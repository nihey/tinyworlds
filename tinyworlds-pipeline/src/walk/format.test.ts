import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeCell } from "../../../tinyworlds-frontend/src/walk/format.ts";
import { encodeCell } from "./format.js";

describe("square format", () => {
  it("a square round-trips through the viewer's decoder", () => {
    const arrays = {
      "vol.xy": new Int16Array([-5, 7, 1999, -3000]),
      "vol.seed": new Uint32Array([4294967295]),
      mask: new Uint8Array([1]),
      "cab.xyz": new Int32Array([-70000, 5, 2147483647]),
      "vol.pattern": new Float32Array([0.5, -2]),
    };
    const gz = encodeCell(-3, 12, arrays);
    expect(gz[0]).toBe(0x1f);
    expect(gz[1]).toBe(0x8b);
    const raw = new Uint8Array(gunzipSync(gz));
    const out = decodeCell(raw);
    expect(out.i).toBe(-3);
    expect(out.j).toBe(12);
    for (const [name, a] of Object.entries(arrays)) {
      const got = out.arrays[name]!;
      expect(got.constructor).toBe(a.constructor);
      expect(Array.from(got)).toEqual(Array.from(a));
      expect(got.byteOffset % 4).toBe(0);
    }
  });

  it("is deterministic", () => {
    const a = { "vol.xy": new Int16Array([1, 2, 3]) };
    expect(encodeCell(0, 0, a).equals(encodeCell(0, 0, a))).toBe(true);
  });
});
