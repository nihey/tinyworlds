import { describe, expect, it } from "vitest";
import { R } from "../render/palette.js";
import { G } from "./kinds.js";
import { disc, insideRing, ringArea } from "./medieval.js";
import type { Look, SyntheticBuilder } from "./synthetic.js";
import {
  castle,
  city,
  facingEdge,
  grove,
  holdfast,
  houses,
  isle,
  LandMask,
  nearestOnPath,
  nearestWater,
  pathPQ,
  polygon,
  range,
  roughen,
  ruin,
  settle,
  sketch,
  toEN,
  toPQ,
  wallRing,
  ziggurat,
  type Style,
} from "./worldkit.js";

interface Recorded {
  volumes: { corners: number[]; height: number; base: number; look: Look }[];
  ground: { kind: number; rings: number[] | number[][] }[];
  trees: number[];
}

/** A builder that only writes down what it is asked to build. */
function builder(): { b: SyntheticBuilder; seen: Recorded } {
  const seen: Recorded = { volumes: [], ground: [], trees: [] };
  const b: SyntheticBuilder = {
    ground: (kind, rings) => void seen.ground.push({ kind, rings }),
    line: () => undefined,
    volume: (corners, height, base, look) => void seen.volumes.push({ corners, height, base, look }),
    prism: (p, q, radius, sides, height, base, look) =>
      void seen.volumes.push({ corners: disc(p, q, radius, sides), height, base, look }),
    tree: (p, q) => void seen.trees.push(p, q),
    limits: () => undefined,
    place: () => undefined,
    hood: () => undefined,
    route: () => undefined,
  };
  return { b, seen };
}

const STYLE: Style = {
  stone: R.greyStone,
  cone: R.roofSlate,
  roof: R.roofSlate,
  walls: [R.greyStone, R.timber],
  roofs: [R.roofSlate, R.thatch],
};

/** How far the farthest corner of anything built is from a point. */
function reach(volumes: Recorded["volumes"], p: number, q: number): number {
  let far = 0;
  for (const v of volumes)
    for (let i = 0; i < v.corners.length; i += 2)
      far = Math.max(far, Math.hypot(v.corners[i] - p, v.corners[i + 1] - q));
  return far;
}

describe("world coordinates", () => {
  it("puts north straight up the screen and east to the right", () => {
    // map x = (p + q)·k, map y = (q − p)·k/2
    const [np, nq] = toPQ(0, 100);
    expect(np + nq).toBeCloseTo(0, 9);
    expect(nq - np).toBeLessThan(0);
    const [ep, eq] = toPQ(100, 0);
    expect(eq - ep).toBeCloseTo(0, 9);
    expect(ep + eq).toBeGreaterThan(0);
  });

  it("keeps distances, and turns back", () => {
    const [p, q] = toPQ(300, -400);
    expect(Math.hypot(p, q)).toBeCloseTo(500, 9);
    const [e, n] = toEN(p, q);
    expect(e).toBeCloseTo(300, 9);
    expect(n).toBeCloseTo(-400, 9);
    const path = [10, 20, -30, 44, 5, -6];
    const back = pathPQ(pathPQ(path));
    back.forEach((v, i) => expect(v).toBeCloseTo(path[i], 9));
  });

  it("scales a sketch by its two steps", () => {
    expect(sketch([[1, 2]])).toEqual([100, 200]);
    expect(
      sketch(
        [
          [1, 2],
          [-3, 0.5],
        ],
        80,
        125,
      ),
    ).toEqual([80, 250, -240, 62.5]);
  });
});

