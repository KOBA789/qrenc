import { Version, QrErrors, QrError, EcLevel, Table, Mode, Modes, NormalVersion, EC_LEVEL_INT } from "./types";
import { chunks } from "./util";
import { Segment, parse, optimize, totalEncodedLen } from "./optimize";

type ExtendedMode =
  | { type: "Eci" }
  | { type: "Data"; data: Mode }
  | { type: "Fnc1First" }
  | { type: "Fnc1Second" }
  | { type: "StructuredAppend" };
const ExtendedModes: {
  Eci: ExtendedMode,
  Data(data: Mode): ExtendedMode,
  Fnc1First: ExtendedMode,
  Fnc1Second: ExtendedMode,
  StructuredAppend: ExtendedMode,
} = {
  Eci: { type: "Eci" },
  Data(data: Mode) { return { type: 'Data', data }; },
  Fnc1First: { type: "Fnc1First" },
  Fnc1Second: { type: "Fnc1Second" },
  StructuredAppend: { type: "StructuredAppend" },
};

const INITIAL_CAPACITY = 256;
export class Bits {
  private data: Uint8Array;
  private byteLength: number;
  private bitOffset: number;
  constructor(readonly version: Version) {
    this.data = new Uint8Array(INITIAL_CAPACITY);
    this.byteLength = 0;
    this.bitOffset = 0;
  }
  private grow() {
    const newData = new Uint8Array(this.data.length * 2);
    newData.set(this.data);
    this.data = newData;
  }
  private pushByte(byte: number) {
    if (this.byteLength === this.data.length) {
      this.grow();
    }
    this.data[this.byteLength++] = byte;
  }
  private pushBits(n: number, bits: number) {
    const b = this.bitOffset + n;
    const lastIndex = this.byteLength - 1;
    if (this.bitOffset === 0) {
      if (0 <= b && b <= 8) {
        this.pushByte((bits << (8 - b)) & 0xff);
      } else {
        this.pushByte((bits << (8 - b)) & 0xff);
      }
    } else if (0 <= b && b <= 8) {
      this.data[lastIndex] |= (bits << (8 - b)) & 0xff;
    } else if (9 <= b && b <= 16) {
      this.data[lastIndex] |= (bits >> (b - 8)) & 0xff;
      this.pushByte((bits << (16 - b)) & 0xff);
    } else {
      this.data[lastIndex] |= (bits >> (b - 8)) & 0xff;
      this.pushByte((bits >> (b - 16)) & 0xff);
      this.pushByte((bits << (24 - b)) & 0xff);
    }
    this.bitOffset = b & 7;
  }
  private pushBitsChecked(n: number, bits: number): null | QrError {
    if (n > 16 || bits >= 1 << n) {
      return QrErrors.DataTooLong;
    } else {
      this.pushBits(n, bits);
      return null;
    }
  }
  intoBytes(): Uint8Array {
    return this.data.subarray(0, this.byteLength);
  }
  length(): number {
    if (this.bitOffset === 0) {
      return this.byteLength * 8;
    } else {
      return (this.byteLength - 1) * 8 + this.bitOffset;
    }
  }
  isEmpty(): boolean {
    return this.byteLength === 0;
  }
  maxLength(ecLevel: EcLevel): number {
    return this.version.fetch(ecLevel, DATA_LENGTHS);
  }

  // Mode Indicator
  private modeBits(mode: ExtendedMode): number {
    switch (mode.type) {
      case "Data":
        switch (mode.data) {
          case Modes.Numeric:
            return 0b0001;
          case Modes.Alphanumeric:
            return 0b0010;
          case Modes.Byte:
            return 0b0100;
          case Modes.Kanji:
            return 0b1000;
        }
      case "Eci":
        return 0b0111;
      case "Fnc1First":
        return 0b0101;
      case "Fnc1Second":
        return 0b1001;
      case "StructuredAppend":
        return 0b0011;
    }
  }
  pushModeIndicator(mode: ExtendedMode): null | QrError {
    const bits = this.modeBits(mode);
    const n = this.version.modeBitsCount();
    const ret = this.pushBitsChecked(n, bits);
    if (ret !== null) {
      return QrErrors.UnsupportedCharacterSet;
    }
    return null;
  }

  // ECI

