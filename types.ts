export type QrErrorKind = 'data_too_long' | 'invalid_version' | 'unsupported_character_set' | 'invalid_character';

export class QrError {
  constructor(readonly kind: QrErrorKind) {}
}

export type EcLevel = 'L' | 'M' | 'Q' | 'H';
export const EcLevel = {
  tryFrom(ecLevelStr: string): EcLevel | null {
    switch (ecLevelStr) {
      case 'L':
      case 'M':
      case 'Q':
      case 'H':
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


export type ModeKind = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';