describe("roughen", () => {
  const SQUARE = [0, 0, 1000, 0, 1000, 1000, 0, 1000];

  it("is the same coast every time", () => {
    expect(roughen(SQUARE, 5)).toEqual(roughen(SQUARE, 5));
    expect(roughen(SQUARE, 5)).not.toEqual(roughen(SQUARE, 6));
  });

  it("keeps the corners it was given, in order, the first one first", () => {
    const ring = roughen(SQUARE, 9, { minLen: 40 });
    expect(ring.slice(0, 2)).toEqual([0, 0]);
    let from = 0;
    for (let c = 0; c < SQUARE.length; c += 2) {
      let found = -1;
      for (let i = from; i < ring.length; i += 2) {
        if (ring[i] === SQUARE[c] && ring[i + 1] === SQUARE[c + 1]) {
          found = i;
          break;
        }
      }
      expect(found, `corner ${c / 2}`).toBeGreaterThanOrEqual(from);
      from = found + 2;
    }
  });

  it("leaves no stretch longer than asked, and no corner twice", () => {
    const ring = roughen(SQUARE, 3, { minLen: 35 });
    const n = ring.length / 2;
    expect(n).toBeGreaterThan(100);
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      expect(Math.hypot(ring[j * 2] - ring[i * 2], ring[j * 2 + 1] - ring[i * 2 + 1])).toBeLessThanOrEqual(
        35,
      );
      seen.add(`${ring[i * 2]},${ring[i * 2 + 1]}`);
    }
    expect(seen.size).toBe(n);
  });

  it("moves a coast about without changing how much land there is by much", () => {
    const area = Math.abs(ringArea(roughen(SQUARE, 12)));
    expect(area).toBeGreaterThan(0.8e6);
    expect(area).toBeLessThan(1.2e6);
  });

  it("gives two outlines the same shared edge, whichever way each walks it", () => {
    const there = roughen([0, 0, 800, 300], 4, { closed: false });
    const back = roughen([800, 300, 0, 0], 4, { closed: false });
    const reversed: number[] = [];
    for (let i = back.length - 2; i >= 0; i -= 2) reversed.push(back[i], back[i + 1]);
    expect(reversed).toEqual(there);
  });

  it("keeps both ends of an open path", () => {
    const path = roughen([0, 0, 500, 0, 500, 700], 2, { closed: false });
    expect(path.slice(0, 2)).toEqual([0, 0]);
    expect(path.slice(-2)).toEqual([500, 700]);
  });
});

describe("LandMask", () => {
  const mask = new LandMask(-500, -500, 500, 500, 5);
  mask.add([-300, -300, 300, -300, 300, 300, -300, 300]);
  mask.add(disc(0, 0, 60, 16), false);

  it("knows land from sea, and a lake from the land around it", () => {
    expect(mask.has(200, 200)).toBe(true);
    expect(mask.has(400, 0)).toBe(false);
    expect(mask.has(0, 0)).toBe(false);
    expect(mask.has(9999, 0)).toBe(false);
    expect(mask.holds(200, 0, 60)).toBe(true);
    expect(mask.holds(280, 0, 60)).toBe(false);
  });

  it("settles a disc on dry ground near where it was put", () => {
    const [e, n] = settle(mask, 290, 0, 50);
    expect(mask.holds(e, n, 50)).toBe(true);
    expect(Math.hypot(e - 290, n)).toBeLessThan(80);
    // already dry: it does not move
    expect(settle(mask, 180, 180, 40)).toEqual([180, 180]);
    // out of the lake
    const [le, ln] = settle(mask, 40, 0, 30);
    expect(mask.holds(le, ln, 30)).toBe(true);
  });

  it("finds which way the water is", () => {
    const water = nearestWater(mask, 240, 0, 20, 200);
    expect(water).not.toBeNull();
    expect(water!.de).toBeGreaterThan(0.9);
    expect(water!.dist).toBeGreaterThan(50);
    expect(water!.dist).toBeLessThan(80);
    expect(nearestWater(mask, 180, 180, 10, 40)).toBeNull();
  });
});

