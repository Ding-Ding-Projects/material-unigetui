import { app, safeStorage } from 'electron'
import { promises as fs } from 'fs'
import { createHash, randomBytes, timingSafeEqual, scryptSync } from 'crypto'
import * as path from 'path'
import { TotpParameters, verifyTotp, TOTP_DEFAULTS } from '../lib/totp'

/**
 * Toy locks.
 *
 * Any rendered element can be locked behind a password or a TOTP code. **Each
 * and every lock carries its own credential**: one is never derived from
 * another, there is no master, and unlocking one never unlocks anything else. A
 * user who wants one credential everywhere gets there by deliberately reusing
 * it, never by this store assuming it.
 *
 * ## It is for fun, and it says so
 *
 * This is a self-imposed speed bump in exactly the sense School mode is. It is
 * not encryption of the locked content, not protection from anyone else with
 * this machine, and never described as securing anything. Forgetting a password
 * is a normal outcome, so recovery is self-service: **delete the
 * application-data folder**. Every surface that offers a lock says so.
 *
 * ## What is stored
 *
 * A password is stored as a scrypt hash with a per-lock salt — never the
 * password. A TOTP secret genuinely has to be recoverable to compute codes, so
 * it is encrypted with the operating system's own key material through
 * `safeStorage` and never written in the clear.
 */

export type LockMethod = 'password' | 'totp'

export interface LockRecord {
  readonly id: string
  /** What is locked: a route, a tab, a setting key, an element id. */
  readonly target: string
  readonly label: string
  readonly method: LockMethod
  readonly createdAt: string
  /** How long an unlock lasts. */
  readonly duration: 'surface' | 'minutes' | 'session'
  readonly minutes: number
}

interface StoredLock extends LockRecord {
  /** password: scrypt hash. Never the password itself. */
  readonly hash?: string
  readonly salt?: string
  /** totp: base64 of the safeStorage-encrypted secret. Never plaintext. */
  readonly encryptedSecret?: string
  readonly algorithm?: TotpParameters['algorithm']
  readonly digits?: number
  readonly period?: number
}

export interface UnlockOutcome {
  readonly ok: boolean
  /** Why it failed, in words a user can act on. Never about the stored value. */
  readonly reason?: string
  /** Until when this target stays unlocked, epoch ms. */
  readonly until?: number
}

const SCRYPT_KEY_LENGTH = 32

export class LockStore {
  private locks: StoredLock[] = []
  private loaded = false
  /** Live unlocks, in memory only: a restart relocks everything. */
  private readonly unlocked = new Map<string, number>()
  /** Failed attempts per lock, for honest rate limiting. */
  private readonly failures = new Map<string, number[]>()

