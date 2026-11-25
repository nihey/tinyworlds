import type { WalkIndex } from "./walk-index";

/**
 * Tunnels for you: going into a portal (across its roadway) takes you through in the dark, for as
 * long as the tunnel would take at your speed (8 s at most), and out of its other portal; a
 * tunnel whose other end is off the map is closed by a barrier. No three.js.
 */

/** A portal reaches this far along the way into it, either side of its line, and either side of the roadway's middle, m. */
const REACH = 3;
const WIDE = 6;
/** Through a tunnel at no less than this, m/s; the dark lasts no longer than this, s. */
const SLOWEST = 3;
const LONGEST = 8;
/** You come out this far beyond the far portal, m. */
const OUT = 4;

export type Crossing =
  | { closed: true }
  | {
      closed: false;
      /** how long the dark lasts */
      seconds: number;
      /** where you come out, facing out of the far portal, at the speed you went in */
      e: number;
      n: number;
      yaw: number;
      speed: number;
    };

/**
 * Whether the step that brought you to (e, n), moving (de, dn) in h seconds, went into a portal:
 * a closed tunnel's barrier, or the way through an open one. Null when it went into none.
 */
export function portalCrossed(
  tunnels: WalkIndex["tunnels"],
  e: number,
  n: number,
  de: number,
  dn: number,
  h: number,
): Crossing | null {
  if (!(h > 0)) return null;
  for (const t of tunnels)
    for (const [end, other] of [
      [t.a, t.b],
      [t.b, t.a],
    ] as const) {
      if (!end) continue;
      const ue = Math.sin(end[2]);
      const un = Math.cos(end[2]);
      const along = (e - end[0]) * ue + (n - end[1]) * un;
      const across = (e - end[0]) * un - (n - end[1]) * ue;
      if (Math.abs(along) > REACH || Math.abs(across) > WIDE) continue;
      if (de * ue + dn * un <= 0) continue;
      if (!other) return { closed: true };
      const speed = Math.hypot(de, dn) / h;
      const yaw = other[2] + Math.PI;
      return {
        closed: false,
        seconds: Math.min(LONGEST, t.length / Math.max(SLOWEST, speed)),
        e: other[0] + Math.sin(yaw) * OUT,
        n: other[1] + Math.cos(yaw) * OUT,
        yaw,
        speed,
      };
    }
  return null;
}
