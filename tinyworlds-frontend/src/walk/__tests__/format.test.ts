import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { WalkDataError, decodeCell, inflate } from "../format";

function square(header: unknown, body: number[] = []): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(header));
  const pad = (4 - (json.length % 4)) % 4;
  const out = new Uint8Array(4 + json.length + pad + body.length);
  new DataView(out.buffer).setUint32(0, json.length, true);
  out.set(json, 4);
  out.set(body, 4 + json.length + pad);
  return out;
}

describe("decodeCell", () => {
  it("reads a small square", () => {
    const raw = square({ v: 1, i: 2, j: -1, arrays: [["mask", "u8", 1]] }, [2, 0, 0, 0]);
    const c = decodeCell(raw);
    expect([c.i, c.j]).toEqual([2, -1]);
    expect(Array.from(c.arrays.mask!)).toEqual([2]);
  });

  it("throws on a truncated payload", () => {
    const raw = square({ v: 1, i: 0, j: 0, arrays: [["vol.xy", "i16", 10]] }, [1, 2]);
    expect(() => decodeCell(raw)).toThrow(WalkDataError);
    expect(() => decodeCell(raw.subarray(0, 2))).toThrow(WalkDataError);
  });

  it("throws on an unknown type", () => {
    const raw = square({ v: 1, i: 0, j: 0, arrays: [["x", "f64", 1]] }, new Array(8).fill(0));
    expect(() => decodeCell(raw)).toThrow(WalkDataError);
  });

  it("takes a type's name only as a name, and any array name as a name", () => {
    for (const type of ["toString", "constructor", "__proto__"]) {
      const raw = square({ v: 1, i: 0, j: 0, arrays: [["x", type, 1]] }, [0, 0, 0, 0]);
      expect(() => decodeCell(raw)).toThrow(WalkDataError);
    }
    const raw = square({ v: 1, i: 0, j: 0, arrays: [["__proto__", "u8", 1]] }, [9, 0, 0, 0]);
    const c = decodeCell(raw);
    expect(Object.getPrototypeOf(c.arrays)).toBeNull();
    expect(Array.from((c.arrays as Record<string, Uint8Array>)["__proto__"])).toEqual([9]);
  });

  it("throws on a header that is not JSON", () => {
    const raw = new Uint8Array([4, 0, 0, 0, 1, 2, 3, 4]);
    expect(() => decodeCell(raw)).toThrow(WalkDataError);
  });
});

describe("inflate", () => {
  it("undoes gzip", async () => {
    const out = await inflate(new Uint8Array(gzipSync(Buffer.from("hello"))));
    expect(new TextDecoder().decode(out)).toBe("hello");
  });

  it("leaves plain bytes alone", async () => {
    const out = await inflate(new Uint8Array([1, 2, 3]));
    expect(Array.from(out)).toEqual([1, 2, 3]);
  });
});