describe("paths and rings", () => {
  it("finds the nearest point of a path and the way it runs there", () => {
    const hit = nearestOnPath([0, 0, 100, 0, 100, 100], 60, 20);
    expect(hit.x).toBeCloseTo(60, 9);
    expect(hit.y).toBeCloseTo(0, 9);
    expect(hit.dist).toBeCloseTo(20, 9);
    expect([hit.tx, hit.ty]).toEqual([1, 0]);
    expect(nearestOnPath([0, 0, 100, 0, 100, 100], 130, 80).tx).toBeCloseTo(0, 9);
  });

  it("draws an island around its centre, stretched as asked", () => {
    const round = isle(100, 200, 50, 7);
    const wide = isle(100, 200, 50, 7, 2);
    expect(insideRing(round, 100, 200)).toBe(true);
    for (let i = 0; i < round.length; i += 2) {
      const d = Math.hypot(round[i] - 100, round[i + 1] - 200);
      expect(d).toBeGreaterThan(50 * 0.7);
      expect(d).toBeLessThan(50 * 1.3);
      expect(wide[i] - 100).toBeCloseTo((round[i] - 100) * 2, 9);
      expect(wide[i + 1]).toBeCloseTo(round[i + 1], 9);
    }
  });

  it("picks the edge of a ring that faces a direction", () => {
    const ring = [-10, -10, 10, -10, 10, 10, -10, 10];
    expect(facingEdge(ring, 0, 0, 0, -1)).toBe(0);
    expect(facingEdge(ring, 0, 0, 1, 0)).toBe(1);
    expect(facingEdge(ring, 0, 0, 0, 1)).toBe(2);
    expect(facingEdge(ring, 0, 0, -1, 0)).toBe(3);
  });

  it("plants a grove inside its ring and nowhere it is told not to", () => {
    const { b, seen } = builder();
    const ring = polygon(0, 0, 200, 9, 3, 0.2);
    const planted = grove(b, ring, 100, 1, (p) => p < 50);
    expect(planted).toBe(seen.trees.length / 2);
    expect(planted).toBeGreaterThan(400);
    for (let i = 0; i < seen.trees.length; i += 2) {
      expect(seen.trees[i]).toBeLessThan(50);
      // jitter may carry a tree half a step over the edge
      expect(Math.hypot(seen.trees[i], seen.trees[i + 1])).toBeLessThan(200 * 1.2 + 10);
    }
  });
});

