import { Version, EcLevel, Color, Colors, EC_LEVEL_INT } from "./types";
import { rangeE } from "./util";

export const Modules: {
  Empty:         0b000,
  MaskedLight:   0b010,
  MaskedDark:    0b011,
  UnmaskedLight: 0b100,
  UnmaskedDark:  0b101,
} = {
  Empty:         0b000,
  MaskedLight:   0b010,
  MaskedDark:    0b011,
  UnmaskedLight: 0b100,
  UnmaskedDark:  0b101,
};
export type ModuleKind = keyof typeof Modules;
export type Module = typeof Modules[ModuleKind];

export const Module = {
  isDark(mod: Module): boolean {
    return (mod & 0b001) !== 0;
  },

  isMasked(mod: Module): boolean {
    return (mod & 0b010) !== 0;
  },

  isUnmasked(mod: Module): boolean {
    return (mod & 0b100) !== 0;
  },

  mask(mod: Module, shouldInvert: boolean): Module {
    if (mod === Modules.Empty) {
      if (shouldInvert) {
        return Modules.MaskedDark;
      } else {
        return Modules.MaskedLight;
      }
    } else if (shouldInvert && Module.isUnmasked(mod)) {
      return (mod & 0b001 ^ 0b001 | 0b010) as Module;
    } else {
      return (mod & 0b001 | 0b010) as Module;
    }
  },

  Masked(color: Color): Module {
    return (0b010 | color) as Module;
  },
  Unmasked(color: Color): Module {
    return (0b100 | color) as Module;
  },
};

export class Canvas {
  private readonly width: number;
  private readonly modules: Uint8Array;
  constructor(private readonly version: Version, private ecLevel: EcLevel) {
    this.width = version.width();
    this.modules = new Uint8Array(this.width * this.width);
  }

  clone(): Canvas {
    const c = new Canvas(this.version, this.ecLevel);
    c.modules.set(this.modules);
    return c;
  }

  toDebugString(): string {
    const buf = [];
    for (let y = 0; y < this.width; ++ y) {
      const line = [];
      for (let x = 0; x < this.width; ++ x) {
        line.push(DEBUG_CHAR_MAP[this.get(x, y)]);
      }
      buf.push(line.join(''));
    }
    return buf.join('\n');
  }

  coodsToIndex(x: number, y: number): number {
    const x2 = x < 0 ? x + this.width : x;
    const y2 = y < 0 ? y + this.width : y;
    return y2 * this.width + x2;
  }

  get(x: number, y: number): Module {
    return this.modules[this.coodsToIndex(x, y)] as Module;
  }

  put(x: number, y: number, color: Color) {
    this.putModule(x, y, Module.Masked(color));
  }

  putModule(x: number, y: number, mod: Module) {
    this.modules[this.coodsToIndex(x, y)] = mod;
  }

  drawFinderPatternAt(x: number, y: number) {
    const [dxLeft, dxRight] = x >= 0 ? [-3, 4] : [-4, 3];
    const [dyTop, dyBottom] = y >= 0 ? [-3, 4] : [-4, 3];
    for (let k = dyTop; k <= dyBottom; ++ k) {
      for (let i = dxLeft; i <= dxRight; ++ i) {
        const color = FINDER_PATTERN[(i + 4) + (k + 4) * 9] as Color;
        this.put(x + i, y + k, color);
      }
    }
  }

  drawFinderPatterns() {
    this.drawFinderPatternAt(3, 3);
    this.drawFinderPatternAt(-4, 3);
    this.drawFinderPatternAt(3, -4);
  }

  drawAlignmentPattenAt(x: number, y: number) {
    if (this.get(x, y) !== Modules.Empty) {
      return;
    }
    for (let k = -2; k <= 2; ++ k) {
      for (let i = -2; i <= 2; ++ i) {
        this.put(x + i, y + k, ALIGNMENT_PATTERN[(i + 2) + (k + 2) * 5] as Color);
      }
    }
  }

  drawAlignmentPattens() {
    if (this.version.v === 1) {
      return;
    } else if (2 <= this.version.v && this.version.v <= 6) {
      this.drawAlignmentPattenAt(-7, -7);
    } else {
      const positions = ALIGNMENT_PATTERN_POSITIONS[this.version.v - 7];
      for (const x of positions) {
        for (const y of positions) {
          this.drawAlignmentPattenAt(x, y);
        }
      }
    }
  }

