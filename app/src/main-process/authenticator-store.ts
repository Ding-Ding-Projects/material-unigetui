import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { randomBytes } from 'crypto'
import * as path from 'path'
import {
  TotpParameters,
  TOTP_DEFAULTS,
  totp,
  secondsRemaining,
  otpauthUri,
  parseOtpauthUri,
  generateSecret,
  base32Decode,
} from '../lib/totp'

/**
 * The built-in authenticator.
 *
 * Holds arbitrary TOTP secrets the user registers — for whatever accounts they
 * like, not only this application's own locks — and reads live codes.
 *
 * Everything is local. No account, no cloud sync, no network, no telemetry.
 * Secrets are encrypted at rest through the operating system's own key material
 * and never written in the clear, never logged, never captured, and never
 * included in an ordinary export.
 */

export interface AuthEntry {
  readonly id: string
  readonly issuer: string
  readonly account: string
  readonly algorithm: TotpParameters['algorithm']
  readonly digits: number
  readonly period: number
}

interface StoredEntry extends AuthEntry {
  /** base64 of the safeStorage-encrypted secret. Never plaintext. */
  readonly encryptedSecret: string
}

export class AuthenticatorStore {
  private entries: StoredEntry[] = []
  private loaded = false

  private file(): string {
    return path.join(app.getPath('userData'), 'authenticator.json')
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return
    }
    try {
      const raw = await fs.readFile(this.file(), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      this.entries = Array.isArray(parsed) ? (parsed as StoredEntry[]) : []
    } catch {
      this.entries = []
    }
    this.loaded = true
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.file()), { recursive: true })
    await fs.writeFile(this.file(), JSON.stringify(this.entries, null, 2), 'utf8')
  }

  private decrypt(entry: StoredEntry): string | null {
    if (!safeStorage.isEncryptionAvailable()) {
      return null
    }
    try {
      return safeStorage.decryptString(Buffer.from(entry.encryptedSecret, 'base64'))
    } catch {
      return null
    }
  }

  public async list(): Promise<
    ReadonlyArray<AuthEntry & { readonly uri: string }>
  > {
    await this.load()
    return this.entries.map(entry => {
      const secret = this.decrypt(entry)
      return {
        id: entry.id,
        issuer: entry.issuer,
        account: entry.account,
        algorithm: entry.algorithm,
        digits: entry.digits,
        period: entry.period,
        // The URI is what lets a user re-pair an entry on another device. It
        // carries the secret, so it is produced on request and never logged.
        uri:
          secret === null
            ? ''
            : otpauthUri({
                secret,
                algorithm: entry.algorithm,
                digits: entry.digits,
                period: entry.period,
                issuer: entry.issuer,
                account: entry.account,
              }),
      }
    })
  }

  /**
   * Registers a secret from an `otpauth://` URI or a bare base32 secret.
   *
   * Parameters carried by a URI are honoured rather than overwritten with
   * defaults — an entry that silently becomes SHA-1/6/30 when it was not
   * produces codes the far side rejects, with nothing on screen to explain it.
   */
  public async add(
    uriOrSecret: string,
    issuerFallback: string,
    accountFallback: string
  ): Promise<{ ok: boolean; reason?: string }> {
    await this.load()

    if (!safeStorage.isEncryptionAvailable()) {
      return {
        ok: false,
        reason:
          'This computer cannot encrypt stored secrets, so an authenticator ' +
          'entry cannot be saved here. Nothing was written.',
      }
    }

    const trimmed = uriOrSecret.trim()
    let parameters: TotpParameters | null = null

    if (trimmed.toLowerCase().startsWith('otpauth://')) {
      parameters = parseOtpauthUri(trimmed)
      if (parameters === null) {
        return { ok: false, reason: 'That is not a usable otpauth:// URI.' }
      }
    } else {
      try {
        base32Decode(trimmed)
      } catch {
        return { ok: false, reason: 'That is not a valid base32 secret.' }
      }
      parameters = {
        secret: trimmed.toUpperCase().replace(/[\s-]/g, ''),
        algorithm: TOTP_DEFAULTS.algorithm,
        digits: TOTP_DEFAULTS.digits,
        period: TOTP_DEFAULTS.period,
        issuer: issuerFallback,
        account: accountFallback,
      }
    }

    this.entries.push({
      id: randomBytes(8).toString('hex'),
      issuer: parameters.issuer.length > 0 ? parameters.issuer : issuerFallback,
      account: parameters.account.length > 0 ? parameters.account : accountFallback,
      algorithm: parameters.algorithm,
      digits: parameters.digits,
      period: parameters.period,
      encryptedSecret: safeStorage.encryptString(parameters.secret).toString('base64'),
    })

    await this.persist()
    return { ok: true }
  }

  public async remove(id: string): Promise<void> {
    await this.load()
    this.entries = this.entries.filter(entry => entry.id !== id)
    await this.persist()
  }

  /** Current and next code for every entry, plus the countdown. */
  public async codes(now: number): Promise<
    ReadonlyArray<{
      readonly id: string
      readonly code: string
      readonly next: string
      readonly secondsRemaining: number
    }>
  > {
    await this.load()
    const result: Array<{
      id: string
      code: string
      next: string
      secondsRemaining: number
    }> = []

    for (const entry of this.entries) {
      const secret = this.decrypt(entry)
      if (secret === null) {
        // Undecryptable rather than wrong: showing digits that cannot be right
        // is worse than showing none.
        result.push({ id: entry.id, code: '', next: '', secondsRemaining: 0 })
        continue
      }
      const parameters = {
        secret,
        algorithm: entry.algorithm,
        digits: entry.digits,
        period: entry.period,
      }
      result.push({
        id: entry.id,
        code: totp(parameters, now),
        // The next code, so nobody starts typing one with two seconds left.
        next: totp(parameters, now + entry.period * 1000),
        secondsRemaining: secondsRemaining(entry.period, now),
      })
    }

    return result
  }

  public generateSecret(): string {
    return generateSecret()
  }
}

export const authenticatorStore = new AuthenticatorStore()
