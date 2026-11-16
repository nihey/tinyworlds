/**
 * Segments cut into pieces between their connectors: the walk's street, sidewalk and rail
 * stretches, densified, each vertex knowing whether it is on a bridge and at what level.
 */
import { CAR_CLASSES, CAR_WIDTH, oneWayOf, type Rule, type Segment } from "./segments.js";

export interface Piece {
  kind: "street" | "walk" | "rail";
  /** Index into the segments given. */
  seg: number;
  /** Connector ids at the two ends. */
  a: string;
  b: string;
  /** Index into CAR_CLASSES; -1 for walks and rails. */
  cls: number;
  link: boolean;
  ow: 0 | 1 | -1;
  width: number;
  crosswalk: boolean;
  name: string;
  /** Flat e, n in metres, at most 10 m between vertices. */
  pts: number[];
  bridge: boolean[];
  level: number[];
  tunnel: boolean;
}

const MAX_STEP = 10;
const MIN_PIECE = 0.5;
const EPS = 1e-9;
const WALK_OUT = ["is_indoor", "is_covered", "is_under_construction"];

const covers = (rules: Rule[], at: number, test: (r: Rule) => boolean): boolean =>
  rules.some((r) => test(r) && (!r.between || (at >= r.between[0] - EPS && at <= r.between[1] + EPS)));

const hasFlag =
  (...names: string[]) =>
  (r: Rule): boolean =>
    !!r.values?.some((v) => names.includes(v));

/** The level a vertex stands at: the first level rule covering it, 0 when none. */
function levelAt(levels: Rule[], at: number): number {
  for (const r of levels)
    if (r.value != null && (!r.between || (at >= r.between[0] - EPS && at <= r.between[1] + EPS)))
      return r.value;
  return 0;
}

export function piecesOf(segments: Segment[]): Piece[] {
  const out: Piece[] = [];
  segments.forEach((seg, index) => {
    const rail = seg.subtype === "rail";
    const carIdx = rail ? -1 : CAR_CLASSES.indexOf(seg.cls);
    const kind: Piece["kind"] = rail ? "rail" : carIdx >= 0 ? "street" : "walk";
    let ow: 0 | 1 | -1 = 0;
    if (kind === "street") {
      const o = oneWayOf(seg.access);
      if (o === null) return; // closed to everyone
      ow = o;
    }
    const cons = [...seg.connectors].sort((x, y) => x.at - y.at);
    if (cons.length < 2) return;

    const pts = seg.pts;
    const cum = [0];
    for (let i = 2; i < pts.length; i += 2)
      cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
    const total = cum[cum.length - 1];
    if (total < MIN_PIECE) return;

    /** The point at distance s along the segment. */
    const at = (s: number): [number, number] => {
      let i = 1;
      while (i < cum.length - 1 && cum[i] < s) i++;
      const t = Math.min(1, Math.max(0, (s - cum[i - 1]) / Math.max(1e-9, cum[i] - cum[i - 1])));
      return [
        pts[i * 2 - 2] + (pts[i * 2] - pts[i * 2 - 2]) * t,
        pts[i * 2 - 1] + (pts[i * 2 + 1] - pts[i * 2 - 1]) * t,
      ];
    };

    const width =
      kind === "rail"
        ? 3.4
        : (seg.width ??
          (kind === "street"
            ? CAR_WIDTH[carIdx] * (seg.subclass === "link" ? 0.6 : 1)
            : seg.subclass === "crosswalk"
              ? 3
              : 2.5));

    for (let k = 0; k + 1 < cons.length; k++) {
      const s0 = Math.max(0, cons[k].at) * total;
      const s1 = Math.min(1, cons[k + 1].at) * total;
      if (s1 - s0 < MIN_PIECE) continue;
      const a = cons[k].id;
      const b = cons[k + 1].id;
      if (kind === "walk" && a === b) continue;

      const mid = (s0 + s1) / 2 / total;
      const underground =
        covers(seg.flags, mid, hasFlag("is_tunnel")) || covers(seg.levels, mid, (r) => (r.value ?? 0) < 0);
      // nobody strolls through a tunnel: only street and rail tunnels stay, for their portals
      if (kind === "walk" && (underground || covers(seg.flags, mid, hasFlag(...WALK_OUT)))) continue;
      if (kind === "rail" && covers(seg.flags, mid, hasFlag("is_abandoned", "is_disused"))) continue;

      // the connectors, and the segment's own vertices between them, with their distance along it
      const raw: [number, number, number][] = [[...at(s0), s0]];
      for (let i = 1; i < pts.length / 2 - 1; i++)
        if (cum[i] > s0 + 0.05 && cum[i] < s1 - 0.05) raw.push([pts[i * 2], pts[i * 2 + 1], cum[i]]);
      raw.push([...at(s1), s1]);

      const flat: number[] = [];
      const bridge: boolean[] = [];
      const level: number[] = [];
      const push = (e: number, n: number, s: number): void => {
        const f = s / total;
        flat.push(e, n);
        bridge.push(covers(seg.flags, f, hasFlag("is_bridge")));
        level.push(levelAt(seg.levels, f));
      };
      push(raw[0][0], raw[0][1], raw[0][2]);
      for (let i = 1; i < raw.length; i++) {
        const [e0, n0, t0] = raw[i - 1];
        const [e1, n1, t1] = raw[i];
        const steps = Math.ceil(Math.hypot(e1 - e0, n1 - n0) / MAX_STEP);
        for (let j = 1; j < steps; j++) {
          const u = j / steps;
          push(e0 + (e1 - e0) * u, n0 + (n1 - n0) * u, t0 + (t1 - t0) * u);
        }
        push(e1, n1, t1);
      }

      out.push({
        kind,
        seg: index,
        a,
        b,
        cls: carIdx,
        link: seg.subclass === "link",
        ow,
        width,
        crosswalk: kind === "walk" && seg.subclass === "crosswalk",
        name: seg.name,
        pts: flat,
        bridge,
        level,
        tunnel: underground,
      });
    }
  });
  return out;
}
