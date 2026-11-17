import { describe, expect, it } from "vitest";
import { bumped, collide, type CrashHooks } from "../crashes";
import { newPlayer } from "../player";
import { RoadNet, Traffic } from "../traffic";
import { newVehicle, nextVehicleId, type Vehicle } from "../vehicles";
import { fileStreets, ringed, roadNode, streetEdge, strip, worldOf } from "./fixtures";

const car = (
  kind: Vehicle["kind"],
  e: number,
  n: number,
  yaw: number,
  state: Vehicle["state"] = "parked",
) => newVehicle(nextVehicleId(), kind, e, n, yaw, state);

/** Hooks that keep what was loosened, kept and crunched; everything moving is a mover. */
function hooks(traffic: Traffic) {
  const loosened: Vehicle[] = [];
  const kept: Vehicle[] = [];
  const crunches: number[] = [];
  const h: CrashHooks = {
    traffic,
    mover: (v) => v.state === "loose" || v.state === "driven",
    loosen: (v) => {
      v.state = "loose";
      loosened.push(v);
    },
    keep: (v) => kept.push(v),
    crunch: (_v, _e, _n, _z, speed) => crunches.push(speed),
  };
  return { h, loosened, kept, crunches };
}

/** A two-way street east from (10, 100) to (390, 100) and its traffic. */
function street() {
  const nodes = [roadNode(40, 10, 100), roadNode(41, 390, 100)];
  const s = streetEdge(
    40,
    41,
    [
      [10, 100],
      [390, 100],
    ],
    { width: 12 },
  );
  const cells = ringed(fileStreets(nodes, [s]));
  const world = worldOf(...cells);
  const net = new RoadNet();
  for (const c of cells) net.add(c);
  let seed = 3;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  return { world, net, traffic: new Traffic(net, world, [], random) };
}

describe("collide", () => {
  it("leaves alone what is above or below (a car on a deck over a parked one)", () => {
    const { traffic } = street();
    const parked = car("sedan", 100, 50, 0);
    const above = car("sedan", 100.5, 50, 0, "loose");
    above.z = 8;
    above.v = 10;
    const { h, loosened, crunches } = hooks(traffic);
    collide([parked, above], h);
    expect(loosened).toEqual([]);
    expect(crunches).toEqual([]);
    expect(parked.state).toBe("parked");
    expect(above.v).toBe(10);
  });

  it("shoves a parked car loose, and each takes its damage by the other's weight", () => {
    const { traffic } = street();
    // a hatchback at 15 m/s into the back of a parked bus, both facing north
    const bus = car("bus", 100, 50, 0);
    const hatch = car("hatchback", 100, 50 - 6 - 1.95 + 0.1, 0, "loose");
    hatch.v = 15;
    const { h, loosened, crunches } = hooks(traffic);
    collide([bus, hatch], h);
    expect(loosened).toEqual([bus]);
    expect(bus.state).toBe("loose");
    expect(bus.v).toBeGreaterThan(0);
    expect(hatch.v).toBeLessThan(15);
    expect(crunches.length).toBe(1);
    // closing at 15: (15 − 3) × 0.022 × (2 · 12000 / 13100), the bus a third of its little share
    expect(hatch.damage).toBeCloseTo(12 * 0.022 * ((2 * 12000) / 13100), 2);
    expect(bus.damage).toBeCloseTo((12 * 0.022 * ((2 * 1100) / 13100)) / 3, 3);
  });

  it("knocks a traffic car loose when hit hard, for the game to keep, and only stops it when not", () => {
    const hard = street();
    const victim = hard.traffic.spawnAt(hard.net.edge("40-41")!, true, 100, {
      kind: "sedan",
      lane: 0,
    })!;
    const ram = car("suv", victim.e - 2.35 - 2.4 + 0.1, victim.n, Math.PI / 2, "loose");
    ram.v = 14;
    const h1 = hooks(hard.traffic);
    collide([victim, ram], h1.h);
    expect(victim.state).toBe("loose");
    expect(h1.kept).toEqual([victim]);
    expect(victim.damage).toBeGreaterThan(0);

    const soft = street();
    const stopped = soft.traffic.spawnAt(soft.net.edge("40-41")!, true, 100, {
      kind: "sedan",
      lane: 0,
    })!;
    const nudge = car("hatchback", stopped.e - 2.35 - 1.95 + 0.05, stopped.n, Math.PI / 2, "loose");
    nudge.v = 1;
    stopped.v = 0;
    const h2 = hooks(soft.traffic);
    collide([stopped, nudge], h2.h);
    expect(stopped.state).toBe("traffic");
    expect(stopped.stopFor).toBeGreaterThan(0);
    expect(h2.kept).toEqual([]);
  });
});

describe("bumped", () => {
  const world = worldOf(...strip(3));

  it("is no hit when you walk into a car standing still, and pushes you out of it", () => {
    const parked = car("sedan", 100, 100, 0);
    // walking east into its west side, 0.1 m into your reach
    const p = newPlayer(100 - 0.9 - 0.25, 100, 0, Math.PI / 2);
    const hit = bumped(p, [parked], world, { e: 4.5, n: 0 });
    expect(hit).not.toBeNull();
    expect(hit!.closing).toBeLessThanOrEqual(0);
    expect(p.e).toBeLessThanOrEqual(100 - 0.9 - 0.35);
  });

  it("is a hit at the car's speed when it comes at you, less yours away from it", () => {
    const coming = car("sedan", 100, 100 - 2.35 - 0.3, 0, "loose");
    coming.v = 10;
    const still = bumped(newPlayer(100, 100, 0, 0), [coming], world, { e: 0, n: 0 });
    expect(still!.closing).toBeCloseTo(10, 5);
    const fleeing = bumped(newPlayer(100, 100, 0, 0), [coming], world, { e: 0, n: 4 });
    expect(fleeing!.closing).toBeCloseTo(6, 5);
  });
});
