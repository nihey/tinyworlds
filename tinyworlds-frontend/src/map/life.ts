import type { MapEngine, ViewState } from "./engine";

/**
 * "Life on the map": things that move over the still tiles. Ferries work the routes in
 * life.json across the water, and its flights (tour helicopters, a plane on approach) pass
 * overhead with their shadows on the ground.
 *
 * Only things that are never hidden behind a building are animated: the viewer has the picture
 * of the city, not its depth, so a taxi would drive across the face of a tower.
 */
export interface Flight {
  kind: "helicopter" | "plane";
  /** flat [lon, lat, altMetres, lon, lat, altMetres, ...] */
  path: number[];
  /** true: a closed circuit flown forever. false: flown start to end, then hidden for `pause`. */
  loop: boolean;
  /** ground metres per second */
  speed?: number;
  /** seconds between runs when `loop` is false */
  pause?: number;
}

export interface LifeFile {
  ferries: { name: string; path: number[] }[];
  flights?: Flight[];
}

/** Ground metres per second, and seconds out of sight between runs. */
export const FLIGHT_DEFAULTS = {
  helicopter: { speed: 60 },
  plane: { speed: 75 },
  pause: 20,
} as const;

export interface Track {
  /** map px, flat */
  pts: Float32Array;
  /** distance from the start at each point */
  cum: Float32Array;
  /** metres above the ground at each point (flights only) */
  alt?: Float32Array;
  length: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Pose {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** metres above the ground; 0 on a track without altitudes */
  alt?: number;
}

export const HEADINGS = 16;

/**
 * Project a path into a track. `stride` is 2 for [lon, lat, ...] and 3 for [lon, lat, alt, ...];
 * a closed track returns to its first point.
 */
function makeTrack(
  engine: MapEngine,
  path: readonly number[],
  closed = false,
  stride: 2 | 3 = 2,
): Track | null {
  const points = Math.floor(path.length / stride);
  const count = points + (closed ? 1 : 0);
  if (points < 2) return null;
  const pts = new Float32Array(count * 2);
  const cum = new Float32Array(count);
  const alt = stride === 3 ? new Float32Array(count) : undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const j = (i % points) * stride;
    const p = engine.projection.toMap(path[j], path[j + 1]);
    pts[i * 2] = p.x;
    pts[i * 2 + 1] = p.y;
    if (alt) alt[i] = Math.max(0, path[j + 2]);
    // distance on the ground, where a screen row counts double
    if (i > 0) cum[i] = cum[i - 1] + Math.hypot(p.x - pts[i * 2 - 2], (p.y - pts[i * 2 - 1]) * 2);
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const length = cum[count - 1];
  return length > 0 ? { pts, cum, alt, length, minX, minY, maxX, maxY } : null;
}

/** Where a traveller is after `d` ground px along a track, and which way it points. */
export function poseAt(track: Track, d: number, out: Pose): Pose {
  const { pts, cum } = track;
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const t = Math.min(1, Math.max(0, (d - cum[lo]) / span));
  out.dx = pts[hi * 2] - pts[lo * 2];
  out.dy = pts[hi * 2 + 1] - pts[lo * 2 + 1];
  out.x = pts[lo * 2] + out.dx * t;
  out.y = pts[lo * 2 + 1] + out.dy * t;
  out.alt = track.alt ? track.alt[lo] + (track.alt[hi] - track.alt[lo]) * t : 0;
  return out;
}

/**
 * How far along its track a flight is at time `t` (seconds), in the track's own units, or -1
 * while it is out of sight between two runs. `phase` (0…1) staggers flights that share a clock.
 */
export function flightDistance(
  length: number,
  speed: number,
  loop: boolean,
  pause: number,
  phase: number,
  t: number,
): number {
  if (!(length > 0) || !(speed > 0)) return -1;
  if (loop) return (((((t * speed) / length + phase) % 1) + 1) % 1) * length;
  const run = length / speed;
  const cycle = run + Math.max(0, pause);
  const clock = (((t + phase * cycle) % cycle) + cycle) % cycle;
  return clock <= run ? clock * speed : -1;
}

/** Heading index for a direction in map px (ground angle, so vertical motion counts double). */
export const headingOf = (dx: number, dy: number): number =>
  ((Math.round((Math.atan2(dy * 2, dx) / (Math.PI * 2)) * HEADINGS) % HEADINGS) + HEADINGS) %
  HEADINGS;

interface Livery {
  deck: string;
  hull: string;
  cabin: string;
}

type Shape = (along: number, across: number) => boolean;
/** Fill every pixel of the sprite whose ground point, `lift` px below it, is inside the shape. */
type Plot = (lift: number, colour: string, shape: Shape) => void;

/**
 * One square sprite per heading, seen from the map's camera. Shapes are given on the ground in
 * the vehicle's own axes (along its nose, across to its right) and plotted pixel by pixel, so
 * nothing is anti-aliased; `lift` raises a layer off the ground.
 */
function headingSprites(size: number, paint: (plot: Plot) => void): HTMLCanvasElement[] {
  const half = size / 2;
  return Array.from({ length: HEADINGS }, (_, index) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    const angle = (index / HEADINGS) * Math.PI * 2;
    const hx = Math.cos(angle);
    const hy = Math.sin(angle);
    paint((lift, colour, shape) => {
      ctx.fillStyle = colour;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const gx = x + 0.5 - half;
          const gy = (y + 0.5 - half + lift) * 2;
          if (shape(gx * hx + gy * hy, -gx * hy + gy * hx)) ctx.fillRect(x, y, 1, 1);
        }
      }
    });
    return canvas;
  });
}

