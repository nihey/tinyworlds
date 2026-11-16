/**
 * The walk's square, as the pipeline wrote it: a gzipped header and named typed arrays.
 * This file imports nothing: the pipeline's test reaches it by relative path.
 */

export class WalkDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalkDataError";
  }
}

export type CellArray =
  Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array;

export type CellArrays = Record<string, CellArray>;

/** Gzip bytes, undone; anything else comes back as it is (a server may already have undone it). */
export async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const TYPES = {
  u8: [Uint8Array, 1],
  i8: [Int8Array, 1],
  u16: [Uint16Array, 2],
  i16: [Int16Array, 2],
  u32: [Uint32Array, 4],
  i32: [Int32Array, 4],
  f32: [Float32Array, 4],
} as const;

type TypeName = keyof typeof TYPES;

/**
 * Payload: u32 header length, the header as UTF-8 JSON `{ v, i, j, arrays: [[name, type, length]] }`,
 * zero padding to a multiple of 4, then every array in header order, each starting at a multiple
 * of 4, little-endian. The arrays are views on a copy, so they are aligned whatever the input's
 * byte offset was.
 */
export function decodeCell(raw: Uint8Array): { i: number; j: number; arrays: Partial<CellArrays> } {
  if (raw.length < 4) throw new WalkDataError("square: too short for a header");
  const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const headerLen = view.getUint32(0, true);
  if (4 + headerLen > raw.length) throw new WalkDataError("square: header runs past the end");
  let header: { v?: unknown; i?: unknown; j?: unknown; arrays?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + headerLen)));
  } catch {
    throw new WalkDataError("square: the header is not JSON");
  }
  if (!header || header.v !== 1) throw new WalkDataError("square: unknown version");
  const { i, j, arrays: list } = header;
  if (!Number.isInteger(i) || !Number.isInteger(j) || !Array.isArray(list)) {
    throw new WalkDataError("square: malformed header");
  }

  const copy = new Uint8Array(raw).buffer; // starts at 0, so offsets that are multiples of 4 stay aligned
  const arrays: Partial<CellArrays> = {};
  let at = (4 + headerLen + 3) & ~3;
  for (const entry of list) {
    if (!Array.isArray(entry) || typeof entry[0] !== "string" || !(entry[1] in TYPES)) {
      throw new WalkDataError(`square: unknown array type ${String(entry?.[1])}`);
    }
    const [name, type, length] = entry as [string, TypeName, number];
    if (!Number.isInteger(length) || length < 0)
      throw new WalkDataError(`square: bad length for ${name}`);
    const [Ctor, size] = TYPES[type];
    const bytes = length * size;
    if (at + bytes > raw.length) throw new WalkDataError(`square: ${name} runs past the end`);
    arrays[name] = new Ctor(copy, at, length);
    at = (at + bytes + 3) & ~3;
  }
  return { i: i as number, j: j as number, arrays };
}
