import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import type { WalkCell, WalkEdge } from "../cell";
import { defaultBindings } from "../controls";
import { WalkGame, type GameView, type LifeRoutes, type WalkState } from "../game";
import { enToLonLat } from "../geo";
import { StreetLighting } from "../render/city-light";
import { MODEL_RAMPS, WalkModels } from "../render/models";
import { makePalette } from "../render/palette";
import { PARTICLE_RAMPS } from "../render/particles";
import { WalkSound } from "../sound";
import { PAINT_RED, parkedOn, starterCar } from "../traffic";
import { blastDamage } from "../health";
import { bodyOf, overlap } from "../collide";
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
    lighting: new StreetLighting(),
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
  /** squares the index has that never come in (outside the loaded ones, or failing) */
  missing?: WalkCell[];
}

/** The game over these squares, already in, with its latest state kept. */
function play(cells: WalkCell[], opts: Opts) {
  const ix = { ...indexOf([...cells, ...(opts.missing ?? [])]), tunnels: opts.tunnels ?? [] };
  const world = new WalkWorld(ix);
  for (const c of cells) world.add(c);
  const view = fakeView(world);
  const sound = new WalkSound();
  const game = new WalkGame({
    view,
    ix,
    life: opts.life ?? [],
    start: { yaw: 0, ...opts.start },
    bindings: defaultBindings(),
    reduced: opts.reduced ?? false,
    sound,
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
  return { game, world, view, now, simUntil, sound };
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

describe("the long ferry", () => {
  /** Open water round (100, 100) and a 90 × 20 m ferry lying there, bow north. */
  const lying = () => {
    const water = { mask: { mode: 1 as const, bits: null } };
    const parts: Record<string, Partial<WalkCell>> = {};
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) parts[`${i}_${j}`] = water;
    const ferry = newVehicle(nextVehicleId(), "ferry", 100, 100, 0, "parked", 1);
    ferry.size = { length: 90, width: 20 };
    return { cells: area(-1, -1, 1, 1, parts), ferry };
  };

  it("is solid at its far ends: a swimmer sprinting at its bow stays outside it", () => {
    const { cells, ferry } = lying();
    // 6 m beyond the bow, swimming south at it
    const { game } = play(cells, { start: { e: 100, n: 151, yaw: Math.PI }, vehicles: [ferry] });
    game.sim(0.1);
    game.keyDown("ShiftLeft");
    game.keyDown("KeyW");
    game.sim(5);
    expect(game.position().n).toBeGreaterThan(145 + 0.3);
  });

  /** How deep two hulls are in each other (0 apart). */
  const depth = (a: Vehicle, b: Vehicle) => overlap(bodyOf(a), bodyOf(b))?.depth ?? 0;

  it("is hit where it is, though its middle is far from you", () => {
    const { cells } = lying();
    // lying east–west, its middle 60 m east of you and its stern at e = 115; a speedboat near you
    // runs at its stern
    const ferry = newVehicle(nextVehicleId(), "ferry", 160, 100, Math.PI / 2, "parked", 1);
    ferry.size = { length: 90, width: 20 };
    const boat = newVehicle(nextVehicleId(), "speedboat", 95, 100, Math.PI / 2, "loose");
    boat.v = 15;
    const { game } = play(cells, { start: { e: 100, n: 120 }, vehicles: [ferry, boat] });
    let deepest = 0;
    for (let k = 0; k < 120; k++) {
      game.sim(1 / 30);
      deepest = Math.max(deepest, depth(ferry, boat));
    }
    expect(boat.e).toBeLessThan(115);
    expect(deepest).toBeLessThan(0.5);
  });

  it("shoves what lies ahead of its bow when you drive it, never through it", () => {
    const { cells, ferry } = lying();
    // a motorboat moored across its way, 52 m ahead of its middle, 5.3 m off its bow
    const moored = newVehicle(nextVehicleId(), "motorboat", 100, 152, Math.PI / 2, "parked");
    const { game, now } = play(cells, {
      start: { e: 111.5, n: 100 },
      vehicles: [ferry, moored],
    });
    game.sim(0.1);
    game.keyDown("KeyF");
    game.keyUp("KeyF");
    game.sim(0.1);
    expect(now().mode).toBe("boat");
    game.keyDown("KeyW");
    let deepest = 0;
    for (let k = 0; k < 360; k++) {
      game.sim(1 / 30);
      deepest = Math.max(deepest, depth(ferry, moored));
    }
    expect(moored.state).not.toBe("parked");
    expect(deepest).toBeLessThan(0.5);
  });

  it("is boarded from beside its ends too", () => {
    const { cells, ferry } = lying();
    // beside its bow quarter, 1.5 m off its side
    const { game, now } = play(cells, { start: { e: 111.5, n: 143 }, vehicles: [ferry] });
    game.sim(0.1);
    expect(now().near?.kind).toBe("ferry");
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

it("lets you find, ride and dismount a motorcycle parked at the kerb", () => {
  const road = streetEdge(
    1,
    2,
    [
      [10, 100],
      [190, 100],
    ],
    { width: 14 },
  );
  const cells = area(-1, -1, 1, 1, {
    "0_0": {
      nodes: [roadNode(1, 10, 100), roadNode(2, 190, 100)],
      streets: [road],
    },
  });
  const { game, now, simUntil } = play(cells, { start: { e: 100, n: 109 } });
  game.setCrowd(0, 0);
  game.sim(0.5);
  const bike = game.vehicles().find((v) => v.kind === "motorcycle" && v.state === "parked");
  expect(bike).toBeDefined();
  if (!bike) return;

  const right = bike.n > 100 ? 1 : -1;
  game.teleport(bike.e, bike.n + right, 0, bike.yaw);
  game.sim(0.1);
  expect(now().near?.kind).toBe("motorcycle");
  game.keyDown("KeyF");
  game.keyUp("KeyF");
  game.sim(0.1);
  expect(now()).toMatchObject({ mode: "drive", vehicle: { kind: "motorcycle", boat: false } });

  game.keyDown("KeyW");
  expect(simUntil(() => (now().vehicle?.speed ?? 0) > 4, 1)).toBe(true);
  game.keyUp("KeyW");
  game.keyDown("KeyS");
  expect(simUntil(() => (now().vehicle?.speed ?? Infinity) < 1, 1)).toBe(true);
  game.keyUp("KeyS");
  game.keyDown("KeyF");
  game.keyUp("KeyF");
  game.sim(0.1);
  expect(now().mode).toBe("foot");
  expect(game.vehicles()).toContain(bike);
});

describe("motorcycle crashes", () => {
  function ride(cells: WalkCell[], vehicles: Vehicle[] = []) {
    const bike = newVehicle(nextVehicleId(), "motorcycle", 100, 100, Math.PI / 2);
    const played = play(cells, { start: { e: 100, n: 101.5 }, vehicles: [bike, ...vehicles] });
    played.game.sim(0.1);
    played.game.keyDown("KeyF");
    played.game.keyUp("KeyF");
    played.game.sim(0.1);
    expect(played.now().vehicle?.kind).toBe("motorcycle");
    return { ...played, bike };
  }

  const wall = () => area(-1, -1, 1, 1, { "0_0": { volumes: [boxVolume(104, 90, 120, 110)] } });

  it("throws and hurts the rider on a hard wall hit, then lets them get up", () => {
    const { game, bike, now, simUntil } = ride(wall());
    bike.v = 13;
    expect(simUntil(() => now().mode === "down", 1)).toBe(true);
    expect(now().vehicle).toBeNull();
    expect(now().life).toBeGreaterThan(0);
    expect(now().life).toBeLessThan(100);
    expect(now().message).toBe("thrownOff");
    expect(bike.state).toBe("loose");
    const lifeAfterCrash = now().life;
    game.sim(2);
    expect(now().mode).toBe("foot");
    expect(now().life).toBe(lifeAfterCrash);
  });

  it("keeps the rider mounted on a slow bump", () => {
    const { game, bike, now } = ride(wall());
    bike.v = 5;
    game.sim(1);
    expect(bike.damage).toBeGreaterThan(0);
    expect(now().vehicle?.kind).toBe("motorcycle");
    expect(now().life).toBe(100);
  });

  it("throws the rider when another vehicle hits the bike", () => {
    const car = sedan(88, 100, Math.PI / 2, "loose");
    const { bike, now, simUntil } = ride(area(-1, -1, 1, 1), [car]);
    car.v = 12;
    expect(simUntil(() => now().mode === "down", 1)).toBe(true);
    expect(now().vehicle).toBeNull();
    expect(now().life).toBeLessThan(100);
    expect(bike.damage).toBeGreaterThan(0);
  });

  it("throws the rider on a hard landing", () => {
    const { bike, now, simUntil } = ride(area(-1, -1, 1, 1));
    bike.z = 6;
    expect(simUntil(() => now().mode === "down", 2)).toBe(true);
    expect(now().life).toBeLessThan(100);
  });

  it("uses the wasted sequence when the crash takes all the rider's life", () => {
    const { bike, now, simUntil } = ride(wall());
    bike.v = 28;
    expect(simUntil(() => now().wasted !== null, 1)).toBe(true);
    expect(now().vehicle).toBeNull();
    expect(now().life).toBe(0);
  });
});

it("draws empty motorcycles at the kerb and riders on occupied ones", () => {
  const ix = indexOf([makeCell(0, 0)]);
  const palette = makePalette(ix);
  const models = new WalkModels(new THREE.Scene(), palette, ix);
  const bike = newVehicle(nextVehicleId(), "motorcycle", 100, 100, 0);
  models.vehicle(bike);
  models.end(0);
  expect(models.counts()).toMatchObject({ motorcycle: 1, motorcyclist: 0 });

  bike.state = "traffic";
  models.vehicle(bike);
  models.end(0);
  expect(models.counts()).toMatchObject({ motorcycle: 1, motorcyclist: 1 });
  models.dispose();
  palette.texture.dispose();
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

describe("punching", () => {
  it("swings once, hits the closest pedestrian in front, and gives them time to get up", () => {
    const { game, now, sound } = play(streetWorld(), { start: { e: 100, n: 109 } });
    const swingSound = vi.spyOn(sound, "swing");
    const impactSound = vi.spyOn(sound, "punch");
    const crowd = game["crowd"];
    const target = crowd.addAt("n", 90)!;
    const farther = crowd.addAt("n", 91)!;
    game.teleport(target.e - 1.35, target.n, target.z, Math.PI / 2);
    game.sim(0.1);

    expect(game.keyDown("KeyE")).toContain("punch");
    game.keyUp("KeyE");
    game.sim(0.04);
    expect(now().punch).toMatchObject({ hit: null });
    expect(target.state).not.toBe("down");
    expect(swingSound).toHaveBeenCalledTimes(1);
    expect(impactSound).not.toHaveBeenCalled();
    game.sim(0.1);
    expect(now().punch).toMatchObject({ hit: true });
    expect(target.state).toBe("down");
    expect(farther.state).not.toBe("down");
    expect(impactSound).toHaveBeenCalledTimes(1);
    const swing = now().punch?.sequence;
    game.press("punch", true);
    game.press("punch", false);
    game.sim(0.04);
    expect(now().punch?.sequence).toBe(swing);

    game.sim(6);
    expect(target.state).not.toBe("down");
    expect(swingSound).toHaveBeenCalledTimes(1);
    expect(impactSound).toHaveBeenCalledTimes(1);
  });

  it("swings without hitting a pedestrian through a wall", () => {
    const cells = streetWorld();
    cells.find(({ key }) => key === "0_0")!.volumes.push(boxVolume(99.25, 106, 99.45, 112));
    const { game, now, sound } = play(cells, { start: { e: 98.6, n: 109 } });
    const impactSound = vi.spyOn(sound, "punch");
    const target = game["crowd"].addAt("n", 90)!;
    game.teleport(target.e - 1.5, target.n, target.z, Math.PI / 2);
    game.sim(0.1);
    game.press("punch", true);
    game.press("punch", false);
    game.sim(0.15);
    expect(now().punch).toMatchObject({ hit: false });
    expect(target.state).not.toBe("down");
    expect(impactSound).not.toHaveBeenCalled();
  });
});

it("plays one impact when the player's car knocks down a pedestrian", () => {
  const car = sedan(100, 109, Math.PI / 2);
  const { game, now, simUntil, sound } = play(streetWorld(), {
    start: { e: 100, n: 110.9 },
    vehicles: [car],
  });
  const impactSound = vi.spyOn(sound, "pedestrianHit");
  game.sim(0.1);
  game.keyDown("KeyF");
  game.keyUp("KeyF");
  game.sim(0.1);
  expect(now().mode).toBe("drive");
  expect(impactSound).not.toHaveBeenCalled();

  const pedestrian = game["crowd"].addAt("n", 93)!;
  car.n = pedestrian.n;
  car.v = 5;
  game.keyDown("KeyW");
  expect(simUntil(() => pedestrian.state === "down", 0.3)).toBe(true);
  game.keyUp("KeyW");
  game.sim(0.2);
  expect(impactSound).toHaveBeenCalledTimes(1);
  expect(impactSound.mock.calls[0][0]).toBeGreaterThan(0);
});

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
    const { game, now, sound } = play(area(-1, -1, 1, 1), {
      start: { e: 100, n: 100 },
      vehicles: [comingAt(5)],
    });
    const hurtSound = vi.spyOn(sound, "hurt");
    game.sim(0.3);
    expect(now().wasted).toBeNull();
    expect(now().life).toBeCloseTo(73, 0);
    expect(now().mode).toBe("down");
    expect(now().hurt).toBeGreaterThan(0);
    game.sim(2);
    expect(now().mode).toBe("foot");
    expect(hurtSound).toHaveBeenCalledTimes(1);
    expect(hurtSound.mock.calls[0][0]).toBeCloseTo(0.27, 2);
  });

  it("warns you when your car is wrecked and kills you at the end of the countdown", () => {
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
    expect(simUntil(() => now().vehicle?.explodesIn != null, 6)).toBe(true);
    expect(car.state).toBe("wrecked");
    expect(now().vehicle?.explodesIn).toBe(8);
    expect(now().life).toBe(100);
    const countdown = new Set<number>();
    const unsubscribe = game.subscribe(({ vehicle }) => {
      if (vehicle?.explodesIn != null) countdown.add(vehicle.explodesIn);
    });
    game.sim(7);
    expect(now().vehicle?.explodesIn).toBe(1);
    expect([...countdown]).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    unsubscribe();
    expect(now().wasted).toBeNull();
    expect(simUntil(() => now().wasted !== null, 1.1)).toBe(true);
    expect(now().vehicle).toBeNull();
  });
});

describe("wrecks", () => {
  it("draws fire as soon as a fuse starts and a larger burst when it expires", () => {
    const car = sedan(100, 100);
    const { game, view } = play(area(-1, -1, 1, 1), {
      start: { e: 112, n: 100 },
      vehicles: [car],
    });
    const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
    try {
      game.sim(0.1);
      const points = view.scene.children.find((child) => child instanceof THREE.Points)!;
      expect(points.geometry.drawRange.count).toBe(0);
      applyDamage(car, 100);
      game.sim(1 / 30);
      expect(car.fuse).toBeGreaterThan(7);
      const ignition = points.geometry.drawRange.count;
      expect(ignition).toBeGreaterThan(0);
      game.sim(8);
      expect(car.fuse).toBeNull();
      expect(points.geometry.drawRange.count).toBeGreaterThan(ignition);
    } finally {
      random.mockRestore();
    }
  });

  it("damages closer cars more and gives a chain reaction its own fuse", () => {
    const car = sedan(100, 100);
    const critical = sedan(103, 100);
    const near = sedan(100, 105);
    const far = sedan(100, 108);
    const safe = sedan(116, 100);
    critical.damage = 0.98;
    const { game } = play(area(-1, -1, 1, 1), {
      start: { e: 90, n: 90 },
      vehicles: [car, critical, near, far, safe],
    });
    game.sim(0.1);
    applyDamage(car, 100);
    game.sim(7.9);
    expect(critical.damage).toBe(0.98);
    game.sim(0.2);
    expect(critical.state).toBe("wrecked");
    expect(critical.fuse).toBeGreaterThan(7);
    expect(far.damage).toBeGreaterThan(0);
    expect(near.damage).toBeGreaterThan(far.damage);
    expect(safe.damage).toBe(0);
    game.sim(7.7);
    expect(critical.fuse).not.toBeNull();
    game.sim(0.3);
    expect(critical.fuse).toBeNull();
    expect(critical.fire).toBeGreaterThan(0);
  });

  it("hurts the player through a nearby car as well as damaging the car", () => {
    const source = sedan(100, 100);
    const driven = sedan(103, 100);
    const { game, now } = play(area(-1, -1, 1, 1), {
      start: { e: 104.8, n: 100 },
      vehicles: [source, driven],
    });
    game.sim(0.1);
    game.press("enter", true);
    game.press("enter", false);
    game.sim(0.1);
    expect(now().mode).toBe("drive");
    applyDamage(source, 100);
    game.sim(8.1);
    expect(now().mode).toBe("drive");
    expect(now().life).toBeGreaterThan(0);
    expect(now().life).toBeLessThan(100);
    expect(driven.damage).toBeGreaterThan(0);
  });

  it("knocks pedestrians down at the edge of the blast", () => {
    const walk: WalkEdge = {
      key: "1-2",
      a: 1,
      b: 2,
      crosswalk: false,
      phase: 0,
      elevated: false,
      pts: Float32Array.of(10, 110, 0, 190, 110, 0),
      length: 180,
    };
    const car = sedan(100, 100);
    const { game } = play(area(-1, -1, 1, 1, { "0_0": { walks: [walk] } }), {
      start: { e: 100, n: 100 },
      vehicles: [car],
    });
    game.sim(0.1);
    applyDamage(car, 100);
    game.sim(7.9);
    const person = game["crowd"].people[0];
    expect(person.state).not.toBe("down");
    car.e = person.e;
    car.n = person.n - 9.5;
    game.sim(0.2);
    expect(person.state).toBe("down");
    expect(person.downFor).toBeGreaterThan(3);
  });

  it("damages you once when a nearby wreck explodes", () => {
    // a sedan 3 m east of you, its side 2.1 m from you, about to burn
    const car = sedan(103, 100, 0, "loose");
    const { game, now } = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100 }, vehicles: [car] });
    game.sim(0.1);
    applyDamage(car, 100);
    game.sim(7.9);
    expect(car.state).toBe("wrecked");
    expect(now().life).toBe(100);
    game.sim(0.2);
    expect(now().life).toBeCloseTo(100 - blastDamage(2.1), 1);
    const after = now().life;
    game.sim(3);
    expect(now().life).toBe(after);
  });

  it("lets a touch player bail out while rolling and leave the wreck to explode", () => {
    const car = sedan(100, 100);
    const { game, now } = play(area(-1, -1, 1, 1), {
      start: { e: 101.8, n: 100 },
      vehicles: [car],
    });
    game.sim(0.1);
    game.press("enter", true);
    game.press("enter", false);
    game.sim(0.1);
    expect(now().mode).toBe("drive");
    car.v = 8;
    applyDamage(car, 100);
    game.sim(0.03);
    game.press("exit", true);
    game.press("exit", false);
    game.sim(0.1);
    expect(now().mode).toBe("foot");
    expect(car.fuse).toBeGreaterThan(7);
    game.stick(-1, 0);
    game.sim(8);
    expect(car.fire).toBeGreaterThan(0);
    expect(now().life).toBe(100);
    expect(now().wasted).toBeNull();
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
    const { game, now, simUntil, sound } = play(area(-1, -1, 1, 1), {
      start: { e: 100, n: 100, z: 8 },
    });
    const hurtSound = vi.spyOn(sound, "hurt");
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
    expect(hurtSound).toHaveBeenCalledTimes(1);
    expect(hurtSound.mock.calls[0][0]).toBeCloseTo(4 / 11, 2);
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

describe("the sound", () => {
  it("is let go with the game: its audio context closed, so walk after walk does not keep one each", () => {
    const { game, sound } = play(area(-1, -1, 1, 1), { start: { e: 100, n: 100 } });
    let closed = 0;
    const ctx = { state: "running", close: () => ((closed += 1), Promise.resolve()) };
    (sound as unknown as { ctx: unknown }).ctx = ctx;
    game.dispose();
    expect(closed).toBe(1);
  });
});

describe("parked cars after an early move", () => {
  /** One street in square 0_0; the start 3 km away, where no square is (yet) in. */
  const streetAndFar = () =>
    area(-1, -1, 1, 1, {
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

  /** The squares round (3000, 3000): in the index, never in (out of reach, or failing). */
  const farAway = () => area(14, 14, 16, 16);

  it("park all the same when you are put elsewhere before the start's squares are in", () => {
    const { game } = play(streetAndFar(), {
      start: { e: 3000, n: 3000 },
      starter: true,
      missing: farAway(),
    });
    game.sim(0.5);
    // a walk link followed while walking, in the first second
    game.teleport(100, 109);
    game.sim(3);
    expect(game.vehicles().filter((v) => v.state === "parked").length).toBeGreaterThan(10);
  });

  it("park all the same when the start's squares never come in", () => {
    const { game } = play(streetAndFar(), {
      start: { e: 3000, n: 3000 },
      starter: true,
      missing: farAway(),
    });
    // walked over to the street on foot, no teleport: the starter's wait ends by itself
    const p = (game as unknown as { player: { e: number; n: number } }).player;
    game.sim(0.5);
    p.e = 100;
    p.n = 109;
    game.sim(25);
    expect(game.vehicles().filter((v) => v.state === "parked").length).toBeGreaterThan(10);
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
  it("tied with a corner over the pier are set clear of it, and sail away", () => {
    // the pier's edge at e = 100; a speedboat (2.4 m wide) tied with its side 1.2 m over it
    const quay = (i: number, j: number) => waterRect(i, j, 100, j * 200, 200, j * 200 + 200);
    const water = { mask: { mode: 1 as const, bits: null } };
    const cells = area(-1, -1, 2, 1, {
      "0_-1": { mask: quay(0, -1) },
      "0_0": { mask: quay(0, 0), moorings: [{ e: 100, n: 100, heading: 0, kind: "speedboat" }] },
      "0_1": { mask: quay(0, 1) },
      "1_-1": water,
      "1_0": water,
      "1_1": water,
      "2_-1": water,
      "2_0": water,
      "2_1": water,
    });
    const { game, now } = play(cells, { start: { e: 99, n: 100, yaw: Math.PI / 2 } });
    game.sim(0.2);
    const boat = game.vehicles().find((v) => v.kind === "speedboat")!;
    expect(boat.e).toBeGreaterThanOrEqual(100 + 1.2);
    expect(boat.e).toBeLessThan(104);
    game.keyDown("KeyF");
    game.keyUp("KeyF");
    game.sim(0.1);
    expect(now().mode).toBe("boat");
    game.keyDown("KeyW");
    game.sim(3);
    expect(boat.n).toBeGreaterThan(110);
  });

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