/** A boat: a hull a few px tall, a deck and a cabin. */
function boatSprites(
  length: number,
  beam: number,
  tall: number,
  livery: Livery,
): HTMLCanvasElement[] {
  return headingSprites(length + tall + 6, (plot) => {
    // a pointed bow, a square stern
    const hull: Shape = (along, across) =>
      along > -length / 2 &&
      along < length / 2 &&
      Math.abs(across) < (beam / 2) * Math.min(1, (length / 2 - along) / (length * 0.22) + 0.25);
    for (let lift = 0; lift < tall; lift++) plot(lift, livery.hull, hull);
    plot(tall, livery.deck, hull);
    plot(
      tall + 1,
      livery.cabin,
      (along, across) =>
        Math.abs(along + length * 0.05) < length * 0.24 && Math.abs(across) < beam * 0.3,
    );
  });
}

const SHADOW = "rgba(20, 26, 48, 0.28)";

/**
 * A regional turboprop, about 20 m long: a high straight wing with two engines, a T of a tail.
 * Returns the aircraft and, separately, its flat shadow for the ground below.
 */
function planeSprites(): { body: HTMLCanvasElement[]; shadow: HTMLCanvasElement[] } {
  const size = 78;
  const fuselage: Shape = (along, across) =>
    along > -28 &&
    along < 28 &&
    Math.abs(across) < 3.2 * Math.min(1, (28 - along) / 9 + 0.25, (along + 28) / 17 + 0.3);
  const wing: Shape = (along, across) =>
    Math.abs(across) < 31 &&
    along > 0.5 + Math.abs(across) * 0.05 &&
    along < 9 - Math.abs(across) * 0.06;
  const tailplane: Shape = (along, across) =>
    Math.abs(across) < 11 && along > -28 && along < -22.5 - Math.abs(across) * 0.12;
  const nacelle: Shape = (along, across) =>
    Math.abs(Math.abs(across) - 11.5) < 2 && along > 3 && along < 14.5;
  const propeller: Shape = (along, across) =>
    Math.abs(Math.abs(across) - 11.5) < 5.5 && along >= 14.5 && along < 16;
  const fin: Shape = (along, across) => Math.abs(across) < 1.2 && along > -28 && along < -19;
  const cockpit: Shape = (along, across) => Math.abs(across) < 2.3 && along > 19.5 && along < 24;

  const body = headingSprites(size, (plot) => {
    plot(0, "#8f9ba8", fuselage);
    plot(1, "#c5ced6", fuselage);
    plot(2, "#f3f5f7", fuselage);
    plot(2, "#27374d", cockpit);
    plot(2, "#d9e0e6", tailplane);
    plot(2, "#99a5b1", wing);
    plot(2, "#4c5764", nacelle);
    plot(3, "#e8ecf0", wing);
    plot(3, "#5d6977", nacelle);
    plot(3, "rgba(34, 40, 52, 0.5)", propeller);
    for (let lift = 3; lift <= 8; lift++) plot(lift, lift === 8 ? "#4a8be8" : "#2f6fd6", fin);
  });
  const shadow = headingSprites(size, (plot) => {
    plot(
      0,
      SHADOW,
      (along, across) => fuselage(along, across) || wing(along, across) || tailplane(along, across),
    );
  });
  return { body, shadow };
}

