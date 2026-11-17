import { describe, expect, it } from "vitest";
import type { CarKind } from "../kinds";
import {
  accelFactor,
  applyDamage,
  BOATS,
  CARS,
  DAMAGE_PER_MS,
  newVehicle,
  pickCar,
  stepBoat,
  stepCar,
  TRAFFIC_MIX,
  vehicleBlocked,
  type DriveInput,
  type Vehicle,
  type VehicleEvents,
} from "../vehicles";
import { deckAt, type WalkWorld } from "../world";
import { boxVolume, deckWay, makeCell, strip, waterRect, worldOf } from "./fixtures";

const EAST = Math.PI / 2;
const NORTH = 0;
const WEST = -Math.PI / 2;
const idle: DriveInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
const gas: DriveInput = { ...idle, throttle: 1 };
const water = { mask: { mode: 1 as const, bits: null } };

interface Run {
  impact: number;
  fell: number;
  sank: number;
  wrecked: boolean;
  maxV: number;
}

/** Steps a car or a boat at 60 frames a second, gathering what happened. */
function run(
  v: Vehicle,
  input: DriveInput | null,
  w: WalkWorld,
  seconds: number,
  each?: (t: number) => void,
  t0 = 0,
): Run {
  const out: Run = { impact: 0, fell: 0, sank: 0, wrecked: false, maxV: v.v };
  const frames = Math.round(seconds * 60);
  for (let f = 0; f < frames; f++) {
    const t = t0 + f / 60;
    const ev: VehicleEvents = v.boat
      ? stepBoat(v, input, w, 1 / 60, t)
      : stepCar(v, input, w, 1 / 60);
    out.impact = Math.max(out.impact, ev.impact);
    out.fell = Math.max(out.fell, ev.fell);
    out.sank += ev.sank ? 1 : 0;
    out.wrecked ||= ev.wrecked;
    out.maxV = Math.max(out.maxV, v.v);
    each?.(t + 1 / 60);
  }
  return out;
}

function car(kind: CarKind, e: number, n: number, yaw: number, speed = 0, z = 0): Vehicle {
  const v = newVehicle(1, kind, e, n, yaw, "driven");
  v.v = speed;
  v.z = z;
  return v;
}

describe("the kinds", () => {
  it("has the spec's top speeds, masses and toughness", () => {
    const kinds: CarKind[] = [
      "hatchback",
      "sedan",
      "taxi",
      "suv",
      "pickup",
      "limousine",
      "police",
      "muscle",
      "sports",
      "supercar",
      "motorcycle",
      "boxTruck",
      "bus",
    ];
    expect(kinds.map((k) => CARS[k].vmax)).toEqual([
      40, 42, 40, 38, 40, 40, 52, 60, 64, 82, 58, 28, 24,
    ]);
    expect(kinds.map((k) => CARS[k].mass)).toEqual([
      1100, 1500, 1600, 2100, 2300, 2600, 1800, 1650, 1350, 1400, 310, 5500, 12000,
    ]);
    expect(kinds.map((k) => CARS[k].tough)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.85, 2, 3]);
    expect(Object.keys(CARS).sort()).toEqual([...kinds].sort());
    const grips = kinds.map((k) => CARS[k].grip);
    expect(Math.min(...grips)).toBe(CARS.muscle.grip);
    expect(grips.filter((g) => g === CARS.muscle.grip)).toHaveLength(1);
    for (const k of kinds)
      if (k !== "supercar") expect(CARS[k].vmax).toBeLessThan(CARS.supercar.vmax);
    expect([BOATS.speedboat.vmax, BOATS.motorboat.vmax, BOATS.ferry.vmax]).toEqual([28, 14, 9]);
  });

  it("mixes the traffic with sedans and taxis most and supercars rarest", () => {
    const byWeight = (Object.keys(TRAFFIC_MIX) as CarKind[]).sort(
      (a, b) => TRAFFIC_MIX[b] - TRAFFIC_MIX[a],
    );
    expect(byWeight.slice(0, 2).sort()).toEqual(["sedan", "taxi"]);
    expect(byWeight[byWeight.length - 1]).toBe("supercar");
    expect(Object.keys(TRAFFIC_MIX).sort()).toEqual(Object.keys(CARS).sort());
  });

  it("picks a kind for every number from 0 to 1, as often as its weight says", () => {
    const counts = new Map<CarKind, number>();
    const N = 100000;
    for (let i = 0; i < N; i++) {
      const k = pickCar((i + 0.5) / N);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const total = Object.values(TRAFFIC_MIX).reduce((s, x) => s + x, 0);
    for (const [k, weight] of Object.entries(TRAFFIC_MIX) as [CarKind, number][])
      expect((counts.get(k) ?? 0) / N).toBeCloseTo(weight / total, 3);
    expect(pickCar(0)).toBeDefined();
    expect(pickCar(0.999999)).toBeDefined();
    expect(pickCar(1)).toBe(pickCar(0.999999));
  });

  it("makes a vehicle standing still where it is put", () => {
    const v = newVehicle(7, "taxi", 10, 20, EAST, "parked", 3);
    expect(v).toMatchObject({ id: 7, kind: "taxi", boat: false, e: 10, n: 20, z: 0, yaw: EAST });
    expect(v).toMatchObject({ v: 0, vs: 0, w: 0, vz: 0, damage: 0, fire: 0, sink: 0, color: 3 });
    const b = newVehicle(8, "ferry", 10, 20, 0, "traffic");
    expect(b.boat).toBe(true);
    expect(b.z).toBeCloseTo(-0.6, 9);
  });
});