  private file(): string {
    return path.join(app.getPath('userData'), 'locks.json')
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return
    }
    try {
      const raw = await fs.readFile(this.file(), 'utf8')
      const parsed: unknown = JSON.parse(raw)
      this.locks = Array.isArray(parsed) ? (parsed as StoredLock[]) : []
    } catch {
      this.locks = []
    }
    this.loaded = true
  }

  private async persist(): Promise<void> {
    await fs.mkdir(path.dirname(this.file()), { recursive: true })
    await fs.writeFile(this.file(), JSON.stringify(this.locks, null, 2), 'utf8')
  }

  /** Public records only — never a hash, a salt or an encrypted secret. */
  public async list(): Promise<readonly LockRecord[]> {
    await this.load()
    return this.locks.map(lock => ({
      id: lock.id,
      target: lock.target,
      label: lock.label,
      method: lock.method,
      createdAt: lock.createdAt,
      duration: lock.duration,
      minutes: lock.minutes,
    }))
  }

  public async isLocked(target: string, now: number): Promise<boolean> {
    await this.load()
    if (!this.locks.some(lock => lock.target === target)) {
      return false
    }
    const until = this.unlocked.get(target)
    return until === undefined || until <= now
  }

  public async createPasswordLock(
    target: string,
    label: string,
    password: string,
    duration: LockRecord['duration'],
    minutes: number
  ): Promise<LockRecord> {
    await this.load()
    const salt = randomBytes(16).toString('hex')
    const hash = scryptSync(password, salt, SCRYPT_KEY_LENGTH).toString('hex')

    const lock: StoredLock = {
      id: randomBytes(8).toString('hex'),
      target,
      label,
      method: 'password',
      createdAt: new Date().toISOString(),
      duration,
      minutes,
      hash,
      salt,
    }
    this.locks.push(lock)
    await this.persist()
    return this.publicOf(lock)
  }

  public async createTotpLock(
    target: string,
    label: string,
    secret: string,
    duration: LockRecord['duration'],
    minutes: number
  ): Promise<LockRecord | { readonly error: string }> {
    await this.load()

    if (!safeStorage.isEncryptionAvailable()) {
      // Refused rather than stored in the clear. A secret written plainly to
      // disk under the name of a lock would be worse than no lock at all.
      return {
        error:
          'This computer cannot encrypt stored secrets, so a code-based lock ' +
          'cannot be created here. A password lock still can.',
      }
    }

    const lock: StoredLock = {
      id: randomBytes(8).toString('hex'),
      target,
      label,
      method: 'totp',
      createdAt: new Date().toISOString(),
      duration,
      minutes,
      encryptedSecret: safeStorage.encryptString(secret).toString('base64'),
      algorithm: TOTP_DEFAULTS.algorithm,
      digits: TOTP_DEFAULTS.digits,
      period: TOTP_DEFAULTS.period,
    }
    this.locks.push(lock)
    await this.persist()
    return this.publicOf(lock)
  }

  public async remove(id: string): Promise<readonly LockRecord[]> {
    await this.load()
    this.locks = this.locks.filter(lock => lock.id !== id)
    await this.persist()
    return this.list()
  }

  /**
   * Attempts an unlock.
   *
   * Honest, rate-limited feedback: the value did not match, and here is the
   * recovery route. It never wipes content, never escalates, and never pretends
   * a lockout is enforcement.
   */
  public async attempt(
    target: string,
    value: string,
    now: number
  ): Promise<UnlockOutcome> {
    await this.load()
    const lock = this.locks.find(candidate => candidate.target === target)
    if (lock === undefined) {
      return { ok: false, reason: 'Nothing is locked here.' }
    }

    const recent = (this.failures.get(lock.id) ?? []).filter(
      at => now - at < 60_000
    )
    if (recent.length >= 5) {
      return {
        ok: false,
        reason:
          'Too many attempts in the last minute. Wait a moment — or delete the ' +
          'application-data folder, which clears every lock.',
      }
    }

    const matched =
      lock.method === 'password'
        ? this.matchesPassword(lock, value)
        : this.matchesTotp(lock, value, now)

    if (!matched) {
      this.failures.set(lock.id, [...recent, now])
      return {
        ok: false,
        reason:
          'That did not match. If you have lost it, delete the application-data ' +
          'folder — that clears every lock, and it is the documented way out.',
      }
    }

    this.failures.delete(lock.id)
    const until =
      lock.duration === 'minutes'
        ? now + lock.minutes * 60_000
        : Number.MAX_SAFE_INTEGER
    this.unlocked.set(target, until)
    return { ok: true, until }
  }

  /** Relocks a target immediately, whatever its duration was. */
  public relock(target: string): void {
    this.unlocked.delete(target)
  }

  private matchesPassword(lock: StoredLock, value: string): boolean {
    if (lock.hash === undefined || lock.salt === undefined) {
      return false
    }
    const candidate = scryptSync(value, lock.salt, SCRYPT_KEY_LENGTH)
    const stored = Buffer.from(lock.hash, 'hex')
    return (
      candidate.length === stored.length && timingSafeEqual(candidate, stored)
    )
  }

  private matchesTotp(lock: StoredLock, value: string, now: number): boolean {
    if (lock.encryptedSecret === undefined || !safeStorage.isEncryptionAvailable()) {
      return false
    }
    let secret: string
    try {
      secret = safeStorage.decryptString(
        Buffer.from(lock.encryptedSecret, 'base64')
      )
    } catch {
      return false
    }
    return verifyTotp(
      {
        secret,
        algorithm: lock.algorithm ?? TOTP_DEFAULTS.algorithm,
        digits: lock.digits ?? TOTP_DEFAULTS.digits,
        period: lock.period ?? TOTP_DEFAULTS.period,
      },
      value,
      now
    )
  }

  private publicOf(lock: StoredLock): LockRecord {
    return {
      id: lock.id,
      target: lock.target,
      label: lock.label,
      method: lock.method,
      createdAt: lock.createdAt,
      duration: lock.duration,
      minutes: lock.minutes,
    }
  }
}

export const lockStore = new LockStore()

/**
 * A stable fingerprint for a lock target.
 *
 * Used only to key in-memory state; it is never shown, never stored, and says
 * nothing about the credential.
 */
export function targetKey(kind: string, id: string): string {
  return createHash('sha256').update(`${kind}:${id}`).digest('hex').slice(0, 16)
}
