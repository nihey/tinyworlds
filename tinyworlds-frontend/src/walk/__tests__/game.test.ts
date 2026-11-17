import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { WalkCell, WalkEdge } from "../cell";
import { defaultBindings } from "../controls";
import { WalkGame, type GameView, type LifeRoutes, type WalkState } from "../game";
import { enToLonLat } from "../geo";
import { MODEL_RAMPS } from "../render/models";
import { PARTICLE_RAMPS } from "../render/particles";
import { WalkSound } from "../sound";
import { PAINT_RED, parkedOn, starterCar } from "../traffic";
import { fireDamage } from "../health";
import { applyDamage, newVehicle, nextVehicleId, type Vehicle } from "../vehicles";
import type { WalkIndex } from "../walk-index";
import { WalkWorld } from "../world";
import { boxVolume, makeCell, roadNode, streetEdge, waterRect } from "./fixtures";

/** The squares from (i0, j0) to (i1, j1), all land, `parts` filling in some of them by key. */
function area(
  i0: number,
  j0: number,
  i1: number,
  j1: number,
  parts: Record<string, Partial<WalkCell>> = {},
): WalkCell[] {
  const out: WalkCell[] = [];
  for (let i = i0; i <= i1; i++)
    for (let j = j0; j <= j1; j++) out.push(makeCell(i, j, parts[`${i}_${j}`] ?? {}));
  return out;
}

/** Every ramp the game draws with. */
const RAMPS = [...new Set([...MODEL_RAMPS, ...PARTICLE_RAMPS])];

/** An index whose squares are these, with a palette holding every ramp the game draws with. */
function indexOf(cells: WalkCell[]): WalkIndex {
  const i0 = Math.min(...cells.map((c) => c.i));
  const j0 = Math.min(...cells.map((c) => c.j));
  const cols = Math.max(...cells.map((c) => c.i)) - i0 + 1;
  const rows = Math.max(...cells.map((c) => c.j)) - j0 + 1;
  const bits = new Uint8Array(Math.ceil((cols * rows) / 8));
  for (const c of cells) {
    const b = c.i - i0 + (c.j - j0) * cols;
    bits[b >> 3] |= 1 << (b & 7);
  }
  return {
    v: 1,
    cell: 200,
    i0,
    j0,
    cols,
    rows,
    cells: btoa(String.fromCharCode(...bits)),
    geo: { lon0: -74, lat0: 40.7, betaDeg: 45, k: 2, kz: 2.45 },
    gridDeg: 28.9,
    sunDeg: 254,
    palette: { names: RAMPS, rgb: RAMPS.flatMap(() => new Array(18).fill(128)) },
    paintRank: [],
    tunnels: [],
  };
}

