/**
 * Pure TypeScript QR Code Generator (Byte mode, Error Correction Level M)
 * Fully offline, zero dependencies, compliant with ISO/IEC 18004.
 * Generates SVG path string and 2D boolean matrix for UPI payment codes.
 */

// GF(256) tables for Reed-Solomon polynomial math
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let val = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = val;
    LOG_TABLE[val] = i;
    val = (val << 1) ^ (val & 128 ? 0x11d : 0);
  }
  EXP_TABLE[255] = EXP_TABLE[0];
})();

function gMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[a] + LOG_TABLE[b]) % 255];
}

function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gMul(poly[j], EXP_TABLE[i]);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, numEcBytes: number): Uint8Array {
  const gen = rsGeneratorPoly(numEcBytes);
  const remainder = new Uint8Array(numEcBytes);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[numEcBytes - 1] = 0;
    for (let j = 0; j < numEcBytes; j++) {
      remainder[j] ^= gMul(gen[j], factor);
    }
  }
  return remainder;
}

// Table of QR capacity for Level M: [version, totalCodewords, dataCodewords, ecCodewordsPerBlock, numBlocks]
// Suitable for UPI strings up to 134 bytes (Version 1 through 6)
interface QrSpec {
  version: number;
  size: number;
  totalCodewords: number;
  dataCodewords: number;
  ecBytesPerBlock: number;
  blocks: number;
  alignPos: number[];
}

