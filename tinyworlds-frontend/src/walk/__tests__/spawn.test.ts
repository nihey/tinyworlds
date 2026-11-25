import { describe, expect, it } from "vitest";
import type { StreetEdge, WalkEdge } from "../cell";
import { comeTo } from "../spawn";
import { WalkWorld } from "../world";
import type { WalkIndex } from "../walk-index";
import { boxVolume, makeCell, waterRect } from "./fixtures";

const street = (n: number, width = 10, elevated = false): StreetEdge => ({
  key: `s${n}`,
  a: 1,
  b: 2,
  cls: 5,
  link: false,
  ow: 0,
  elevated,
  width,
  pts: Float32Array.of(0, n, 0, 400, n, 0),
  length: 400,
});
const walk = (n: number, opts: Partial<WalkEdge> = {}): WalkEdge => ({
  key: `w${n}${opts.crosswalk ? "x" : ""}`,
  a: 1,
  b: 2,
  crosswalk: false,
  phase: 0,
  elevated: false,
  pts: Float32Array.of(0, n, 0, 400, n, 0),
  length: 400,
  ...opts,
});

function world(...cells: ReturnType<typeof makeCell>[]) {
  const w = new WalkWorld({} as WalkIndex);
  for (const c of cells) w.add(c);
  return w;
}

const rng =
  (seed = 1) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

describe("comeTo", () => {
  it("puts you on a sidewalk 20 to 60 m away, out of walls, facing along it", () => {
    const w = world(
      makeCell(0, 0, {
        streets: [street(100)],
        walks: [walk(110), walk(90)],
        volumes: [boxVolume(150, 105, 170, 130)],
      }),
      makeCell(1, 0, { streets: [street(100)], walks: [walk(110), walk(90)] }),
    );
    for (let s = 1; s < 30; s++) {
      const r = comeTo(w, 100, 100, rng(s))!;
      expect(r).not.toBeNull();
      const d = Math.hypot(r.e - 100, r.n - 100);
      expect(d).toBeGreaterThanOrEqual(20);
      expect(d).toBeLessThanOrEqual(60);
      expect(Math.abs(r.n - 100)).toBeGreaterThan(7);
      expect(w.blocked(r.e, r.n, 0.35, 0, 1.8)).toBe(false);
      expect(Math.abs(Math.sin(r.yaw))).toBeCloseTo(1, 5);
    }
  });

  it("skips crosswalks, elevated walks, water and spots near the street", () => {
    const w = world(
      makeCell(0, 0, {
        streets: [street(100)],
        walks: [
          walk(100, { crosswalk: true }),
          walk(130, { elevated: true }),
          walk(103), // 3 m from the centre: inside the 5 m strip
          walk(106.5), // 1.5 m from the strip's edge
        ],
      }),
    );
    expect(comeTo(w, 100, 100, rng())).toBeNull();
    const wet = world(
      makeCell(0, 0, { walks: [walk(110)], mask: waterRect(0, 0, 0, 0, 200, 200) }),
    );
    expect(comeTo(wet, 100, 100, rng())).toBeNull();
  });

  it("widens to 200 m when nothing is within 60 m", () => {
    const w = world(
      makeCell(0, 0, {
        walks: [Object.assign(walk(100), { pts: Float32Array.of(190, 100, 0, 195, 100, 0) })],
      }),
    );
    expect(comeTo(w, 20, 100, rng())).not.toBeNull();
    const far = world(
      makeCell(1, 0, {
        walks: [Object.assign(walk(100), { pts: Float32Array.of(390, 100, 0, 395, 100, 0) })],
      }),
    );
    expect(comeTo(far, 20, 100, rng())).toBeNull();
  });

  it("gives null for a world with only a street", () => {
    const w = world(makeCell(0, 0, { streets: [street(100)] }));
    expect(comeTo(w, 100, 100, rng())).toBeNull();
  });
});
