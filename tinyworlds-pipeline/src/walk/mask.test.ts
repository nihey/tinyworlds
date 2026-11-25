import { describe, expect, it } from "vitest";
import { G, PAINT_RANK } from "../scene/kinds.js";
import { maskOf } from "./mask.js";

const rect = (e0: number, n0: number, e1: number, n1: number) => [e0, n0, e1, n0, e1, n1, e0, n1];
const bit = (m: Uint8Array, x: number, y: number) => (m[1 + ((x + 100 * y) >> 3)] >> ((x + 100 * y) & 7)) & 1;

describe("maskOf", () => {
  it("a square with no polygons is all water", () => {
    expect([...maskOf([], 3, -2, PAINT_RANK)]).toEqual([1]);
  });

  it("one land polygon covering the square is all land", () => {
    const m = maskOf([{ kind: G.Land, order: 0, rings: [rect(-10, -10, 300, 300)] }], 0, 0, PAINT_RANK);
    expect([...m]).toEqual([0]);
  });

  it("a lake over land in the west half gives a mixed mask", () => {
    const m = maskOf(
      [
        { kind: G.Land, order: 0, rings: [rect(0, 0, 200, 200)] },
        { kind: G.Lake, order: 1, rings: [rect(0, 0, 100, 200)] },
      ],
      0,
      0,
      PAINT_RANK,
    );
    expect(m[0]).toBe(2);
    expect(m.length).toBe(1251);
    expect(bit(m, 10, 50)).toBe(1);
    expect(bit(m, 90, 50)).toBe(0);
  });

  it("reads rings in world metres for any square", () => {
    const m = maskOf(
      [
        { kind: G.Land, order: 0, rings: [rect(-400, 600, -200, 800)] },
        { kind: G.Lake, order: 1, rings: [rect(-400, 700, -200, 800)] },
      ],
      -2,
      3,
      PAINT_RANK,
    );
    expect(bit(m, 50, 20)).toBe(0);
    expect(bit(m, 50, 80)).toBe(1);
  });

  it("a hole in a polygon is not painted", () => {
    const m = maskOf(
      [{ kind: G.Land, order: 0, rings: [rect(0, 0, 200, 200), rect(100, 100, 120, 120)] }],
      0,
      0,
      PAINT_RANK,
    );
    expect(bit(m, 55, 55)).toBe(1);
    expect(bit(m, 5, 5)).toBe(0);
  });

  it("a pier painted over water is land", () => {
    const m = maskOf(
      [
        { kind: G.Water, order: 0, rings: [rect(0, 0, 200, 200)] },
        { kind: G.Pier, order: 1, rings: [rect(0, 90, 200, 110)] },
      ],
      0,
      0,
      PAINT_RANK,
    );
    expect(bit(m, 50, 50)).toBe(0);
    expect(bit(m, 50, 10)).toBe(1);
  });

  it("ties in rank paint in order", () => {
    const water = { kind: G.Water, order: 5, rings: [rect(0, 0, 200, 200)] };
    const lake = { kind: G.Lake, order: 2, rings: [rect(0, 0, 200, 200)] };
    // same rank for the test: the later order wins
    const rank = new Float32Array(PAINT_RANK);
    rank[G.Lake] = rank[G.Water];
    expect([...maskOf([water, lake], 0, 0, rank)]).toEqual([1]);
    const land = { kind: G.Land, order: 3, rings: [rect(0, 0, 200, 200)] };
    rank[G.Land] = rank[G.Water];
    expect([...maskOf([land, water], 0, 0, rank)]).toEqual([1]);
    expect([...maskOf([{ ...land, order: 9 }, water], 0, 0, rank)]).toEqual([0]);
  });
});