describe("driving", () => {
  it("lets a motorcycle back up at walking speed after braking", () => {
    const bike = car("motorcycle", 300, 100, EAST, 10);
    run(bike, { ...idle, brake: 1 }, worldOf(...strip(3)), 4);
    expect(bike.v).toBeCloseTo(-1.4);
    expect(bike.z).toBe(0);
  });

  it("reaches near its top speed on the flat at full throttle, and no more", () => {
    const w = worldOf(...strip(30));
    for (const kind of ["supercar", "bus"] as const) {
      const v = car(kind, 20, 100, EAST);
      const r = run(v, gas, w, 60);
      expect(v.v).toBeGreaterThan(0.97 * CARS[kind].vmax);
      expect(r.maxV).toBeLessThanOrEqual(CARS[kind].vmax);
      expect(v.n).toBeCloseTo(100, 6);
      expect(v.z).toBe(0);
    }
  });

  it("brakes from 20 m/s to a stop, then backs up", () => {
    const w = worldOf(...strip(3));
    const v = car("sedan", 300, 100, EAST, 20);
    const brake = { ...idle, brake: 1 };
    let stopped = Infinity;
    run(v, brake, w, 4, (t) => {
      if (v.v <= 0 && stopped === Infinity) stopped = t;
    });
    expect(stopped).toBeGreaterThan(1.5);
    expect(stopped).toBeLessThan(2.2);
    expect(v.v).toBeLessThan(-3);
    expect(v.v).toBeGreaterThanOrEqual(-9);
  });

  it("turns wider the faster it goes", () => {
    const w = worldOf(...strip(3));
    const radius = (speed: number) => {
      const v = car("sedan", 300, 100, NORTH, speed);
      // hold the speed: only the wheel matters here
      run(v, { ...idle, steer: 1 }, w, 0.6, () => (v.v = speed));
      return speed / v.w;
    };
    expect(radius(8)).toBeGreaterThan(0);
    expect(radius(30)).toBeGreaterThan(1.5 * radius(8));
  });

  it("turns left and right as the wheel says, and not at all standing still", () => {
    const w = worldOf(...strip(3));
    const right = car("sedan", 300, 100, NORTH, 10);
    run(right, { ...gas, steer: 1 }, w, 0.5);
    expect(right.yaw).toBeGreaterThan(0.1);
    const left = car("sedan", 300, 100, NORTH, 10);
    run(left, { ...gas, steer: -1 }, w, 0.5);
    expect(left.yaw).toBeLessThan(-0.1);
    const still = car("sedan", 300, 100, NORTH, 0);
    run(still, { ...idle, steer: 1 }, w, 1);
    expect(still.yaw).toBe(NORTH);
  });

  it("slides its back out on the handbrake", () => {
    const w = worldOf(...strip(3));
    const slip = (handbrake: boolean) => {
      const v = car("sedan", 300, 100, NORTH, 20);
      run(v, { ...idle, steer: 1, handbrake }, w, 0.5);
      return Math.abs(v.vs);
    };
    expect(slip(true)).toBeGreaterThan(3 * slip(false));
  });

  it("rolls to a stop with nobody at the wheel", () => {
    const w = worldOf(...strip(3));
    const v = car("sedan", 300, 100, EAST, 10);
    v.state = "loose";
    v.w = 1;
    run(v, null, w, 12);
    expect(v.v).toBe(0);
    expect(v.vs).toBe(0);
    expect(v.w).toBe(0);
    expect(v.e).toBeGreaterThan(320);
  });

  it("loses acceleration to damage, and a wreck does not drive", () => {
    const w = worldOf(...strip(3));
    const fresh = car("sedan", 300, 100, EAST);
    run(fresh, gas, w, 2);
    const hurt = car("sedan", 300, 100, EAST);
    hurt.damage = 0.6;
    run(hurt, gas, w, 2);
    expect(hurt.v).toBeLessThan(0.8 * fresh.v);
    expect(hurt.v).toBeGreaterThan(0.6 * fresh.v);
    expect(accelFactor(newVehicle(1, "sedan", 0, 0, 0))).toBe(1);
    expect(accelFactor(hurt)).toBeCloseTo(1 - 0.45 * 0.6, 9);

    const wreck = car("sedan", 300, 100, EAST);
    applyDamage(wreck, 100);
    expect(wreck.state).toBe("wrecked");
    expect(wreck.fire).toBe(9);
    expect(accelFactor(wreck)).toBe(0);
    run(wreck, gas, w, 3);
    expect(wreck.v).toBe(0);
    expect(wreck.e).toBe(300);
    expect(wreck.fire).toBeCloseTo(6, 6);
    run(wreck, gas, w, 7);
    expect(wreck.fire).toBe(0);
    expect(wreck.state).toBe("wrecked");
  });
});

