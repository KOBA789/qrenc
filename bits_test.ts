import * as assert from "assert";
import { Bits } from "./bits";
import { NormalVersion } from "./types";

(function test9() {
  const bits = new Bits(NormalVersion.tryFrom(1)!);
  assert.strictEqual(bits.pushEciDesignator(9), null);
  assert.deepStrictEqual(bits.intoBytes(), new Uint8Array([0b01110000, 0b10010000]));
})();
