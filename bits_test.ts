import * as assert from "assert";
import { Bits } from "./bits";
import { NormalVersion } from "./types";

(function test9() {
  const bits = new Bits(NormalVersion.tryFrom(1)!);
  assert.strictEqual(bits.pushEciDesignator(9), null);
  assert.deepStrictEqual(bits.intoBytes(), new Uint8Array([0b01110000, 0b10010000]));
})();

(function testPushBits() {
  const bits = new Bits(NormalVersion.tryFrom(1)!) as any;
  bits.pushBits(3, 0b010);
  bits.pushBits(3, 0b110);
  bits.pushBits(3, 0b101);
  bits.pushBits(7, 0b001_1010);
  bits.pushBits(4, 0b1100);
  bits.pushBits(12, 0b1011_0110_1101);
  bits.pushBits(10, 0b01_1001_0001);
  bits.pushBits(15, 0b111_0010_1110_0011);
  const bytes = bits.intoBytes();
  assert.deepStrictEqual(bytes, new Uint8Array([
    0b010_110_10, // 90
    0b1_001_1010, // 154
    0b1100_1011,  // 203
    0b0110_1101,  // 109
    0b01_1001_00, // 100
    0b01_111_001, // 121
    0b0_1110_001, // 113
    0b1_0000000,  // 128
  ]));
})();

(function testIso18004_2006example1() {
  const bits = new Bits(NormalVersion.tryFrom(1)!);
  assert.equal(bits.pushNumericData(new TextEncoder().encode("01234567")), null);
  assert.deepStrictEqual(bits.intoBytes(), new Uint8Array([
    0b0001_0000, 0b001000_00, 0b00001100, 0b01010110, 0b01_100001, 0b1_0000000
  ]));
})();
