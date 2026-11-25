/**
 * Boats tied up along piers, as the walk finds them: some piers have a row of them on their water
 * sides, chosen by hash, so the same boats are there every visit.
 */
import { mix } from "../scene/hash.js";

export interface Mooring {
  e: number;
  n: number;
  /** Radians from north, clockwise, in [0, 2π): along the pier's edge. */
  heading: number;
  kind: "speedboat" | "motorboat";
}

/** Metres between boats along an edge. */
const SPACING = 12;
/** Metres from the edge to a boat's middle; the water must reach a little past it. */
const OUT = 2.5;
const WATER_OUT = 3;
/** Metres inside the edge that must be the pier, so a boat is tied on the pier's own side. */
const PIER_IN = 1;

/**
 * The boats along the piers given (each a polygon's rings, flat e, n, the outer first). A pier is
 * given boats when its index passes a hash; along each edge of its outer ring as many as fit 12 m
 * apart, centred on the edge, each 2.5 m out on whichever side is water.
 */
export function mooringsOf(
  piers: number[][][],
  isWater: (e: number, n: number) => boolean,
  everyPier = false,
): Mooring[] {
  const out: Mooring[] = [];
  piers.forEach((rings, index) => {
    if (!everyPier && mix(index, 77) % 3 !== 0) return;
    const ring = rings[0];
    if (!ring || ring.length < 6) return;
    const count = ring.length / 2;
    let boat = 0;
    for (let v = 0; v < count; v++) {
      const e0 = ring[v * 2];
      const n0 = ring[v * 2 + 1];
      const e1 = ring[((v + 1) % count) * 2];
      const n1 = ring[((v + 1) % count) * 2 + 1];
      const length = Math.hypot(e1 - e0, n1 - n0);
      const fits = Math.floor(length / SPACING);
      if (fits === 0) continue;
      const ue = (e1 - e0) / length;
      const un = (n1 - n0) / length;
      let heading = Math.atan2(ue, un);
      if (heading < 0) heading += 2 * Math.PI;
      const first = (length - (fits - 1) * SPACING) / 2;
      for (let b = 0; b < fits; b++) {
        const pe = e0 + ue * (first + b * SPACING);
        const pn = n0 + un * (first + b * SPACING);
        // the water side, whichever way the ring runs
        for (const side of [1, -1]) {
          const ne = un * side;
          const nn = -ue * side;
          if (
            !isWater(pe + ne * WATER_OUT, pn + nn * WATER_OUT) ||
            isWater(pe - ne * PIER_IN, pn - nn * PIER_IN)
          )
            continue;
          out.push({
            e: pe + ne * OUT,
            n: pn + nn * OUT,
            heading,
            kind: mix(index, boat) % 3 === 0 ? "speedboat" : "motorboat",
          });
          boat++;
          break;
        }
      }
    }
  });
  return out;
}
