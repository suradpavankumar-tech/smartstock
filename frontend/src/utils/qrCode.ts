const QR_BLOCKS = [
  null,
  { data: 19, ecc: 7, blocks: 1 },
  { data: 34, ecc: 10, blocks: 1 },
  { data: 55, ecc: 15, blocks: 1 },
  { data: 80, ecc: 20, blocks: 1 },
  { data: 108, ecc: 26, blocks: 1 },
  { data: 136, ecc: 18, blocks: 2 },
  { data: 156, ecc: 20, blocks: 2 },
  { data: 194, ecc: 24, blocks: 2 },
  { data: 232, ecc: 30, blocks: 2 },
];

const ALIGNMENT_CENTERS: Record<number, number[]> = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
};

function multiply(a: number, b: number): number {
  let result = 0;
  for (let i = 7; i >= 0; i -= 1) {
    result = (result << 1) ^ ((result >>> 7) * 0x11d);
    result ^= ((b >>> i) & 1) * a;
  }
  return result;
}

function bchRemainder(value: number, polynomial: number): number {
  let remainder = value;
  const polynomialDegree = 31 - Math.clz32(polynomial);
  while (remainder !== 0 && 31 - Math.clz32(remainder) >= polynomialDegree) {
    remainder ^= polynomial << ((31 - Math.clz32(remainder)) - polynomialDegree);
  }
  return remainder;
}

function errorCorrection(data: number[], degree: number): number[] {
  const divisor = new Array<number>(degree).fill(0);
  divisor[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < degree; j += 1) {
      divisor[j] = multiply(divisor[j], root);
      if (j + 1 < degree) divisor[j] ^= divisor[j + 1];
    }
    root = multiply(root, 2);
  }

  const result = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result[0];
    result.shift();
    result.push(0);
    for (let i = 0; i < degree; i += 1) result[i] ^= multiply(divisor[i], factor);
  }
  return result;
}

function toCodewords(text: string, dataCapacity: number): number[] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const bits: number[] = [];
  const appendBits = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };

  appendBits(0b0100, 4); // Byte mode
  appendBits(bytes.length, 8); // Versions 1–9 use an 8-bit byte count
  bytes.forEach((byte) => appendBits(byte, 8));
  const capacityBits = dataCapacity * 8;
  if (bits.length > capacityBits) throw new Error("UPI QR payload is too long");
  appendBits(0, Math.min(4, capacityBits - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    codewords.push(bits.slice(i, i + 8).reduce((value, bit) => (value << 1) | bit, 0));
  }
  for (let pad = 0; codewords.length < dataCapacity; pad += 1) codewords.push(pad % 2 === 0 ? 0xec : 0x11);
  return codewords;
}

function makeMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  const version = QR_BLOCKS.findIndex((entry, idx) => idx > 0 && entry!.data * 8 >= 12 + bytes.length * 8);
  if (version < 1) throw new Error("UPI QR payload is too long");
  const spec = QR_BLOCKS[version]!;
  const size = 17 + version * 4;
  const matrix = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));

  const setFunction = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && y >= 0 && x < size && y < size) {
      matrix[y][x] = dark;
      reserved[y][x] = true;
    }
  };

  const finder = (centerX: number, centerY: number) => {
    for (let dy = -1; dy <= 7; dy += 1) {
      for (let dx = -1; dx <= 7; dx += 1) {
        const x = centerX + dx;
        const y = centerY + dy;
        const inside = dx >= 0 && dx <= 6 && dy >= 0 && dy <= 6;
        const ring = dx === 0 || dx === 6 || dy === 0 || dy === 6;
        const center = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
        setFunction(x, y, inside && (ring || center));
      }
    }
  };

  finder(0, 0);
  finder(size - 7, 0);
  finder(0, size - 7);

  for (let i = 8; i < size - 8; i += 1) {
    setFunction(i, 6, i % 2 === 0);
    setFunction(6, i, i % 2 === 0);
  }

  for (const centerY of ALIGNMENT_CENTERS[version] || []) {
    for (const centerX of ALIGNMENT_CENTERS[version] || []) {
      if (reserved[centerY][centerX]) continue;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const distance = Math.max(Math.abs(dx), Math.abs(dy));
          setFunction(centerX + dx, centerY + dy, distance !== 1);
        }
      }
    }
  }

  if (version >= 7) {
    const versionBits = (version << 12) | bchRemainder(version << 12, 0x1f25);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((versionBits >>> i) & 1) !== 0;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, bit);
      setFunction(b, a, bit);
    }
  }

  // Reserve both format-information copies; they are populated after data placement.
  for (let i = 0; i <= 5; i += 1) setFunction(8, i, false);
  setFunction(8, 7, false);
  setFunction(8, 8, false);
  setFunction(7, 8, false);
  for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, false);
  for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, false);
  for (let i = 8; i < 15; i += 1) setFunction(8, size - 15 + i, false);
  setFunction(8, size - 8, true);

  const data = toCodewords(text, spec.data);
  const dataPerBlock = spec.data / spec.blocks;
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let block = 0; block < spec.blocks; block += 1) {
    const blockData = data.slice(block * dataPerBlock, (block + 1) * dataPerBlock);
    dataBlocks.push(blockData);
    eccBlocks.push(errorCorrection(blockData, spec.ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < dataPerBlock; i += 1) dataBlocks.forEach((block) => codewords.push(block[i]));
  for (let i = 0; i < spec.ecc; i += 1) eccBlocks.forEach((block) => codewords.push(block[i]));

  let bitIndex = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let vert = 0; vert < size; vert += 1) {
      const y = upward ? size - 1 - vert : vert;
      for (let offset = 0; offset < 2; offset += 1) {
        const x = right - offset;
        if (reserved[y][x]) continue;
        let dark = false;
        if (bitIndex < codewords.length * 8) {
          dark = ((codewords[Math.floor(bitIndex / 8)] >>> (7 - (bitIndex % 8))) & 1) !== 0;
        }
        bitIndex += 1;
        if ((x + y) % 2 === 0) dark = !dark; // Mask pattern 0
        matrix[y][x] = dark;
      }
    }
  }

  // Error-correction level L (01), mask 0; BCH and fixed mask per QR specification.
  const formatData = 0b01000;
  const formatBits = ((formatData << 10) | bchRemainder(formatData << 10, 0x537)) ^ 0x5412;
  for (let i = 0; i <= 5; i += 1) matrix[i][8] = ((formatBits >>> i) & 1) !== 0;
  matrix[7][8] = ((formatBits >>> 6) & 1) !== 0;
  matrix[8][8] = ((formatBits >>> 7) & 1) !== 0;
  matrix[8][7] = ((formatBits >>> 8) & 1) !== 0;
  for (let i = 9; i < 15; i += 1) matrix[8][14 - i] = ((formatBits >>> i) & 1) !== 0;
  for (let i = 0; i < 8; i += 1) matrix[8][size - 1 - i] = ((formatBits >>> i) & 1) !== 0;
  for (let i = 8; i < 15; i += 1) matrix[size - 15 + i][8] = ((formatBits >>> i) & 1) !== 0;
  matrix[size - 8][8] = true;

  return matrix;
}

export function qrCodeSvgDataUrl(text: string): string {
  const matrix = makeMatrix(text);
  const quiet = 4;
  const size = matrix.length + quiet * 2;
  const squares: string[] = [];
  matrix.forEach((row, y) => row.forEach((dark, x) => {
    if (dark) squares.push(`<rect x="${x + quiet}" y="${y + quiet}" width="1" height="1"/>`);
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">${squares.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