describe("kits", () => {
  it("builds a castle that stays on its ground", () => {
    const { b, seen } = builder();
    castle(b, 1000, -500, 50, STYLE, 42, { double: true, moat: true });
    expect(seen.volumes.length).toBeGreaterThan(40);
    expect(reach(seen.volumes, 1000, -500)).toBeLessThan(50 * 1.25);
    // on a rock it lays no ground of its own and everything starts at the top of the rock
    const high = builder();
    castle(high.b, 0, 0, 40, STYLE, 42, { base: 30 });
    expect(high.seen.ground).toHaveLength(0);
    expect(Math.min(...high.seen.volumes.map((v) => v.base))).toBe(30);
  });

  it("builds a holdfast and a ruin within their radius", () => {
    const hold = builder();
    holdfast(hold.b, 0, 0, 30, STYLE, 7);
    expect(reach(hold.seen.volumes, 0, 0)).toBeLessThan(30 * 1.2);
    const old = builder();
    ruin(old.b, 0, 0, 40, R.greyStone, 7, 5);
    expect(old.seen.volumes.length).toBeGreaterThanOrEqual(10);
    expect(reach(old.seen.volumes, 0, 0)).toBeLessThan(40 * 1.3);
  });

  it("walls a ring with a tower on every corner and gates where asked", () => {
    const { b, seen } = builder();
    const ring = polygon(0, 0, 100, 6, 1, 0);
    wallRing(b, ring, {
      height: 10,
      thickness: 4,
      wall: R.greyStone,
      towerRadius: 6,
      towerHeight: 16,
      gates: [0],
      open: [3],
    });
    const walls = seen.volumes.filter((v) => v.corners.length === 8 && v.height === 10);
    expect(walls).toHaveLength(5);
    // 6 corner towers, 2 gate towers and one half-way along each of the 4 plain stretches, each a
    // shaft and a crown; one gatehouse
    expect(seen.volumes).toHaveLength(5 + (6 + 2 + 4) * 2 + 1);
  });

  it("keeps houses apart, inside the walls and off forbidden ground", () => {
    const { b, seen } = builder();
    const inside = polygon(0, 0, 90, 8, 2, 0);
    const placed = houses(b, 0, 0, 100, STYLE, 9, {
      count: 60,
      inside,
      avoid: [[0, 0, 25]],
      ok: (p) => p > -60,
    });
    expect(placed.length).toBeGreaterThan(20);
    expect(seen.volumes).toHaveLength(placed.length);
    for (let i = 0; i < placed.length; i++) {
      const [p, q, r] = placed[i];
      expect(insideRing(inside, p, q)).toBe(true);
      expect(p).toBeGreaterThan(-60);
      expect(Math.hypot(p, q)).toBeGreaterThanOrEqual(25 + r);
      for (let j = i + 1; j < placed.length; j++)
        expect(Math.hypot(p - placed[j][0], q - placed[j][1])).toBeGreaterThanOrEqual(
          r + placed[j][2] - 1e-9,
        );
    }
  });

  it("builds a walled city on its radius, with piers on the side of the water", () => {
    const { b, seen } = builder();
    const ring = city(b, 0, 0, 120, STYLE, 5, {
      houses: 50,
      landmark: "sept",
      citadel: true,
      port: { dp: 1, dq: 0, reach: 60 },
    });
    expect(ring).toHaveLength(20);
    const piers = seen.ground.filter((g) => g.kind === G.Pier);
    expect(piers.length).toBeGreaterThanOrEqual(2);
    for (const pier of piers)
      expect(Math.min(...(pier.rings as number[]).filter((_, i) => i % 2 === 0))).toBeGreaterThan(60);
    // everything but the ships at the piers is within the walls and their towers
    const ashore = seen.volumes.filter((v) => v.corners[0] < 125);
    expect(reach(ashore, 0, 0)).toBeLessThan(120 * 1.2);
    expect(seen.volumes.length).toBeGreaterThan(120);
  });

  it("steps a pyramid up to its height", () => {
    const { b, seen } = builder();
    expect(ziggurat(b, 0, 0, 40, 90, 6, [R.brickRed, R.ochre], 10)).toBe(100);
    expect(seen.volumes).toHaveLength(6);
    for (let i = 1; i < 6; i++) {
      expect(seen.volumes[i].base).toBeCloseTo(seen.volumes[i - 1].height, 9);
      expect(Math.abs(ringArea(seen.volumes[i].corners))).toBeLessThan(
        Math.abs(ringArea(seen.volumes[i - 1].corners)),
      );
    }
  });

  it("raises a range of peaks along its line, only where allowed", () => {
    const opts = { width: 400, height: 200, rock: R.greyStone, seed: 3, cap: { above: 150, of: R.snow } };
    const all = builder();
    const count = range(all.b, [0, 0, 2000, 0], opts);
    expect(count).toBeGreaterThan(40);
    // a capped peak is two volumes
    expect(all.seen.volumes.length).toBeGreaterThan(count);
    expect(all.seen.volumes.length).toBeLessThanOrEqual(count * 2);
    expect(Math.max(...all.seen.volumes.map((v) => v.height))).toBeLessThanOrEqual(200 * 1.01 + 1e-9);
    for (const v of all.seen.volumes) expect(Math.abs(v.corners[1])).toBeLessThan(400);
    const again = builder();
    expect(range(again.b, [0, 0, 2000, 0], opts)).toBe(count);
    expect(again.seen.volumes).toEqual(all.seen.volumes);
    const some = builder();
    const fewer = range(some.b, [0, 0, 2000, 0], { ...opts, ok: (p) => p > 1000 });
    expect(fewer).toBeLessThan(count);
    expect(fewer).toBeGreaterThan(0);
    for (const v of some.seen.volumes) expect(v.corners[0]).toBeGreaterThan(850);
  });
});