function seeded(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A view that renders nothing: the world and a real scene, the cameras and greys it was given kept. */
function fakeView(world: WalkWorld): GameView & { cameras: number[][]; greys: number[] } {
  const cameras: number[][] = [];
  const greys: number[] = [];
  return {
    world,
    scene: new THREE.Scene(),
    cameras,
    greys,
    setCamera: (...pose: number[]) => void cameras.push(pose),
    setGrey: (amount: number) => void greys.push(amount),
    update() {},
    render() {},
  };
}

interface Opts {
  start: { e: number; n: number; yaw?: number; z?: number };
  vehicles?: Vehicle[];
  starter?: boolean;
  life?: LifeRoutes;
  reduced?: boolean;
  tunnels?: WalkIndex["tunnels"];
}

/** The game over these squares, already in, with its latest state kept. */
function play(cells: WalkCell[], opts: Opts) {
  const ix = { ...indexOf(cells), tunnels: opts.tunnels ?? [] };
  const world = new WalkWorld(ix);
  for (const c of cells) world.add(c);
  const view = fakeView(world);
  const game = new WalkGame({
    view,
    ix,
    life: opts.life ?? [],
    start: { yaw: 0, ...opts.start },
    bindings: defaultBindings(),
    reduced: opts.reduced ?? false,
    sound: new WalkSound(),
    units: "imperial",
    starter: opts.starter,
    random: seeded(11),
  });
  for (const v of opts.vehicles ?? []) game.add(v);
  // the latest state, whether or not it was worth telling the signs
  const now = (): WalkState => game.state;
  /** Steps until `until` holds, `limit` seconds at most; answers whether it did. */
  const simUntil = (until: () => boolean, limit: number) => {
    for (let t = 0; t < limit; t += 1 / 30) {
      if (until()) return true;
      game.sim(1 / 30);
    }
    return until();
  };
  return { game, world, view, now, simUntil };
}

/** A parked sedan at (e, n), facing north unless `yaw` says. */
const sedan = (e: number, n: number, yaw = 0, state: Vehicle["state"] = "parked") =>
  newVehicle(nextVehicleId(), "sedan", e, n, yaw, state);

describe("bumping into what stands still", () => {
  it("walking or sprinting into a parked car does not hurt, nor knock you down", () => {
    for (const sprint of [false, true])
      for (const e of [98.2, 99.1, 100, 100.7, 101.6, 102.3]) {
        // a sedan across your way 6 m north (4.7 m long, east–west): you walk into its side
        const { game, now } = play(area(-1, -1, 1, 1), {
          start: { e, n: 94 },
          vehicles: [sedan(100, 100, Math.PI / 2)],
        });
        game.sim(0.1);
        if (sprint) game.keyDown("ShiftLeft");
        game.keyDown("KeyW");
        game.sim(3);
        expect(now().life).toBe(100);
        expect(now().mode).toBe("foot");
      }
  });

  it("swimming hard into a moored boat does not hurt", () => {
    const water = { mask: { mode: 1 as const, bits: null } };
    const parts: Record<string, Partial<WalkCell>> = {};
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) parts[`${i}_${j}`] = water;
    for (const e of [99, 100, 101.5]) {
      const boat = newVehicle(nextVehicleId(), "speedboat", 100, 100, Math.PI / 2, "parked");
      const { game, now } = play(area(-1, -1, 1, 1, parts), {
        start: { e, n: 96 },
        vehicles: [boat],
      });
      game.sim(0.1);
      expect(now().mode).toBe("swim");
      game.keyDown("ShiftLeft");
      game.keyDown("KeyW");
      game.sim(4);
      expect(now().life).toBe(100);
      expect(now().mode).toBe("swim");
    }
  });
});

describe("getting into a car", () => {
  it("works within 2.4 m of a parked car, and not at 3 m", () => {
    // a sedan is 1.8 m wide: its right side is at e = 100.9
    const near = play(area(-1, -1, 2, 2), {
      start: { e: 102.9, n: 100 },
      vehicles: [sedan(100, 100)],
    });
    near.game.sim(0.1);
    expect(near.now().near?.kind).toBe("sedan");
    near.game.keyDown("KeyF");
    near.game.sim(0.1);
    expect(near.now().mode).toBe("drive");
    expect(near.now().vehicle?.kind).toBe("sedan");

    const far = play(area(-1, -1, 2, 2), {
      start: { e: 103.9, n: 100 },
      vehicles: [sedan(100, 100)],
    });
    far.game.sim(0.1);
    expect(far.now().near).toBeNull();
    far.game.keyDown("KeyF");
    far.game.sim(0.1);
    expect(far.now().mode).toBe("foot");
    expect(far.now().vehicle).toBeNull();
  });
});

describe("getting out of a car", () => {
  it("says slow down at 6 m/s, and lets you out on the driver's side once slow", () => {
    const car = sedan(100, 100);
    const { game, now, simUntil } = play(area(-1, -1, 2, 2), {
      start: { e: 102.4, n: 100 },
      vehicles: [car],
    });
    game.sim(0.1);
    game.keyDown("KeyF");
    game.keyUp("KeyF");
    game.sim(0.1);
    expect(now().mode).toBe("drive");
    game.keyDown("KeyW");
    expect(simUntil(() => (now().vehicle?.speed ?? 0) >= 6, 3)).toBe(true);
    game.keyDown("KeyF");
    game.keyUp("KeyF");
    game.sim(1 / 30);
    expect(now().message).toBe("slowDown");
    expect(now().mode).toBe("drive");

    game.keyUp("KeyW");
    game.keyDown("KeyS");
    expect(simUntil(() => (now().vehicle?.speed ?? 9) < 1, 3)).toBe(true);
    game.keyUp("KeyS");
    game.sim(0.5);
    game.keyDown("KeyF");
    game.sim(1 / 30);
    expect(now().mode).toBe("foot");
    // facing north, the driver's side is the west
    const at = game.position();
    expect(at.e).toBeLessThan(car.e - 0.9);
    expect(Math.abs(at.n - car.n)).toBeLessThan(1);
  });
});