  drawHorizontalLine(x1: number, y: number, len: number, colorEven: Color, colorOdd: Color) {
    for (let x = x1; x < x1 + len; ++ x) {
      this.put(x, y, x % 2 === 0 ? colorEven : colorOdd);
    }
  }

  drawVerticalLine(x: number, y1: number, len: number, colorEven: Color, colorOdd: Color) {
    for (let y = y1; y < y1 + len; ++ y) {
      this.put(x, y, y % 2 === 0 ? colorEven : colorOdd);
    }
  }

  drawTimingPatterns() {
    const len = this.width - 16;
    this.drawHorizontalLine(8, 6, len, Colors.Dark, Colors.Light);
    this.drawVerticalLine(6, 8, len, Colors.Dark, Colors.Light);
  }

  drawNumber(bits: number, n: number, onColor: Color, offColor: Color, coords: [number, number][]) {
    let mask = 1 << (n - 1);
    for(const [x, y] of coords) {
      const color = (mask & bits) === 0 ? offColor : onColor;
      this.put(x, y, color);
      mask >>= 1;
    }
  }

  drawFormatInfoPatternsWithNumber(formatInfo: number) {
    this.drawNumber(formatInfo, 15, Colors.Dark, Colors.Light, FORMAT_INFO_COORDS_QR_MAIN);
    this.drawNumber(formatInfo, 15, Colors.Dark, Colors.Light, FORMAT_INFO_COORDS_QR_SIDE);
    this.put(8, -8, Colors.Dark);
  }

  drawReservedFormatInfoPatterns() {
    this.drawFormatInfoPatternsWithNumber(0);
  }

  drawVersionInfoPatterns() {
    if (this.version.v <= 6) {
      return;
    }
    const versionInfo = VERSION_INFOS[this.version.v - 7];
    this.drawNumber(versionInfo, 18, Colors.Dark, Colors.Light, VERSION_INFO_COORDS_BL);
    this.drawNumber(versionInfo, 18, Colors.Dark, Colors.Light, VERSION_INFO_COORDS_TR);
  }

  drawAllFunctionalPatterns() {
    this.drawFinderPatterns();
    this.drawAlignmentPattens();
    this.drawReservedFormatInfoPatterns();
    this.drawTimingPatterns();
    this.drawVersionInfoPatterns();
  }

  drawCodewords(codewords: Uint8Array, isHalfCodewordAtEnd: boolean, coords: Iterator<[number, number]>) {
    const len = codewords.length;
    const lastWord = isHalfCodewordAtEnd ? len - 1 : len;
    for (let i = 0; i < len; ++ i) {
      const b = codewords[i];
      const bitsEnd = i === lastWord ? 4 : 0;
      for (let k = 7; k >= bitsEnd; -- k) {
        const color = (b & (1 << k)) === 0 ? Colors.Light : Colors.Dark;
        while (true) {
          const next = coords.next();
          if (next.done) {
            return;
          }
          const [x, y] = next.value;
          if (this.get(x, y) === Modules.Empty) {
            this.putModule(x, y, Module.Unmasked(color));
            break;
          }
        }
      }
    }
  }

  drawData(data: Uint8Array, ec: Uint8Array) {
    const isHalfCodewordAtEnd = false;
    const coords = dataModules(this.version);
    this.drawCodewords(data, isHalfCodewordAtEnd, coords);
    this.drawCodewords(ec, false, coords);
  }

  applyMask(pattern: MaskPattern) {
    const maskFn = MASK_FUNCTION_MAP[pattern];
    for (let x = 0; x < this.width; ++ x) {
      for (let y = 0; y < this.width; ++ y) {
        const mod = this.get(x, y);
        this.putModule(x, y, Module.mask(mod, maskFn(x, y)));
      }
    }

    this.drawFormatInfoPatterns(pattern);
  }

  drawFormatInfoPatterns(pattern: MaskPattern) {
    const simpleFormatNumber = (EC_LEVEL_INT[this.ecLevel] ^ 1) << 3 | pattern;
    const formatNumber = FORMAT_INFOS_QR[simpleFormatNumber];
    this.drawFormatInfoPatternsWithNumber(formatNumber);
  }

