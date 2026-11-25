import { describe, expect, it } from "vitest";
import { Crowd, type Person } from "../people";
import { CYCLE, greenLeft, signal } from "../lights";
import type { WalkEdge } from "../cell";
import { newVehicle, type Vehicle } from "../vehicles";
import { boxVolume, makeCell, waterRect, worldOf } from "./fixtures";

/** A walking edge through [e, n] points. */
function walkEdge(a: number, b: number, pts: number[][], opts: Partial<WalkEdge> = {}): WalkEdge {
  const flat = Float32Array.from(pts.flatMap(([e, n, z = 0]) => [e, n, z]));
  let length = 0;
  for (let q = 3; q < flat.length; q += 3)
    length += Math.hypot(flat[q] - flat[q - 3], flat[q + 1] - flat[q - 2]);
  return {
    key: `${a}-${b}`,
    a,
    b,
    crosswalk: false,
    phase: 0,
    elevated: false,
    pts: flat,
    length,
    ...opts,
  };
}

/** Sidewalk 1 along the south (80 m, west to east), a crosswalk 2 north across the street, sidewalk 3 on the far side. */
function blockWorld() {
  const walks = [
    walkEdge(1, 2, [
      [20, 20],
      [100, 20],
    ]),
    walkEdge(
      2,
      3,
      [
        [100, 20],
        [100, 40],
      ],
      { crosswalk: true, phase: 2 },
    ),
    walkEdge(3, 4, [
      [100, 40],
      [20, 40],
    ]),
  ];
  return { world: worldOf(makeCell(0, 0, { walks })), walks };
}

const FOCUS = { e: 60, n: 30 };
const constant = (x: number) => () => x;

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The distance from a person to the nearest walking edge, in plan. */
function offEdges(p: Person, walks: WalkEdge[]): number {
  let best = Infinity;
  for (const w of walks)
    for (let q = 3; q < w.pts.length; q += 3) {
      const ae = w.pts[q - 3];
      const an = w.pts[q - 2];
      const de = w.pts[q] - ae;
      const dn = w.pts[q + 1] - an;
      const t = Math.max(0, Math.min(1, ((p.e - ae) * de + (p.n - an) * dn) / (de * de + dn * dn)));
      best = Math.min(best, Math.hypot(p.e - ae - de * t, p.n - an - dn * t));
    }
  return best;
}

/** A time at which phase 1 (a crosswalk's, edge phase 2) is red, and one at which it has 8 s of green. */
const RED_T = 5;
const GREEN_T = CYCLE / 2 + 3;

describe("the sidewalks", () => {
  it("fills the budget and keeps everyone on a walking edge", () => {
    const { world, walks } = blockWorld();
    const crowd = new Crowd(world, seeded(1));
    crowd.budget = 40;
    crowd.prime({ e: 60, n: 100 });
    expect(crowd.people.length).toBeGreaterThan(10);
    for (let k = 0; k < 600; k++) {
      crowd.step(0.05, k * 0.05, FOCUS, []);
      for (const p of crowd.people) expect(offEdges(p, walks)).toBeLessThan(1.5);
    }
    expect(crowd.people.length).toBeGreaterThan(10);
    for (const p of crowd.people) {
      for (const k of ["skin", "hair", "top", "bottom"] as const) {
        expect(Number.isInteger(p.look[k])).toBe(true);
        expect(p.look[k]).toBeGreaterThanOrEqual(0);
        expect(p.look[k]).toBeLessThan(8);
      }
    }
  });

  it("lets people go, out of sight and far, when the budget is lowered", () => {
    // a 400 m sidewalk, the focus at one end
    const walks = [
      walkEdge(1, 2, [
        [0, 20],
        [400, 20],
      ]),
    ];
    const world = worldOf(...[0, 1].map((i) => makeCell(i, 0, { walks })));
    const crowd = new Crowd(world, seeded(6));
    crowd.budget = 60;
    const focus = { e: 10, n: 20 };
    crowd.prime(focus);
    expect(crowd.people.length).toBeGreaterThan(30);
    const near = () =>
      crowd.people.filter((p) => Math.hypot(p.e - focus.e, p.n - focus.n) <= 60).length;
    crowd.budget = 10;
    for (let k = 0; k < 120; k++) crowd.step(1 / 60, k / 60, focus, [], (e) => e < 40);
    expect(crowd.people.length).toBeLessThanOrEqual(Math.max(10, near()));
    // and nobody in view went
    expect(crowd.people.length).toBeGreaterThanOrEqual(Math.min(10, near()));
  });

  it("walks at their own pace to one side of the line and turns on at the nodes", () => {
    const { world } = blockWorld();
    const crowd = new Crowd(world, seeded(2));
    const p = crowd.addAt("1-2", 0)!;
    let moved = 0;
    for (let k = 0; k < 200; k++) {
      const before = Math.hypot(p.e, p.n);
      crowd.step(0.05, GREEN_T, FOCUS, []);
      moved += Math.abs(Math.hypot(p.e, p.n) - before);
    }
    expect(moved).toBeGreaterThan(8);
    // walking east along n = 20: the right-hand side is south
    expect(p.n).toBeLessThan(20);
    expect(p.n).toBeGreaterThan(19);
  });

  it("drops people beyond 200 m and does not spawn within 60 m or in sight", () => {
    const { world } = blockWorld();
    const crowd = new Crowd(world, seeded(3));
    const p = crowd.addAt("1-2", 10)!;
    crowd.budget = 1;
    crowd.step(0.05, 0, { e: 900, n: 900 }, []);
    expect(crowd.people).not.toContain(p);
    const c2 = new Crowd(world, seeded(4));
    c2.budget = 30;
    for (let k = 0; k < 50; k++) c2.step(0.05, 0, { e: 60, n: 30 }, []);
    // the whole block is within 60 m of the middle: nothing spawns
    expect(c2.people.length).toBe(0);
    const c3 = new Crowd(world, seeded(5));
    c3.budget = 30;
    for (let k = 0; k < 50; k++) c3.step(0.05, 0, { e: 60, n: 200 }, [], () => true);
    expect(c3.people.length).toBe(0);
    for (let k = 0; k < 50; k++) c3.step(0.05, 0, { e: 60, n: 200 }, [], () => false);
    expect(c3.people.length).toBeGreaterThan(0);
  });
});