describe("driving into the water", () => {
  it("sinks the car, and you come out swimming", () => {
    // land west of e = 200, the river east of it
    const water = { mask: { mode: 1 as const, bits: null } };
    const cells = area(-1, -1, 3, 1, { "1_-1": water, "1_0": water, "1_1": water, "2_0": water });
    const car = sedan(150, 100, Math.PI / 2);
    const { game, now, simUntil } = play(cells, { start: { e: 150, n: 101.9 }, vehicles: [car] });
    game.sim(0.1);
    game.keyDown("KeyF");
    game.keyUp("KeyF");
    game.sim(0.1);
    expect(now().mode).toBe("drive");
    game.keyDown("KeyW");
    let warned = false;
    expect(
      simUntil(() => {
        warned ||= now().message === "sinking";
        return now().mode === "swim";
      }, 12),
    ).toBe(true);
    expect(warned).toBe(true);
    expect(["sinking", "sunk"]).toContain(car.state);
    expect(now().vehicle).toBeNull();
    expect(game.position().e).toBeGreaterThan(200);
  });
});

/** A street along n = 100 (12 m wide) with a sidewalk on each side, 9 m from its middle. */
function streetWorld(): WalkCell[] {
  const nodes = [roadNode(1, 10, 100), roadNode(2, 190, 100)];
  const street = streetEdge(
    1,
    2,
    [
      [10, 100],
      [190, 100],
    ],
    { width: 12 },
  );
  const walk = (key: string, n: number): WalkEdge => ({
    key,
    a: key === "s" ? 3 : 5,
    b: key === "s" ? 4 : 6,
    crosswalk: false,
    phase: 0,
    elevated: false,
    pts: Float32Array.of(10, n, 0, 190, n, 0),
    length: 180,
  });
  return area(-1, -1, 1, 1, {
    "0_0": { nodes, streets: [street], walks: [walk("s", 91), walk("n", 109)] },
  });
}