  pushEciDesignator(eciDesignator: number): null | QrError {
    this.pushModeIndicator(ExtendedModes.Eci);
    if (0 <= eciDesignator && eciDesignator <= 127) {
      this.pushBits(8, eciDesignator);
    } else if (128 <= eciDesignator && eciDesignator <= 16383) {
      this.pushBits(2, 0b10);
      this.pushBits(14, eciDesignator);
    } else if (16384 <= eciDesignator && eciDesignator <= 999999) {
      this.pushBits(3, 0b110);
      this.pushBits(5, eciDesignator >> 16);
      this.pushBits(16, eciDesignator & 0xFFFF);
    } else {
      return QrErrors.InvalidEciDesignator;
    }
    return null;
  }

  // Numeric mode

  pushHeader(mode: Mode, rawDataLen: number): null | QrError {
    const lengthBits = Mode.lengthBitsCount(mode, this.version);
    const err = this.pushModeIndicator(ExtendedModes.Data(mode));
    if (err !== null) {
      return err;
    }
    return this.pushBitsChecked(lengthBits, rawDataLen);
  }

  pushNumericData(data: Uint8Array): null | QrError {
    const err = this.pushHeader(Modes.Alphanumeric, data.length);
    if (err !== null) {
      return err;
    }
    for (const chunk of chunks(data, 3)) {
      const bits = chunk.map((b) => b - 0x30).reduce((a, b) => a * 10 + b, 0);
      const n = chunk.length * 3 + 1;
      this.pushBits(n, bits);
    }
    return null;
  }

  // Alphanumeric mode

  pushAlphanumericData(data: Uint8Array): null | QrError {
    const err = this.pushHeader(Modes.Alphanumeric, data.length);
    if (err !== null) {
      return err;
    }
    const dataLenEven = data.length - (data.length & 1);
    for (let i = 0; i < dataLenEven; i += 2) {
      const bits = alphanumericDigit(data[i]) * 45 + alphanumericDigit(data[i + 1]);
      this.pushBits(11, bits);
    }
    if ((data.length & 1) === 1) {
      const bits = alphanumericDigit(data[data.length - 1]);
      this.pushBits(6, bits);
    }
    return null;
  }

  // Byte mode

  pushByteData(data: Uint8Array): null | QrError {
    const err = this.pushHeader(Modes.Alphanumeric, data.length);
    if (err !== null) {
      return err;
    }
    for (const b of data) {
      this.pushBits(8, b);
    }
    return null;
  }

  // Kanji mode

  pushKanjiData(data: Uint8Array): null | QrError {
    const err = this.pushHeader(Modes.Alphanumeric, data.length);
    if (err !== null) {
      return err;
    }
    for (const kanji of chunks(data, 2)) {
      if (kanji.length !== 2) {
        return QrErrors.InvalidCharacter;
      }
      const cp = kanji[0] * 256 + kanji[1];
      const bytes = cp < 0xE040 ? cp - 0x8140 : cp - 0xC140;
      const bits = (bytes >> 8) * 0xC0 + (bytes & 0xFF);
      this.pushBits(13, bits);
    }
    return null;
  }

  // FNC1 mode

  pushFnc1FirstPosition(): null | QrError {
    return this.pushModeIndicator(ExtendedModes.Fnc1First);
  }

  pushFnc1SecondPosition(applicationIndicator: number): null | QrError {
    const ret = this.pushModeIndicator(ExtendedModes.Fnc1Second);
    if (ret !== null) {
      return ret;
    }
    this.pushBits(8, applicationIndicator);
    return null;
  }

  pushTerminator(ecLevel: EcLevel): null | QrError {
    const curLength = this.length();
    const dataLength = this.maxLength(ecLevel);
    if (curLength > dataLength) {
      return QrErrors.DataTooLong;
    }

    const terminatorSize = Math.min(4, dataLength - curLength);
    if (terminatorSize > 0) {
      this.pushBits(terminatorSize, 0);
    }

    if (this.length() < dataLength) {
      this.bitOffset = 0;
      const dataBytesLength = Math.floor(dataLength / 8);
      const paddingBytesCount = dataBytesLength - this.byteLength;
      const paddingBytesCountEven = paddingBytesCount - (paddingBytesCount & 1);
      for (let i = 0; i < paddingBytesCountEven; i ++) {
        this.pushByte(PADDING_BYTES[0]);
        this.pushByte(PADDING_BYTES[1]);
      }
      if (paddingBytesCount !== paddingBytesCountEven) {
        this.pushByte(PADDING_BYTES[0]);
      }
    }

    if (this.length() < dataLength) {
      this.pushByte(0);
    }

    return null;
  }

