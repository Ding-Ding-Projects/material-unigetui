/**
 * A minimal, local QR Code encoder (ISO/IEC 18004), byte mode only.
 *
 * Drawn in-process from this file — never a third-party QR web service, which
 * would hand a two-factor secret to a stranger's server on the way to
 * rendering it. Everything here runs against text already in memory and
 * produces nothing but a boolean matrix.
 *
 * Scope, deliberately narrow: byte-mode encoding, error-correction level L,
 * a single fixed mask pattern (0), and versions 1 through 9. That range
 * covers every `otpauth://` URI this application generates (well under 230
 * bytes) without needing the multi-group block splitting or larger alignment
 * layouts that show up from version 10 onward.
 */

// ---- Galois field GF(256), primitive polynomial 0x11D --------------------

const GF_EXP = new Uint8Array(512)
const GF_LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x
    GF_LOG[x] = i
    x <<= 1
    if (x & 0x100) {
      x ^= 0x11d
    }
  }
  for (let i = 255; i < 512; i++) {
    GF_EXP[i] = GF_EXP[i - 255]!
  }
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) {
    return 0
  }
  return GF_EXP[GF_LOG[a]! + GF_LOG[b]!]!
}

/** Reed-Solomon generator polynomial for `degree` error-correction words. */
function rsGeneratorPolynomial(degree: number): number[] {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= gfMul(poly[j]!, GF_EXP[i]!)
      next[j + 1] ^= poly[j]!
    }
    poly = next
  }
  return poly
}

function rsEncode(data: readonly number[], eccCount: number): number[] {
  const generator = rsGeneratorPolynomial(eccCount)
  const remainder = new Array(eccCount).fill(0)
  for (const byte of data) {
    const factor = byte ^ remainder[0]!
    remainder.shift()
    remainder.push(0)
    if (factor !== 0) {
      for (let i = 0; i < generator.length; i++) {
        remainder[i] ^= gfMul(generator[i]!, factor)
      }
    }
  }
  return remainder
}

// ---- Version capacity table, error-correction level L --------------------

interface VersionSpec {
  readonly dataCodewords: number
  readonly blocks: number
  readonly eccPerBlock: number
}

/** Versions 1 through 9, level L. Every block splits evenly for this range. */
const VERSION_SPECS: readonly VersionSpec[] = [
  { dataCodewords: 19, blocks: 1, eccPerBlock: 7 },
  { dataCodewords: 34, blocks: 1, eccPerBlock: 10 },
  { dataCodewords: 55, blocks: 1, eccPerBlock: 15 },
  { dataCodewords: 80, blocks: 1, eccPerBlock: 20 },
  { dataCodewords: 108, blocks: 1, eccPerBlock: 26 },
  { dataCodewords: 136, blocks: 2, eccPerBlock: 18 },
  { dataCodewords: 156, blocks: 2, eccPerBlock: 20 },
  { dataCodewords: 194, blocks: 2, eccPerBlock: 24 },
  { dataCodewords: 232, blocks: 2, eccPerBlock: 30 },
]

const MAX_VERSION = VERSION_SPECS.length

/** Byte-mode overhead: 4-bit mode indicator + 8-bit count (versions 1-9). */
function bytesNeeded(payloadLength: number): number {
  return Math.ceil((4 + 8 + 8 * payloadLength) / 8)
}

function pickVersion(payloadLength: number): number | null {
  const needed = bytesNeeded(payloadLength)
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (VERSION_SPECS[v - 1]!.dataCodewords >= needed) {
      return v
    }
  }
  return null
}

// ---- Bit-level data-codeword construction ---------------------------------

function buildDataCodewords(bytes: Uint8Array, spec: VersionSpec): Uint8Array {
  const bits: number[] = []
  const pushBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i--) {
      bits.push((value >> i) & 1)
    }
  }

  pushBits(0b0100, 4) // byte mode
  pushBits(bytes.length, 8) // character count indicator, versions 1-9
  for (const byte of bytes) {
    pushBits(byte, 8)
  }

  const capacityBits = spec.dataCodewords * 8
  const remaining = capacityBits - bits.length
  const terminator = Math.max(0, Math.min(4, remaining))
  pushBits(0, terminator)
  while (bits.length % 8 !== 0) {
    bits.push(0)
  }

  const codewords: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | bits[i + j]!
    }
    codewords.push(byte)
  }

  const padBytes = [0xec, 0x11]
  let padIndex = 0
  while (codewords.length < spec.dataCodewords) {
    codewords.push(padBytes[padIndex % 2]!)
    padIndex++
  }

  return Uint8Array.from(codewords.slice(0, spec.dataCodewords))
}

