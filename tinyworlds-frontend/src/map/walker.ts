import type { MapFrame } from "@/walk/load";
import { WORLD } from "@/worlds";
import type { MapEngine } from "./engine";

/**
 * The street walk on the map: while the person is carried over the map, the ways it can be put
 * down on, lit in the accent. A scene layer drawn whatever "life on the map" says (it is a sign,
 * not life), placed through the engine's own projection (north up or turned to the street grid:
 * the map's, not the walk's). Reached by dynamic import, with the rest of the walk. While you
 * walk the map is covered and still; the walk's own minimap shows where you are.
 */

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
