import { describe, expect, it } from "vitest";
import { levelForScale, Pyramid, tileKey } from "../tiles";

/** row-major, LSB-first, like the pipeline writes it */
function bitset(cols: number, rows: number, has: (tx: number, ty: number) => boolean): string {
  const bytes = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (let ty = 0; ty < rows; ty++)
    for (let tx = 0; tx < cols; tx++) {
      const i = tx + ty * cols;
      if (has(tx, ty)) bytes[i >> 3] |= 1 << (i & 7);
    }
  return Buffer.from(bytes).toString("base64");
}

const pyramid = new Pyramid({
  tileSize: 512,
  origin: { x: -2048, y: -1024 },
  levels: [
    { z: 0, cols: 8, rows: 4, tiles: bitset(8, 4, (tx, ty) => !(tx === 3 && ty === 1)) },
    { z: 1, cols: 4, rows: 2, tiles: bitset(4, 2, () => true) },
    { z: 2, cols: 2, rows: 1, tiles: bitset(2, 1, () => true) },
  ],
});

describe("levelForScale", () => {
  it("uses native tiles at and above scale 1", () => {
    expect(levelForScale(1, 5)).toBe(0);
    expect(levelForScale(3, 5)).toBe(0);
  });
  it("steps down one level per halving", () => {
    expect(levelForScale(0.75, 5)).toBe(0);
    expect(levelForScale(0.5, 5)).toBe(1);
    expect(levelForScale(0.3, 5)).toBe(1);
    expect(levelForScale(0.25, 5)).toBe(2);
    expect(levelForScale(0.124, 5)).toBe(3);
  });
  it("clamps to the levels that exist", () => {
    expect(levelForScale(0.001, 3)).toBe(3);
    expect(levelForScale(0, 3)).toBe(3);
    expect(levelForScale(Number.NaN, 3)).toBe(3);
  });
});

describe("Pyramid", () => {
  it("knows which tiles exist", () => {
    expect(pyramid.has(0, 0, 0)).toBe(true);
    expect(pyramid.has(0, 3, 1)).toBe(false);
    expect(pyramid.has(0, 8, 0)).toBe(false);
    expect(pyramid.has(0, -1, 0)).toBe(false);
    expect(pyramid.has(7, 0, 0)).toBe(false);
    expect(pyramid.maxZ).toBe(2);
    expect(pyramid.all(0)).toHaveLength(31);
  });

  it("places tiles from the shared origin, doubling per level", () => {
    expect(pyramid.tileRect(0, 0, 0)).toEqual({
      left: -2048,
      top: -1024,
      right: -1536,
      bottom: -512,
    });
    expect(pyramid.tileRect(1, 1, 1)).toEqual({ left: -1024, top: 0, right: 0, bottom: 1024 });
    expect(pyramid.tileRect(2, 1, 0)).toEqual({ left: 0, top: -1024, right: 2048, bottom: 1024 });
  });

  it("finds the tiles a view touches", () => {
    const r = pyramid.range(0, { left: -100, top: -100, right: 600, bottom: 100 });
    expect(r).toEqual({ z: 0, tx0: 3, ty0: 1, tx1: 5, ty1: 2 });
  });

  it("does not include a tile the view only touches at its edge", () => {
    const r = pyramid.range(0, { left: 0, top: 0, right: 512, bottom: 512 });
    expect(r).toEqual({ z: 0, tx0: 4, ty0: 2, tx1: 4, ty1: 2 });
  });

  it("clamps to the grid, and is empty beyond it", () => {
    const r = pyramid.range(0, { left: -99999, top: -99999, right: 99999, bottom: 99999 });
    expect(r).toEqual({ z: 0, tx0: 0, ty0: 0, tx1: 7, ty1: 3 });
    const off = pyramid.range(0, { left: 5000, top: 0, right: 6000, bottom: 100 });
    expect(off.tx1).toBeLessThan(off.tx0);
  });

  it("names tiles the way the files are named", () => {
    expect(tileKey(2, 10, 7)).toBe("2/10_7");
  });
});
