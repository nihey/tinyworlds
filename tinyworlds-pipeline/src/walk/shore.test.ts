import { describe, expect, it } from "vitest";
import { cellKey } from "./grid.js";
import { shoreDistances } from "./shore.js";

const LAND = Uint8Array.of(0);
const WATER = Uint8Array.of(1);

/** A mixed mask from a test of each 2 m cell (x, y from the south-west). */
function mixed(water: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(1251);
  out[0] = 2;
  for (let y = 0; y < 100; y++)
    for (let x = 0; x < 100; x++) if (water(x, y)) out[1 + ((x + 100 * y) >> 3)] |= 1 << ((x + 100 * y) & 7);
  return out;
}

/** Squares (i, j) for i in [i0, i1], j in [j0, j1], all of one mask. */
function block(
  masks: Map<string, Uint8Array>,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
  m: Uint8Array,
) {
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) masks.set(cellKey(i, j), m);
}

describe("shoreDistances", () => {
  it("counts the cells to the land across the squares' edge", () => {
    // the land in square (0, 0) and everything west of it; water east of it, wide enough that
    // no other land is within 255 cells of square (1, 0)
    const masks = new Map<string, Uint8Array>();
    block(masks, 1, 4, -3, 3, WATER);
    masks.set(cellKey(0, 0), LAND);
    const shore = shoreDistances(masks);
    const east = shore.get(cellKey(1, 0))!;
    expect(east).toHaveLength(10000);
    for (const y of [0, 37, 99]) for (let x = 0; x < 100; x++) expect(east[x + 100 * y]).toBe(x + 1);
  });

  it("is 255 where no land is within 510 m", () => {
    const masks = new Map<string, Uint8Array>();
    block(masks, -3, 3, -3, 3, WATER);
    const middle = shoreDistances(masks).get(cellKey(0, 0))!;
    expect(middle.every((d) => d === 255)).toBe(true);
  });

  it("counts a missing square as land: the map's edge", () => {
    const masks = new Map<string, Uint8Array>([[cellKey(0, 0), WATER]]);
    const lone = shoreDistances(masks).get(cellKey(0, 0))!;
    expect(lone[0]).toBe(1); // the south-west corner: land just west and south
    expect(lone[50 + 100 * 50]).toBe(50); // the middle: 50 cells from the east and north edges
  });

  it("gives an all-land square none, and land cells 0 in a mixed one", () => {
    const masks = new Map<string, Uint8Array>();
    block(masks, -3, 3, -3, 3, WATER);
    // land in the west half of square (0, 0)
    masks.set(
      cellKey(0, 0),
      mixed((x) => x >= 50),
    );
    masks.set(cellKey(5, 5), LAND);
    const shore = shoreDistances(masks);
    expect(shore.has(cellKey(5, 5))).toBe(false);
    const half = shore.get(cellKey(0, 0))!;
    expect(half[10 + 100 * 40]).toBe(0);
    expect(half[49 + 100 * 40]).toBe(0);
    expect(half[50 + 100 * 40]).toBe(1);
    expect(half[99 + 100 * 40]).toBe(50);
    // and the water square east of it carries on counting
    expect(shore.get(cellKey(1, 0))![0 + 100 * 40]).toBe(51);
  });

  it("works out only the squares asked for", () => {
    const masks = new Map<string, Uint8Array>();
    block(masks, -3, 3, -3, 3, WATER);
    const shore = shoreDistances(masks, [cellKey(0, 0)]);
    expect([...shore.keys()]).toEqual([cellKey(0, 0)]);
  });
});