describe("crosswalks", () => {
  it("waits at a red crosswalk and goes on green", () => {
    expect(signal(RED_T, 1)).toBe("red");
    expect(greenLeft(GREEN_T, 1)).toBeGreaterThanOrEqual(4);
    const { world } = blockWorld();
    const crowd = new Crowd(world, constant(0.5));
    const p = crowd.addAt("2-3", 0)!;
    for (let k = 0; k < 40; k++) crowd.step(0.05, RED_T, FOCUS, []);
    expect(p.state).toBe("waiting");
    expect(p.n).toBeCloseTo(20, 0);
    for (let k = 0; k < 40; k++) crowd.step(0.05, GREEN_T, FOCUS, []);
    expect(p.state).toBe("walking");
    expect(p.n).toBeGreaterThan(21);
  });

  it("does not step out with less than 4 s of green left", () => {
    const t = CYCLE / 2 + 10.5;
    expect(greenLeft(t, 1)).toBeLessThan(4);
    const { world } = blockWorld();
    const crowd = new Crowd(world, constant(0.5));
    const p = crowd.addAt("2-3", 0)!;
    for (let k = 0; k < 20; k++) crowd.step(0.05, t, FOCUS, []);
    expect(p.state).toBe("waiting");
  });

  it("stops at the end of the sidewalk before a red crosswalk", () => {
    const { world } = blockWorld();
    // the only way on from node 2 is the crosswalk (and back): pick wanders, so force with a high first roll
    const crowd = new Crowd(world, constant(0.5));
    const p = crowd.addAt("1-2", 70)!;
    for (let k = 0; k < 300; k++) crowd.step(0.05, RED_T, FOCUS, []);
    expect(p.state).toBe("waiting");
    expect(Math.hypot(p.e - 100, p.n - 20)).toBeLessThan(2);
  });

  it("one in sixteen crosses on red", () => {
    const { world } = blockWorld();
    const crowd = new Crowd(world, constant(0.01));
    const p = crowd.addAt("2-3", 0)!;
    for (let k = 0; k < 40; k++) crowd.step(0.05, RED_T, FOCUS, []);
    expect(p.state).toBe("walking");
    expect(p.n).toBeGreaterThan(21);
  });
});

/** A car on the sidewalk's south side heading north at `v` m/s, `ahead` metres short of the person. */
function carAt(e: number, n: number, v: number, yaw = 0): Vehicle {
  const c = newVehicle(1, "sedan", e, n, yaw, "traffic");
  c.v = v;
  return c;
}

