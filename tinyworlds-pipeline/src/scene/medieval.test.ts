import { describe, expect, it } from "vitest";
import { G } from "./kinds.js";
import {
  blob,
  chaikin,
  curtain,
  disc,
  growLanes,
  insideRing,
  inset,
  lineWithHouses,
  Occupancy,
  pathLength,
  pointAlong,
  rect,
  ribbon,
  ringArea,
  STONE,
  steps,
  tower,
  type Street,
} from "./medieval.js";
import type { Look, SyntheticBuilder } from "./synthetic.js";

interface Recorded {
  volumes: { corners: number[]; height: number; base: number; look: Look }[];
  lines: { kind: number; width: number; path: number[] }[];
  trees: number[];
}

/** A builder that only writes down what it is asked to build. */
function recorder(): SyntheticBuilder & Recorded {
  const volumes: Recorded["volumes"] = [];
  const lines: Recorded["lines"] = [];
  const trees: number[] = [];
  return {
    volumes,
    lines,
    trees,
    ground: () => undefined,
    line: (kind, width, path) => void lines.push({ kind, width, path }),
    volume: (corners, height, base, look) => void volumes.push({ corners, height, base, look }),
    prism: (p, q, radius, sides, height, base, look) =>
      void volumes.push({ corners: disc(p, q, radius, sides), height, base, look }),
    tree: (p, q) => void trees.push(p, q),
    limits: () => undefined,
    place: () => undefined,
    hood: () => undefined,
    route: () => undefined,
  };
}

const SQUARE = [0, 0, 100, 0, 100, 100, 0, 100];

describe("geometry", () => {
  it("rect keeps its area whatever its angle", () => {
    for (const angle of [0, 0.3, 1.2, Math.PI / 2]) {
      const ring = rect(10, -5, 6, 2.5, angle);
      expect(ring).toHaveLength(8);
      expect(Math.abs(ringArea(ring))).toBeCloseTo(4 * 6 * 2.5, 6);
    }
  });

  it("insideRing tells inside from outside", () => {
    expect(insideRing(SQUARE, 50, 50)).toBe(true);
    expect(insideRing(SQUARE, 150, 50)).toBe(false);
    expect(insideRing(SQUARE, -1, -1)).toBe(false);
  });

  it("inset shrinks a ring by a positive distance and grows it by a negative one", () => {
    expect(Math.abs(ringArea(inset(SQUARE, 10)))).toBeCloseTo(80 * 80, 3);
    expect(Math.abs(ringArea(inset(SQUARE, -10)))).toBeCloseTo(120 * 120, 3);
    // the same whichever way round the ring is wound
    const reversed = [0, 100, 100, 100, 100, 0, 0, 0];
    expect(Math.abs(ringArea(inset(reversed, 10)))).toBeCloseTo(80 * 80, 3);
  });

  it("pointAlong walks a path by distance and reports its direction", () => {
    const path = [0, 0, 10, 0, 10, 10];
    expect(pathLength(path)).toBe(20);
    const at = pointAlong(path, 15);
    expect(at.p).toBeCloseTo(10);
    expect(at.q).toBeCloseTo(5);
    expect(at.dp).toBeCloseTo(0);
    expect(at.dq).toBeCloseTo(1);
  });

  it("chaikin rounds a closed ring without leaving it", () => {
    const smooth = chaikin(SQUARE, 2, true);
    expect(smooth.length).toBeGreaterThan(SQUARE.length);
    expect(Math.abs(ringArea(smooth))).toBeLessThan(100 * 100);
    for (let i = 0; i < smooth.length; i += 2) {
      expect(smooth[i]).toBeGreaterThanOrEqual(0);
      expect(smooth[i]).toBeLessThanOrEqual(100);
    }
  });

  it("ribbon is as wide as asked", () => {
    const strip = ribbon([0, 0, 50, 0], 8);
    expect(Math.abs(ringArea(strip))).toBeCloseTo(50 * 8, 3);
  });

  it("blob is the same ring every time for the same seed", () => {
    expect(blob(5, 5, 40, 0.2, 7)).toEqual(blob(5, 5, 40, 0.2, 7));
    expect(blob(5, 5, 40, 0.2, 7)).not.toEqual(blob(5, 5, 40, 0.2, 8));
  });
});

describe("Occupancy", () => {
  it("refuses ground that is taken, and ground off the grid", () => {
    const occ = new Occupancy(0, 0, 100, 100, 1);
    const house = rect(20, 20, 4, 3);
    expect(occ.isFree(house)).toBe(true);
    occ.blockRing(house);
    expect(occ.isFree(house)).toBe(false);
    expect(occ.isFree(rect(22, 21, 4, 3))).toBe(false);
    expect(occ.isFree(rect(60, 60, 4, 3))).toBe(true);
    expect(occ.isFree(rect(-20, 50, 4, 3))).toBe(false);
  });

  it("blocks a path with its width", () => {
    const occ = new Occupancy(0, 0, 100, 100, 1);
    occ.blockPath([0, 50, 100, 50], 6);
    expect(occ.isTaken(40, 51)).toBe(true);
    expect(occ.isTaken(40, 60)).toBe(false);
  });
});