describe("going down", () => {
  it("a fall of 20 m runs the wasted sequence, and you come to on a sidewalk 20 to 60 m away", () => {
    const { game, now, simUntil } = play(streetWorld(), { start: { e: 100, n: 109, z: 20 } });
    expect(simUntil(() => now().wasted !== null, 4)).toBe(true);
    const down = game.position();
    expect(now().mode).toBe("down");
    expect(simUntil(() => now().wasted === null, 8)).toBe(true);
    const at = game.position();
    const d = Math.hypot(at.e - down.e, at.n - down.n);
    expect(d).toBeGreaterThanOrEqual(20);
    expect(d).toBeLessThanOrEqual(60);
    expect(Math.min(Math.abs(at.n - 91), Math.abs(at.n - 109))).toBeLessThan(0.01);
    expect(now().life).toBe(100);
    expect(now().mode).toBe("foot");
  });

  it("drains the city's colours while it runs, and gives them back after", () => {
    const { view, now, simUntil } = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100, z: 20 } });
    const last = () => view.greys[view.greys.length - 1];
    expect(simUntil(() => now().wasted !== null, 4)).toBe(true);
    expect(simUntil(() => (now().wasted?.grey ?? 0) > 0.6, 3)).toBe(true);
    expect(last()).toBeCloseTo(now().wasted!.grey, 5);
    expect(simUntil(() => now().wasted === null, 6)).toBe(true);
    expect(last()).toBe(0);

    // under reduced motion they drain all the same (only the slow motion and the lift go)
    const calm = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100, z: 20 }, reduced: true });
    expect(calm.simUntil(() => calm.now().wasted !== null, 4)).toBe(true);
    calm.game.sim(2);
    expect(calm.view.greys[calm.view.greys.length - 1]).toBe(1);
    expect(calm.now().wasted!.timeRate).toBe(1);
  });

  it("slows time while it runs, and a key skips ahead once the word is up", () => {
    const { game, now, simUntil } = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100, z: 20 } });
    expect(simUntil(() => now().wasted !== null, 4)).toBe(true);
    expect(now().wasted!.timeRate).toBeLessThan(1);
    expect(simUntil(() => now().wasted?.skippable === true, 4)).toBe(true);
    game.keyDown("KeyQ");
    expect(simUntil(() => now().wasted === null, 1)).toBe(true);
    expect(now().life).toBe(100);
  });

  /** A loose sedan coming north at you (standing at 100, 100) at `speed`, about to touch. */
  const comingAt = (speed: number) => {
    const car = sedan(100, 100 - 0.35 - 2.35 - 0.05, 0, "loose");
    car.v = speed;
    return car;
  };

  it("being hit on foot at 15 m/s is the end of you", () => {
    const { now, simUntil } = play(area(-1, -1, 1, 1), {
      start: { e: 100, n: 100 },
      vehicles: [comingAt(15)],
    });
    expect(simUntil(() => now().wasted !== null, 0.5)).toBe(true);
  });

  it("being hit on foot at 5 m/s hurts and knocks you down, and you get up", () => {
    const { game, now } = play(area(-1, -1, 1, 1), {
      start: { e: 100, n: 100 },
      vehicles: [comingAt(5)],
    });
    game.sim(0.3);
    expect(now().wasted).toBeNull();
    expect(now().life).toBeCloseTo(73, 0);
    expect(now().mode).toBe("down");
    expect(now().hurt).toBeGreaterThan(0);
    game.sim(2);
    expect(now().mode).toBe("foot");
  });

  it("a car wrecked with you inside is the end of you", () => {
    // a building across the way 30 m east
    const cells = area(-1, -1, 1, 1, { "0_0": { volumes: [boxVolume(130, 40, 170, 160)] } });
    const car = sedan(100, 100, Math.PI / 2);
    car.damage = 0.8;
    const { game, now, simUntil } = play(cells, { start: { e: 100, n: 101.9 }, vehicles: [car] });
    game.sim(0.1);
    game.keyDown("KeyF");
    game.keyUp("KeyF");
    game.sim(0.1);
    expect(now().mode).toBe("drive");
    game.keyDown("KeyW");
    expect(simUntil(() => now().wasted !== null, 6)).toBe(true);
    expect(car.state).toBe("wrecked");
    expect(now().vehicle).toBeNull();
  });
});

describe("wrecks", () => {
  it("catching fire within 5 m of you hurt you once, nearer worse", () => {
    // a sedan 3 m east of you, its side 2.1 m from you, about to burn
    const car = sedan(103, 100, 0, "loose");
    const { game, now } = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100 }, vehicles: [car] });
    game.sim(0.1);
    applyDamage(car, 100);
    game.sim(0.1);
    expect(car.state).toBe("wrecked");
    expect(now().life).toBeCloseTo(100 - fireDamage(2.1), 1);
    const after = now().life;
    game.sim(3);
    expect(now().life).toBe(after);
  });
});

describe("fast cars", () => {
  it("do not pass through another, however fast", () => {
    // a supercar at 70 m/s northwards at the side of a parked sedan lying across its way, near you
    const parked = sedan(100, 130, Math.PI / 2);
    const fast = newVehicle(nextVehicleId(), "supercar", 100, 110, 0, "loose");
    fast.v = 70;
    const { game } = play(area(-1, -1, 1, 1), {
      start: { e: 90, n: 120 },
      vehicles: [parked, fast],
    });
    // in the longest frames there are (a slow machine's): 7 m a frame
    game.sim(0.3, 0.1);
    expect(parked.state).not.toBe("parked");
    // it hit the sedan and shoved it: it is still behind it
    expect(fast.n).toBeLessThan(parked.n);
  });
});