describe("cars", () => {
  /** a person who has stopped at a red crosswalk's start, at (99.4, 20) roughly */
  const stood = (random: () => number) => {
    const { world } = blockWorld();
    const crowd = new Crowd(world, random);
    const p = crowd.addAt("2-3", 10)!;
    return { crowd, p };
  };

  it("jumps aside from a car at 10 m/s coming at them, three times in four", () => {
    for (const [roll, dodges] of [
      [0.1, true],
      [0.9, false],
    ] as const) {
      const { crowd, p } = stood(constant(roll));
      const car = carAt(p.e, p.n - 8, 10);
      crowd.step(0.02, GREEN_T, { e: p.e, n: p.n }, [car]);
      expect(p.state === "dodging").toBe(dodges);
      expect(crowd.people.includes(p)).toBe(true);
    }
  });

  it("does not jump from a slow car, or one going away", () => {
    const { crowd, p } = stood(constant(0.1));
    crowd.step(0.02, GREEN_T, { e: p.e, n: p.n }, [carAt(p.e, p.n - 8, 4)]);
    expect(p.state).not.toBe("dodging");
    crowd.step(0.02, GREEN_T, { e: p.e, n: p.n }, [carAt(p.e, p.n + 8, 10)]);
    expect(p.state).not.toBe("dodging");
  });

  it("a touch knocks them down, they lie 3.5 to 5.5 s, then get up and go on", () => {
    const { crowd, p } = stood(constant(0.5));
    const car = carAt(p.e, p.n - 2.2, 10);
    const events = crowd.step(0.02, GREEN_T, { e: p.e, n: p.n }, [car]);
    expect(p.state).toBe("down");
    expect(events.knocks.length).toBe(1);
    expect(events.knocks[0].speed).toBeCloseTo(10);
    expect(p.downFor).toBeGreaterThanOrEqual(3.5);
    expect(p.downFor).toBeLessThanOrEqual(5.5);
    let t = 0;
    while (p.state === "down" && t < 6) {
      crowd.step(0.05, GREEN_T + t, { e: p.e, n: p.n }, []);
      t += 0.05;
    }
    expect(t).toBeLessThanOrEqual(5.6);
    expect(p.state).not.toBe("down");
    expect(p.downFor).toBe(0);
    // and then on, still on the sidewalk
    for (let k = 0; k < 100; k++) crowd.step(0.05, GREEN_T + t + k * 0.05, { e: p.e, n: p.n }, []);
    expect(["walking", "running", "waiting"]).toContain(p.state);
  });

  it("a knock scares those near", () => {
    const { world } = blockWorld();
    const crowd = new Crowd(world, constant(0.5));
    const a = crowd.addAt("1-2", 10)!;
    const b = crowd.addAt("1-2", 14)!;
    const far = crowd.addAt("3-4", 0)!;
    crowd.knock(a, { ve: 5, vn: 0 });
    expect(a.state).toBe("down");
    expect(b.state).toBe("running");
    expect(b.runFor).toBeGreaterThanOrEqual(5);
    expect(far.state).not.toBe("running");
  });
});

describe("the water", () => {
  it("someone in the water swims to land and climbs out", () => {
    const walks = [
      walkEdge(1, 2, [
        [20, 20],
        [180, 20],
      ]),
    ];
    const world = worldOf(makeCell(0, 0, { walks, mask: waterRect(0, 0, 0, 100, 200, 200) }));
    const crowd = new Crowd(world, constant(0.5));
    const p = crowd.addAt("1-2", 50)!;
    p.e = 90;
    p.n = 140;
    p.state = "swimming";
    expect(world.isWater(p.e, p.n)).toBe(true);
    let t = 0;
    while (p.state === "swimming" && t < 60) {
      crowd.step(0.05, t, { e: 90, n: 100 }, []);
      expect(p.z).toBeLessThanOrEqual(0);
      t += 0.05;
    }
    expect(p.state).not.toBe("swimming");
    expect(world.isWater(p.e, p.n)).toBe(false);
  });

  it("a jump aside never takes anyone into the water", () => {
    const walks = [
      walkEdge(1, 2, [
        [20, 98],
        [180, 98],
      ]),
    ];
    const world = worldOf(makeCell(0, 0, { walks, mask: waterRect(0, 0, 0, 100, 200, 200) }));
    const crowd = new Crowd(world, constant(0.1));
    const p = crowd.addAt("1-2", 60)!;
    // a car coming from the west just south of them: the way clear of it is north, into the water
    const car = carAt(p.e - 8, p.n - 0.3, 10, Math.PI / 2);
    let dodged = false;
    for (let k = 0; k < 120; k++) {
      crowd.step(0.02, GREEN_T, { e: p.e, n: p.n }, k === 0 ? [car] : []);
      if (p.state === "dodging") dodged = true;
      expect(world.isWater(p.e, p.n)).toBe(false);
    }
    expect(dodged).toBe(true);
    expect(p.state).not.toBe("swimming");
  });

  it("someone knocked into the water swims out", () => {
    const walks = [
      walkEdge(1, 2, [
        [20, 98],
        [180, 98],
      ]),
    ];
    const world = worldOf(makeCell(0, 0, { walks, mask: waterRect(0, 0, 0, 100, 200, 200) }));
    const crowd = new Crowd(world, constant(0.5));
    const p = crowd.addAt("1-2", 60)!;
    crowd.knock(p, { ve: 0, vn: 12 });
    let swam = false;
    const splashes: { e: number; n: number }[] = [];
    let t = 0;
    while (t < 40) {
      splashes.push(...crowd.step(0.05, t, { e: 80, n: 100 }, []).splashes);
      if (p.state === "swimming") swam = true;
      t += 0.05;
    }
    expect(swam).toBe(true);
    expect(world.isWater(p.e, p.n)).toBe(false);
    // going in made a splash (its ring on the water), once, where they went in
    expect(splashes).toHaveLength(1);
    expect(world.isWater(splashes[0].e, splashes[0].n)).toBe(true);
  });
});

