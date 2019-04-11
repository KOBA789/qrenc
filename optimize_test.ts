import * as assert from "assert";
import * as util from "util";

import { parse, Segment, totalEncodedLen, optimize } from "./optimize";
import { Modes, Version, NormalVersion } from "./types";

(function testParse1() {
  // prettier-ignore
  const segs = parse(Buffer.from("01049123451234591597033130128%10ABC123"));
  assert.deepStrictEqual(
    [...segs],
    [
      new Segment(Modes.Numeric, 0, 29),
      new Segment(Modes.Alphanumeric, 29, 30),
      new Segment(Modes.Numeric, 30, 32),
      new Segment(Modes.Alphanumeric, 32, 35),
      new Segment(Modes.Numeric, 35, 38)
    ]
  );
})();

(function testParseShiftJisExample1() {
  // prettier-ignore
  const segs = parse(new Uint8Array([0x82, 0xa0, 0x81, 0x41, 0x41, 0xb1, 0x81, 0xf0]));
  assert.deepStrictEqual(
    [...segs],
    [
      new Segment(Modes.Kanji, 0, 4),
      new Segment(Modes.Alphanumeric, 4, 5),
      new Segment(Modes.Byte, 5, 6),
      new Segment(Modes.Kanji, 6, 8)
    ]
  );
})();

(function testParseUtf8() {
  // prettier-ignore
  const segs = parse(new Uint8Array([0xe3,0x81,0x82,0xe3,0x80,0x81,0x41,0xef,0xbd,0xb1,0xe2,0x84,0xab]));
  assert.deepStrictEqual(
    [...segs],
    [
      new Segment(Modes.Kanji, 0, 4),
      new Segment(Modes.Byte, 4, 5),
      new Segment(Modes.Kanji, 5, 7),
      new Segment(Modes.Byte, 7, 10),
      new Segment(Modes.Kanji, 10, 12),
      new Segment(Modes.Byte, 12, 13)
    ]
  );
})();

function testOptimizationResult(
  given: Segment[],
  expected: Segment[],
  version: Version
) {
  const prevLen = totalEncodedLen(given, version);
  const optSegs = [...optimize(given[Symbol.iterator](), version)];
  const newLen = totalEncodedLen(optSegs, version);
  assert.deepStrictEqual(
    optSegs,
    expected,
    `Optimization gave something better: ${newLen} < ${totalEncodedLen(
      expected,
      version
    )} (${util.inspect(optSegs)})`
  );
}

(function testExample1() {
  testOptimizationResult([
    new Segment(Modes.Alphanumeric, 0, 3),
    new Segment(Modes.Numeric, 3, 6),
    new Segment(Modes.Byte, 6, 10),
  ], [
    new Segment(Modes.Alphanumeric, 0, 6),
    new Segment(Modes.Byte, 6, 10),
  ], NormalVersion.tryFrom(1)!);
})();

(function testExample2() {
  testOptimizationResult([
    new Segment(Modes.Alphanumeric, 0, 3),
    new Segment(Modes.Numeric, 3, 6),
    new Segment(Modes.Byte, 6, 10),
  ], [
    new Segment(Modes.Alphanumeric, 0, 6),
    new Segment(Modes.Byte, 6, 10),
  ], NormalVersion.tryFrom(1)!);
})();

// TODO: more tests