const QR_SPECS: QrSpec[] = [
  { version: 1, size: 21, totalCodewords: 26, dataCodewords: 16, ecBytesPerBlock: 10, blocks: 1, alignPos: [] },
  { version: 2, size: 25, totalCodewords: 44, dataCodewords: 28, ecBytesPerBlock: 16, blocks: 1, alignPos: [6, 18] },
  { version: 3, size: 29, totalCodewords: 70, dataCodewords: 44, ecBytesPerBlock: 26, blocks: 1, alignPos: [6, 22] },
  { version: 4, size: 33, totalCodewords: 100, dataCodewords: 64, ecBytesPerBlock: 18, blocks: 2, alignPos: [6, 26] },
  { version: 5, size: 37, totalCodewords: 134, dataCodewords: 86, ecBytesPerBlock: 24, blocks: 2, alignPos: [6, 30] },
  { version: 6, size: 41, totalCodewords: 172, dataCodewords: 108, ecBytesPerBlock: 16, blocks: 4, alignPos: [6, 34] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) utf8Bytes.push(code);
    else if (code < 2048) {
      utf8Bytes.push(192 | (code >> 6), 128 | (code & 63));
    } else {
      utf8Bytes.push(224 | (code >> 12), 128 | ((code >> 6) & 63), 128 | (code & 63));
    }
  }

  // Find minimal version that accommodates utf8Bytes
  let spec = QR_SPECS[0];
  for (const s of QR_SPECS) {
    if (s.dataCodewords - 2 >= utf8Bytes.length) {
      spec = s;
      break;
    }
  }

  // 1. Bitstream encoding: 4-bit mode (0100 for Byte mode) + 8-bit count + bytes
  const bits: number[] = [];
  const pushBits = (val: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(utf8Bytes.length, 8); // Character count
  for (const b of utf8Bytes) {
    pushBits(b, 8);
  }

  // Terminator (up to 4 zeroes)
  const maxBits = spec.dataCodewords * 8;
  const termLength = Math.min(4, maxBits - bits.length);
  pushBits(0, termLength);

  // Pad to multiple of 8
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Pad bytes 0xEC, 0x11
  const padPatterns = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to data codewords
  const dataCodewords = new Uint8Array(spec.dataCodewords);
  for (let i = 0; i < spec.dataCodewords; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i * 8 + b];
    }
    dataCodewords[i] = byteVal;
  }

  // 2. Error Correction computation per block
  const blockSize = Math.floor(spec.dataCodewords / spec.blocks);
  const allBlocksData: Uint8Array[] = [];
  const allBlocksEc: Uint8Array[] = [];

  let offset = 0;
  for (let b = 0; b < spec.blocks; b++) {
    const curBlockLen = blockSize + (b >= spec.blocks - (spec.dataCodewords % spec.blocks) ? 1 : 0);
    const blockData = dataCodewords.slice(offset, offset + curBlockLen);
    const blockEc = rsComputeRemainder(blockData, spec.ecBytesPerBlock);
    allBlocksData.push(blockData);
    allBlocksEc.push(blockEc);
    offset += curBlockLen;
  }

  // Interleave data and EC
  const finalCodewords: number[] = [];
  const maxBlockLen = Math.max(...allBlocksData.map((d) => d.length));
  for (let i = 0; i < maxBlockLen; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      if (i < allBlocksData[b].length) {
        finalCodewords.push(allBlocksData[b][i]);
      }
    }
  }
  for (let i = 0; i < spec.ecBytesPerBlock; i++) {
    for (let b = 0; b < spec.blocks; b++) {
      finalCodewords.push(allBlocksEc[b][i]);
    }
  }

  // 3. Matrix placement
  const size = spec.size;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () => Array(size).fill(null));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  const setModule = (r: number, c: number, val: boolean) => {
    matrix[r][c] = val;
    isFunction[r][c] = true;
  };

  // Finder pattern (7x7) + separator (8x8)
  const drawFinder = (top: number, left: number) => {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          const isBlack =
            r >= 0 &&
            r <= 6 &&
            c >= 0 &&
            c <= 6 &&
            (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
          setModule(row, col, isBlack);
        }
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  // Alignment patterns
  if (spec.alignPos.length > 0) {
    for (const r of spec.alignPos) {
      for (const c of spec.alignPos) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBlack = Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0);
            setModule(r + dr, c + dc, isBlack);
          }
        }
      }
    }
  }

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    if (!isFunction[6][i]) setModule(6, i, i % 2 === 0);
    if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(size - 8, 8, true);

  // Reserve format info area
  for (let i = 0; i < 9; i++) {
    if (i !== 6) {
      isFunction[8][i] = true;
      isFunction[i][8] = true;
    }
  }
  for (let i = 0; i < 8; i++) {
    isFunction[8][size - 1 - i] = true;
    isFunction[size - 1 - i][8] = true;
  }

  // Convert final codewords to bits
  const finalBits: boolean[] = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) {
      finalBits.push(((cw >> b) & 1) === 1);
    }
  }

  // Data module placement (zigzag from right to left)
  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // skip vertical timing line
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (let c = right; c >= right - 1; c--) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < finalBits.length ? finalBits[bitIdx++] : false;
          // Apply mask 0: (row + col) % 2 === 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = bit !== mask;
        }
      }
    }
    upwards = !upwards;
  }

  // Format info for EC Level M (00) and Mask 0 (000) = 00000 -> with BCH = 101010000010010 ^ 101010000010010 = 000000000000000
  // Standard format mask constant 0x5412 (101010000010010 in binary)
  // Mask 0 + EC M -> 0b00000 ^ 0b101010000010010 = 0b101010000010010
  const formatString = "101010000010010";
  for (let i = 0; i < 15; i++) {
    const val = formatString[i] === "1";
    // Around top-left
    if (i < 6) matrix[8][i] = val;
    else if (i === 6) matrix[8][7] = val;
    else if (i === 7) matrix[8][8] = val;
    else if (i === 8) matrix[7][8] = val;
    else matrix[14 - i][8] = val;

    // Split across bottom-left and top-right
    if (i < 8) matrix[size - 1 - i][8] = val;
    else matrix[8][size - 15 + i] = val;
  }

  // Convert to clean boolean matrix
  return matrix.map((row) => row.map((cell) => !!cell));
}

/**
 * Returns an SVG string for rendering the QR code in React or HTML
 */
export function generateQrSvg(
  text: string,
  options: { size?: number; padding?: number; color?: string; bgColor?: string } = {}
): string {
  const matrix = generateQrMatrix(text);
  const matrixSize = matrix.length;
  const padding = options.padding ?? 3;
  const totalGrid = matrixSize + padding * 2;
  const color = options.color || "#1A120E";
  const bgColor = options.bgColor || "#ffffff";

  let rects = "";
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        rects += `<rect x="${c + padding}" y="${r + padding}" width="1" height="1" fill="${color}" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalGrid} ${totalGrid}" width="${options.size || 200}" height="${options.size || 200}" shape-rendering="crispEdges">
    <rect width="${totalGrid}" height="${totalGrid}" fill="${bgColor}" />
    ${rects}
  </svg>`;
}
