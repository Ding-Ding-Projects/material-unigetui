import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadCompiled } from '../helpers/compiled.mjs'

const {
  totp,
  hotp,
  verifyTotp,
  base32Decode,
  base32Encode,
  generateSecret,
  otpauthUri,
  parseOtpauthUri,
  secondsRemaining,
  clockLooksSkewed,
  TOTP_DEFAULTS,
} = loadCompiled('lib/totp.ts')

/*
 * RFC 6238 Appendix B.
 *
 * The published vectors, which are the only thing that distinguishes a correct
 * implementation from one that is subtly wrong — and a subtly wrong one
 * produces codes every service rejects with no error to read.
 *
 * The seeds are ASCII "12345678901234567890" repeated to the key length each
 * algorithm needs.
 */
const SEED_SHA1 = base32Encode(Buffer.from('12345678901234567890', 'ascii'))
const SEED_SHA256 = base32Encode(Buffer.from('12345678901234567890123456789012', 'ascii'))
const SEED_SHA512 = base32Encode(
  Buffer.from('1234567890123456789012345678901234567890123456789012345678901234', 'ascii')
)

const VECTORS = [
  { time: 59, sha1: '94287082', sha256: '46119246', sha512: '90693936' },
  { time: 1111111109, sha1: '07081804', sha256: '68084774', sha512: '25091201' },
  { time: 1111111111, sha1: '14050471', sha256: '67062674', sha512: '99943326' },
  { time: 1234567890, sha1: '89005924', sha256: '91819424', sha512: '93441116' },
  { time: 2000000000, sha1: '69279037', sha256: '90698825', sha512: '38618901' },
  { time: 20000000000, sha1: '65353130', sha256: '77737706', sha512: '47863826' },
]

assert.ok(VECTORS.length > 0, 'no RFC vectors declared')

for (const vector of VECTORS) {
  test(`RFC 6238 vector at t=${vector.time}`, () => {
    assert.equal(
      totp({ secret: SEED_SHA1, algorithm: 'SHA1', digits: 8, period: 30 }, vector.time * 1000),
      vector.sha1,
      'SHA-1 mismatch'
    )
    assert.equal(
      totp({ secret: SEED_SHA256, algorithm: 'SHA256', digits: 8, period: 30 }, vector.time * 1000),
      vector.sha256,
      'SHA-256 mismatch'
    )
    assert.equal(
      totp({ secret: SEED_SHA512, algorithm: 'SHA512', digits: 8, period: 30 }, vector.time * 1000),
      vector.sha512,
      'SHA-512 mismatch'
    )
  })
}

test('the counter is a true 64-bit value, not a truncated 32-bit one', () => {
  // The RFC vectors do not reach this: even t=20000000000 is only counter
  // 666666666, comfortably under 2^31. So it is tested directly.
  //
  // A 32-bit implementation makes counter 2^32+1 and counter 1 collide, since
  // the high half is discarded. They must produce different codes.
  const secret = base32Decode(SEED_SHA1)
  const low = hotp(secret, 1, 'SHA1', 8)
  const high = hotp(secret, 2 ** 32 + 1, 'SHA1', 8)
  assert.notEqual(
    low,
    high,
    'counter 2^32+1 produced the same code as counter 1 — the high half is being discarded'
  )
})

test('six digits is the default and is zero-padded', () => {
  assert.equal(TOTP_DEFAULTS.digits, 6)
  const code = totp(
    { secret: SEED_SHA1, algorithm: 'SHA1', digits: 6, period: 30 },
    59_000
  )
  assert.equal(code.length, 6)
  assert.match(code, /^\d{6}$/)
})

test('base32 round-trips, and tolerates spaces, case and padding', () => {
  const secret = generateSecret()
  assert.equal(base32Encode(base32Decode(secret)), secret)
  const spaced = secret.slice(0, 4) + ' ' + secret.slice(4).toLowerCase() + '==='
  assert.deepEqual(base32Decode(spaced), base32Decode(secret))
})

test('a non-base32 character is rejected rather than silently dropped', () => {
  assert.throws(() => base32Decode('ABC1DEF'), /not a base32 character/)
})

test('verification accepts a code from the neighbouring window', () => {
  const parameters = { secret: SEED_SHA1, algorithm: 'SHA1', digits: 6, period: 30 }
  const now = 1_700_000_000_000
  const previous = totp(parameters, now - 30_000)
  assert.equal(verifyTotp(parameters, previous, now), true, 'skew window not honoured')
})

test('verification refuses a code from outside the window', () => {
  const parameters = { secret: SEED_SHA1, algorithm: 'SHA1', digits: 6, period: 30 }
  const now = 1_700_000_000_000
  const distant = totp(parameters, now - 300_000)
  assert.equal(verifyTotp(parameters, distant, now), false)
})

test('a wrong-length code is refused without comparing', () => {
  const parameters = { secret: SEED_SHA1, algorithm: 'SHA1', digits: 6, period: 30 }
  assert.equal(verifyTotp(parameters, '1234', Date.now()), false)
  assert.equal(verifyTotp(parameters, '', Date.now()), false)
})

test('the countdown reaches the period boundary and never zero', () => {
  assert.equal(secondsRemaining(30, 0), 30)
  assert.equal(secondsRemaining(30, 1_000), 29)
  assert.equal(secondsRemaining(30, 29_000), 1)
  assert.equal(secondsRemaining(30, 30_000), 30)
})

test('the otpauth URI carries every parameter the entry uses', () => {
  // A scan must reproduce the entry exactly rather than fall back to defaults
  // that do not match it.
  const parameters = {
    secret: SEED_SHA1,
    algorithm: 'SHA256',
    digits: 8,
    period: 45,
    issuer: 'Material UniGetUI',
    account: 'someone@example.com',
  }
  const uri = otpauthUri(parameters)
  const parsed = parseOtpauthUri(uri)
  assert.ok(parsed)
  assert.equal(parsed.secret, parameters.secret)
  assert.equal(parsed.algorithm, 'SHA256')
  assert.equal(parsed.digits, 8)
  assert.equal(parsed.period, 45)
  assert.equal(parsed.issuer, 'Material UniGetUI')
  assert.equal(parsed.account, 'someone@example.com')
})

test('a URI with no parameters falls back to the common defaults', () => {
  const parsed = parseOtpauthUri(`otpauth://totp/Example:me?secret=${SEED_SHA1}`)
  assert.ok(parsed)
  assert.equal(parsed.algorithm, 'SHA1')
  assert.equal(parsed.digits, 6)
  assert.equal(parsed.period, 30)
})

test('a malformed or non-otpauth URI is refused', () => {
  assert.equal(parseOtpauthUri('not a uri'), null)
  assert.equal(parseOtpauthUri('https://example.com'), null)
  assert.equal(parseOtpauthUri('otpauth://hotp/Example:me?secret=AAAA'), null)
  assert.equal(parseOtpauthUri('otpauth://totp/Example:me'), null)
  assert.equal(parseOtpauthUri('otpauth://totp/Example:me?secret=not-base32!'), null)
})

test('a skewed clock is reported rather than producing wrong digits quietly', () => {
  const now = 1_700_000_000_000
  assert.equal(clockLooksSkewed(now, now + 5_000), false)
  assert.equal(clockLooksSkewed(now, now + 120_000), true)
  assert.equal(clockLooksSkewed(now, now - 120_000), true)
})