describe("walls and damage", () => {
  const building = () => worldOf(makeCell(0, 0, { volumes: [boxVolume(60, 0, 80, 200)] }));
  const front = (v: Vehicle) => v.e + CARS[v.kind as CarKind].length / 2;

  it("a car at 80 m/s into a building stops at its wall", () => {
    const w = building();
    const v = car("sedan", 20, 100, EAST, 80);
    const r = run(v, gas, w, 2, () => {
      expect(front(v)).toBeLessThanOrEqual(60 + 1e-6);
      expect(vehicleBlocked(v.kind, v.e, v.n, v.yaw, v.z, w)).toBe(false);
    });
    expect(front(v)).toBeGreaterThan(59.9);
    expect(r.impact).toBeCloseTo(80, 0);
    expect(r.wrecked).toBe(true);
    expect(v.v).toBeCloseTo(0, 1);

    // the same in frames five seconds long
    const u = car("supercar", 20, 100, EAST, 80);
    for (let i = 0; i < 20; i++) {
      stepCar(u, gas, w, 5);
      expect(front(u)).toBeLessThanOrEqual(60 + 1e-6);
    }
  });

  it("slides along a wall it meets at an angle, hit only by the speed into it", () => {
    const w = building();
    // 30 degrees into the wall, its front 0.3 m from it
    const yaw = (30 * Math.PI) / 180;
    const v = car("sedan", 60 - 0.3 - 0.9 - 1.45 * Math.sin(yaw), 60, yaw, 20);
    const r = run(v, gas, w, 0.2);
    expect(r.impact).toBeCloseTo(20 * Math.sin(yaw), 0);
    expect(v.damage).toBeLessThan(1);
    const n = v.n;
    run(v, gas, w, 1, () => expect(vehicleBlocked(v.kind, v.e, v.n, v.yaw, v.z, w)).toBe(false));
    expect(v.n - n).toBeGreaterThan(2);
  });

  it("can steer away from a wall it is pressed against", () => {
    const w = building();
    // parked along the wall, its right side touching it
    const v = car("sedan", 60 - 0.901, 100, NORTH, 0);
    expect(vehicleBlocked(v.kind, v.e, v.n, v.yaw, v.z, w)).toBe(false);
    run(v, { ...gas, steer: -1 }, w, 1.5);
    expect(v.yaw).toBeLessThan(-0.3);
    expect(v.e).toBeLessThan(57);
  });

  it("takes no damage from a hit at 3 m/s", () => {
    const v = car("hatchback", 0, 0, 0);
    expect(applyDamage(v, 3)).toBe(false);
    expect(applyDamage(v, 2, 1500)).toBe(false);
    expect(v.damage).toBe(0);
  });

  it("does half the spike's damage a metre a second (the owner: cars sustain more)", () => {
    expect(DAMAGE_PER_MS).toBe(0.011);
    const v = car("sedan", 0, 0, 0);
    applyDamage(v, 13);
    expect(v.damage).toBeCloseTo(2 * 10 * 0.011, 12);
  });

  it("survives a 30 m/s wall hit in a hatchback, smoking; is wrecked from about 48 m/s; a bus takes a third", () => {
    const w = building();
    const hatch = car("hatchback", 60 - CARS.hatchback.length / 2 - 0.5, 100, EAST, 30);
    const h = run(hatch, gas, w, 0.5);
    expect(h.impact).toBeCloseTo(30, 0);
    expect(h.wrecked).toBe(false);
    expect(hatch.state).toBe("driven");
    // (30 − 3) × 0.011 × 2: past the cracked glass (35%) and the smoke (55%), short of a wreck
    expect(hatch.damage).toBeCloseTo(2 * (h.impact - 3) * 0.011, 6);
    expect(hatch.damage).toBeGreaterThan(0.55);
    expect(hatch.damage).toBeLessThan(0.65);

    // a supercar (as tough as a hatchback) into the same wall: 45 m/s leaves it, 52 m/s wrecks it
    const near = car("supercar", 60 - CARS.supercar.length / 2 - 0.5, 100, EAST, 45);
    expect(run(near, gas, w, 0.5).wrecked).toBe(false);
    expect(near.damage).toBeGreaterThan(0.9);
    const fast = car("supercar", 60 - CARS.supercar.length / 2 - 0.5, 100, EAST, 52);
    const f = run(fast, gas, w, 0.5);
    expect(f.wrecked).toBe(true);
    expect(fast.state).toBe("wrecked");
    expect(fast.damage).toBe(1);
    expect(fast.fire).toBeGreaterThan(8);

    const bus = car("bus", 60 - CARS.bus.length / 2 - 0.5, 100, EAST, 30);
    const b = run(bus, gas, w, 0.5);
    expect(b.impact).toBeCloseTo(30, 0);
    expect(b.wrecked).toBe(false);
    expect(bus.state).toBe("driven");
    expect(bus.damage).toBeCloseTo((2 * (b.impact - 3) * 0.011) / 3, 6);
  });

  it("hurts the lighter of two cars more, and equal ones by the formula", () => {
    const hatch = car("hatchback", 0, 0, 0);
    const bus = car("bus", 0, 0, 0);
    applyDamage(hatch, 20, CARS.bus.mass);
    applyDamage(bus, 20, CARS.hatchback.mass);
    expect(hatch.damage).toBeGreaterThan(10 * bus.damage);
    const a = car("sedan", 0, 0, 0);
    applyDamage(a, 20, CARS.sedan.mass);
    expect(a.damage).toBeCloseTo((20 - 3) * 0.011, 9);
    // what does not give (a wall, the ground) counts as the heaviest of all
    const b = car("sedan", 0, 0, 0);
    applyDamage(b, 20);
    expect(b.damage).toBeCloseTo(2 * (20 - 3) * 0.011, 9);
  });

  it("says when a car would stand in a wall or outside the data", () => {
    const w = building();
    expect(vehicleBlocked("sedan", 50, 100, EAST, 0, w)).toBe(false);
    expect(vehicleBlocked("sedan", 58, 100, EAST, 0, w)).toBe(true);
    expect(vehicleBlocked("sedan", 58, 100, NORTH, 0, w)).toBe(false);
    expect(vehicleBlocked("bus", 54.5, 100, EAST, 0, w)).toBe(true);
    expect(vehicleBlocked("sedan", -10, 100, EAST, 0, w)).toBe(true);
  });

  it("grazes the edge of the data and drives on along it, hit only by the speed into it", () => {
    const w = worldOf(...strip(3));
    // 10 degrees off the north edge, a little short of it
    const yaw = (80 * Math.PI) / 180;
    const v = car("sedan", 100, 199, yaw, 30);
    const r = run(v, gas, w, 1, () =>
      expect(vehicleBlocked(v.kind, v.e, v.n, v.yaw, v.z, w)).toBe(false),
    );
    expect(r.impact).toBeCloseTo(30 * Math.sin((10 * Math.PI) / 180), 0);
    expect(r.wrecked).toBe(false);
    expect(v.state).toBe("driven");
    expect(v.damage).toBeLessThan(0.2);
    expect(Math.hypot(v.v, v.vs)).toBeGreaterThan(15);
    expect(v.e).toBeGreaterThan(120);
  });

  it("eases back into the data when found over its edge", () => {
    const w = worldOf(...strip(3));
    const v = car("sedan", 100, 199.9, NORTH, 0);
    expect(vehicleBlocked(v.kind, v.e, v.n, v.yaw, v.z, w)).toBe(true);
    run(v, gas, w, 0.5);
    expect(vehicleBlocked(v.kind, v.e, v.n, v.yaw, v.z, w)).toBe(false);
    expect(v.n + CARS.sedan.length / 2 - CARS.sedan.width / 2).toBeLessThan(200);
  });
});

