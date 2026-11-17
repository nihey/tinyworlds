import type { MapFrame } from "@/walk/load";
import { WORLD } from "@/worlds";
import type { MapEngine } from "./engine";
import type { Geo } from "./manifest";
import { PERSON, PERSON_H, PERSON_W, personColours } from "./person";

/**
 * The street walk on the map: where you are while you walk (the little person, and a cone the
 * way you face), and while the person is carried over the map the ways it can be put down on,
 * lit in the accent. Both are scene layers drawn whatever "life on the map" says; they are
 * signs, not life. Both go through the engine's own projection (north up or turned to the
 * street grid: the map's, not the walk's). Reached by dynamic import, with the rest of the walk.
 */

const RAD = Math.PI / 180;
/** Screen px per pixel of the person. */
const PERSON_PX = 2;
/** The cone's reach on screen, CSS px, and its half-angle. */
const CONE = 30;
const CONE_HALF = 32 * RAD;
const INK = "#15171a";

/** A ground move of (de, dn) metres as a move in map px of a map drawn with `geo` (the
 * projection is linear). */
function moveToMap(geo: Geo, de: number, dn: number): { x: number; y: number } {
  const s = Math.sin(geo.betaDeg * RAD);
  const c = Math.cos(geo.betaDeg * RAD);
  const p = de * s + dn * c;
  const q = de * c - dn * s;
  return { x: (p + q) * geo.k, y: ((q - p) * geo.k) / 2 };
}

/** Where you are, for the map: on the ground at (lon, lat), `z` metres up (a deck), facing `heading`° from north. */
export interface WalkerAt {
  lat: number;
  lon: number;
  heading: number;
  z: number;
}

/** Map px of where you stand: the ground point raised by your height, as the map draws decks. */
export function walkerPoint(engine: MapEngine, at: WalkerAt): { x: number; y: number } {
  const p = engine.projection.toMap(at.lon, at.lat);
  return { x: p.x, y: p.y - Math.max(0, at.z) * engine.manifest.geo.kz };
}

/**
 * You on the map: a cone on the ground (or the deck) the way you face, and the person standing
 * at your feet, the same size on screen at every zoom; on a bridge, on its deck as the map draws
 * it. `get` answers where you are now (null: draw nothing). Returns the layer's remover. The
 * engine redraws it whenever the map is redrawn: whoever moves you calls `engine.invalidate()`
 * (or moves the view).
 */
export function walkerLayer(engine: MapEngine, get: () => WalkerAt | null): () => void {
  const colours = personColours(WORLD.accent.color);
  const accent = WORLD.accent.color;
  // the map's own: its projection is the one `walkerPoint` places you with
  const geo = engine.manifest.geo;
  return engine.addSceneLayer(
    (ctx, view) => {
      const at = get();
      if (!at) return;
      const p = walkerPoint(engine, at);
      const margin = 60 / view.scale;
      if (
        p.x < view.left - margin ||
        p.x > view.right + margin ||
        p.y < view.top - margin ||
        p.y > view.bottom + margin
      )
        return;
      const m = ctx.getTransform();
      const dpr = view.dpr;
      // drawn in device pixels from here, so the person is crisp and as big at every zoom
      const fx = Math.round(m.a * p.x + m.e);
      const fy = Math.round(m.d * p.y + m.f);
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // the cone: an arc of ground ahead, as the map draws the ground
      const reach = CONE / (view.scale * geo.k);
      const yaw = at.heading * RAD;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      for (let s = 0; s <= 8; s++) {
        const a = yaw - CONE_HALF + (2 * CONE_HALF * s) / 8;
        const d = moveToMap(geo, Math.sin(a) * reach, Math.cos(a) * reach);
        ctx.lineTo(fx + d.x * m.a, fy + d.y * m.d);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.38;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = Math.max(1, Math.round(dpr));
      ctx.strokeStyle = accent;
      ctx.stroke();

      // the person: a shadow, then its pixels, feet on the spot
      const u = Math.max(1, Math.round(PERSON_PX * dpr));
      const x0 = fx - Math.round((PERSON_W * u) / 2);
      const y0 = fy - PERSON_H * u + u;
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = INK;
      ctx.fillRect(x0 + u, fy, (PERSON_W - 2) * u, u);
      ctx.globalAlpha = 1;
      for (let r = 0; r < PERSON_H; r++)
        for (let c = 0; c < PERSON_W; c++) {
          const colour = colours[PERSON[r][c]];
          if (!colour) continue;
          ctx.fillStyle = colour;
          ctx.fillRect(x0 + c * u, y0 + r * u, u, u);
        }
      ctx.restore();
    },
    { always: true },
  );
}

const highlights = new WeakMap<MapEngine, { ways: Float32Array[]; off: () => void }>();

/**
 * While the person is carried over the map: the ways it can be put down on near the pointer,
 * (e, n, z) polylines in the walk's metres, placed on this map by `frame` (`mapFrame`), lit in
 * the accent over a dark edge. Null takes them away.
 */
export function dropHighlight(
  engine: MapEngine,
  lit: { ways: Float32Array[]; frame: MapFrame } | null,
): void {
  const had = highlights.get(engine);
  const ways = lit?.ways;
  if (!lit || !ways || ways.length === 0) {
    if (had) {
      had.off();
      highlights.delete(engine);
    }
    return;
  }
  const { frame } = lit;
  // into map px once: [x, y, x, y, …] per way
  const lines = ways.map((pts) => {
    const out = new Float32Array((pts.length / 3) * 2);
    for (let q = 0, o = 0; q + 2 < pts.length; q += 3, o += 2) {
      const m = frame.toMap(pts[q], pts[q + 1], pts[q + 2]);
      out[o] = m.x;
      out[o + 1] = m.y;
    }
    return out;
  });
  if (had) {
    had.ways = lines;
    engine.invalidate();
    return;
  }
  const entry = {
    ways: lines,
    off: engine.addSceneLayer(
      (ctx, view) => {
        ctx.save();
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const path = new Path2D();
        for (const line of entry.ways) {
          if (line.length < 4) continue;
          path.moveTo(line[0], line[1]);
          for (let o = 2; o < line.length; o += 2) path.lineTo(line[o], line[o + 1]);
        }
        ctx.lineWidth = 6 / view.scale;
        ctx.strokeStyle = "rgba(21, 23, 26, 0.55)";
        ctx.stroke(path);
        ctx.lineWidth = 3 / view.scale;
        ctx.strokeStyle = WORLD.accent.color;
        ctx.stroke(path);
        ctx.restore();
      },
      { always: true },
    ),
  };
  highlights.set(engine, entry);
}
