import fs from "node:fs";
import path from "node:path";

type Ctor =
  | Float32ArrayConstructor
  | Uint32ArrayConstructor
  | Uint16ArrayConstructor
  | Uint8ArrayConstructor
  | Int16ArrayConstructor;
export type Arr = Float32Array | Uint32Array | Uint16Array | Uint8Array | Int16Array;

const TYPES: Record<string, Ctor> = {
  f32: Float32Array,
  u32: Uint32Array,
  u16: Uint16Array,
  u8: Uint8Array,
  i16: Int16Array,
};
const typeName = (arr: Arr): string => Object.keys(TYPES).find((k) => arr instanceof TYPES[k])!;

/** A typed array that grows as values are pushed. */
export class Grow<T extends Arr> {
  data: T;
  length = 0;
  constructor(
    private readonly ctor: new (n: number) => T,
    initial = 1 << 14,
  ) {
    this.data = new ctor(initial);
  }
  push(v: number): void {
    if (this.length === this.data.length) this.reserve(this.length + 1);
    this.data[this.length++] = v;
  }
  push2(a: number, b: number): void {
    if (this.length + 2 > this.data.length) this.reserve(this.length + 2);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
  }
  push4(a: number, b: number, c: number, d: number): void {
    if (this.length + 4 > this.data.length) this.reserve(this.length + 4);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
    this.data[this.length++] = d;
  }
  private reserve(n: number): void {
    let size = this.data.length;
    while (size < n) size *= 2;
    const bigger = new this.ctor(size);
    (bigger as Uint8Array).set(this.data as Uint8Array);
    this.data = bigger;
  }
  finish(): T {
    return this.data.subarray(0, this.length) as T;
  }
}

export const f32 = (): Grow<Float32Array> => new Grow(Float32Array);
export const u32 = (): Grow<Uint32Array> => new Grow(Uint32Array);
export const u8 = (): Grow<Uint8Array> => new Grow(Uint8Array);

/** A scene on disk: one raw file per array plus a JSON index. */
export interface SceneIndex {
  arrays: Record<string, { type: string; length: number }>;
  meta: Record<string, unknown>;
}

export function writeScene(dir: string, arrays: Record<string, Arr>, meta: Record<string, unknown>): void {
  fs.mkdirSync(dir, { recursive: true });
  const index: SceneIndex = { arrays: {}, meta };
  for (const [name, arr] of Object.entries(arrays)) {
    index.arrays[name] = { type: typeName(arr), length: arr.length };
    fs.writeFileSync(
      path.join(dir, `${name}.bin`),
      new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength),
    );
  }
  fs.writeFileSync(path.join(dir, "scene.json"), JSON.stringify(index, null, 1));
}

/** Load a scene into shared memory, so worker threads can read it without copies. */
export function readScene(dir: string): { arrays: Record<string, Arr>; meta: Record<string, unknown> } {
  const index = JSON.parse(fs.readFileSync(path.join(dir, "scene.json"), "utf8")) as SceneIndex;
  const arrays: Record<string, Arr> = {};
  for (const [name, { type, length }] of Object.entries(index.arrays)) {
    const ctor = TYPES[type];
    const shared = new SharedArrayBuffer(Math.max(length * ctor.BYTES_PER_ELEMENT, 1));
    const fd = fs.openSync(path.join(dir, `${name}.bin`), "r");
    const bytes = new Uint8Array(shared);
    let done = 0;
    while (done < bytes.length) {
      const n = fs.readSync(fd, bytes, done, Math.min(bytes.length - done, 1 << 28), done);
      if (n <= 0) break;
      done += n;
    }
    fs.closeSync(fd);
    arrays[name] = new ctor(shared as unknown as ArrayBuffer, 0, length);
  }
  return { arrays, meta: index.meta };
}