describe("decks", () => {
  it("drives up a ramp onto its deck", () => {
    const w = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 100, 0],
            [100, 100, 8],
            [190, 100, 8],
          ]),
        ],
      }),
    );
    const v = car("sedan", 3, 100, EAST, 10);
    run(v, { ...gas, throttle: 0.3 }, w, 10, () => {
      if (v.e < 100) expect(v.z).toBeCloseTo(Math.max(0, (v.e / 100) * 8), 1);
    });
    expect(v.e).toBeGreaterThan(110);
    expect(v.z).toBeCloseTo(8, 6);
  });

  it("is stopped by a deck's parapet on the deck, and not under it", () => {
    const deck = () =>
      worldOf(
        makeCell(0, 0, {
          elevated: [
            deckWay([
              [0, 100, 8],
              [200, 100, 8],
            ]),
          ],
        }),
      );
    const w = deck();
    const on = car("sedan", 100, 100, NORTH, 15, 8);
    const r = run(on, gas, w, 1);
    expect(on.n + CARS.sedan.length / 2).toBeLessThanOrEqual(105 + 1e-6);
    expect(on.n + CARS.sedan.length / 2).toBeGreaterThan(104.9);
    expect(r.impact).toBeGreaterThan(14);
    expect(on.z).toBe(8);

    const under = car("sedan", 100, 85, NORTH, 15, 0);
    run(under, gas, deck(), 2);
    expect(under.n).toBeGreaterThan(115);
    expect(under.z).toBe(0);
  });

  it("falls off the end of a deck and is hurt as by a hit at the landing speed", () => {
    const w = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 100, 10],
            [60, 100, 10],
          ]),
        ],
      }),
    );
    const v = car("sedan", 50, 100, EAST, 10, 10);
    v.state = "loose";
    const r = run(v, null, w, 3);
    expect(v.z).toBe(0);
    const landing = Math.sqrt(2 * 13 * 10);
    expect(r.fell).toBeCloseTo(landing, 0);
    expect(v.damage).toBeCloseTo(2 * (r.fell - 3) * 0.011, 6);
    expect(r.impact).toBe(0);
  });

  /** Lets a car fall for two seconds: how many steps said it landed, and the hardest landing. */
  const drop = (v: Vehicle, w: WalkWorld) => {
    let landings = 0;
    let fell = 0;
    for (let f = 0; f < 120; f++) {
      const ev = stepCar(v, null, w, 1 / 60);
      if (ev.fell > 0) landings++;
      fell = Math.max(fell, ev.fell);
    }
    return { landings, fell };
  };

  it("comes down by a deck's rail onto the deck, never onto the rail", () => {
    const w = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay([
            [0, 100, 5],
            [200, 100, 5],
          ]),
        ],
      }),
    );
    // its middle half a metre inside the deck's north edge, its side over the rail
    const v = car("sedan", 100, 104.5, EAST, 0, 8);
    v.state = "loose";
    const r = drop(v, w);
    expect(v.z).toBe(5);
    expect(r.landings).toBe(1);
    expect(r.fell).toBeCloseTo(Math.sqrt(2 * 13 * 3), 0);
  });

  it("rests on a low building's top it comes down on, landing once", () => {
    const w = worldOf(makeCell(0, 0, { volumes: [boxVolume(90, 90, 110, 110, 0, 5)] }));
    const v = car("sedan", 100, 100, EAST, 0, 9);
    v.state = "loose";
    const r = drop(v, w);
    expect(v.z).toBeGreaterThan(4.9);
    expect(v.z).toBeLessThan(5.15);
    expect(r.landings).toBe(1);
    expect(r.fell).toBeCloseTo(Math.sqrt(2 * 13 * 4), 0);
  });

  it("drives on down across the joint where one way ends and the next goes on, without a drop", () => {
    // two 13 m ways meeting end to end at e = 100, both falling 8%
    const w = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay(
            [
              [0, 50, 10],
              [100, 50, 2],
            ],
            13,
          ),
          deckWay(
            [
              [100, 50, 2],
              [125, 50, 0],
            ],
            13,
          ),
        ],
      }),
    );
    const v = car("taxi", 60, 50, EAST, 30, 10 - 0.08 * 60);
    const r = run(v, { ...gas, throttle: 0.5 }, w, 1.5, () => {
      if (v.e < 124) expect(Math.abs(v.z - Math.max(0, 10 - 0.08 * v.e))).toBeLessThan(0.05);
    });
    expect(r.fell).toBe(0);
    expect(v.damage).toBe(0);
  });

  it("keeps to its own way where a narrower one overlaps it and climbs away", () => {
    // a 13 m roadway at 5 m, and down its middle a 2.5 m footway that rises at 8%
    const w = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay(
            [
              [0, 50, 5],
              [190, 50, 5],
            ],
            13,
          ),
          deckWay(
            [
              [12, 50, 5],
              [112, 50, 13],
            ],
            2.5,
            1,
          ),
        ],
      }),
    );
    const v = car("taxi", 10, 50, EAST, 15, 5);
    run(v, { ...gas, throttle: 0.2 }, w, 80 / 15);
    expect(v.e).toBeGreaterThan(85);
    expect(v.z).toBeCloseTo(5, 2);
  });

  it("still steps onto a way it drives into from the side, once nearer its line than its own's", () => {
    const w = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay(
            [
              [0, 50, 5],
              [200, 50, 5],
            ],
            10,
          ),
          deckWay(
            [
              [0, 57, 5.3],
              [200, 57, 5.3],
            ],
            10,
          ),
        ],
      }),
    );
    const v = car("taxi", 100, 47, NORTH, 3, 5);
    run(v, { ...gas, throttle: 0.1 }, w, 4, () => {
      // the overlap is 52 to 55: its own until past the middle of it
      if (v.n < 53.5) expect(v.z).toBe(5);
    });
    expect(v.n).toBeGreaterThan(58);
    expect(v.z).toBeCloseTo(5.3, 5);
  });

  it("stays on the road where a footway starts on its line and climbs away, from a standing start", () => {
    // the footway's first metre is the road's line: no way to tell them apart there but the height
    const w = worldOf(
      makeCell(0, 0, {
        elevated: [
          deckWay(
            [
              [0, 50, 5],
              [190, 50, 5],
            ],
            13,
          ),
          deckWay(
            [
              [0, 50, 5],
              [100, 50, 13],
            ],
            2.5,
            1,
          ),
        ],
      }),
    );
    const v = car("taxi", 1, 50, EAST, 0, 5);
    run(v, { ...gas, throttle: 0.4 }, w, 6, () => {
      expect(v.z).toBeCloseTo(5, 5);
    });
    expect(v.e).toBeGreaterThan(40);
  });

  it("keeps a car on its roadway where a footway along its edge lane drops away beside it", () => {
    // a 17 m roadway at 21 m, and along its edge lane (6.3 m off its line) a 2.5 m footway 0.65 m
    // lower that falls away at 30% (the Manhattan Bridge's Brooklyn end)
    const w = worldOf(
      ...strip(2, {
        elevated: [
          deckWay(
            [
              [0, 100, 21],
              [400, 100, 21],
            ],
            17,
          ),
          deckWay(
            [
              [60, 106.3, 20.35],
              [80, 106.3, 14.35],
              [200, 106.3, 14.35],
            ],
            2.5,
            1,
          ),
        ],
      }),
    );
    for (const speed of [15, 30]) {
      const v = car("taxi", 20, 106.3, EAST, speed, 21);
      const r = run(v, { ...gas, throttle: 0.3 }, w, 180 / speed);
      expect(v.e).toBeGreaterThan(190);
      expect(v.z).toBe(21);
      expect(r.fell).toBe(0);
      expect(r.impact).toBe(0);
    }
  });

  it("does not sink on a bridge over the water", () => {
    const w = worldOf(
      ...strip(3, {
        ...water,
        elevated: [
          deckWay([
            [0, 100, 20],
            [600, 100, 20],
          ]),
        ],
      }),
    );
    const v = car("sedan", 50, 100, EAST, 15, 20);
    const r = run(v, gas, w, 3);
    expect(r.sank).toBe(0);
    expect(v.state).toBe("driven");
    expect(v.z).toBe(20);
  });
});