describe("curtain", () => {
  const options = {
    height: 10,
    thickness: 4,
    stone: STONE.grey,
    towerRadius: 5,
    towerHeight: 14,
    towerEvery: 40,
  };

  it("cuts each gate into the nearest stretch of wall and says which way is out", () => {
    const b = recorder();
    const gates = curtain(b, SQUARE, { ...options, gates: [{ name: "east", p: 50, q: 130 }] });
    expect(gates).toHaveLength(1);
    expect(gates[0].name).toBe("east");
    expect(gates[0].p).toBeCloseTo(50);
    expect(gates[0].q).toBeCloseTo(100);
    expect(gates[0].outP).toBeCloseTo(0);
    expect(gates[0].outQ).toBeCloseTo(1);
    // the same gate when the ring is wound the other way
    const again = curtain(recorder(), [0, 100, 100, 100, 100, 0, 0, 0], {
      ...options,
      gates: [{ name: "east", p: 50, q: 130 }],
    });
    expect(again[0].outQ).toBeCloseTo(1);
    expect(b.volumes.length).toBeGreaterThan(8);
  });

  it("leaves open edges unwalled and stands on its base", () => {
    const closed = recorder();
    curtain(closed, SQUARE, options);
    const open = recorder();
    curtain(open, SQUARE, { ...options, openEdges: [1], bareCorners: [1] });
    expect(open.volumes.length).toBeLessThan(closed.volumes.length);

    const raised = recorder();
    curtain(raised, SQUARE, { ...options, base: 20, merlons: true });
    expect(Math.min(...raised.volumes.map((v) => v.base))).toBe(20);
    expect(Math.max(...raised.volumes.map((v) => v.height))).toBeGreaterThan(20 + 14);
  });
});

describe("tower and steps", () => {
  it("measures a tower's height from its base", () => {
    const b = recorder();
    tower(b, 0, 0, 5, 12, STONE.grey, { base: 8, crown: true, cone: { height: 6, roof: STONE.grey.roof } });
    expect(b.volumes[0].base).toBe(8);
    expect(b.volumes[0].height).toBe(20);
    expect(Math.max(...b.volumes.map((v) => v.height))).toBeCloseTo(8 + 12 + 1.2 + 6);
  });

  it("steps go down, away from the terrace", () => {
    const b = recorder();
    steps(b, 0, 0, 1, 0, 20, 6, 10, STONE.grey, 5);
    expect(b.volumes).toHaveLength(5);
    const heights = b.volumes.map((v) => v.height);
    expect([...heights].sort((x, y) => y - x)).toEqual(heights);
    expect(heights[0]).toBeLessThan(10);
    expect(heights[4]).toBeGreaterThan(0);
  });
});

describe("streets and houses", () => {
  const main: Street = { path: [10, 150, 290, 150], width: 8, kind: G.Cobble, level: 0 };
  const allowed = (p: number, q: number): boolean => p > 5 && p < 295 && q > 5 && q < 295;
  const options = {
    seed: 9,
    allowed,
    spacing: [30, 50] as [number, number],
    reach: [40, 120] as [number, number],
    depth: 3,
    join: 14,
    width: [4, 5] as [number, number],
    kind: G.DirtRoad,
  };

  it("grows the same lanes every time, and only where allowed", () => {
    const lanes = growLanes([main], options);
    expect(lanes.length).toBeGreaterThan(8);
    expect(growLanes([main], options)).toEqual(lanes);
    expect(growLanes([main], { ...options, seed: 10 })).not.toEqual(lanes);
    for (const lane of lanes) {
      expect(lane.level).toBeGreaterThan(0);
      expect(lane.width).toBeGreaterThanOrEqual(2.8);
      // every point it grew on its own is allowed (its last may be the street it joined)
      for (let i = 0; i < lane.path.length - 2; i += 2)
        expect(allowed(lane.path[i], lane.path[i + 1])).toBe(true);
    }
  });

  it("lines a street with houses that do not stand on each other or on the street", () => {
    const b = recorder();
    const occ = new Occupancy(0, 0, 300, 300, 1);
    occ.blockPath(main.path, main.width);
    const built = lineWithHouses(b, occ, main, { seed: 3, wealthAt: () => 1, rows: 2 });
    expect(built).toBeGreaterThan(40);
    expect(b.volumes).toHaveLength(built);
    // a second pass finds every plot taken
    const check = new Occupancy(0, 0, 300, 300, 0.5);
    check.blockPath(main.path, main.width - 1);
    for (const house of b.volumes) {
      expect(check.isFree(house.corners)).toBe(true);
      check.blockRing(inset(house.corners, 0.3));
    }
    // and nowhere the wealth map says no
    expect(
      lineWithHouses(recorder(), new Occupancy(0, 0, 300, 300, 1), main, {
        seed: 3,
        wealthAt: () => null,
        rows: 2,
      }),
    ).toBe(0);
  });
});