  computeAdjacentPenaltyScore(isHorizontal: boolean): number {
    let totalScore = 0;
    for (let i = 0; i < this.width; ++ i) {
      let lastMod: Module = Modules.Empty;
      let consecutiveLen = 1;
      for (let k = 0; k < this.width; ++ k) {
        const mod = isHorizontal ? this.get(k, i) : this.get(i, k);
        if (mod === lastMod) {
          consecutiveLen += 1;
        } else {
          lastMod = mod;
          if (consecutiveLen >= 5) {
            totalScore += consecutiveLen - 2;
          }
          consecutiveLen = 1;
        }
      }
      if (Modules.Empty === lastMod) {
        consecutiveLen += 1;
      } else {
        if (consecutiveLen >= 5) {
          totalScore += consecutiveLen - 2;
        }
        consecutiveLen = 1;
      }
    }
    return totalScore;
  }

  computeBlockPenaltyScore(): number {
    let totalScore = 0;
    for (let i = 0; i < this.width - 1; ++ i) {
      for (let k = 0; k < this.width - 1; ++ k) {
        const here = this.get(i, k);
        const right = this.get(i + 1, k);
        const bottom = this.get(i, k + 1);
        const bottomRight = this.get(i + 1, k + 1);
        if (here === right && right === bottom && bottom === bottomRight) {
          totalScore += 3;
        }
      }
    }
    return totalScore;
  }

  computeFinderPenaltyScore(isHorizontal: boolean): number {
    const PATTERN = [Colors.Dark, Colors.Light, Colors.Dark, Colors.Dark, Colors.Dark, Colors.Light, Colors.Dark];
    let totalScore = 0;
    for (let i = 0; i < this.width; ++ i) {
      for (let j = 0; j < this.width - 6; ++ j) {
        const get = isHorizontal
          ? (k: number) => {
              return (this.get(k, i) & 0b1) as Color;
            }
          : (k: number) => {
              return (this.get(i, k) & 0b1) as Color;
            };

        if (PATTERN.some((color, idx) => get(j + idx) !== color)) {
          continue;
        }

        const check = (k: number) => 0 <= k && k < this.width && get(k) !== Colors.Light;
        if (![...rangeE(j - 4, j)].some(check) || ![...rangeE(j + 7, j + 11)].some(check)) {
          totalScore += 40;
        }
      }
    }
    return totalScore - 360;
  }

  computeBalancePenaltyScore(): number {
    const darkMods = this.modules.filter(Module.isDark as any).length;
    const totalMods = this.modules.length;
    const ratio = Math.floor(darkMods * 200 / totalMods);
    if (ratio >= 100) {
      return ratio - 100;
    } else {
      return 100 - ratio;
    }
  }

  computeLightSidePenaltyScore(): number {
    let h = 0;
    for (let i = 1; i < this.width; ++ i) {
      if (!Module.isDark(this.get(i, -1))) {
        h += 1;
      }
    }
    let v = 0;
    for (let i = 1; i < this.width; ++ i) {
      if (!Module.isDark(this.get(-1, i))) {
        v += 1;
      }
    }
    return (h + v + 15 * Math.max(h, v));
  }

  computeTotalPenaltyScores(): number {
    const s1A = this.computeAdjacentPenaltyScore(true);
    const s1B = this.computeAdjacentPenaltyScore(false);
    const s2 = this.computeBlockPenaltyScore();
    const s3A = this.computeFinderPenaltyScore(true);
    const s3B = this.computeFinderPenaltyScore(false);
    const s4 = this.computeBalancePenaltyScore();
    return s1A + s1B + s2 + s3A + s3B + s4;
  }

  applyBestMask(): Canvas {
    return ALL_PATTERNS_QR.map((pat) => {
      const c = this.clone();
      c.applyMask(pat);
      return [c.computeTotalPenaltyScores(), c] as [number, Canvas];
    }).sort(([a, _], [b, __]) => a - b)[0][1];
  }

  toColors(): Uint8Array {
    return this.modules.map((mod) => (mod & 0b1) as Color);
  }
}

