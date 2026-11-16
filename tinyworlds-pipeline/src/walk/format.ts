/**
 * One square's file: named typed arrays in a gzipped binary, read by the viewer's
 * `tinyworlds-frontend/src/walk/format.ts` (which documents the layout; the contract is in the
 * root CLAUDE.md). Arrays start on multiples of 4, so the reader can view them in place.
 */
import { gzipSync } from "node:zlib";

export type CellArrays = Record<
  string,
  Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array
>;

function typeOf(a: CellArrays[string]): string {
  if (a instanceof Uint8Array) return "u8";
  if (a instanceof Int8Array) return "i8";
  if (a instanceof Uint16Array) return "u16";
  if (a instanceof Int16Array) return "i16";
  if (a instanceof Uint32Array) return "u32";
  if (a instanceof Int32Array) return "i32";
  return "f32";
}

const pad4 = (n: number) => (n + 3) & ~3;

export function encodeCell(i: number, j: number, arrays: CellArrays): Buffer {
  const names = Object.keys(arrays);
  const header = Buffer.from(
    JSON.stringify({ v: 1, i, j, arrays: names.map((n) => [n, typeOf(arrays[n]), arrays[n].length]) }),
    "utf8",
  );
  let size = pad4(4 + header.length);
  for (const n of names) size += pad4(arrays[n].byteLength);

  const out = Buffer.alloc(size);
  out.writeUInt32LE(header.length, 0);
  header.copy(out, 4);
  let at = pad4(4 + header.length);
  for (const n of names) {
    const a = arrays[n];
    // copied byte for byte: typed arrays are little-endian on every platform we run on
    out.set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength), at);
    at += pad4(a.byteLength);
  }
  return gzipSync(out, { level: 9 });
}