  pushSegment(subarr: Uint8Array, seg: Segment): null | QrError {
    switch (seg.mode) {
      case Modes.Numeric:
        return this.pushNumericData(subarr);
      case Modes.Alphanumeric:
        return this.pushAlphanumericData(subarr);
      case Modes.Byte:
        return this.pushByteData(subarr);
      case Modes.Kanji:
        return this.pushKanjiData(subarr);
    }
  }
  pushSegments(data: Uint8Array, segs: Iterable<Segment>): null | QrError {
    for (const seg of segs) {
      const subarr = data.subarray(seg.begin, seg.end);
      const err = this.pushSegment(subarr, seg);
      if (err !== null) {
        return err;
      }
    }
    return null;
  }
}

const AUTO_VERSIONS = [NormalVersion.tryFrom(9)!, NormalVersion.tryFrom(26)!, NormalVersion.tryFrom(40)!];
export function encodeAuto(data: Uint8Array, ecLevel: EcLevel): Bits | QrError {
  const segs = [...parse(data)];
  for (const version of AUTO_VERSIONS) {
    const optSegs = [...optimize(segs[Symbol.iterator](), version)];
    const totalLen = totalEncodedLen(optSegs, version);
    const dataCapacity = version.fetch(ecLevel, DATA_LENGTHS);
    if (totalLen <= dataCapacity) {
      const minVersion = findMinVersion(totalLen, ecLevel);
      const bits = new Bits(minVersion);
      let err;
      err = bits.pushSegments(data, optSegs);
      if (err !== null) {
        return err;
      }
      err = bits.pushTerminator(ecLevel);
      if (err != null) {
        return err;
      }
      return bits;
    }
  }
  return QrErrors.DataTooLong;
}

function findMinVersion(length: number, ecLevel: EcLevel): Version {
  let min = 0;
  let max = 39;
  while (min < max) {
    const half = Math.floor((min + max) / 2);
    if (DATA_LENGTHS[half][EC_LEVEL_INT[ecLevel]] < length) {
      min = half + 1;
    } else {
      max = half;
    }
  }
  return NormalVersion.tryFrom(min + 1)!;
}

const PADDING_BYTES = new Uint8Array([0b1110_1100, 0b0001_0001]);

function alphanumericDigit(char: number) {
  if (0x30 <= char && char <= 0x39) {
    return char - 0x30;
  } else if (0x41 <= char && char <= 0x5A) {
    return char - 0x41 + 10;
  } else if (char === 0x20) {
    return 36;
  } else if (char === 0x24) {
    return 37;
  } else if (char === 0x25) {
    return 38;
  } else if (char === 0x2A) {
    return 39;
  } else if (char === 0x2B) {
    return 40;
  } else if (char === 0x2D) {
    return 41;
  } else if (char === 0x2E) {
    return 42;
  } else if (char === 0x2F) {
    return 43;
  } else if (char === 0x3A) {
    return 44;
  } else {
    return 0;
  }
}

// prettier-ignore
const DATA_LENGTHS: Table<number> = [
  [152, 128, 104, 72],
  [272, 224, 176, 128],
  [440, 352, 272, 208],
  [640, 512, 384, 288],
  [864, 688, 496, 368],
  [1088, 864, 608, 480],
  [1248, 992, 704, 528],
  [1552, 1232, 880, 688],
  [1856, 1456, 1056, 800],
  [2192, 1728, 1232, 976],
  [2592, 2032, 1440, 1120],
  [2960, 2320, 1648, 1264],
  [3424, 2672, 1952, 1440],
  [3688, 2920, 2088, 1576],
  [4184, 3320, 2360, 1784],
  [4712, 3624, 2600, 2024],
  [5176, 4056, 2936, 2264],
  [5768, 4504, 3176, 2504],
  [6360, 5016, 3560, 2728],
  [6888, 5352, 3880, 3080],
  [7456, 5712, 4096, 3248],
  [8048, 6256, 4544, 3536],
  [8752, 6880, 4912, 3712],
  [9392, 7312, 5312, 4112],
  [10208, 8000, 5744, 4304],
  [10960, 8496, 6032, 4768],
  [11744, 9024, 6464, 5024],
  [12248, 9544, 6968, 5288],
  [13048, 10136, 7288, 5608],
  [13880, 10984, 7880, 5960],
  [14744, 11640, 8264, 6344],
  [15640, 12328, 8920, 6760],
  [16568, 13048, 9368, 7208],
  [17528, 13800, 9848, 7688],
  [18448, 14496, 10288, 7888],
  [19472, 15312, 10832, 8432],
  [20528, 15936, 11408, 8768],
  [21616, 16816, 12016, 9136],
  [22496, 17728, 12656, 9776],
  [23648, 18672, 13328, 10208],
];
