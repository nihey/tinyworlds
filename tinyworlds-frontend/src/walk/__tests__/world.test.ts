import { describe, expect, it } from "vitest";
import { WalkWorld } from "../world";
import type { WalkIndex } from "../walk-index";
import { boxVolume, deckWay, makeCell, waterRect } from "./fixtures";

const index = {} as WalkIndex;

function world(...cells: ReturnType<typeof makeCell>[]) {
  const w = new WalkWorld(index);
  for (const c of cells) w.add(c);
  return w;
}

describe("surfaces", () => {
  it("is the ground on land and the water over a mixed mask's water bit", () => {
    const w = world(makeCell(0, 0, { mask: waterRect(0, 0, 100, 0, 200, 200) }));
    expect(w.surfaceUnder(50, 50, 0, 0.3)).toEqual({ z: 0, kind: "ground" });
    expect(w.surfaceUnder(150, 50, 0, 0.3)).toEqual({ z: -0.6, kind: "water" });
    expect(w.isWater(150, 50)).toBe(true);
    expect(w.isWater(50, 50)).toBe(false);
  });

  it("reads the all-water and all-land modes", () => {
    const w = world(makeCell(0, 0, { mask: { mode: 1, bits: null } }), makeCell(1, 0));
    expect(w.isWater(10, 10)).toBe(true);
    expect(w.isWater(210, 10)).toBe(false);
  });

  it("walks under a deck and on it from above", () => {
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 50, 7],
            [100, 50, 7],
          ]),
        ],
      }),
    );
    expect(w.surfaceUnder(50, 50, 0, 0.3)).toEqual({ z: 0, kind: "ground" });
    expect(w.surfaceUnder(50, 50, 6.9, 0.3)).toEqual({ z: 7, kind: "deck" });
    expect(w.surfaceUnder(50, 70, 6.9, 0.3).kind).toBe("ground");
  });

  it("interpolates a ramp", () => {
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 50, 0],
            [100, 50, 8],
          ]),
        ],
      }),
    );
    const s = w.surfaceUnder(50, 50, 4, 0.5);
    expect(s.kind).toBe("deck");
    expect(s.z).toBeCloseTo(4, 5);
  });

  it("puts a car's roof under someone on foot", () => {
    const w = world(makeCell(0, 0));
    w.roofs = (e) => (e === 5 ? 1.5 : null);
    expect(w.surfaceUnder(5, 5, 1.4, 0.3)).toEqual({ z: 1.5, kind: "roof" });
    expect(w.surfaceUnder(5, 5, 0, 0.3).kind).toBe("ground");
    expect(w.surfaceUnder(6, 5, 1.4, 0.3).kind).toBe("ground");
  });
});

