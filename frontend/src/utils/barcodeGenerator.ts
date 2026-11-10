/**
 * Code 128 (Subset B) Barcode Generator in Pure TypeScript
 * Generates crisp, standard-compliant SVG barcodes for retail stickers and POS scanning.
 */

// Code 128 patterns (index = character code 0-106)
// Each number represents widths of alternating bars and spaces (3 bars, 3 spaces = 6 digits)
const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "233111"                                   // 100-106
];

const START_CODE_B = 104; // Start Code B for ASCII 32-127
const STOP_CODE = 106;

/**
 * Encodes text into a sequence of bar widths (1-4 modules each)
 */
export function encodeCode128(text: string): { widths: number[]; checkDigit: number } {
  // Clean string to ASCII 32-126
  const clean = text.replace(/[^\x20-\x7E]/g, " ").trim() || "000000";
  const codes: number[] = [START_CODE_B];
  let checkSum = START_CODE_B;

  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i) - 32;
    codes.push(charCode);
    checkSum += charCode * (i + 1);
  }

  const checkDigit = checkSum % 103;
  codes.push(checkDigit);
  codes.push(STOP_CODE);

  // Convert codes to pattern widths
  const widths: number[] = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code] || CODE128_PATTERNS[0];
    for (let j = 0; j < pattern.length; j++) {
      widths.push(parseInt(pattern[j], 10));
    }
  }

  // Stop character has an extra terminating bar of width 2
  widths.push(2);

  return { widths, checkDigit };
}

/**
 * Generates an SVG path string for Code 128 barcode
 */
export function generateBarcodeSvg(
  text: string,
  options: {
    height?: number;
    moduleWidth?: number;
    showText?: boolean;
    fontSize?: number;
  } = {}
): {
  svgPath: string;
  totalWidth: number;
  totalHeight: number;
  viewBox: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
} {
  const height = options.height || 45;
  const moduleWidth = options.moduleWidth || 1.8;
  const quietZoneModules = 10;

  const { widths } = encodeCode128(text);
  const rects: Array<{ x: number; y: number; width: number; height: number }> = [];

  let currentX = quietZoneModules * moduleWidth;
  let isBar = true; // starts with a bar

  for (const w of widths) {
    const barWidth = w * moduleWidth;
    if (isBar) {
      rects.push({
        x: currentX,
        y: 0,
        width: barWidth,
        height: height,
      });
    }
    currentX += barWidth;
    isBar = !isBar;
  }

  const totalWidth = currentX + quietZoneModules * moduleWidth;
  const totalHeight = height + (options.showText ? (options.fontSize || 12) + 6 : 0);

  const path = rects
    .map((r) => `M${r.x.toFixed(1)},${r.y.toFixed(1)} h${r.width.toFixed(1)} v${r.height.toFixed(1)} h-${r.width.toFixed(1)} Z`)
    .join(" ");

  return {
    svgPath: path,
    totalWidth,
    totalHeight,
    viewBox: `0 0 ${totalWidth.toFixed(1)} ${totalHeight.toFixed(1)}`,
    rects,
  };
}
