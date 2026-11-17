import { describe, expect, it } from "vitest";
import { Cameras } from "../cameras";
import { wrap } from "../math";
import { newVehicle, nextVehicleId } from "../vehicles";
import { boxVolume, deckWay, makeCell, strip, worldOf } from "./fixtures";

/** A sedan heading east at (100, 100), on open land. */
const sedan = () => newVehicle(nextVehicleId(), "sedan", 100, 100, Math.PI / 2, "driven");
const open = worldOf(...strip(3));

/** Runs the chase camera for `seconds` in steps of 1/30 s, answering the last view. */
function chase(
  cams: Cameras,
  v: ReturnType<typeof sedan>,
  seconds: number,
  behind = false,
  world = open,
) {
  let eye = cams.eye;
  for (let t = 0; t < seconds - 1e-9; t += 1 / 30) {
    eye = cams.driving(v, 1 / 30, behind, world);
    cams.tick(1 / 30);
  }
  return eye;
}

describe("the chase camera", () => {
  it("keeps looking where you looked for 1.4 s, then swings back behind", () => {
    const cams = new Cameras({ e: 100, n: 100, z: 0, yaw: 0 }, false);
    const v = sedan();
    cams.takeWheel(v);
    chase(cams, v, 1);
    cams.look(300, 0);
    const held = chase(cams, v, 1.3);
    expect(Math.abs(wrap(held.yaw - (v.yaw + 300 * 0.0021)))).toBeLessThan(0.05);
    const back = chase(cams, v, 2.5);
    expect(Math.abs(wrap(back.yaw - v.yaw))).toBeLessThan(0.05);
  });

  it("looks behind while asked, from in front of the car", () => {
    const cams = new Cameras({ e: 100, n: 100, z: 0, yaw: 0 }, false);
    const v = sedan();
    cams.takeWheel(v);
    const eye = chase(cams, v, 0.5, true);
    expect(Math.abs(wrap(eye.yaw - (v.yaw + Math.PI)))).toBeLessThan(0.05);
    expect(eye.e).toBeGreaterThan(v.e);
  });

  it("comes closer when a wall stands between it and the car", () => {
    const v = sedan();
    const free = new Cameras({ e: 100, n: 100, z: 0, yaw: 0 }, false);
    free.takeWheel(v);
    const far = chase(free, v, 0.5);
    // a building across the way 4 m behind the car's back
    const walled = worldOf(
      makeCell(0, 0, { volumes: [boxVolume(80, 80, 93.6, 120)] }),
      ...strip(3).slice(1),
    );
    const boxed = new Cameras({ e: 100, n: 100, z: 0, yaw: 0 }, false);
    boxed.takeWheel(v);
    const near = chase(boxed, v, 0.5, false, walled);
    expect(v.e - far.e).toBeGreaterThan(8);
    expect(v.e - near.e).toBeLessThan(v.e - far.e);
    expect(near.e).toBeGreaterThan(93.6);
  });

  it("stays out of a tower the roadway passes through, coming closer instead", () => {
    // a deck at 20 m through a tower (an opening: no wall to the car); the car just past it
    const tower = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 100, 20],
            [200, 100, 20],
          ]),
        ],
        volumes: [boxVolume(84, 88, 96, 112, 0, 80)],
      }),
      ...strip(3).slice(1),
    );
    const v = sedan();
    v.z = 20;
    expect(tower.blocked(90, 100, 0.3, 20, 1.5)).toBe(false);
    expect(tower.blocked(90, 100, 0.3, 20, 1.5, true)).toBe(false);
    expect(tower.blocked(90, 100, 0.3, 20, 1.5, false)).toBe(true);
    const cams = new Cameras({ e: 100, n: 100, z: 20, yaw: 0 }, false);
    cams.takeWheel(v);
    const eye = chase(cams, v, 0.5, false, tower);
    expect(eye.e).toBeGreaterThan(96);
  });

  it("widens with speed, but not under reduced motion", () => {
    for (const reduced of [false, true]) {
      const cams = new Cameras({ e: 100, n: 100, z: 0, yaw: 0 }, reduced);
      const v = sedan();
      v.v = 40;
      cams.takeWheel(v);
      const eye = chase(cams, v, 3);
      if (reduced) expect(eye.fov).toBe(70);
      // 70 + (40 − 12) × 0.45
      else expect(eye.fov).toBeCloseTo(82.6, 0);
    }
  });

  it("puts the first-person camera above the middle of the motorcycle", () => {
    const v = newVehicle(nextVehicleId(), "motorcycle", 100, 100, Math.PI / 2, "driven");
    const cams = new Cameras({ e: 100, n: 100, z: 0, yaw: 0 }, false);
    cams.takeWheel(v);
    cams.toggle();
    const eye = cams.driving(v, 1 / 30, false, open);
    expect(eye.n).toBeCloseTo(v.n);
    expect(eye.z - v.z).toBeGreaterThan(1.4);
    expect(eye.yaw).toBe(v.yaw);
  });
});