describe("life", () => {
  it("comes back at 2 a second once nothing has hurt you for 5 s", () => {
    const { game, now, simUntil } = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100, z: 8 } });
    expect(simUntil(() => now().life < 100, 3)).toBe(true);
    const hurt = now().life;
    // a fall of 8 m: (8 − 4) / 11 of it
    expect(hurt).toBeCloseTo(100 - (4 / 11) * 100, 0);
    game.sim(4.8);
    expect(now().life).toBeCloseTo(hurt, 5);
    game.sim(1.2);
    expect(now().life).toBeCloseTo(hurt + 2, 0);
    game.sim(30);
    expect(now().life).toBe(100);
  });
});

describe("the signs", () => {
  it("are told when what they show changes, not every frame, and when life is whole again", () => {
    const { game } = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100, z: 8 } });
    const told: WalkState[] = [];
    game.subscribe((s) => told.push(s));
    game.sim(2);
    const afterFall = told.length;
    expect(told[told.length - 1].life).toBeLessThan(100);
    // nothing changes while life waits to come back: nothing is said
    game.sim(3);
    expect(told.length).toBe(afterFall);
    // it comes back in half points, a few dozen times, not a frame at a time
    game.sim(30);
    expect(told.length - afterFall).toBeLessThan(90);
    expect(told[told.length - 1].life).toBe(100);
  });
});

describe("parked cars", () => {
  it("line the streets, and New York's first walk has a red supercar waiting by the start", () => {
    const cells = area(-1, -1, 1, 1, {
      "0_0": {
        nodes: [roadNode(1, 10, 100), roadNode(2, 190, 100)],
        streets: [
          streetEdge(
            1,
            2,
            [
              [10, 100],
              [190, 100],
            ],
            { width: 14 },
          ),
        ],
      },
    });
    const { game, world } = play(cells, { start: { e: 100, n: 109 }, starter: true });
    game.sim(1.5);
    const all = game.vehicles();
    const supercar = all.find((v) => v.kind === "supercar" && v.color === PAINT_RED);
    expect(supercar).toBeDefined();
    expect(Math.hypot(supercar!.e - 100, supercar!.n - 109)).toBeLessThan(15);
    const parked = all.filter((v) => v.state === "parked" && v !== supercar);
    // every spot the street fills, but the one the supercar stands in
    const { spot } = starterCar(world, { e: 100, n: 109 })!;
    let expected = 0;
    for (const c of world.cells())
      for (const s of c.streets) expected += parkedOn(s, world, spot)!.length;
    expect(parked.length).toBe(expected);
    expect(parked.length).toBeGreaterThan(10);
    for (const v of parked)
      expect(Math.hypot(v.e - supercar!.e, v.n - supercar!.n)).toBeGreaterThan(3);
  });
});

describe("ferries", () => {
  it("sail their routes there and back, waiting at each end", () => {
    const water = { mask: { mode: 1 as const, bits: null } };
    const parts: Record<string, Partial<WalkCell>> = {};
    for (let i = -1; i <= 3; i++) for (let j = -1; j <= 1; j++) parts[`${i}_${j}`] = water;
    const cells = area(-1, -1, 3, 1, parts);
    const ix = indexOf(cells);
    const route = [enToLonLat(ix.geo, 0, 100), enToLonLat(ix.geo, 400, 100)].flat();
    const { game } = play(cells, {
      start: { e: 200, n: 150 },
      life: [{ name: "Pier A – Pier B", path: route }],
    });
    const ferry = () => game.vehicles().find((v) => v.kind === "ferry")!;
    game.sim(0.1);
    expect(ferry()).toBeDefined();
    const seen: number[] = [];
    for (let t = 0; t < 240; t += 1) {
      game.sim(1);
      seen.push(ferry().e);
    }
    expect(Math.min(...seen)).toBeLessThan(5);
    expect(Math.max(...seen)).toBeGreaterThan(395);
    // it waits: the same place for some seconds at an end
    let still = 0;
    for (let k = 1; k < seen.length; k++)
      if (Math.abs(seen[k] - seen[k - 1]) < 0.01) still = Math.max(still, k);
    expect(still).toBeGreaterThan(0);
    expect(Math.abs(ferry().n - 100)).toBeLessThan(0.5);
  });
});

