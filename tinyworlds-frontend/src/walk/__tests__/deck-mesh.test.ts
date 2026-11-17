import { describe, expect, it } from "vitest";
import type { ElevatedWay } from "../cell";
import { columnSide, deckGeometry, type DeckSpan } from "../render/deck-mesh";
import { deckWay } from "./fixtures";

const nowhere = () => false;

/** The plan length of a span. */
const lengthOf = (s: DeckSpan) => Math.hypot(s.e1 - s.e0, s.n1 - s.n0);

/** A way along the east axis at one height, a vertex every 10 m, `own` as given (1 where absent). */
function eastWay(length: number, z: number, own?: number[], width = 10): ElevatedWay {
  const pts: [number, number, number][] = [];
  for (let e = 0; e <= length; e += 10) pts.push([e, 0, z]);
  const way = deckWay(pts, width);
  if (own) way.own = Uint8Array.from(own);
  return way;
}

describe("deckGeometry", () => {
  it("stands a 120 m way over open land on columns 30 m apart", () => {
    const g = deckGeometry(
      deckWay([
        [0, 0, 6.5],
        [120, 0, 6.5],
      ]),
      nowhere,
    );
    const es = g.columns.map(([e]) => e).sort((a, b) => a - b);
    expect(es.length).toBe(4);
    for (let k = 1; k < es.length; k++) expect(es[k] - es[k - 1]).toBeCloseTo(30, 5);
    for (const [, n, top] of g.columns) {
      expect(n).toBeCloseTo(0, 5);
      // the column reaches the slab's underside, a metre under the deck
      expect(top).toBeCloseTo(5.5, 5);
    }
  });

  it("never stands a column where `under` is true, and keeps them about 30 m apart", () => {
    // a street 10 m wide crossing under the way, and the water from e = 90 on: the station at
    // 105 m finds no ground within reach, the one at 45 m moves off the street
    const under = (e: number) => (e >= 40 && e <= 50) || e >= 90;
    const way = deckWay([
      [0, 0, 6.5],
      [120, 0, 6.5],
    ]);
    const g = deckGeometry(way, under);
    const r = columnSide(way.width) / 2;
    expect(g.columns.length).toBe(3);
    const es = g.columns.map(([e]) => e).sort((a, b) => a - b);
    for (const e of es) {
      expect(under(e - r) || under(e) || under(e + r)).toBe(false);
    }
    for (let k = 1; k < es.length; k++) {
      expect(es[k] - es[k - 1]).toBeGreaterThan(18);
      expect(es[k] - es[k - 1]).toBeLessThan(42);
    }
  });

  it("steps a column sideways when the street below runs along the way", () => {
    // a street 6 m wide right under the middle of a 16 m deck, all the way along
    const under = (_e: number, n: number) => Math.abs(n) <= 3;
    const way = deckWay(
      [
        [0, 0, 8],
        [120, 0, 8],
      ],
      16,
    );
    const g = deckGeometry(way, under);
    expect(g.columns.length).toBe(4);
    const r = columnSide(way.width) / 2;
    for (const [, n] of g.columns) {
      expect(Math.abs(n) - r).toBeGreaterThan(3);
      expect(Math.abs(n) + r).toBeLessThanOrEqual(8 + 1e-6);
    }
  });

  it("puts a parapet along both edges wherever the way is raised", () => {
    const g = deckGeometry(
      deckWay([
        [0, 0, 6.5],
        [120, 0, 6.5],
      ]),
      nowhere,
    );
    const left = g.parapets.filter((p) => p.n0 > 0 && p.n1 > 0);
    const right = g.parapets.filter((p) => p.n0 < 0 && p.n1 < 0);
    expect(left.length + right.length).toBe(g.parapets.length);
    for (const p of g.parapets) {
      expect(Math.abs(p.n0)).toBeCloseTo(5, 5);
      expect(Math.abs(p.n1)).toBeCloseTo(5, 5);
      expect(p.z0).toBeCloseTo(6.5, 5);
    }
    expect(left.reduce((s, p) => s + lengthOf(p), 0)).toBeCloseTo(120, 3);
    expect(right.reduce((s, p) => s + lengthOf(p), 0)).toBeCloseTo(120, 3);
  });

  it("opens a parapet where `open` says another way joins", () => {
    const open = (e: number, n: number) => n > 0 && e >= 50 && e <= 70;
    const g = deckGeometry(
      deckWay([
        [0, 0, 6.5],
        [120, 0, 6.5],
      ]),
      nowhere,
      { open },
    );
    const left = g.parapets.filter((p) => p.n0 > 0);
    expect(left.reduce((s, p) => s + lengthOf(p), 0)).toBeCloseTo(100, 0);
    for (const p of left) {
      const mid = (p.e0 + p.e1) / 2;
      expect(mid < 50 || mid > 70).toBe(true);
    }
    const right = g.parapets.filter((p) => p.n0 < 0);
    expect(right.reduce((s, p) => s + lengthOf(p), 0)).toBeCloseTo(120, 3);
  });

  it("builds no slab, and stands no column, where the map's deck holds the way (`own` 0)", () => {
    // own from 0 to 40 m, the map's deck from 50 to 80 m, own again from 90 m
    const own = [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1];
    const g = deckGeometry(eastWay(120, 7, own), nowhere);
    expect(g.slab.length).toBeGreaterThan(0);
    for (const s of g.slab) {
      const lo = Math.min(s.e0, s.e1);
      const hi = Math.max(s.e0, s.e1);
      // nothing over the stretch between the two vertices that are both the map's
      expect(hi <= 50 + 1e-6 || lo >= 80 - 1e-6).toBe(true);
    }
    const covered = (e: number) => g.slab.some((s) => e >= s.e0 - 1e-6 && e <= s.e1 + 1e-6);
    for (const e of [5, 20, 35, 95, 110]) expect(covered(e)).toBe(true);
    for (const [e] of g.columns) expect(e < 40 + 1e-6 || e > 90 - 1e-6).toBe(true);
    // parapets do not care who builds the deck
    const left = g.parapets.filter((p) => p.n0 > 0);
    expect(left.reduce((sum, p) => sum + lengthOf(p), 0)).toBeCloseTo(120, 3);
  });

  it("lays the roadway on the deck all along, own or not, with the distance along it", () => {
    const own = [1, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1];
    const g = deckGeometry(eastWay(120, 7, own), nowhere);
    expect(g.surface.reduce((s, p) => s + lengthOf(p), 0)).toBeCloseTo(120, 3);
    let along = 0;
    for (const p of g.surface) {
      expect(p.along).toBeCloseTo(along, 3);
      along += lengthOf(p);
    }
  });

  it("stands no column under a deck too low to need one", () => {
    // a ramp from the ground up to 6 m over 60 m: the low half has no columns
    const way = deckWay([
      [0, 0, 0],
      [60, 0, 6],
      [120, 0, 6],
    ]);
    const g = deckGeometry(way, nowhere);
    for (const [e, , top] of g.columns) {
      expect(e).toBeGreaterThan(20);
      expect(top).toBeGreaterThan(1);
    }
  });

  it("cuts long stretches into short pieces, so a square draws only those it holds", () => {
    const g = deckGeometry(
      deckWay([
        [0, 0, 6.5],
        [400, 0, 6.5],
      ]),
      nowhere,
    );
    for (const s of [...g.slab, ...g.parapets, ...g.surface])
      expect(lengthOf(s)).toBeLessThanOrEqual(25 + 1e-6);
  });

  it("works out, within a box, exactly what the whole way has there", () => {
    // a long way that bends, with a street under it and a way joining it
    const way = deckWay([
      [0, 0, 0],
      [80, 0, 8],
      [300, 120, 8],
      [700, 140, 8],
      [900, 140, 0],
    ]);
    const under = (e: number, n: number) => Math.abs(e - 420) < 6 || n > 135;
    const open = (e: number) => e > 640 && e < 660;
    const full = deckGeometry(way, under, { open });
    const box = [400, 0, 600, 200] as const;
    const part = deckGeometry(way, under, { open, within: box });
    const inBox = (e: number, n: number) => e >= box[0] && e < box[2] && n >= box[1] && n < box[3];
    const held = (list: DeckSpan[]) =>
      list.filter((s) => inBox((s.e0 + s.e1) / 2, (s.n0 + s.n1) / 2));
    for (const key of ["slab", "parapets", "surface"] as const) {
      expect(held(part[key]).length).toBeGreaterThan(0);
      expect(held(part[key])).toEqual(held(full[key]));
      expect(part[key].length).toBeLessThan(full[key].length);
    }
    const columnsIn = (g: typeof full) => g.columns.filter(([e, n]) => inBox(e, n));
    expect(columnsIn(part).length).toBeGreaterThan(0);
    expect(columnsIn(part)).toEqual(columnsIn(full));
  });
});