function interleave(version: number, data: Uint8Array): Uint8Array {
  const spec = VERSION_SPECS[version - 1]!
  const perBlock = spec.dataCodewords / spec.blocks
  const blocks: Uint8Array[] = []
  const eccBlocks: number[][] = []

  for (let b = 0; b < spec.blocks; b++) {
    const block = data.slice(b * perBlock, (b + 1) * perBlock)
    blocks.push(block)
    eccBlocks.push(rsEncode(Array.from(block), spec.eccPerBlock))
  }

  const out: number[] = []
  for (let i = 0; i < perBlock; i++) {
    for (const block of blocks) {
      out.push(block[i]!)
    }
  }
  for (let i = 0; i < spec.eccPerBlock; i++) {
    for (const eccBlock of eccBlocks) {
      out.push(eccBlock[i]!)
    }
  }
  return Uint8Array.from(out)
}

// ---- Format and version information, via BCH (computed, not hardcoded) --

/** 15-bit format info: 5 data bits (EC level + mask) through BCH(15,5). */
function formatInfoBits(maskPattern: number): number {
  const ecLevelL = 0b01 // ISO/IEC 18004 Table 25: L=01, M=00, Q=11, H=10
  const data5 = (ecLevelL << 3) | maskPattern
  let d = data5 << 10
  const generator = 0b10100110111 // degree-10 generator, 11 bits
  for (let i = 14; i >= 10; i--) {
    if ((d >> i) & 1) {
      d ^= generator << (i - 10)
    }
  }
  const bits = ((data5 << 10) | d) ^ 0b101010000010010
  return bits & 0x7fff
}

/** 18-bit version info for versions 7+, via BCH(18,6). Not needed below v7. */
function versionInfoBits(version: number): number {
  let d = version << 12
  const generator = 0b1111100100101 // degree-12 generator, 13 bits
  for (let i = 17; i >= 12; i--) {
    if ((d >> i) & 1) {
      d ^= generator << (i - 12)
    }
  }
  return (version << 12) | d
}

/** Alignment pattern centre coordinates, per ISO/IEC 18004 Annex E. */
function alignmentPositions(version: number): readonly number[] {
  if (version === 1) {
    return []
  }
  const numAlign = Math.floor(version / 7) + 2
  const step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2
  const positions = [6]
  let pos = version * 4 + 10
  for (let i = 0; i < numAlign - 1; i++) {
    positions.splice(1, 0, pos)
    pos -= step
  }
  return positions
}

// ---- Matrix construction ---------------------------------------------------

function placeFinder(matrix: boolean[][], fn: boolean[][], top: number, left: number): void {
  for (let r = -1; r <= 7; r++) {
    for (let c = -1; c <= 7; c++) {
      const row = top + r
      const col = left + c
      if (row < 0 || col < 0 || row >= matrix.length || col >= matrix.length) {
        continue
      }
      fn[row]![col] = true
      const onRing = r === -1 || r === 7 || c === -1 || c === 7
      const inCore = r >= 0 && r <= 6 && c >= 0 && c <= 6
      const isDark = inCore && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
      matrix[row]![col] = !onRing && isDark
    }
  }
}

function placeAlignment(matrix: boolean[][], fn: boolean[][], row: number, col: number): void {
  for (let r = -2; r <= 2; r++) {
    for (let c = -2; c <= 2; c++) {
      const rr = row + r
      const cc = col + c
      fn[rr]![cc] = true
      matrix[rr]![cc] = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0)
    }
  }
}

/**
 * Encodes `text` as a QR symbol and returns its module matrix — `true` for a
 * dark module. Returns `null` when the text exceeds this encoder's supported
 * capacity (232 bytes, byte mode, level L, versions 1-9).
 */
