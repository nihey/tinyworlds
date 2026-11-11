import type { PlaceType } from "./build.js";

/**
 * Sights: the structures on the map that light up under the pointer. A sight is one building,
 * stadium, statue or bridge that one or more search entries point at.
 */

/** Where a search entry came from. */
export type Source = "curated" | "building" | "poi" | "station";

/** What a sight is called in its sign: a place type, or a building named by its own name. */
export type SightType = PlaceType | "building";

/** A search entry that may name a structure. `order` is its position in the index. */
export interface Candidate {
  n: string;
  t: PlaceType;
  b?: string;
  r: number;
  lon: number;
  lat: number;
  order: number;
  src: Source;
  /** a building entry's own building (hashString of its id), when it comes from the building data */
  seed?: number;
}

/** The structure an entry stands on: one key per structure, its volumes in the scene. */
export interface Found {
  key: string;
  vols: number[];
  /** the building's seed, when the structure is a building */
  seed?: number;
}

export interface SightDraft {
  key: string;
  vols: number[];
  n: string;
  t: SightType;
  b?: string;
  lon: number;
  lat: number;
  /** the rank and index position of the entry that named it: sights are listed best first */
  r: number;
  order: number;
}

const better = (a: Candidate, b: Candidate): number => b.r - a.r || a.order - b.order;

/**
 * Groups the entries by the structure they stand on and names each structure: by its curated
 * entry; else by the building's own name (a point of interest never renames a named building);
 * else by its best-ranked entry, ties going to the one listed first.
 */
export function resolveSights(
  cands: Candidate[],
  find: (c: Candidate) => Found | null,
  ownName: (seed: number) => string | undefined,
): SightDraft[] {
  const groups = new Map<string, { found: Found; entries: Candidate[] }>();
  for (const c of cands) {
    const found = find(c);
    if (!found) continue;
    const group = groups.get(found.key);
    if (group) group.entries.push(c);
    else groups.set(found.key, { found, entries: [c] });
  }

  const sights: SightDraft[] = [];
  for (const { found, entries } of groups.values()) {
    entries.sort(better);
    const best = entries[0];
    const curated = entries.find((e) => e.src === "curated");
    const own = found.seed !== undefined ? ownName(found.seed) : undefined;
    const namer =
      curated ?? (own === undefined ? best : entries.find((e) => e.src === "building" && e.n === own));
    const { key, vols } = found;
    if (namer) {
      const { n, t, b, lon, lat, r, order } = namer;
      sights.push({ key, vols, n, t, b, lon, lat, r, order });
    } else if (own !== undefined) {
      const { b, lon, lat, r, order } = best;
      sights.push({ key, vols, n: own, t: "building", b, lon, lat, r, order });
    }
  }
  return sights.sort((a, b) => b.r - a.r || a.order - b.order);
}
