import { describe, expect, it } from "vitest";
import { applyBody, bodyOf, overlap, resolve, type Body } from "../collide";
import { CARS, newVehicle } from "../vehicles";

const EAST = Math.PI / 2;

/** A box of half length `hl` (along its yaw) and half width `hw`, at rest unless told otherwise. */
function box(e: number, n: number, o: Partial<Body> = {}): Body {
  return { e, n, yaw: 0, hl: 0.5, hw: 0.5, mass: 1000, ve: 0, vn: 0, w: 0, ...o };
}

describe("overlap", () => {
  it("finds nothing between two unit boxes 1.5 m apart", () => {
    expect(overlap(box(1.5, 0), box(0, 0))).toBeNull();
    expect(overlap(box(0, 1.5), box(0, 0))).toBeNull();
  });

  it("finds 0.1 m along east between two unit boxes 0.9 m apart, pushing the first away", () => {
    const hit = overlap(box(0.9, 0), box(0, 0))!;
    expect(hit).not.toBeNull();
    expect(hit.depth).toBeCloseTo(0.1, 9);
    expect(hit.ne).toBeCloseTo(1, 9);
    expect(hit.nn).toBeCloseTo(0, 9);
    // the middle of the overlap
    expect(hit.pe).toBeCloseTo(0.45, 9);
    expect(hit.pn).toBeCloseTo(0, 9);
    // the other way round, the normal turns round with it
    expect(overlap(box(0, 0), box(0.9, 0))!.ne).toBeCloseTo(-1, 9);
  });

  it("finds a box turned 45 degrees by the corner it pushes in", () => {
    const half = Math.SQRT1_2;
    const hit = overlap(box(0.5 + half - 0.1, 0, { yaw: Math.PI / 4 }), box(0, 0))!;
    expect(hit).not.toBeNull();
    expect(hit.depth).toBeCloseTo(0.1, 6);
    expect(hit.ne).toBeCloseTo(1, 6);
    expect(hit.pe).toBeCloseTo(0.4, 6);
    expect(hit.pn).toBeCloseTo(0, 6);
    expect(overlap(box(0.5 + half + 0.1, 0, { yaw: Math.PI / 4 }), box(0, 0))).toBeNull();
  });

  it("separates two boxes turned 45 degrees along their own axis", () => {
    const d = 0.9 * Math.SQRT1_2;
    const hit = overlap(box(d, d, { yaw: Math.PI / 4 }), box(0, 0, { yaw: Math.PI / 4 }))!;
    expect(hit.depth).toBeCloseTo(0.1, 6);
    expect(hit.ne).toBeCloseTo(Math.SQRT1_2, 6);
    expect(hit.nn).toBeCloseTo(Math.SQRT1_2, 6);
    expect(
      overlap(box(1.1, 1.1, { yaw: Math.PI / 4 }), box(0, 0, { yaw: Math.PI / 4 })),
    ).toBeNull();
  });

  it("uses the long axis of a car-sized box", () => {
    // a 4.7 m car facing east, nose 0.2 m into a unit box
    const car = box(0, 0, { yaw: EAST, hl: 2.35, hw: 0.9 });
    const hit = overlap(box(2.35 + 0.5 - 0.2, 0), car)!;
    expect(hit.depth).toBeCloseTo(0.2, 6);
    expect(hit.ne).toBeCloseTo(1, 6);
  });
});

describe("resolve", () => {
  it("bounces equal masses meeting head-on at 10 m/s each apart at a quarter of their closing speed", () => {
    const a = box(0.9, 0, { ve: -10 });
    const b = box(0, 0, { ve: 10 });
    const impact = resolve(a, b, overlap(a, b)!);
    expect(impact).toBeCloseTo(20, 9);
    const apart = a.ve - b.ve;
    expect(apart).toBeGreaterThan(0);
    expect(apart).toBeLessThanOrEqual(0.25 * 20 + 1e-9);
    expect(apart).toBeCloseTo(5, 9);
    // a head-on hit through both middles spins neither
    expect(a.w).toBeCloseTo(0, 9);
    expect(b.w).toBeCloseTo(0, 9);
    // pushed apart, each half way
    expect(overlap(a, b)).toBeNull();
    expect(a.e).toBeCloseTo(0.95, 2);
    expect(b.e).toBeCloseTo(-0.05, 2);
  });

  it("moves the heavier less", () => {
    const a = box(0.9, 0, { mass: 1000, ve: -10 });
    const b = box(0, 0, { mass: 4000 });
    resolve(a, b, overlap(a, b)!);
    expect(Math.abs(a.e - 0.9)).toBeGreaterThan(Math.abs(b.e));
    expect(Math.abs(a.ve + 10)).toBeGreaterThan(Math.abs(b.ve));
    // momentum is kept
    expect(1000 * a.ve + 4000 * b.ve).toBeCloseTo(1000 * -10, 6);
  });

  it("answers 0 and leaves the speeds alone for boxes already parting", () => {
    const a = box(0.9, 0, { ve: 3 });
    const b = box(0, 0);
    expect(resolve(a, b, overlap(a, b)!)).toBe(0);
    expect(a.ve).toBe(3);
    expect(b.ve).toBe(0);
    expect(overlap(a, b)).toBeNull();
  });

  it("spins boxes that meet corner to corner, the way the blow turns them", () => {
    // a box driving east catches the north end of a box lying north-south with its own south corner
    const a = box(-0.9, 1.2, { ve: 10 });
    const b = box(0, 0, { hl: 1, hw: 0.5 });
    const hit = overlap(a, b)!;
    expect(hit.ne).toBeCloseTo(-1, 6);
    expect(hit.pn).toBeCloseTo(0.85, 6);
    resolve(a, b, hit);
    // b is pushed east above its middle, a west below its own: both turn clockwise (north towards east)
    expect(b.w).toBeGreaterThan(0);
    expect(a.w).toBeGreaterThan(0);
    expect(b.ve).toBeGreaterThan(0);
  });

  it("does not move what cannot move", () => {
    const a = box(0.9, 0, { ve: -10 });
    const wall = box(0, 0, { mass: Infinity });
    const impact = resolve(a, wall, overlap(a, wall)!);
    expect(impact).toBeCloseTo(10, 9);
    expect(wall.e).toBe(0);
    expect(wall.ve).toBe(0);
    expect(a.ve).toBeCloseTo(2.5, 9);
    expect(a.e).toBeGreaterThanOrEqual(1);
  });
});

describe("bodies of vehicles", () => {
  it("turns a vehicle's speeds along and across its heading into east and north and back", () => {
    const v = newVehicle(1, "sedan", 10, 20, EAST, "loose");
    v.v = 12;
    v.vs = 3;
    v.w = 0.4;
    const b = bodyOf(v);
    expect(b.hl).toBe(CARS.sedan.length / 2);
    expect(b.hw).toBe(CARS.sedan.width / 2);
    expect(b.mass).toBe(CARS.sedan.mass);
    // facing east: forward is east, its right is south
    expect(b.ve).toBeCloseTo(12, 9);
    expect(b.vn).toBeCloseTo(-3, 9);
    b.ve = 5;
    b.vn = 2;
    b.e = 11;
    b.w = -1;
    applyBody(v, b);
    expect(v.e).toBe(11);
    expect(v.v).toBeCloseTo(5, 9);
    expect(v.vs).toBeCloseTo(-2, 9);
    expect(v.w).toBe(-1);
  });
});