describe("forks", () => {
  /** A trunk X ending at (100, 100, 20); A goes on east at `aGrade`, B leaves `turn` degrees to
   * its left (north) at `bGrade`, `bWidth` wide: their strips overlap for some 80 m. */
  function fork(aGrade: number, bGrade: number, bWidth = 14, turn = 10) {
    const r = (turn * Math.PI) / 180;
    const a = deckWay(
      [
        [100, 100, 20],
        [300, 100, 20 + aGrade * 200],
      ],
      14,
    );
    const b = deckWay(
      [
        [100, 100, 20],
        [100 + 200 * Math.cos(r), 100 + 200 * Math.sin(r), 20 + bGrade * 200],
      ],
      bWidth,
    );
    const x = deckWay(
      [
        [0, 100, 20],
        [100, 100, 20],
      ],
      14,
    );
    return { a, b, r, w: worldOf(...strip(2, { elevated: [x, a, b] })) };
  }

  /**
   * A taxi steered (as a driver would, aiming some way ahead) along the line `off` metres to the
   * left of X's and then of a branch's, from 60 m before the fork to 150 m past it: the hardest
   * hit and landing, and how far it ever was from its own branch's deck once 20 m past the fork.
   */
  function follow(f: ReturnType<typeof fork>, branch: "a" | "b", off: number, speed: number) {
    const dir = branch === "a" ? 0 : f.r;
    const own = branch === "a" ? f.a : f.b;
    const along = (e: number, n: number) =>
      e <= 100 ? e - 100 : (e - 100) * Math.cos(dir) + (n - 100) * Math.sin(dir);
    const lane = (s: number): [number, number] =>
      s <= 0
        ? [100 + s, 100 + off]
        : [
            100 + s * Math.cos(dir) - off * Math.sin(dir),
            100 + s * Math.sin(dir) + off * Math.cos(dir),
          ];
    const [e0, n0] = lane(-60);
    const v = car("taxi", e0, n0, EAST, speed, 20);
    const wb = CARS.taxi.length * 0.6;
    let impact = 0;
    let fell = 0;
    let off2 = 0;
    for (let f2 = 0; f2 < 60 * 30 && along(v.e, v.n) < 150; f2++) {
      const vabs = Math.abs(v.v);
      const [te, tn] = lane(along(v.e, v.n) + Math.max(6, Math.min(25, 0.6 * vabs)));
      let alpha = Math.atan2(te - v.e, tn - v.n) - v.yaw;
      while (alpha > Math.PI) alpha -= 2 * Math.PI;
      while (alpha < -Math.PI) alpha += 2 * Math.PI;
      const delta = Math.atan((2 * wb * Math.sin(alpha)) / Math.hypot(te - v.e, tn - v.n));
      const thr = Math.max(-1, Math.min(1, (speed - v.v) * 0.5));
      const steer = Math.max(-1, Math.min(1, delta / (0.6 / (1 + vabs / 15))));
      const ev = stepCar(
        v,
        { throttle: Math.max(0, thr), brake: Math.max(0, -thr), steer, handbrake: false },
        f.w,
        1 / 60,
      );
      impact = Math.max(impact, ev.impact);
      fell = Math.max(fell, ev.fell);
      if (along(v.e, v.n) > 20)
        off2 = Math.max(off2, Math.abs(v.z - (deckAt(own, v.e, v.n) ?? -99)));
    }
    return { impact, fell, off: off2, past: along(v.e, v.n) };
  }

  const lanes = (half: number) => {
    const edge = half - 2.2;
    return [-edge, -edge / 2, 0, edge / 2, edge];
  };

  /** Every lane of the branches given, both speeds: those that hit, fell, stopped short or left their own deck. */
  function wrong(f: ReturnType<typeof fork>, branches: ["a" | "b", number][]) {
    const out: string[] = [];
    for (const speed of [15, 30])
      for (const [branch, half] of branches)
        for (const off of lanes(half)) {
          const r = follow(f, branch, off, speed);
          if (r.impact > 0 || r.fell > 0 || r.past < 150 || r.off >= 0.05)
            out.push(
              `${branch} ${off.toFixed(1)} ${speed}: impact ${r.impact.toFixed(1)} fell ${r.fell.toFixed(1)} past ${r.past.toFixed(0)} off ${r.off.toFixed(2)}`,
            );
        }
    return out;
  }

  it("keeps a car in any lane on the branch it steers along, the other rising beside it", () => {
    expect(
      wrong(fork(-0.04, 0.02), [
        ["a", 7],
        ["b", 7],
      ]),
    ).toEqual([]);
  });

  it("keeps a car on its own branch where a narrower one leaves it lower and falling faster", () => {
    expect(
      wrong(fork(-0.04, -0.08, 8.4), [
        ["a", 7],
        ["b", 4.2],
      ]),
    ).toEqual([]);
  });
});

