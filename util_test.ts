import * as assert from "assert";
import { chunks } from "./util";

(function testChunks() {
  const actual = [...chunks(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 3)];
  const expected = [
    new Uint8Array([1, 2, 3]),
    new Uint8Array([4, 5, 6]),
    new Uint8Array([7, 8, 9]),
    new Uint8Array([10]),
  ];
  assert.deepStrictEqual(actual, expected);
})();