// prettier-ignore
const FINDER_PATTERN = new Uint8Array([
  0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 1, 1, 1, 1, 1, 1, 1, 0,
  0, 1, 0, 0, 0, 0, 0, 1, 0,
  0, 1, 0, 1, 1, 1, 0, 1, 0,
  0, 1, 0, 1, 1, 1, 0, 1, 0,
  0, 1, 0, 1, 1, 1, 0, 1, 0,
  0, 1, 0, 0, 0, 0, 0, 1, 0,
  0, 1, 1, 1, 1, 1, 1, 1, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

// prettier-ignore
const ALIGNMENT_PATTERN = new Uint8Array([
  1, 1, 1, 1, 1,
  1, 0, 0, 0, 1,
  1, 0, 1, 0, 1,
  1, 0, 0, 0, 1,
  1, 1, 1, 1, 1,
]);

const ALIGNMENT_PATTERN_POSITIONS = [
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

const DEBUG_CHAR_MAP = {
  [Modules.Empty]: '?',
  [Modules.MaskedLight]: '.',
  [Modules.MaskedDark]: '#',
  [Modules.UnmaskedLight]: '-',
  [Modules.UnmaskedDark]: '*',
};

const FORMAT_INFO_COORDS_QR_MAIN: [number, number][] = [
  [0, 8],
  [1, 8],
  [2, 8],
  [3, 8],
  [4, 8],
  [5, 8],
  [7, 8],
  [8, 8],
  [8, 7],
  [8, 5],
  [8, 4],
  [8, 3],
  [8, 2],
  [8, 1],
  [8, 0],
];

const FORMAT_INFO_COORDS_QR_SIDE: [number, number][] = [
  [8, -1],
  [8, -2],
  [8, -3],
  [8, -4],
  [8, -5],
  [8, -6],
  [8, -7],
  [-8, 8],
  [-7, 8],
  [-6, 8],
  [-5, 8],
  [-4, 8],
  [-3, 8],
  [-2, 8],
  [-1, 8],
];

// prettier-ignore
const VERSION_INFOS = [
  0x07c94, 0x085bc, 0x09a99, 0x0a4d3, 0x0bbf6, 0x0c762, 0x0d847, 0x0e60d, 0x0f928, 0x10b78, 0x1145d, 0x12a17,
  0x13532, 0x149a6, 0x15683, 0x168c9, 0x177ec, 0x18ec4, 0x191e1, 0x1afab, 0x1b08e, 0x1cc1a, 0x1d33f, 0x1ed75,
  0x1f250, 0x209d5, 0x216f0, 0x228ba, 0x2379f, 0x24b0b, 0x2542e, 0x26a64, 0x27541, 0x28c69,
];

const VERSION_INFO_COORDS_BL: [number, number][] = [
  [5, -9],
  [5, -10],
  [5, -11],
  [4, -9],
  [4, -10],
  [4, -11],
  [3, -9],
  [3, -10],
  [3, -11],
  [2, -9],
  [2, -10],
  [2, -11],
  [1, -9],
  [1, -10],
  [1, -11],
  [0, -9],
  [0, -10],
  [0, -11],
];

const VERSION_INFO_COORDS_TR: [number, number][] = [
  [-9, 5],
  [-10, 5],
  [-11, 5],
  [-9, 4],
  [-10, 4],
  [-11, 4],
  [-9, 3],
  [-10, 3],
  [-11, 3],
  [-9, 2],
  [-10, 2],
  [-11, 2],
  [-9, 1],
  [-10, 1],
  [-11, 1],
  [-9, 0],
  [-10, 0],
  [-11, 0],
];

// prettier-ignore
const FORMAT_INFOS_QR: number[] = [
  0x5412, 0x5125, 0x5e7c, 0x5b4b, 0x45f9, 0x40ce, 0x4f97, 0x4aa0, 0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318,
  0x6c41, 0x6976, 0x1689, 0x13be, 0x1ce7, 0x19d0, 0x0762, 0x0255, 0x0d0c, 0x083b, 0x355f, 0x3068, 0x3f31, 0x3a06,
  0x24b4, 0x2183, 0x2eda, 0x2bed,
];

const NORMAL_VER_TIMING_PATTERN_COLUMN = 6;
export function *dataModules(version: Version): IterableIterator<[number, number]> {
  const width = version.width();
  const timingPatternColumn = NORMAL_VER_TIMING_PATTERN_COLUMN;
  let x = width - 1;
  let y = width - 1;
  while (true) {
    const adjustedRefCol = x <= timingPatternColumn ? x + 1 : x;
    if (adjustedRefCol <= 0) {
      break;
    }
    yield [x, y];
    const columnType = (width - adjustedRefCol) % 4;

    if (columnType === 2 && y > 0) {
      y -= 1;
      x += 1;
    } else if (columnType === 0 && y < width - 1) {
      y += 1;
      x += 1;
    } else if ((columnType === 0 || columnType === 2) && x === timingPatternColumn + 1) {
      x -= 2;
    } else {
      x -= 1;
    }
  }
}

export const MaskPatterns: {
  Checkerboard: 0b000,
  HorizontalLines: 0b001,
  VerticalLines: 0b010,
  DiagonalLines: 0b011,
  LargeCheckerboard: 0b100,
  Fields: 0b101,
  Diamonds: 0b110,
  Meadow: 0b111,
} = {
  /// QR code pattern 000: `(x + y) % 2 == 0`.
  Checkerboard: 0b000,
  /// QR code pattern 001: `y % 2 == 0`.
  HorizontalLines: 0b001,
  /// QR code pattern 010: `x % 3 == 0`.
  VerticalLines: 0b010,
  /// QR code pattern 011: `(x + y) % 3 == 0`.
  DiagonalLines: 0b011,
  /// QR code pattern 100: `((x/3) + (y/2)) % 2 == 0`.
  LargeCheckerboard: 0b100,
  /// QR code pattern 101: `(x*y)%2 + (x*y)%3 == 0`.
  Fields: 0b101,
  /// QR code pattern 110: `((x*y)%2 + (x*y)%3) % 2 == 0`.
  Diamonds: 0b110,
  /// QR code pattern 111: `((x+y)%2 + (x*y)%3) % 2 == 0`.
  Meadow: 0b111,
};
export type MaskPatternKind = keyof typeof MaskPatterns;
export type MaskPattern = typeof MaskPatterns[MaskPatternKind];

type MaskFunction = (x: number, y: number) => boolean;
const MaskFunctions: {
  [key: string]: MaskFunction,
} = {
  checkerboard(x: number, y: number): boolean {
    return (x + y) % 2 === 0;
  },
  horizontalLines(_: number, y: number): boolean {
    return y % 2 === 0;
  },
  verticalLines(x: number, _: number): boolean {
    return x % 3 ===0;
  },
  diagonalLines(x: number, y: number): boolean {
    return (x + y) % 3 === 0;
  },
  largeCheckerboard(x: number, y: number): boolean {
    return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
  },
  fields(x: number, y: number): boolean {
    return (x * y) % 2 + (x * y) % 3 === 0;
  },
  diamonds(x: number, y: number): boolean {
    return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
  },
  meadow(x: number, y: number): boolean {
    return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
  }
};

const MASK_FUNCTION_MAP: {
  [key in MaskPattern]: MaskFunction
} = {
  [MaskPatterns.Checkerboard]: MaskFunctions.checkerboard,
  [MaskPatterns.HorizontalLines]: MaskFunctions.horizontalLines,
  [MaskPatterns.VerticalLines]: MaskFunctions.verticalLines,
  [MaskPatterns.DiagonalLines]: MaskFunctions.diagonalLines,
  [MaskPatterns.LargeCheckerboard]: MaskFunctions.largeCheckerboard,
  [MaskPatterns.Fields]: MaskFunctions.fields,
  [MaskPatterns.Diamonds]: MaskFunctions.diamonds,
  [MaskPatterns.Meadow]: MaskFunctions.meadow,
};

const ALL_PATTERNS_QR = [
  MaskPatterns.Checkerboard,
  MaskPatterns.HorizontalLines,
  MaskPatterns.VerticalLines,
  MaskPatterns.DiagonalLines,
  MaskPatterns.LargeCheckerboard,
  MaskPatterns.Fields,
  MaskPatterns.Diamonds,
  MaskPatterns.Meadow,
];