const FERRY: Livery = { deck: "#f1efe6", hull: "#2f4f7c", cabin: "#c9d3da" };
const STATEN_ISLAND: Livery = { deck: "#f3e7d0", hull: "#e8822e", cabin: "#f6f2e6" };
const WATER_TAXI: Livery = { deck: "#f7d038", hull: "#2b2f36", cabin: "#fff3b0" };

interface Aircraft {
  kind: Flight["kind"];
  track: Track;
  loop: boolean;
  /** ground px per second */
  speed: number;
  pause: number;
  phase: number;
  /** the most the flight ever rises on screen, px */
  top: number;
}

interface Ferry {
  track: Track;
  sprites: HTMLCanvasElement[];
  /** ground px per second */
  speed: number;
  phase: number;
  pause: number;
}

/**
 * Start the life layer. Returns a function that removes it.
 */
export function createLife(engine: MapEngine, file: LifeFile): () => void {
  const big = boatSprites(30, 11, 4, FERRY);
  const orange = boatSprites(38, 13, 5, STATEN_ISLAND);
  const small = boatSprites(18, 7, 3, WATER_TAXI);

  const ferries: Ferry[] = [];
  file.ferries.forEach((route, i) => {
    const track = makeTrack(engine, route.path);
    if (!track || track.length < 400) return;
    const staten = /staten island/i.test(route.name);
    const short = track.length < 2600;
    ferries.push({
      track,
      sprites: staten ? orange : short ? small : big,
      speed: staten ? 62 : short ? 44 : 54,
      phase: (i * 0.618034) % 1,
      pause: 5,
    });
  });

  // metres → the track's units: ground px, where a screen row counts double
  const { k, kz } = engine.manifest.geo;
  const pxPerMetre = k * Math.SQRT2;
  const risePerMetre = Number.isFinite(kz) && kz > 0 ? kz : k * Math.sqrt(1.5);
  const flights: Aircraft[] = [];
  (file.flights ?? []).forEach((flight, i) => {
    const track = makeTrack(engine, flight.path, flight.loop, 3);
    if (!track) return;
    flights.push({
      kind: flight.kind,
      track,
      loop: flight.loop,
      speed: (flight.speed ?? FLIGHT_DEFAULTS[flight.kind].speed) * pxPerMetre,
      pause: flight.pause ?? FLIGHT_DEFAULTS.pause,
      phase: (i * 0.37) % 1,
      top: Math.max(...(track.alt ?? [0])) * risePerMetre,
    });
  });
  const plane = flights.some((f) => f.kind === "plane") ? planeSprites() : null;

  const pose: Pose = { x: 0, y: 0, dx: 1, dy: 0 };

  const draw = (ctx: CanvasRenderingContext2D, view: Readonly<ViewState>, timeMs: number): void => {
    const t = timeMs / 1000;
    const margin = 64;

    // ---- ferries: out, a pause at the slip, back
    if (view.scale >= 0.1) {
      for (const ferry of ferries) {
        const { track } = ferry;
        if (
          track.maxX < view.left - margin ||
          track.minX > view.right + margin ||
          track.maxY < view.top - margin ||
          track.minY > view.bottom + margin
        )
          continue;
        const leg = track.length / ferry.speed + ferry.pause;
        const clock = (t + ferry.phase * leg * 2) % (leg * 2);
        const back = clock >= leg;
        const along = Math.min(1, (back ? clock - leg : clock) / (leg - ferry.pause));
        const d = (back ? 1 - along : along) * track.length;
        poseAt(track, d, pose);
        const sign = back ? -1 : 1;
        const heading = headingOf(pose.dx * sign, pose.dy * sign);
        const sprite = ferry.sprites[heading];
        const x = Math.round(pose.x - sprite.width / 2);
        const y = Math.round(pose.y - sprite.height / 2);
        if (along > 0.01 && along < 0.99) {
          // the wake: foam falling behind, fading as it goes
          const len = Math.hypot(pose.dx, pose.dy * 2) || 1;
          const ux = (pose.dx / len) * sign;
          const uy = ((pose.dy * 2) / len) * sign;
          for (let i = 1; i <= 6; i++) {
            const back = sprite.width * 0.32 + i * 5 + ((t * 20) % 5);
            const spread = ((i * 7919 + Math.floor(t * 4)) % 3) - 1 + (i % 2 ? i * 0.5 : -i * 0.5);
            ctx.fillStyle = `rgba(214, 238, 244, ${0.62 - i * 0.09})`;
            ctx.fillRect(
              Math.round(pose.x - ux * back + -uy * spread),
              Math.round(pose.y - (uy * back) / 2 + (ux * spread) / 2),
              2,
              1,
            );
          }
        }
        ctx.drawImage(sprite, x, y);
      }
    }

    // ---- flights: a shadow on the ground, the machine above it
    if (view.scale >= 0.2) {
      for (const flight of flights) {
        const { track } = flight;
        if (
          track.maxX < view.left - flight.top / 1.05 - 60 ||
          track.minX > view.right + 60 ||
          track.maxY < view.top - 60 ||
          track.minY - flight.top > view.bottom + 60
        )
          continue;
        const d = flightDistance(
          track.length,
          flight.speed,
          flight.loop,
          flight.pause,
          flight.phase,
          t,
        );
        if (d < 0) continue;
        poseAt(track, d, pose);
        const rise = (pose.alt ?? 0) * risePerMetre;
        // the sun is low on the left: a shadow lands to the right of what casts it
        const reach = rise / 1.05;
        if (
          pose.x < view.left - reach - 60 ||
          pose.x > view.right + 60 ||
          pose.y < view.top - 40 ||
          pose.y - rise > view.bottom + 40
        )
          continue;
        const x = Math.round(pose.x);
        const y = Math.round(pose.y);
        const sx = Math.round(pose.x + reach);
        const top = Math.round(pose.y - rise);

        if (flight.kind === "plane" && plane) {
          const heading = headingOf(pose.dx, pose.dy);
          const sprite = plane.body[heading];
          const half = sprite.width / 2;
          ctx.drawImage(plane.shadow[heading], Math.round(sx - half), Math.round(y - half));
          ctx.drawImage(sprite, Math.round(x - half), Math.round(top - half));
          continue;
        }

        ctx.fillStyle = SHADOW;
        ctx.fillRect(sx - 3, y - 1, 9, 3);
        ctx.fillRect(sx - 1, y - 2, 5, 5);
        const right = pose.dx >= 0 ? 1 : -1;
        // tail boom (trailing, joined to the body), body, canopy, skids
        ctx.fillStyle = "#273a5c";
        ctx.fillRect(right > 0 ? x - 11 : x + 5, top, 7, 1);
        ctx.fillStyle = "#35507f";
        ctx.fillRect(x - 4, top - 2, 9, 5);
        ctx.fillStyle = "#bfe3f2";
        ctx.fillRect(x + (right > 0 ? 2 : -4), top - 1, 3, 2);
        ctx.fillStyle = "#1c2233";
        ctx.fillRect(x - 4, top + 4, 9, 1);
        // the rotor: two frames, a blur of blades
        ctx.fillStyle =
          Math.floor(t * 14) % 2 === 0 ? "rgba(30, 34, 46, 0.85)" : "rgba(30, 34, 46, 0.4)";
        if (Math.floor(t * 14) % 2 === 0) ctx.fillRect(x - 8, top - 4, 17, 1);
        else ctx.fillRect(x - 4, top - 4, 9, 1);
      }
    }
  };

  return engine.addSceneLayer(draw);
}