export function generateQrMatrix(text: string): boolean[][] | null {
  const bytes = new TextEncoder().encode(text)
  const version = pickVersion(bytes.length)
  if (version === null) {
    return null
  }
  const spec = VERSION_SPECS[version - 1]!
  const dataCodewords = buildDataCodewords(bytes, spec)
  const finalCodewords = interleave(version, dataCodewords)

  const size = 4 * version + 17
  const matrix: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false))

  placeFinder(matrix, fn, 0, 0)
  placeFinder(matrix, fn, 0, size - 7)
  placeFinder(matrix, fn, size - 7, 0)

  // Timing patterns.
  for (let i = 8; i < size - 8; i++) {
    fn[6]![i] = true
    matrix[6]![i] = i % 2 === 0
    fn[i]![6] = true
    matrix[i]![6] = i % 2 === 0
  }

  // Alignment patterns, skipping any that would overlap a finder.
  const alignPositions = alignmentPositions(version)
  for (const row of alignPositions) {
    for (const col of alignPositions) {
      const nearTopLeft = row <= 8 && col <= 8
      const nearTopRight = row <= 8 && col >= size - 9
      const nearBottomLeft = row >= size - 9 && col <= 8
      if (nearTopLeft || nearTopRight || nearBottomLeft) {
        continue
      }
      placeAlignment(matrix, fn, row, col)
    }
  }

  // Format info reservation (written after; content computed below).
  for (let i = 0; i <= 8; i++) {
    fn[8]![i] = true
    fn[i]![8] = true
  }
  for (let i = size - 8; i < size; i++) {
    fn[8]![i] = true
    fn[i]![8] = true
  }
  // Dark module, always set.
  fn[size - 8]![8] = true
  matrix[size - 8]![8] = true

  // Version info blocks (v7+).
  if (version >= 7) {
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        fn[r]![size - 11 + c] = true
        fn[size - 11 + c]![r] = true
      }
    }
  }

  // Zigzag data placement with mask pattern 0: (row + col) % 2 === 0.
  const bitsTotal = finalCodewords.length * 8
  const bitAt = (index: number): number => {
    if (index >= bitsTotal) {
      return 0
    }
    const byte = finalCodewords[Math.floor(index / 8)]!
    return (byte >> (7 - (index % 8))) & 1
  }

  let bitIndex = 0
  let colRight = size - 1
  let upward = true
  while (colRight > 0) {
    if (colRight === 6) {
      colRight--
    }
    for (let i = 0; i < size; i++) {
      const row = upward ? size - 1 - i : i
      for (let c = colRight; c >= colRight - 1; c--) {
        if (fn[row]![c]) {
          continue
        }
        const bit = bitAt(bitIndex)
        bitIndex++
        const maskFlip = (row + c) % 2 === 0 ? 1 : 0
        matrix[row]![c] = (bit ^ maskFlip) === 1
      }
    }
    upward = !upward
    colRight -= 2
  }

  // Format info, split across its two reserved strips.
  const format = formatInfoBits(0)
  for (let i = 0; i <= 5; i++) {
    matrix[8]![i] = ((format >> i) & 1) === 1
  }
  matrix[8]![7] = ((format >> 6) & 1) === 1
  matrix[8]![8] = ((format >> 7) & 1) === 1
  matrix[7]![8] = ((format >> 8) & 1) === 1
  for (let i = 9; i <= 14; i++) {
    matrix[14 - i]![8] = ((format >> i) & 1) === 1
  }
  for (let i = 0; i <= 7; i++) {
    matrix[size - 1 - i]![8] = ((format >> i) & 1) === 1
  }
  for (let i = 8; i <= 14; i++) {
    matrix[8]![size - 15 + i] = ((format >> i) & 1) === 1
  }

  if (version >= 7) {
    const versionBits = versionInfoBits(version)
    for (let i = 0; i < 18; i++) {
      const bit = ((versionBits >> i) & 1) === 1
      const row = Math.floor(i / 3)
      const col = i % 3
      matrix[row]![size - 11 + col] = bit
      matrix[size - 11 + col]![row] = bit
    }
  }

  return matrix
}
