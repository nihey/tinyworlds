import { describe, expect, it } from "vitest";
import { toTake, wayOut, type Spot } from "../doors";
import { newPlayer } from "../player";
import { newVehicle, nextVehicleId } from "../vehicles";
import { boxVolume, makeCell, strip, waterRect, worldOf } from "./fixtures";

/** A sedan facing north at (100, 100): its driver's side is the west. */
const sedan = (v = 0) => {
  const car = newVehicle(nextVehicleId(), "sedan", 100, 100, 0, "driven");
  car.v = v;
  return car;
};
/** Walls standing along the car's west side, its east side, or both, and before and behind it. */
const wall = { west: boxVolume(97, 90, 98.9, 110), east: boxVolume(101.1, 90, 103, 110) };
const ends = [boxVolume(95, 103, 105, 106), boxVolume(95, 94, 105, 97)];
const walled = (...vols: ReturnType<typeof boxVolume>[]) =>
  worldOf(makeCell(0, 0, { volumes: vols }), ...strip(3).slice(1));

describe("getting out of a car", () => {
  it("is on the driver's side when there is room", () => {
    const spot = wayOut(sedan(), worldOf(...strip(3)), []) as Spot;
    expect(spot.e).toBeCloseTo(100 - 0.9 - 0.6, 5);
    expect(spot.n).toBeCloseTo(100, 5);
    expect(spot.swim).toBe(false);
  });

  it("is on the other side, then the front, then the back, when the way before is walled", () => {
    const other = wayOut(sedan(), walled(wall.west), []) as Spot;
    expect(other.e).toBeGreaterThan(100);
    const front = wayOut(sedan(), walled(wall.west, wall.east), []) as Spot;
    expect(front.n).toBeGreaterThan(102);
    const back = wayOut(sedan(), walled(wall.west, wall.east, ends[0]), []) as Spot;
    expect(back.n).toBeLessThan(98);
  });

  it("is by the front or the back only when the car has all but stopped", () => {
    expect(wayOut(sedan(2), walled(wall.west, wall.east), [])).toBe("slower");
    expect(wayOut(sedan(0.5), walled(wall.west, wall.east), [])).not.toBe("slower");
    // going down in it, any way out will do
    expect(wayOut(sedan(2), walled(wall.west, wall.east), [], true)).not.toBe("slower");
  });

  it("finds no room when it is walled in all round, or another car stands where you would", () => {
    expect(wayOut(sedan(), walled(wall.west, wall.east, ...ends), [])).toBeNull();
    const neighbour = newVehicle(nextVehicleId(), "sedan", 98.2, 100, 0, "parked");
    const spot = wayOut(sedan(), worldOf(...strip(3)), [neighbour]) as Spot;
    expect(spot.e).toBeGreaterThan(100);
  });
});

describe("getting off a boat", () => {
  // land west of e = 100, water east of it
  const quay = worldOf(
    makeCell(0, 0, { mask: waterRect(0, 0, 100, 0, 200, 200) }),
    ...strip(3)
      .slice(1)
      .map((c) => ({ ...c, mask: { mode: 1 as const, bits: null } })),
  );
  const boat = (e: number) => newVehicle(nextVehicleId(), "speedboat", e, 100, 0, "driven");

  it("is onto the pier within 1.5 m of its side", () => {
    const spot = wayOut(boat(102), quay, []) as Spot;
    expect(spot.swim).toBe(false);
    expect(spot.e).toBeLessThan(100);
  });

  it("is into the water when the land is farther", () => {
    const spot = wayOut(boat(110), quay, []) as Spot;
    expect(spot.swim).toBe(true);
    expect(spot.z).toBeCloseTo(-0.6, 5);
  });

  it("is taken by a swimmer beside it, and not by one far from it", () => {
    // the hull is 2.4 m wide: its west side is at 108.8
    const swimmer = newPlayer(107, 100, -0.6, 0);
    swimmer.mode = "swim";
    expect(toTake(swimmer, [boat(110)])?.kind).toBe("speedboat");
    swimmer.e = 114;
    expect(toTake(swimmer, [boat(110)])).toBeNull();
  });
});
