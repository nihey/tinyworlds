import type { Drop } from "@/walk/drop";
import type { DropGround, MapFrame } from "@/walk/load";
import { WORLD } from "@/worlds";
import type { MapEngine } from "./engine";

/**
 * While the person is carried, the baked map recedes behind the nearby walkable network.
 * The ways and landing point use the map's projection, including the height of bridge decks.
 */

type Point = { x: number; y: number };

interface DropPreview {
  frame: MapFrame;
  ways: Float32Array[];
  ground: DropGround;
  pointer: Point;
  /** Radius of the street preview in metres. */
  reach: number;
  drop: Drop | null;
}

interface ProjectedPreview {
  path: Path2D;
  ground: { paths: Path2D[]; rgb: string; opacity: number }[];
  pointer: Point;
  radius: number;
  landing: Point | null;
}

const highlights = new WeakMap<MapEngine, { preview: ProjectedPreview | null; off: () => void }>();

const GROUND_INK = [
  { kind: "green", rgb: "125, 163, 117", opacity: 0.7 },
  { kind: "paved", rgb: "193, 167, 126", opacity: 0.59 },
  { kind: "footprints", rgb: "170, 185, 198", opacity: 0.68 },
] as const;

function areaPath(frame: MapFrame, rings: Float32Array[]): Path2D {
  const path = new Path2D();
  for (const ring of rings) {
    if (ring.length < 6) continue;
    const first = frame.toMap(ring[0], ring[1], 0);
    path.moveTo(first.x, first.y);
    for (let i = 2; i + 1 < ring.length; i += 2) {
      const p = frame.toMap(ring[i], ring[i + 1], 0);
      path.lineTo(p.x, p.y);
    }
    path.closePath();
  }
  return path;
}

function fadeAt(
  ctx: CanvasRenderingContext2D,
  { x, y }: Point,
  reach: number,
  rgb: string,
  opacity: number,
): CanvasGradient {
  const fade = ctx.createRadialGradient(x, y, 0, x, y, reach);
  fade.addColorStop(0, `rgba(${rgb}, ${opacity})`);
  fade.addColorStop(0.57, `rgba(${rgb}, ${opacity * 0.8})`);
  fade.addColorStop(1, `rgba(${rgb}, 0)`);
  return fade;
}

function project({ frame, ways, ground, pointer, reach, drop }: DropPreview): ProjectedPreview {
  const path = new Path2D();
  for (const pts of ways) {
    if (pts.length < 6) continue;
    const first = frame.toMap(pts[0], pts[1], pts[2]);
    path.moveTo(first.x, first.y);
    for (let i = 3; i + 2 < pts.length; i += 3) {
      const p = frame.toMap(pts[i], pts[i + 1], pts[i + 2]);
      path.lineTo(p.x, p.y);
    }
  }
  return {
    path,
    ground: GROUND_INK.map(({ kind, rgb, opacity }) => ({
      paths: ground[kind].map((rings) => areaPath(frame, rings)),
      rgb,
      opacity,
    })),
    pointer,
    radius: reach * frame.k,
    landing: drop && frame.toMap(drop.e, drop.n, drop.z),
  };
}

/** A drag can show the dimmed map before its nearby streets have loaded. */
export function dropHighlight(engine: MapEngine, active: boolean, candidate?: DropPreview): void {
  const had = highlights.get(engine);
  if (!active) {
    if (had) {
      had.off();
      highlights.delete(engine);
    }
    return;
  }
  const preview = candidate ? project(candidate) : null;
  if (had) {
    had.preview = preview;
    engine.invalidate();
    return;
  }
  const entry = {
    preview,
    off: engine.addSceneLayer(
      (ctx, view) => {
        ctx.save();
        ctx.fillStyle = "rgba(21, 23, 26, 0.68)";
        ctx.fillRect(
          view.left - 1,
          view.top - 1,
          view.right - view.left + 2,
          view.bottom - view.top + 2,
        );
        const current = entry.preview;
        if (!current) {
          ctx.restore();
          return;
        }

        const { path, ground, pointer, radius, landing } = current;
        const px = 1 / view.scale;
        const reach = Math.max(84 * px, Math.min(radius, 300 * px));
        for (const { paths, rgb, opacity } of ground) {
          if (paths.length === 0) continue;
          ctx.fillStyle = fadeAt(ctx, pointer, reach, rgb, opacity);
          for (const area of paths) ctx.fill(area, "evenodd");
        }

        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.lineWidth = 3.5 * px;
        ctx.strokeStyle = fadeAt(ctx, pointer, reach, "244, 242, 236", 1);
        ctx.stroke(path);

        if (landing) {
          ctx.beginPath();
          ctx.arc(landing.x, landing.y, 7 * px, 0, Math.PI * 2);
          ctx.fillStyle = "#15171a";
          ctx.fill();
          ctx.lineWidth = 3 * px;
          ctx.strokeStyle = WORLD.accent.color;
          ctx.stroke();
        }
        ctx.restore();
      },
      { always: true },
    ),
  };
  highlights.set(engine, entry);
}
