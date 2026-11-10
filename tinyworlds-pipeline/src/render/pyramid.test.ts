import { describe, expect, it } from "vitest";
import { halve, packBits } from "./pyramid.js";

describe("halve", () => {
  it("averages drawn pixels and keeps alpha binary", () => {
    // 4×2: left block has two drawn pixels, right block only one
    const src = new Uint8Array(4 * 2 * 4);
    const set = (x: number, y: number, r: number) => src.set([r, 10, 20, 255], (y * 4 + x) * 4);
    set(0, 0, 100);
    set(1, 1, 200);
    set(3, 0, 50);
    const out = halve(src, 4, 2);
    expect(Array.from(out.subarray(0, 4))).toEqual([150, 10, 20, 255]);
    expect(Array.from(out.subarray(4, 8))).toEqual([0, 0, 0, 0]);
  });
});

describe("packBits", () => {
  it("packs row-major, least significant bit first", () => {
    const bits = packBits((tx, ty) => (tx === 0 && ty === 0) || (tx === 2 && ty === 1), 5, 2);
    const bytes = Buffer.from(bits, "base64");
    expect(bytes[0]).toBe(0b10000001); // bit 0 and bit 7 (2 + 1·5)
    expect(bytes[1]).toBe(0);
  });
});
