import { describe, expect, it } from "vitest";
import type { WalkCell } from "../cell";
import { bodyOf } from "../collide";
import { Ferries } from "../ferries";
import { enToLonLat, lonLatToEN, type WalkGeo } from "../geo";
import { wrap } from "../math";
import { BOATS, newVehicle, nextVehicleId, sizeFor, stepBoat } from "../vehicles";
import { makeCell, waterRect, worldOf } from "./fixtures";

const geo: WalkGeo = { lon0: -74, lat0: 40.7, betaDeg: 45, k: 2, kz: 2.45 };
const route = (name: string, from: [number, number], to: [number, number]) => ({
  name,
  path: [...enToLonLat(geo, ...from), ...enToLonLat(geo, ...to)],
});

/** Open water south of n = 300, land north of it. */
function harbour(): ReturnType<typeof worldOf> {
  const cells: WalkCell[] = [];
  for (let i = -1; i <= 1; i++) {
    for (const j of [-1, 0]) cells.push(makeCell(i, j, { mask: { mode: 1, bits: null } }));
    cells.push(makeCell(i, 1, { mask: waterRect(i, 1, i * 200, 200, i * 200 + 200, 300) }));
    cells.push(makeCell(i, 2));
  }
  return worldOf(...cells);
}

describe("which boat is the Staten Island ferry", () => {
  it("is the St. George route whose other end is nearest Whitehall, in lower Manhattan", () => {
    const stGeorge = [-74.07417, 40.64609];
    const batteryPark = [-74.01807, 40.71516];
    const ferries = new Ferries(
      [
        { name: "St. George – Bay Ridge", path: [...stGeorge, -74.03816, 40.63991] },
        { name: "St. George – Battery Park City", path: [...stGeorge, ...batteryPark] },
        { name: "Sunset Park – Rockaway", path: [-74.02648, 40.6463, -73.83174, 40.58419] },
      ],
      geo,
    );
    // out along their routes, away from St. George where both begin
    ferries.step(
      200,
      1,
      worldOf(),
      true,
      () => false,
      () => true,
    );
    const orange = ferries.boats().filter((b) => b.color === 1);
    expect(orange).toHaveLength(1);
    const [se, sn] = lonLatToEN(geo, stGeorge[0], stGeorge[1]);
    const [be, bn] = lonLatToEN(geo, batteryPark[0], batteryPark[1]);
    const { e, n } = orange[0];
    expect(Math.hypot(e - se, n - sn)).toBeGreaterThan(500);
    // on the line from St. George to Battery Park City (1.6 km from Whitehall; Bay Ridge is 7 km)
    const off =
      Math.abs((be - se) * (n - sn) - (bn - sn) * (e - se)) / Math.hypot(be - se, bn - sn);
    expect(off).toBeLessThan(1);
  });
});

describe("the Staten Island ferry", () => {
  const ferries = new Ferries(
    [
      route("Pier 11 – Red Hook", [0, 0], [300, 0]),
      route("St. George – Whitehall", [0, 100], [2000, 100]),
    ],
    geo,
  );
  const boats = ferries.boats();
  const staten = boats.find((b) => b.color === 1)!;

  it("is the long orange one, its box 90 × 20 m; the others are not", () => {
    expect(staten.size).toEqual({ length: 90, width: 20 });
    const body = bodyOf(staten);
    expect(body.hl).toBe(45);
    expect(body.hw).toBe(10);
    // as much taller and heavier as it is longer
    expect(sizeFor(staten).height).toBeCloseTo(BOATS.ferry.height * 3, 5);
    expect(sizeFor(staten).mass).toBeCloseTo(BOATS.ferry.mass * 3, 5);
    const other = boats.find((b) => b !== staten)!;
    expect(other.size).toBeUndefined();
    expect(bodyOf(other).hl).toBe(15);
  });

  it("sails its route end to end and turns round at each end over a few seconds", () => {
    const world = harbour();
    const seen: { e: number; yaw: number }[] = [];
    for (let t = 0; t < 600; t += 1) {
      ferries.step(
        t,
        1,
        world,
        true,
        () => false,
        () => true,
      );
      seen.push({ e: staten.e, yaw: staten.yaw });
    }
    expect(Math.min(...seen.map((s) => s.e))).toBeLessThan(1);
    expect(Math.max(...seen.map((s) => s.e))).toBeGreaterThan(1999);
    // never more than half a radian in a second (the turn round takes 10 s)
    for (let k = 1; k < seen.length; k++)
      expect(Math.abs(wrap(seen[k].yaw - seen[k - 1].yaw))).toBeLessThan(0.5);
  });

  it("is stopped by land at its own bow, 45 m ahead of its middle", () => {
    const world = harbour();
    const sail = (size?: { length: number; width: number }) => {
      const b = newVehicle(nextVehicleId(), "ferry", 100, 150, 0, "driven");
      b.size = size;
      const ahead = { throttle: 1, brake: 0, steer: 0, handbrake: false };
      for (let t = 0; t < 40; t += 0.05) stepBoat(b, ahead, world, 0.05, t, { calm: true });
      return b;
    };
    const long = sail({ length: 90, width: 20 });
    const short = sail();
    expect(long.n).toBeLessThan(300 - 44);
    expect(long.n).toBeGreaterThan(300 - 47);
    expect(short.n).toBeGreaterThan(300 - 17);
  });
});
