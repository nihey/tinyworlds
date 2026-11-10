import { describe, expect, it } from "vitest";
import { GeomKind, readWkb } from "./wkb.js";

/** Build little-endian WKB by hand. */
function wkb(...chunks: (number | number[])[]): Uint8Array {
  const bytes: number[] = [];
  const dv = new DataView(new ArrayBuffer(8));
  for (const c of chunks) {
    if (Array.isArray(c)) {
      for (const f of c) {
        dv.setFloat64(0, f, true);
        for (let i = 0; i < 8; i++) bytes.push(dv.getUint8(i));
      }
    } else if (c < 0) {
      bytes.push(-c); // a single byte, passed negated
    } else {
      dv.setUint32(0, c, true);
      for (let i = 0; i < 4; i++) bytes.push(dv.getUint8(i));
    }
  }
  return Uint8Array.from(bytes);
}

describe("readWkb", () => {
  it("reads a point", () => {
    const g = readWkb(wkb(-1, 1, [-73.98, 40.75]))!;
    expect(g.kind).toBe(GeomKind.Point);
    expect(Array.from(g.parts[0][0])).toEqual([-73.98, 40.75]);
  });

  it("reads a polygon with a hole", () => {
    const outer = [0, 0, 4, 0, 4, 4, 0, 4, 0, 0];
    const hole = [1, 1, 2, 1, 2, 2, 1, 1];
    const g = readWkb(wkb(-1, 3, 2, 5, outer, 4, hole))!;
    expect(g.kind).toBe(GeomKind.Polygon);
    expect(g.parts).toHaveLength(1);
    expect(Array.from(g.parts[0][0])).toEqual(outer);
    expect(Array.from(g.parts[0][1])).toEqual(hole);
  });

  it("flattens a multipolygon into parts", () => {
    const a = [0, 0, 1, 0, 1, 1, 0, 0];
    const b = [5, 5, 6, 5, 6, 6, 5, 5];
    const g = readWkb(wkb(-1, 6, 2, -1, 3, 1, 4, a, -1, 3, 1, 4, b))!;
    expect(g.parts).toHaveLength(2);
    expect(Array.from(g.parts[1][0])).toEqual(b);
  });

  it("drops the Z ordinate", () => {
    const g = readWkb(wkb(-1, 1002, 2, [1, 2, 99, 3, 4, 99]))!;
    expect(g.kind).toBe(GeomKind.Line);
    expect(Array.from(g.parts[0][0])).toEqual([1, 2, 3, 4]);
  });
});