describe("water", () => {
  it("a car pushed over the water sinks and is gone after about 5 s", () => {
    const w = worldOf(makeCell(0, 0, { mask: waterRect(0, 0, 100, 0, 200, 200) }));
    const v = car("sedan", 95, 100, EAST, 6);
    v.state = "loose";
    let into = -1;
    let gone = -1;
    const r = run(v, null, w, 10, (t) => {
      if (into < 0 && v.state === "sinking") into = t;
      if (gone < 0 && v.state === "sunk") gone = t;
    });
    expect(r.sank).toBe(1);
    expect(into).toBeGreaterThan(0);
    expect(gone - into).toBeGreaterThan(4.8);
    expect(gone - into).toBeLessThan(5.3);
    expect(v.z).toBeCloseTo(-3, 6);
    expect(v.v).toBe(0);
    // sunk is the end of it
    const e = v.e;
    expect(stepCar(v, gas, w, 1 / 60)).toEqual({ impact: 0, fell: 0, sank: false, wrecked: false });
    expect(v.e).toBe(e);
  });

  it("floats a moment, then goes all the way under, a bus too", () => {
    const w = worldOf(makeCell(0, 0, water));
    const v = car("bus", 100, 100, EAST, 0, 0);
    const zs: number[] = [];
    run(v, null, w, 6, () => zs.push(v.z));
    expect(v.state).toBe("sunk");
    // half a second in it is still at the surface, half under
    const half = zs[30];
    expect(half).toBeLessThan(-0.6);
    expect(half + CARS.bus.height).toBeGreaterThan(-0.6);
    expect(v.z + CARS.bus.height).toBeLessThan(-0.6);
  });
});