describe("walls", () => {
  it("blocks inside a footprint and near its edge", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(50, 50, 80, 80)] }));
    expect(w.blocked(60, 60, 0.4, 0, 1.8)).toBe(true);
    expect(w.blocked(49.8, 60, 0.4, 0, 1.8)).toBe(true);
    expect(w.blocked(49, 60, 0.4, 0, 1.8)).toBe(false);
  });

  it("is not a wall under a floating volume", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(50, 50, 80, 80, 6, 8)] }));
    expect(w.blocked(60, 60, 0.4, 0, 1.8)).toBe(false);
    expect(w.blocked(60, 60, 0.4, 5, 1.8)).toBe(true);
  });

  it("leaves a hole open", () => {
    const v = boxVolume(0, 0, 40, 40);
    v.rings.push(Float32Array.of(10, 10, 30, 10, 30, 30, 10, 30));
    const w = world(makeCell(0, 0, { volumes: [v] }));
    expect(w.blocked(20, 20, 0.4, 0, 1.8)).toBe(false);
    expect(w.blocked(5, 20, 0.4, 0, 1.8)).toBe(true);
  });

  it("finds a neighbouring square's building that reaches in", () => {
    const big = boxVolume(190, 50, 230, 80);
    const w = world(makeCell(0, 0), makeCell(1, 0, { volumes: [big] }));
    expect(w.blocked(195, 60, 0.4, 0, 1.8)).toBe(true);
    // added the other way round, the grids are rebuilt
    const w2 = world(makeCell(0, 0));
    w2.add(makeCell(1, 0, { volumes: [big] }));
    expect(w2.blocked(195, 60, 0.4, 0, 1.8)).toBe(true);
  });

  it("slides along a wall", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(10, -50, 20, 150)] }));
    const [e, n] = w.slide(9, 50, 9.8, 51, 0.4, 0, 1.8);
    expect(e).toBeCloseTo(9, 5);
    expect(n).toBeCloseTo(51, 5);
    expect(w.slide(5, 5, 6, 6, 0.4, 0, 1.8)).toEqual([6, 6]);
  });

  it("points out of the wall a body touches, from outside it and from inside", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(10, -50, 20, 150)] }));
    for (const e of [9.8, 10.2]) {
      const [ne, nn] = w.wallNormal(e, 50, 0.4, 0, 1.8)!;
      expect(ne).toBeCloseTo(-1, 9);
      expect(nn).toBeCloseTo(0, 9);
    }
    expect(w.wallNormal(5, 50, 0.4, 0, 1.8)).toBeNull();
    expect(w.wallNormal(9.8, 50, 0.4, 40, 1.8)).toBeNull();
  });

  it("stays put in a corner", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(10, 10, 20, 20)] }));
    const [e, n] = w.slide(9, 9, 10.5, 10.5, 0.4, 0, 1.8);
    expect(w.blocked(e, n, 0.4, 0, 1.8)).toBe(false);
  });

  it("is a wall outside every square, and the data says so", () => {
    const w = world(makeCell(0, 0));
    expect(w.inData(10, 10)).toBe(true);
    expect(w.inData(-5, 10)).toBe(false);
    expect(w.blocked(-5, 10, 0.4, 0, 1.8)).toBe(true);
    expect(w.has(0, 0)).toBe(true);
    expect(w.has(1, 0)).toBe(false);
  });

  it("points back into the data from outside it, across the edge crossed", () => {
    const w = world(makeCell(0, 0));
    const near = (got: [number, number] | null, want: [number, number]) => {
      expect(got).not.toBeNull();
      expect(got![0]).toBeCloseTo(want[0], 9);
      expect(got![1]).toBeCloseTo(want[1], 9);
    };
    near(w.wallNormal(201, 50, 0.4, 0, 1.8), [-1, 0]);
    near(w.wallNormal(50, -3, 0.4, 0, 1.8), [0, 1]);
    near(w.wallNormal(200, 50, 0.4, 0, 1.8), [-1, 0]);
    // past a corner: towards it
    near(w.wallNormal(203, 204, 0.4, 0, 1.8), [-0.6, -0.8]);
    // a square and more away: no way in to tell
    expect(w.wallNormal(450, 50, 0.4, 0, 1.8)).toBeNull();
  });

  it("slides a walker along the edge of the data", () => {
    const w = world(makeCell(0, 0));
    const [e, n] = w.slide(199, 50, 201, 52, 0.4, 0, 1.8);
    expect(e).toBeCloseTo(199, 9);
    expect(n).toBeCloseTo(52, 9);
  });

  it("loses a removed square's walls", () => {
    const w = world(makeCell(0, 0, { volumes: [boxVolume(50, 50, 80, 80)] }), makeCell(1, 0));
    expect(w.blocked(60, 60, 0.4, 0, 1.8)).toBe(true);
    w.remove("0_0");
    expect(w.has(0, 0)).toBe(false);
    expect(w.blocked(60, 60, 0.4, 0, 1.8)).toBe(true); // outside the data now
    w.add(makeCell(0, 0));
    expect(w.blocked(60, 60, 0.4, 0, 1.8)).toBe(false);
  });

  it("loses a neighbour's reaching building once its square is removed", () => {
    const w = world(makeCell(0, 0), makeCell(1, 0, { volumes: [boxVolume(190, 50, 230, 80)] }));
    w.remove("1_0");
    expect(w.blocked(195, 60, 0.4, 0, 1.8)).toBe(false);
  });
});

describe("parapets", () => {
  it("gives both edges of a deck, 1 m high at the deck's height", () => {
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay(
            [
              [20, 50, 7],
              [60, 50, 7],
            ],
            10,
          ),
        ],
      }),
    );
    const ps = w.parapets(40, 50, 30);
    const ns = new Set(ps.map((p) => Math.round(p.n0)));
    expect(ns).toEqual(new Set([45, 55]));
    expect(ps.every((p) => p.z === 7)).toBe(true);
    expect(w.parapets(40, 150, 20)).toEqual([]);
  });

  it("is open where two decks meet", () => {
    const main = deckWay(
      [
        [0, 50, 7],
        [100, 50, 7],
      ],
      10,
    );
    const side = deckWay(
      [
        [50, 50, 7],
        [50, 100, 7],
      ],
      6,
    );
    const w = world(makeCell(0, 0, { elevated: [main, side] }));
    const ps = w.parapets(50, 60, 30);
    const onNorthEdge = ps.filter((p) => Math.round(p.n0) === 55 && Math.round(p.n1) === 55);
    // nothing of the main deck's north edge stands where the side deck joins it
    expect(onNorthEdge.some((p) => Math.min(p.e0, p.e1) < 52 && Math.max(p.e0, p.e1) > 48)).toBe(
      false,
    );
    expect(onNorthEdge.length).toBeGreaterThan(0);
  });
});
