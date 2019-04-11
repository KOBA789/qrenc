export type QrErrorKind =
  | "data_too_long"
  | "invalid_version"
  | "unsupported_character_set"
  | "invalid_character";

export class QrError {
  constructor(readonly kind: QrErrorKind) {}
}

export type EcLevel = "L" | "M" | "Q" | "H";
export const EcLevel = {
  tryFrom(ecLevelStr: string): EcLevel | null {
    switch (ecLevelStr) {
      case "L":
      case "M":
      case "Q":
      case "H":
        return ecLevelStr;
      default:
        return null;
    }
  }
};

export const EC_LEVEL_INT: {
  L: 0;
  M: 1;
  Q: 2;
  H: 3;
} = {
  L: 0,
  M: 1,
  Q: 2,
  H: 3
};

export type Table<T> = [T, T, T, T][];
export interface IVersion {
  width(): number;
  fetch<T>(ecLevel: EcLevel, table: Table<T>): T;
  modeBitsCount(): number;
  isMicro(): boolean;
}
export class NormalVersion implements IVersion {
  static tryFrom(versionNumber: number): NormalVersion | null {
    if (1 <= versionNumber && versionNumber <= 40) {
      return new NormalVersion(versionNumber);
    }
    return null;
  }
  private constructor(readonly v: number) {}

  width(): number {
    return this.v * 4 + 17;
  }

  fetch<T>(ecLevel: EcLevel, table: [T, T, T, T][]): T {
    return table[this.v - 1][EC_LEVEL_INT[ecLevel]];
  }

  modeBitsCount(): number {
    return 4;
  }

  isMicro(): boolean {
    return false;
  }
}
export type Version = NormalVersion;

export type Mode = "numeric" | "alphanumeric" | "byte" | "kanji";

type BitsMap = { [key in Mode]: number };
const LENGTH_BITS_MAP_9: BitsMap = {
  numeric: 10,
  alphanumeric: 9,
  byte: 8,
  kanji: 8,
};
const LENGTH_BITS_MAP_26: BitsMap = {
  numeric: 12,
  alphanumeric: 11,
  byte: 16,
  kanji: 10,
};
const LENGTH_BITS_MAP_OTHER: BitsMap = {
  numeric: 14,
  alphanumeric: 13,
  byte: 16,
  kanji: 12,
};
export const Mode = {
  lengthBitsCount(mode: Mode, version: Version): number {
    if (version.v <= 9) {
      return LENGTH_BITS_MAP_9[mode];
    }
    if (version.v <= 26) {
      return LENGTH_BITS_MAP_26[mode];
    }
    return LENGTH_BITS_MAP_OTHER[mode];
  },
  dataBitsCount(mode: Mode, rawDataLen: number): number {
    switch (mode) {
      case "numeric":
        return Math.floor((rawDataLen * 10 + 2) / 3);
      case "alphanumeric":
        return Math.floor((rawDataLen * 11 + 1) / 2);
      case "byte":
        return rawDataLen * 8;
      case "kanji":
        return rawDataLen * 13;
    }
  },
  max(a: Mode, b: Mode): Mode {
    switch (Mode.partialCmp(a, b)) {
      case -1:
      case 0:
        return b;
      case 1:
        return a;
      default:
        return "byte";
    }
  },
  partialCmp(a: Mode, b: Mode): -1 | 0 | 1 | null {
    const less =
      (a === 'numeric' && b === 'alphanumeric') ||
      (a === 'numeric' && b === 'byte') ||
      (a === 'alphanumeric' && b === 'byte') ||
      (a === 'kanji' && b === 'byte')
    ;
    if (less) {
      return -1;
    }
    const greater =
      (a === 'alphanumeric' && b === 'numeric') ||
      (a === 'byte' && b === 'numeric') ||
      (a === 'byte' && b === 'alphanumeric') ||
      (a === 'byte' && b === 'kanji')
    ;
    if (greater) {
      return 1;
    }
    if (a === b) {
      return 0;
    }
    return null;
  }
};