describe("walls", () => {
  it("walking back to the line after a fall never passes through a wall", () => {
    const walks = [
      walkEdge(1, 2, [
        [20, 20],
        [180, 20],
      ]),
    ];
    const world = worldOf(makeCell(0, 0, { walks, volumes: [boxVolume(0, 24, 200, 28)] }));
    const crowd = new Crowd(world, constant(0.5));
    const p = crowd.addAt("1-2", 80)!;
    // thrown over the building: lying on its far side
    p.e = 100;
    p.n = 35;
    p.state = "down";
    p.downFor = 0.05;
    for (let k = 0; k < 200; k++) {
      crowd.step(0.05, GREEN_T, { e: 100, n: 30 }, []);
      expect(world.blocked(p.e, p.n, 0.3, 0, 1.7)).toBe(false);
      expect(p.n).toBeGreaterThan(28);
    }
  });
});

describe("scares", () => {
  it("scare sets running for 5 to 8 s, and they stop running after", () => {
    const { world } = blockWorld();
    const crowd = new Crowd(world, constant(0.5));
    const near = crowd.addAt("1-2", 20)!;
    const far = crowd.addAt("3-4", 70)!;
    crowd.scare(near.e, near.n, 10);
    expect(near.state).toBe("running");
    expect(near.runFor).toBeGreaterThanOrEqual(5);
    expect(near.runFor).toBeLessThanOrEqual(8);
    expect(far.state).toBe("walking");
    for (let k = 0; k < 200; k++) crowd.step(0.05, GREEN_T, FOCUS, []);
    expect(near.state).not.toBe("running");
  });

  it("a scared person runs faster than a walker and ignores a red light", () => {
    const { world } = blockWorld();
    const crowd = new Crowd(world, constant(0.5));
    const walker = crowd.addAt("1-2", 0)!;
    const runner = crowd.addAt("1-2", 0)!;
    crowd.scare(runner.e, runner.n, 1);
    // scare reaches both (same place); put the walker back
    walker.state = "walking";
    walker.runFor = 0;
    for (let k = 0; k < 60; k++) crowd.step(0.05, RED_T, FOCUS, []);
    expect(runner.e).toBeGreaterThan(walker.e);
  });
});

describe("a long run", () => {
  it("keeps going for minutes with cars about, nobody leaves the data and nothing throws", () => {
    const { world, walks } = blockWorld();
    const rnd = seeded(7);
    const crowd = new Crowd(world, rnd);
    crowd.budget = 60;
    crowd.prime({ e: 60, n: 300 });
    const car = carAt(100, 0, 12);
    for (let k = 0; k < 4000; k++) {
      car.n = (k * 0.05 * 12) % 60;
      crowd.step(0.05, k * 0.05, { e: 60, n: 100 }, [car]);
      for (const p of crowd.people) {
        expect(Number.isFinite(p.e + p.n + p.z + p.yaw)).toBe(true);
        // someone knocked far walks back onto their line from where they got up
        if (p.state === "walking" || p.state === "waiting")
          expect(offEdges(p, walks)).toBeLessThan(15);
      }
    }
  });
});
