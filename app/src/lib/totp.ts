import { createHmac, randomBytes, timingSafeEqual } from 'crypto'

/**
 * TOTP, to RFC 6238 over RFC 4226.
 *
 * Implemented rather than depended on, because it is small and because the
 * failure mode of a subtly wrong implementation is codes that every service
 * rejects with no error to read. It is verified against the RFC's own published
 * test vectors for SHA-1, SHA-256 and SHA-512.
 */

export type TotpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface TotpParameters {
  readonly secret: string
  readonly algorithm: TotpAlgorithm
  readonly digits: number
  readonly period: number
  readonly issuer: string
  readonly account: string
}

/** What the rest of the world issues, so it is what this defaults to. */
export const TOTP_DEFAULTS = {
  algorithm: 'SHA1' as TotpAlgorithm,
  digits: 6,
  period: 30,
} as const

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

/** Decodes RFC 4648 base32, tolerating lower case, spaces and padding. */
export function base32Decode(input: string): Buffer {
  const cleaned = input.toUpperCase().replace(/[\s-]/g, '').replace(/=+$/, '')
  let bits = 0
  let value = 0
  const bytes: number[] = []

  for (const character of cleaned) {
    const index = BASE32_ALPHABET.indexOf(character)
    if (index === -1) {
      throw new Error(`"${character}" is not a base32 character`)
    }
    value = (value << 5) | index
    bits += 5
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }

  return Buffer.from(bytes)
}

export function base32Encode(buffer: Buffer): string {
  let bits = 0
  let value = 0
  let output = ''

  for (const byte of buffer) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

/** A fresh secret. 20 bytes is the RFC 4226 recommendation for SHA-1. */
export function generateSecret(bytes = 20): string {
  return base32Encode(randomBytes(bytes))
}

/** HOTP: the counter-based code the whole scheme is built on. */
export function hotp(
  secret: Buffer,
  counter: number,
  algorithm: TotpAlgorithm,
  digits: number
): string {
  const message = Buffer.alloc(8)
  // 64-bit big-endian counter. Written as two 32-bit halves because a plain
  // shift would overflow at 2^31 and silently produce the wrong code.
  message.writeUInt32BE(Math.floor(counter / 0x100000000), 0)
  message.writeUInt32BE(counter >>> 0, 4)

  const digest = createHmac(algorithm.toLowerCase().replace('sha', 'sha'), secret)
    .update(message)
    .digest()

  // Dynamic truncation, RFC 4226 section 5.3.
  const offset = digest[digest.length - 1]! & 0x0f
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff)

  return String(binary % 10 ** digits).padStart(digits, '0')
}

/** The code for a moment in time. `now` is milliseconds since the epoch. */
export function totp(
  parameters: Pick<TotpParameters, 'secret' | 'algorithm' | 'digits' | 'period'>,
  now: number
): string {
  const counter = Math.floor(now / 1000 / parameters.period)
  return hotp(
    base32Decode(parameters.secret),
    counter,
    parameters.algorithm,
    parameters.digits
  )
}

/** Seconds until the current code expires. */
export function secondsRemaining(period: number, now: number): number {
  return period - Math.floor(now / 1000) % period
}

/**
 * Verifies a submitted code.
 *
 * A small window either side absorbs clock skew, which is the single most
 * common reason a correct authenticator is rejected. Comparison is
 * constant-time so the check cannot be probed a digit at a time.
 */
export function verifyTotp(
  parameters: Pick<TotpParameters, 'secret' | 'algorithm' | 'digits' | 'period'>,
  submitted: string,
  now: number,
  window = 1
): boolean {
  const candidate = submitted.replace(/\s/g, '')
  if (candidate.length !== parameters.digits) {
    return false
  }

  for (let drift = -window; drift <= window; drift++) {
    const expected = totp(parameters, now + drift * parameters.period * 1000)
    const a = Buffer.from(expected, 'utf8')
    const b = Buffer.from(candidate, 'utf8')
    if (a.length === b.length && timingSafeEqual(a, b)) {
      return true
    }
  }
  return false
}

/**
 * The `otpauth://` URI an authenticator scans.
 *
 * Every parameter the entry uses is carried, so a scan reproduces the entry
 * exactly rather than falling back to defaults that do not match.
 */
export function otpauthUri(parameters: TotpParameters): string {
  const label = `${parameters.issuer}:${parameters.account}`
  const query = new URLSearchParams({
    secret: parameters.secret,
    issuer: parameters.issuer,
    algorithm: parameters.algorithm,
    digits: String(parameters.digits),
    period: String(parameters.period),
  })
  return `otpauth://totp/${encodeURIComponent(label)}?${query.toString()}`
}

/** Parses a pasted `otpauth://` URI, honouring the parameters it carries. */
export function parseOtpauthUri(uri: string): TotpParameters | null {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    return null
  }
  if (parsed.protocol !== 'otpauth:' || parsed.host !== 'totp') {
    return null
  }

  const secret = parsed.searchParams.get('secret')
  if (secret === null || secret.length === 0) {
    return null
  }
  try {
    base32Decode(secret)
  } catch {
    return null
  }

  const label = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
  const [labelIssuer, labelAccount] = label.includes(':')
    ? label.split(':', 2)
    : ['', label]

  const algorithm = (parsed.searchParams.get('algorithm') ?? TOTP_DEFAULTS.algorithm)
    .toUpperCase()
    .replace('-', '') as TotpAlgorithm

  return {
    secret: secret.toUpperCase(),
    algorithm: ['SHA1', 'SHA256', 'SHA512'].includes(algorithm)
      ? algorithm
      : TOTP_DEFAULTS.algorithm,
    digits: clampInt(parsed.searchParams.get('digits'), TOTP_DEFAULTS.digits, 6, 8),
    period: clampInt(parsed.searchParams.get('period'), TOTP_DEFAULTS.period, 5, 300),
    issuer: parsed.searchParams.get('issuer') ?? labelIssuer ?? '',
    account: labelAccount ?? '',
  }
}

function clampInt(
  raw: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  const parsed = raw === null ? Number.NaN : Number.parseInt(raw, 10)
  if (Number.isNaN(parsed)) {
    return fallback
  }
  return Math.min(max, Math.max(min, parsed))
}

/**
 * Whether the system clock is far enough out that codes will be refused.
 *
 * Codes come from the clock, so a skewed clock produces confidently wrong
 * digits with nothing on screen to explain them. Saying so is the whole point.
 */
export function clockLooksSkewed(localNow: number, trustedNow: number): boolean {
  return Math.abs(localNow - trustedNow) > 30_000
}
