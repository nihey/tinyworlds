import { describe, expect, it } from "vitest";
import { WalkDataError } from "../format";
import { cellExists, parseWalkIndex } from "../walk-index";

const valid = () => ({
  v: 1,
  cell: 200,
  i0: -2,
  j0: 5,
  cols: 4,
  rows: 3,
  // bits 0 (-2,5), 5 (-1,6), 11 (1,7)
  cells: btoa(String.fromCharCode(0b00100001, 0b00001000)),
  geo: { lon0: -73.98566, lat0: 40.74844, betaDeg: 45, k: 2, kz: 2.45 },
  gridDeg: 28.9,
  sunDeg: 254,
  palette: { names: ["a", "b"], rgb: new Array(36).fill(7) },
  paintRank: [0, 1, 2],
  tunnels: [{ name: "T", a: [0, 0, 0], b: null, length: 100 }],
});

describe("parseWalkIndex", () => {
  it("parses a valid index", () => {
    const ix = parseWalkIndex(valid());
    expect(ix.cols).toBe(4);
    expect(ix.palette.names).toEqual(["a", "b"]);
    expect(ix.tunnels[0].b).toBeNull();
  });

  it("throws without a palette", () => {
    const j: Record<string, unknown> = valid();
    delete j.palette;
    expect(() => parseWalkIndex(j)).toThrow(WalkDataError);
  });

  it("throws on a palette of the wrong length, a non-finite number or non-objects", () => {
    expect(() => parseWalkIndex({ ...valid(), palette: { names: ["a"], rgb: [1] } })).toThrow(
      WalkDataError,
    );
    expect(() => parseWalkIndex({ ...valid(), cols: Number.NaN })).toThrow(WalkDataError);
    expect(() => parseWalkIndex({ ...valid(), cells: 4 })).toThrow(WalkDataError);
    expect(() => parseWalkIndex({ ...valid(), tunnels: {} })).toThrow(WalkDataError);
    expect(() => parseWalkIndex(null)).toThrow(WalkDataError);
  });

  it("refuses squares of another size than the walk's code knows", () => {
    expect(() => parseWalkIndex({ ...valid(), cell: 100 })).toThrow(WalkDataError);
  });
});

describe("cellExists", () => {
  const ix = parseWalkIndex(valid());

  it("reads bit (i - i0) + (j - j0) * cols, LSB first", () => {
    expect(cellExists(ix, -2, 5)).toBe(true);
    expect(cellExists(ix, -1, 6)).toBe(true);
    expect(cellExists(ix, 1, 7)).toBe(true);
    expect(cellExists(ix, -1, 5)).toBe(false);
    expect(cellExists(ix, 0, 6)).toBe(false);
  });

  it("is false outside the grid", () => {
    expect(cellExists(ix, -3, 5)).toBe(false);
    expect(cellExists(ix, 2, 5)).toBe(false);
    expect(cellExists(ix, -2, 4)).toBe(false);
    expect(cellExists(ix, -2, 8)).toBe(false);
  });
});
