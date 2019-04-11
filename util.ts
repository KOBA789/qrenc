export function* chunks(
  orig: Uint8Array,
  chunkSize: number
): IterableIterator<Uint8Array> {
  for (let i = 0; i < orig.length; i += chunkSize) {
    yield orig.subarray(i, Math.min(i + chunkSize, orig.length));
  }
}
