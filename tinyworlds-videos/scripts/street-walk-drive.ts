import type { Page } from "puppeteer-core";

interface DriveCamera {
  back: number;
  side: number;
  up: number;
  turn: number;
  pitch: number;
  fov: number;
}

interface DriveShot {
  /** Road centre in the recorded game map. */
  lat: number;
  lon: number;
  heading: number;
  lane: number;
  seconds: number;
  speed: number;
  camera: DriveCamera;
  crossing?: boolean;
}

export const DRIVE_SHOTS = {
  "drive-times": {
    lat: 40.7585,
    lon: -73.985149,
    heading: 209,
    lane: -1.55,
    seconds: 2.1,
    speed: 8,
    camera: { back: 8.5, side: 2.3, up: 3.15, turn: -0.12, pitch: -0.105, fov: 67 },
    crossing: true,
  },
  "drive-world-trade": {
    lat: 40.709932,
    lon: -74.0147,
    heading: 14,
    lane: 0.8,
    seconds: 1.8,
    speed: 12,
    camera: { back: 13, side: -1.8, up: 3.25, turn: 0.13, pitch: 0.24, fov: 83 },
  },
  "drive-vessel": {
    lat: 40.75448,
    lon: -74.00295,
    heading: 209,
    lane: -1.85,
    seconds: 1.8,
    speed: 10,
    camera: { back: 5, side: 8, up: 6.5, turn: -0.97, pitch: -0.04, fov: 79 },
  },
  "drive-park": {
    lat: 40.765022,
    lon: -73.974677,
    heading: 299,
    lane: 2.8,
    seconds: 1.8,
    speed: 12,
    camera: { back: 9.7, side: -0.8, up: 3.5, turn: 0.19, pitch: -0.12, fov: 68 },
  },
} satisfies Record<string, DriveShot>;

export type DriveName = keyof typeof DRIVE_SHOTS;
export function isDriveName(name: string): name is DriveName {
  return Object.hasOwn(DRIVE_SHOTS, name);
}

interface Vehicle {
  id: number;
  kind: string;
  boat: boolean;
  state: string;
  e: number;
  n: number;
  z: number;
  yaw: number;
  color: number;
  v: number;
  vs: number;
  vz: number;
  w: number;
  damage: number;
}

interface Extra {
  state: string;
  side: number;
  cool: number;
  look: { top: number };
}
interface Crossing {
  key: string;
  a: number;
  b: number;
  pts: Float32Array;
  length: number;
  crosswalk: boolean;
  phase: number;
  elevated: boolean;
}

interface DriveGame {
  world: { index: { geo: { lon0: number; lat0: number } } };
  view: { setCamera(e: number, n: number, z: number, yaw: number, pitch: number, fov: number): void };
  traffic: { budget: number; cars: Vehicle[] };
  crowd: {
    wayOf(edge: Crossing): object;
    make(way: object, dir: 1 | -1, start: number): Extra;
    people: Extra[];
  };
  state: { mode: string };
  vehicles(): Vehicle[];
  add(car: Vehicle): void;
  enter(car: Vehicle): void;
  stick(steer: number, throttle: number): void;
  camera(dt: number): void;
}

type DriveWindow = Window & {
  filmWalk: () => DriveGame;
  filmDrive?: { car: Vehicle; extras: Extra[]; hits: number[]; e: number; n: number };
};

export async function stageDrive(page: Page, name: DriveName): Promise<void> {
  await page.evaluate((shot: DriveShot) => {
    const stage = window as unknown as DriveWindow;
    const game = stage.filmWalk();
    const parked = game.vehicles().find((v) => !v.boat && v.state === "parked");
    if (!parked) throw new Error("No vehicle loaded for the take");
    const { lon0, lat0 } = game.world.index.geo;
    const rad = Math.PI / 180;
    const m = 6371008.8 * rad;
    const yaw = shot.heading * rad;
    const east = Math.sin(yaw);
    const north = Math.cos(yaw);
    const e = (shot.lon - lon0) * m * Math.cos(lat0 * rad) + north * shot.lane;
    const n = (shot.lat - lat0) * m - east * shot.lane;
    const car: Vehicle = {
      ...parked,
      id: -1,
      kind: "supercar",
      color: 0,
      state: "loose",
      e,
      n,
      z: 0,
      yaw,
      v: shot.speed,
      vs: 0,
      vz: 0,
      w: 0,
      damage: 0,
    };
    // Reserve a short lane for the take in the simulated traffic. Keep nearby streets occupied.
    const traffic = game.traffic.cars;
    for (let i = traffic.length - 1; i >= 0; i--) {
      const de = traffic[i].e - e;
      const dn = traffic[i].n - n;
      const along = de * east + dn * north;
      if (along > -12 && along < 50 && Math.abs(de * north - dn * east) < 2.5) traffic.splice(i, 1);
    }
    game.traffic.budget = Math.floor(game.traffic.budget * 0.75);
    game.add(car);
    game.enter(car);
    game.stick(0, -0.37);
    document.documentElement.classList.add("walk-capture-clean");

    const extras: Extra[] = [];
    if (shot.crossing) {
      // Two game characters cross a short, staged path. Their contact and fall come from the
      // ordinary crowd simulation. The path and camera exist only in this filmed take.
      for (const [i, ahead] of [10.5, 15.0].entries()) {
        const x = e + east * ahead;
        const y = n + north * ahead;
        const way = game.crowd.wayOf({
          key: `film-crossing-${i}`,
          a: -10 - i * 2,
          b: -11 - i * 2,
          pts: Float32Array.of(x - north * 6, y + east * 6, 0, x + north * 6, y - east * 6, 0),
          length: 12,
          crosswalk: true,
          phase: 0,
          elevated: false,
        });
        const extra = game.crowd.make(way, i === 0 ? 1 : -1, i === 0 ? 4.65 : 4.0);
        extra.side = 0;
        extra.cool = 3;
        extra.look.top = i === 0 ? 1 : 4;
        game.crowd.people.push(extra);
        extras.push(extra);
      }
    }

    const original = game.camera.bind(game);
    const camera = shot.camera;
    const hits: number[] = [];
    let seconds = 0;
    game.camera = (dt) => {
      original(dt);
      seconds += dt;
      if (extras.filter((extra) => extra.state === "down").length > hits.length) {
        hits.push(Math.round(seconds * 100) / 100);
      }
      const s = Math.sin(car.yaw);
      const c = Math.cos(car.yaw);
      game.view.setCamera(
        car.e - s * camera.back + c * camera.side,
        car.n - c * camera.back - s * camera.side,
        car.z + camera.up,
        car.yaw + camera.turn,
        camera.pitch,
        camera.fov,
      );
    };
    stage.filmDrive = { car, extras, hits, e, n };
  }, DRIVE_SHOTS[name]);
}

export async function driveResult(page: Page) {
  return page.evaluate(() => {
    const { car, extras, hits, e, n } = (window as unknown as DriveWindow).filmDrive!;
    return {
      metres: Math.round(Math.hypot(car.e - e, car.n - n) * 10) / 10,
      damage: car.damage,
      speed: car.v,
      down: extras.filter((extra) => extra.state === "down").length,
      hits,
    };
  });
}
