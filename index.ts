import { Bits } from "./bits";
import { Version, EcLevel, QrError } from "./types";
import { constructCodewords, maxAllowedErrors } from "./ec";
import { Canvas } from "./canvas";

export default class QrCode {
  static withVersion(data: Uint8Array, version: Version, ecLevel: EcLevel): QrCode | QrError {
    const bits = new Bits(version);
    let err;
    err = bits.pushOptimalData(data);
    if (err !== null) {
      return err;
    }
    err = bits.pushTerminator(ecLevel);
    if (err !== null) {
      return err;
    }
    return this.withBits(bits, ecLevel);
  }

  static withBits(bits: Bits, ecLevel: EcLevel): QrCode {
    const version = bits.version;
    const data = bits.intoBytes();
    const [encodedData, ecData] = constructCodewords(data, version, ecLevel);
    const canvas = new Canvas(version, ecLevel);
    canvas.drawAllFunctionalPatterns();
    canvas.drawData(encodedData, ecData);
    const canvas2 = canvas.applyBestMask();
    return new QrCode(canvas2, version, ecLevel, version.width());
  }

  constructor(
    private readonly content: Canvas,
    readonly version: Version,
    readonly ecLevel: EcLevel,
    readonly width: number,
  ) {}

  maxAllowedErrors(): number {
    return maxAllowedErrors(this.version, this.ecLevel);
  }

  toColors(): Uint8Array {
    return this.content.toColors();
  }
}

import * as types from "./types";
import * as ec from "./ec";
import * as bits from "./bits";
import * as canvas from "./canvas";
export {
  types,
  ec,
  bits,
  canvas,
};
