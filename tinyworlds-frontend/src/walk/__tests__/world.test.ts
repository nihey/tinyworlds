import { describe, expect, it } from "vitest";
import { ROOF_DECK } from "../cell";
import { newPlayer, SPRINT, stepFoot } from "../player";
import { newVehicle, stepCar } from "../vehicles";
import { WalkWorld, type Parapet } from "../world";
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
    expect(w.surfaceUnder(50, 50, 6.9, 0.3)).toMatchObject({ z: 7, kind: "deck" });
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

  it("is the next way's deck, not the round end of the last, where one way ends and the next goes on", () => {
    const a = deckWay(
      [
        [0, 50, 10],
        [100, 50, 2],
      ],
      13,
    );
    const b = deckWay(
      [
        [100, 50, 2],
        [125, 50, 0],
      ],
      13,
    );
    const w = world(makeCell(0, 0, { elevated: [a, b] }));
    // past the joint going down, and before it coming up: never the end's flat 2 m
    expect(w.surfaceUnder(103, 50, 1.8, 0.5).z).toBeCloseTo(2 - 0.08 * 3, 5);
    expect(w.surfaceUnder(97, 50, 2.1, 0.5).z).toBeCloseTo(2 + 0.08 * 3, 5);
    expect(w.surfaceUnder(103, 50, 1.8, 0.5).way).toBe(b);
  });

  it("keeps the outside of a bend between two ways covered, over a lower way too", () => {
    const a = deckWay([
      [0, 50, 5],
      [100, 50, 5],
    ]);
    // turning 60° to the left at e = 100: the wedge on the outside is past both ways' ends
    const b = deckWay([
      [100, 50, 5],
      [150, 50 + 50 * Math.sqrt(3), 5],
    ]);
    const low = deckWay(
      [
        [102, 0, 1],
        [102, 100, 1],
      ],
      6,
    );
    expect(world(makeCell(0, 0, { elevated: [a, b] })).surfaceUnder(102, 46, 5, 0.3)).toMatchObject(
      {
        z: 5,
        kind: "deck",
      },
    );
    expect(world(makeCell(0, 0, { elevated: [a, b, low] })).surfaceUnder(102, 46, 5, 0.3).z).toBe(
      5,
    );
  });

  it("keeps someone on their own way where an overlapping one rises beside it", () => {
    const road = deckWay(
      [
        [0, 50, 5],
        [190, 50, 5],
      ],
      13,
    );
    const path = deckWay(
      [
        [0, 50, 5],
        [100, 50, 13],
      ],
      2.5,
      1,
    );
    const w = world(makeCell(0, 0, { elevated: [road, path] }));
    // both lines are one: the way you are on, else the one nearest your height (never the
    // higher just for being higher)
    expect(w.surfaceUnder(2, 50, 5, 0.3, road)).toMatchObject({ z: 5, way: road });
    expect(w.surfaceUnder(2, 50, 5, 0.3).way).toBe(road);
    expect(w.surfaceUnder(2, 50, 5.16, 0.3).way).toBe(path);
    // past the path's edge, on the road's own lanes: the road, whichever you were on
    expect(w.surfaceUnder(2, 52, 5, 0.3, path)).toMatchObject({ z: 5, way: road });
    const p = newPlayer(5, 50, 5, Math.PI / 2);
    for (let i = 0; i < 100; i++)
      stepFoot(p, { forward: 1, strafe: 0, turn: 0, sprint: false, jump: false }, w, 0.05);
    expect(p.e).toBeGreaterThan(25);
    expect(p.z).toBeCloseTo(5, 5);
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

describe("the map's bridge decks", () => {
  /**
   * A river bridge as the data has it: the walk's way at 30 m, and under it the map's deck in
   * 10 m pieces, flat steps 0.95 m above and below the way by turns.
   */
  const bridge = () =>
    world(
      makeCell(0, 0, {
        mask: { mode: 1, bits: null },
        elevated: [
          deckWay([
            [0, 100, 30],
            [200, 100, 30],
          ]),
        ],
        volumes: Array.from({ length: 20 }, (_, k) => {
          const top = 30 + (k % 2 === 0 ? 0.95 : -0.95);
          const v = boxVolume(k * 10, 93, k * 10 + 10, 107, top - 1.5, top);
          v.roofShape = ROOF_DECK;
          v.flags = 5;
          return v;
        }),
      }),
    );

  it("are no walls: someone on foot crosses on the walk's own roadway", () => {
    const w = bridge();
    expect(w.blocked(55, 100, 0.35, 30, 1.8)).toBe(false);
    const p = newPlayer(5, 100, 30, Math.PI / 2);
    for (let f = 0; f < 8 * 60; f++) {
      const e0 = p.e;
      stepFoot(p, { forward: 1, strafe: 0, turn: 0, sprint: true, jump: false }, w, 1 / 60);
      expect(p.e - e0).toBeCloseTo(SPRINT / 60, 3);
      expect(p.z).toBe(30);
    }
  });

  it("are no walls: a car drives across without a knock", () => {
    const w = bridge();
    const v = newVehicle(1, "sedan", 10, 100, Math.PI / 2, "driven");
    v.v = 15;
    v.z = 30;
    for (let f = 0; f < 6 * 60; f++) {
      const ev = stepCar(v, { throttle: 0.4, brake: 0, steer: 0, handbrake: false }, w, 1 / 60);
      expect(ev.impact).toBe(0);
      expect(v.z).toBe(30);
    }
    expect(v.e).toBeGreaterThan(100);
  });
});

describe("a bridge's towers", () => {
  /** A deck 10 m wide at 30 m along n = 100, and a tower standing across it from the ground to 80 m. */
  const tower = () =>
    world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 100, 30],
            [200, 100, 30],
          ]),
        ],
        volumes: [boxVolume(95, 88, 105, 112, 0, 80)],
      }),
    );

  it("opens where the roadway passes through: someone on foot walks on", () => {
    const w = tower();
    const p = newPlayer(80, 100, 30, Math.PI / 2);
    for (let f = 0; f < 6 * 60; f++) {
      const e0 = p.e;
      stepFoot(p, { forward: 1, strafe: 0, turn: 0, sprint: false, jump: false }, w, 1 / 60);
      expect(p.e).toBeGreaterThan(e0);
      expect(p.z).toBe(30);
    }
    expect(p.e).toBeGreaterThan(105);
  });

  it("opens where the roadway passes through: a car drives on without a knock", () => {
    const w = tower();
    const v = newVehicle(1, "sedan", 70, 100, Math.PI / 2, "driven");
    v.v = 12;
    v.z = 30;
    for (let f = 0; f < 4 * 60; f++) {
      const ev = stepCar(v, { throttle: 0.3, brake: 0, steer: 0, handbrake: false }, w, 1 / 60);
      expect(ev.impact).toBe(0);
    }
    expect(v.e).toBeGreaterThan(110);
  });

  it("opens on a steep ramp too, where the car's nose is a metre under the deck ahead of it", () => {
    // climbing 45% through a column the map stands up to the deck above
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 100, 20],
            [100, 100, 65],
          ]),
        ],
        volumes: [boxVolume(48, 96, 52, 104, 0, 50)],
      }),
    );
    const v = newVehicle(1, "taxi", 30, 100, Math.PI / 2, "driven");
    v.v = 12;
    v.z = 20 + 0.45 * 30;
    for (let f = 0; f < 3 * 60; f++) {
      const ev = stepCar(v, { throttle: 0.6, brake: 0, steer: 0, handbrake: false }, w, 1 / 60);
      expect(ev.impact).toBe(0);
    }
    expect(v.e).toBeGreaterThan(56);
  });

  it("is a wall everywhere else: under the deck, beside it, and well above it", () => {
    const w = tower();
    // on the ground under the deck, and beside the bridge
    expect(w.blocked(100, 100, 0.35, 0, 1.8)).toBe(true);
    expect(w.blocked(100, 109, 0.35, 0, 1.8)).toBe(true);
    // at the deck's height but out past its edge (5 m, and 0.3 m to spare)
    expect(w.blocked(100, 106, 0.35, 30, 1.8)).toBe(true);
    // on the deck, from 0.5 m under it to 5 m over it, it is open; higher or lower, the tower
    // is there again
    expect(w.blocked(100, 105.2, 0.35, 30, 1.8)).toBe(false);
    expect(w.blocked(100, 100, 0.35, 29.6, 1.8)).toBe(false);
    expect(w.blocked(100, 100, 0.35, 34.9, 1.8)).toBe(false);
    expect(w.blocked(100, 100, 0.35, 35.2, 1.8)).toBe(true);
    expect(w.blocked(100, 100, 0.35, 29.4, 1.8)).toBe(true);
  });

  it("opens no further down a gentle ramp's foot than its first few metres", () => {
    // an 8% ramp up from the ground, its strip over a building's corner beside it
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 100, 0],
            [100, 100, 8],
          ]),
        ],
        volumes: [boxVolume(0, 103, 100, 120, 0, 10)],
      }),
    );
    // on the ground in the strip: open where the deck is within half a metre (6 m), the
    // building's wall past that
    expect(w.blocked(5, 104, 0.35, 0, 1.8)).toBe(false);
    for (const e of [8, 12, 20]) expect(w.blocked(e, 104, 0.35, 0, 1.8)).toBe(true);
    // on the deck itself, open all the way up
    for (const e of [12, 20, 60]) expect(w.blocked(e, 104, 0.35, e * 0.08, 1.8)).toBe(false);
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

  it("has no rail of one way standing in the lanes of another overlapping it on a steep hump", () => {
    // two 14 m roadways side by side, 7 m apart, falling 35%; the north one 1.8 m higher, so its
    // south rail runs down the middle of the other's lanes
    const low = deckWay(
      [
        [0, 0, 35],
        [100, 0, 0],
      ],
      14,
    );
    const high = (lift: number) =>
      deckWay(
        [
          [0, 7, 35 + lift],
          [100, 7, lift],
        ],
        14,
      );
    // what a car's box touches on the low one at e = 50: a rail between 0.95 under and 1.45 over its deck
    const touched = (lift: number) =>
      world(makeCell(0, 0, { elevated: [low, high(lift)] }))
        .parapets(50, 0, 3)
        .filter((r) => Math.abs((r.n0 + r.n1) / 2) < 0.5 && r.z > 17.5 - 0.95 && r.z < 17.5 + 1.45);
    expect(touched(1.8)).toEqual([]);
    // nor for a car on the low one
    const pair = (lift: number) => world(makeCell(0, 0, { elevated: [low, high(lift)] }));
    expect(
      pair(1.8)
        .parapets(50, 0, 3, low)
        .filter((r) => Math.abs((r.n0 + r.n1) / 2) < 0.5),
    ).toEqual([]);
    // 4 m apart, the higher one's rail stays where it is
    const closed = pair(4)
      .parapets(50, 0, 3)
      .filter((r) => Math.abs((r.n0 + r.n1) / 2) < 0.5);
    expect(closed.length).toBeGreaterThan(0);
  });

  it("holds a car on the higher of two overlapping ways by its own rail, where the other is out of a step", () => {
    // as above: for a car on the high way, its south rail stands where the low one lies 1.8 m
    // under what is past it, and is open where they are within half a metre
    const low = deckWay(
      [
        [0, 100, 35],
        [100, 100, 0],
      ],
      14,
    );
    const high = (lift: number) =>
      deckWay(
        [
          [0, 107, 35 + lift],
          [100, 107, lift],
        ],
        14,
      );
    const rail = (lift: number) => {
      const h = high(lift);
      return world(makeCell(0, 0, { elevated: [low, h] }))
        .parapets(50, 100, 3, h)
        .filter((r) => Math.abs((r.n0 + r.n1) / 2 - 100) < 0.5);
    };
    expect(rail(1.8).length).toBeGreaterThan(0);
    expect(rail(0.3)).toEqual([]);
  });

  it("leaves no gap in a rail where its way crosses into the next square", () => {
    // a way across the border at e = 200; a footbridge joins it 1.5 m past the border, filed
    // only under the square east of it
    const main = deckWay([
      [150, 50, 7],
      [250, 50, 7],
    ]);
    const join = deckWay(
      [
        [201.5, 50, 7],
        [201.5, 100, 7],
      ],
      2,
    );
    const w = world(
      makeCell(0, 0, { elevated: [main] }),
      makeCell(1, 0, { elevated: [main, join] }),
    );
    const north = w
      .parapets(200, 55, 6)
      .filter((r) => Math.abs(r.n0 - 55) < 0.01 && Math.abs(r.n1 - 55) < 0.01);
    const covered = (e: number) =>
      north.some((r) => Math.min(r.e0, r.e1) <= e && Math.max(r.e0, r.e1) >= e);
    for (const e of [196.5, 197.5, 198.5, 199.5, 199.9, 203.5, 205]) expect(covered(e)).toBe(true);
    // open where the footbridge joins
    expect(covered(201.5)).toBe(false);
  });

  it("closes the outside of a bend, between one segment's rail and the next's", () => {
    // turning 60° left at (100, 50): the right (south) rails end at (100, 45) and start again at
    // (104.3, 47.5)
    const w = world(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 50, 7],
            [100, 50, 7],
            [150, 50 + 50 * Math.sqrt(3), 7],
          ]),
        ],
      }),
    );
    const near = (r: Parapet, e: number, n: number) =>
      Math.hypot(r.e0 - e, r.n0 - n) < 0.01 || Math.hypot(r.e1 - e, r.n1 - n) < 0.01;
    const chord = w
      .parapets(102, 46, 3)
      .find(
        (r) =>
          near(r, 100, 45) &&
          near(r, 100 + 5 * Math.sin(Math.PI / 3), 50 - 5 * Math.cos(Math.PI / 3)),
      );
    expect(chord).toBeDefined();
    // and none across the inside of the bend
    expect(
      w
        .parapets(99, 56, 2)
        .some(
          (r) =>
            near(r, 100, 55) &&
            near(r, 100 - 5 * Math.sin(Math.PI / 3), 50 + 5 * Math.cos(Math.PI / 3)),
        ),
    ).toBe(false);
  });

  it("holds you up a little past its rails, where a gap between them lets you through", () => {
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
    expect(w.surfaceUnder(50, 55.3, 6.9, 0.3)).toMatchObject({ z: 7, kind: "deck" });
    expect(w.surfaceUnder(50, 55.7, 6.9, 0.3).kind).toBe("ground");
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
