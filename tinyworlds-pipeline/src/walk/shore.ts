/**
 * How far the water is from the land: per 2 m cell of every square with water, the distance to
 * the nearest land in cells (2 m steps), 0 on land, capped at 255. Measured over the whole city,
 * so a harbour square knows the shore in the next square; a square that is not there counts as
 * land, as the edge of the map is a wall. The viewer shades the water by it (deep away from land,
 * a shallow band and lapping along the shore).
 */
import { distanceTransform } from "../scene/fog.js";
import { cellKey } from "./grid.js";

const SIDE = 100;
export const SHORE_CAP = 255;
/** Cells round a square that can hold its nearest land: anything farther is past the cap. */
const REACH = SHORE_CAP + 1;
const WIDE = SIDE + 2 * REACH;
/** Squares round a square that the reach takes in: its shore is measured from their masks. */
export const SHORE_SQUARES = Math.ceil(REACH / SIDE);

const hasWater = (mask: Uint8Array): boolean => mask[0] !== 0;

/**
 * The `shore` array of each square with water among those asked for (all of them by default),
 * from every square's mask (`[0]` land, `[1]` water, `[2, …bits]` mixed).
 */
export function shoreDistances(
  masks: Map<string, Uint8Array>,
  want: Iterable<string> = masks.keys(),
): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const land = new Uint8Array(WIDE * WIDE);
  for (const key of want) {
    const own = masks.get(key);
    if (!own || !hasWater(own)) continue;
    const [i, j] = key.split("_").map(Number);

    // open water all round: nothing to measure
    let open = true;
    for (let dj = -SHORE_SQUARES; dj <= SHORE_SQUARES && open; dj++)
      for (let di = -SHORE_SQUARES; di <= SHORE_SQUARES && open; di++)
        open = masks.get(cellKey(i + di, j + dj))?.[0] === 1;
    if (open) {
      out.set(key, new Uint8Array(SIDE * SIDE).fill(SHORE_CAP));
      continue;
    }

    // the land within reach, the square in the middle; a missing square stays land
    land.fill(1);
    for (let dj = -SHORE_SQUARES; dj <= SHORE_SQUARES; dj++)
      for (let di = -SHORE_SQUARES; di <= SHORE_SQUARES; di++) {
        const m = masks.get(cellKey(i + di, j + dj));
        if (!m || m[0] === 0) continue;
        const x0 = Math.max(0, -(di * SIDE + REACH));
        const x1 = Math.min(SIDE, WIDE - (di * SIDE + REACH));
        const y0 = Math.max(0, -(dj * SIDE + REACH));
        const y1 = Math.min(SIDE, WIDE - (dj * SIDE + REACH));
        for (let y = y0; y < y1; y++) {
          const row = (dj * SIDE + REACH + y) * WIDE + di * SIDE + REACH;
          if (m[0] === 1) land.fill(0, row + x0, row + x1);
          else
            for (let x = x0; x < x1; x++) {
              const b = x + SIDE * y;
              if ((m[1 + (b >> 3)] >> (b & 7)) & 1) land[row + x] = 0;
            }
        }
      }

    const d = distanceTransform(land, WIDE, WIDE);
    const shore = new Uint8Array(SIDE * SIDE);
    for (let y = 0; y < SIDE; y++)
      for (let x = 0; x < SIDE; x++)
        shore[x + SIDE * y] = Math.min(SHORE_CAP, Math.round(d[(REACH + y) * WIDE + REACH + x]));
    out.set(key, shore);
  }
  return out;
}