describe("tunnels", () => {
  it("take you through in the dark to the other portal, and a closed one stops you", () => {
    const tunnels: WalkIndex["tunnels"] = [
      // into it eastwards at (100, 100), out westwards from (700, 100)
      { name: "Through", a: [100, 100, Math.PI / 2], b: [700, 100, -Math.PI / 2], length: 600 },
      { name: "Closed", a: [100, 300, Math.PI / 2], b: null, length: 900 },
    ];
    const cells = area(-1, -1, 4, 2);
    const through = play(cells, { start: { e: 90, n: 100, yaw: Math.PI / 2 }, tunnels });
    through.game.keyDown("ShiftLeft");
    through.game.keyDown("KeyW");
    expect(through.simUntil(() => through.now().dark > 0, 3)).toBe(true);
    through.game.keyUp("KeyW");
    expect(through.simUntil(() => through.now().dark === 0, 10)).toBe(true);
    const out = through.game.position();
    // 4 m out of the far portal, facing out of it (east)
    expect(Math.hypot(out.e - 704, out.n - 100)).toBeLessThan(1);
    expect(Math.abs(out.yaw - Math.PI / 2)).toBeLessThan(0.01);

    const closed = play(cells, { start: { e: 90, n: 300, yaw: Math.PI / 2 }, tunnels });
    closed.game.keyDown("ShiftLeft");
    closed.game.keyDown("KeyW");
    let said = false;
    for (let k = 0; k < 120; k++) {
      closed.game.sim(1 / 30);
      said ||= closed.now().message === "tunnelClosed";
    }
    expect(said).toBe(true);
    expect(closed.now().dark).toBe(0);
    expect(closed.game.position().e).toBeLessThan(100);
  });
});

describe("boats", () => {
  it("are taken from a pier, left onto it, sailed out, left into the water and taken again from it", () => {
    // land west of e = 100, the water east of it; a speedboat tied alongside, bow north
    const quay = (i: number, j: number) => waterRect(i, j, 100, j * 200, 200, j * 200 + 200);
    const water = { mask: { mode: 1 as const, bits: null } };
    const cells = area(-1, -1, 2, 1, {
      "0_-1": { mask: quay(0, -1) },
      "0_0": {
        mask: quay(0, 0),
        moorings: [{ e: 102, n: 100, heading: 0, kind: "speedboat" }],
      },
      "0_1": { mask: quay(0, 1) },
      "1_-1": water,
      "1_0": water,
      "1_1": water,
      "2_-1": water,
      "2_0": water,
      "2_1": water,
    });
    const { game, now, simUntil } = play(cells, { start: { e: 99, n: 100, yaw: Math.PI / 2 } });
    const press = (code: string) => {
      game.keyDown(code);
      game.keyUp(code);
      game.sim(0.1);
    };
    game.sim(0.2);
    expect(now().near?.kind).toBe("speedboat");
    press("KeyF");
    expect(now().mode).toBe("boat");
    game.sim(0.5);
    press("KeyF");
    expect(now().mode).toBe("foot");
    expect(game.position().e).toBeLessThan(100);

    press("KeyF");
    expect(now().mode).toBe("boat");
    game.keyDown("KeyW");
    game.keyDown("KeyD");
    game.sim(3);
    game.keyUp("KeyW");
    game.keyUp("KeyD");
    game.keyDown("KeyS");
    expect(simUntil(() => (now().vehicle?.speed ?? 9) < 1, 10)).toBe(true);
    game.keyUp("KeyS");
    game.sim(1);
    expect(game.position().e).toBeGreaterThan(110);
    press("KeyF");
    expect(now().mode).toBe("swim");
    // swimming beside it, it is yours again
    expect(now().near?.kind).toBe("speedboat");
    press("KeyF");
    expect(now().mode).toBe("boat");
  });
});