describe("boats", () => {
  it("reaches near its top speed on open water, and no more", () => {
    const w = worldOf(...strip(8, water));
    const v = newVehicle(1, "speedboat", 20, 100, EAST, "driven");
    const r = run(v, gas, w, 40);
    expect(v.v).toBeGreaterThan(0.97 * BOATS.speedboat.vmax);
    expect(r.maxV).toBeLessThanOrEqual(BOATS.speedboat.vmax);
    expect(v.z).toBeCloseTo(-0.6, 9);
  });

  it("does not move forward on land", () => {
    const w = worldOf(makeCell(0, 0));
    const v = newVehicle(1, "speedboat", 100, 100, EAST, "driven");
    run(v, gas, w, 3);
    expect(v.e).toBe(100);
    expect(v.n).toBe(100);
  });

  it("does not turn with no way on", () => {
    const w = worldOf(makeCell(0, 0, water));
    const v = newVehicle(1, "motorboat", 100, 100, NORTH, "driven");
    run(v, { ...idle, steer: 1 }, w, 2);
    expect(v.yaw).toBe(NORTH);
  });

  it("turns with way on, its stern sliding out", () => {
    const w = worldOf(makeCell(0, 0, water));
    const v = newVehicle(1, "speedboat", 100, 100, NORTH, "driven");
    v.v = 10;
    run(v, { ...gas, steer: 1 }, w, 1);
    expect(v.yaw).toBeGreaterThan(0.3);
    expect(Math.abs(v.vs)).toBeGreaterThan(0.3);
  });

  it("slows down off the throttle and backs up on it in reverse", () => {
    const w = worldOf(makeCell(0, 0, water));
    const v = newVehicle(1, "speedboat", 100, 100, NORTH, "driven");
    v.v = 20;
    run(v, idle, w, 3);
    expect(v.v).toBeLessThan(10);
    expect(v.v).toBeGreaterThan(0);
    run(v, { ...idle, brake: 1 }, w, 8);
    expect(v.v).toBeLessThan(-2);
  });

  it("is stopped by a quay, hurt by a hard hit and sunk by a wreck", () => {
    const w = () => worldOf(makeCell(0, 0, { mask: waterRect(0, 0, 100, 0, 200, 200) }));
    const bow = (v: Vehicle) => v.e - BOATS.speedboat.length / 2;
    const soft = newVehicle(1, "speedboat", 104, 100, WEST, "driven");
    soft.v = 10;
    const r = run(soft, gas, w(), 2);
    expect(bow(soft)).toBeGreaterThanOrEqual(100 - 1e-6);
    expect(bow(soft)).toBeLessThan(101);
    expect(r.impact).toBeCloseTo(10, 0);
    expect(soft.damage).toBeCloseTo(2 * (r.impact - 3) * 0.011, 6);
    expect(soft.state).toBe("driven");

    // flat out (28 m/s) a fresh boat takes (28 − 3) × 0.011 × 2 and floats on
    const full = newVehicle(3, "speedboat", 110, 100, WEST, "driven");
    full.v = 28;
    const once = run(full, gas, w(), 2);
    expect(once.wrecked).toBe(false);
    expect(full.state).toBe("driven");
    expect(full.damage).toBeCloseTo(2 * (once.impact - 3) * 0.011, 6);

    // a second hit like it is the end of it
    const hard = newVehicle(2, "speedboat", 110, 100, WEST, "driven");
    hard.damage = full.damage;
    hard.v = 28;
    const h = run(hard, gas, w(), 7);
    expect(h.wrecked).toBe(true);
    expect(h.sank).toBe(1);
    expect(hard.state).toBe("sunk");
    expect(bow(hard)).toBeGreaterThanOrEqual(100 - 1e-6);
  });

  it("rides the swell, and keeps still when the swell is calmed", () => {
    const w = worldOf(makeCell(0, 0, water));
    const v = newVehicle(1, "speedboat", 100, 100, NORTH, "parked");
    const heaves: number[] = [];
    const rolls: number[] = [];
    for (let f = 0; f < 600; f++) {
      stepBoat(v, null, w, 1 / 60, f / 60);
      heaves.push(v.heave);
      rolls.push(v.roll);
    }
    expect(Math.max(...heaves) - Math.min(...heaves)).toBeGreaterThan(0.1);
    expect(Math.max(...rolls) - Math.min(...rolls)).toBeGreaterThan(0.05);
    expect(v.e).toBe(100);
    for (let f = 0; f < 60; f++) {
      stepBoat(v, null, w, 1 / 60, f / 60, { calm: true });
      expect(v.heave).toBe(0);
      expect(v.roll).toBe(0);
    }
  });

  it("leaves cars to stepCar and boats to stepBoat", () => {
    const w = worldOf(makeCell(0, 0, water));
    const b = newVehicle(1, "speedboat", 100, 100, NORTH, "driven");
    b.v = 5;
    stepCar(b, gas, w, 0.1);
    expect(b.n).toBe(100);
    const c = car("sedan", 100, 100, NORTH, 5);
    stepBoat(c, gas, w, 0.1, 0);
    expect(c.n).toBe(100);
  });
});
