import type { Scene } from "../render/scene.js";
import type { PlaceType } from "./build.js";
import { silhouette } from "./silhouette.js";
import type { SpriteRef } from "./sprites.js";
import { piecesOf } from "./structures.js";

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

/** A sight as the viewer reads it from sights.json. */
export interface SightRecord {
  id: string;
  n: string;
  t: SightType;
  b?: string;
  lon: number;
  lat: number;
  /** the silhouette: flat map px rings, even-odd */
  rings: number[][];
  /** the largest ground y of its footprints: the nearer the viewer, the larger */
  front: number;
  /** where its sign hangs: the silhouette's topmost point */
  anchor: [number, number];
  /** its picture with nothing in front of it, where one was drawn */
  sprite?: SpriteRef;
}

const round5 = (v: number): number => Math.round(v * 1e5) / 1e5;

/** The sights with their outlines, as sights.json holds them. A sight with no outline is left out. */
export function toSightFile(drafts: SightDraft[], scene: Scene): { sights: SightRecord[] } {
  const sights: SightRecord[] = [];
  for (const d of drafts) {
    const pieces = piecesOf(scene, d.vols);
    const rings = silhouette(pieces);
    if (rings.length === 0) continue;
    let front = -Infinity;
    for (const piece of pieces)
      for (const ring of piece.rings)
        for (let i = 1; i < ring.length; i += 2) front = Math.max(front, ring[i]);
    let anchor: [number, number] = [rings[0][0], rings[0][1]];
    for (const ring of rings)
      for (let i = 0; i < ring.length; i += 2) if (ring[i + 1] < anchor[1]) anchor = [ring[i], ring[i + 1]];
    sights.push({
      id: d.key,
      n: d.n,
      t: d.t,
      ...(d.b ? { b: d.b } : {}),
      lon: round5(d.lon),
      lat: round5(d.lat),
      rings,
      front: Math.round(front * 2) / 2,
      anchor,
    });
  }
  return { sights };
}
