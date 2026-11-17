import type { StreetEdge, WalkCell, WalkEdge } from "./cell";
import { CELL } from "./geo";
import { HEIGHT, RADIUS } from "./player";
import type { WalkWorld } from "./world";

const NEAR = 20;
const FAR = 60;
const FARTHEST = 200;
/** A sidewalk spot must be this far from any street's paved strip. */
const CLEAR = 2;
/** Candidate points per sidewalk edge, spread along it. */
const SAMPLES = 4;

interface Candidate {
  e: number;
  n: number;
  yaw: number;
}

const strip = (s: StreetEdge, e: number, n: number): number => {
  const p = s.pts;
  let best = Infinity;
  for (let q = 3; q < p.length; q += 3) {
    const ae = p[q - 3];
    const an = p[q - 2];
    const de = p[q] - ae;
    const dn = p[q + 1] - an;
    const len2 = de * de + dn * dn;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((e - ae) * de + (n - an) * dn) / len2)) : 0;
    best = Math.min(best, Math.hypot(e - (ae + de * t), n - (an + dn * t)));
  }
  return best - s.width / 2;
};

/** Points along an edge, each with the heading of the stretch it is on. */
function samples(w: WalkEdge): Candidate[] {
  const p = w.pts;
  const segs = p.length / 3 - 1;
  const out: Candidate[] = [];
  if (segs < 1) return out;
  for (let k = 0; k < SAMPLES; k++) {
    const f = ((k + 0.5) / SAMPLES) * segs;
    const q = Math.min(segs - 1, Math.floor(f));
    const t = f - q;
    const de = p[q * 3 + 3] - p[q * 3];
    const dn = p[q * 3 + 4] - p[q * 3 + 1];
    if (Math.hypot(de, dn) < 1e-6) continue;
    out.push({ e: p[q * 3] + de * t, n: p[q * 3 + 1] + dn * t, yaw: Math.atan2(de, dn) });
  }
  return out;
}

/**
 * Where you come to after going down: a sidewalk point 20 to 60 m from (e, n) (out to 200 m when
 * there is none), on land and out of walls and the street's traffic, facing along the sidewalk.
 */
export function comeTo(
  world: WalkWorld,
  e: number,
  n: number,
  random: () => number,
): Candidate | null {
  const cells = new Map<string, WalkCell>();
  for (const c of world.cells()) cells.set(c.key, c);
  const seen = new Set<string>();
  const all: Candidate[] = [];
  for (const c of cells.values())
    for (const w of c.walks) {
      if (w.crosswalk || w.elevated || seen.has(w.key)) continue;
      seen.add(w.key);
      all.push(...samples(w));
    }

  const clearOfStreets = (c: Candidate) => {
    const i = Math.floor(c.e / CELL);
    const j = Math.floor(c.n / CELL);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++)
        for (const s of cells.get(`${i + di}_${j + dj}`)?.streets ?? [])
          if (!s.elevated && strip(s, c.e, c.n) <= CLEAR) return false;
    return true;
  };

  for (const limit of [FAR, FARTHEST]) {
    const ok = all.filter((c) => {
      const d = Math.hypot(c.e - e, c.n - n);
      return (
        d >= NEAR &&
        d <= limit &&
        world.inData(c.e, c.n) &&
        !world.isWater(c.e, c.n) &&
        !world.blocked(c.e, c.n, RADIUS, 0, HEIGHT) &&
        clearOfStreets(c)
      );
    });
    if (ok.length === 0) continue;
    const pick = ok[Math.min(ok.length - 1, Math.floor(random() * ok.length))];
    // either way along the sidewalk
    return { e: pick.e, n: pick.n, yaw: random() < 0.5 ? pick.yaw : pick.yaw + Math.PI };
  }
  return null;
}
