/**
 * Segments cut into pieces between their connectors: the walk's street, sidewalk and rail
 * stretches, densified, each vertex knowing whether it is on a bridge and at what level.
 */
import { LEVEL_HEIGHT, LINK_RAMP, RAMP } from "./heights.js";
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

/**
 * Overture's level rules and bridge flags often leave a gap inside one elevated stretch (a few
 * metres of the Brooklyn Bridge's approach with no level, 250 m of the Williamsburg's approach
 * with neither level nor bridge). With no connector in the gap nothing can meet the way there, so
 * a dip the ramps either side could never reach the bottom of is part of the bridge: it takes
 * the lower of the levels either side. A longer dip is ground the way really comes down to (two
 * creek bridges a kilometre apart on one motorway segment). A vertex's height in levels is its
 * level, at least one on a bridge, none on the ground; a dip is what water poured on that
 * profile would fill.
 */
function fillGaps(
  pts: number[],
  bridge: boolean[],
  level: number[],
  slope: number,
  ends: [EndRule | undefined, EndRule | undefined] = [undefined, undefined],
): void {
  const m = level.length;
  // an end that another way raises at its connector bounds a dip as if it were this one's own
  const kept = [bridge[0], level[0], bridge[m - 1], level[m - 1]] as const;
  ends.forEach((end, x) => {
    const k = x === 0 ? 0 : m - 1;
    if (!end) return;
    bridge[k] = bridge[k] || end.bridge;
    level[k] = Math.max(level[k], end.level);
  });
  const height = (k: number): number => (bridge[k] || level[k] > 0 ? Math.max(level[k], 1) : 0);
  const along = [0];
  for (let k = 1; k < m; k++)
    along.push(along[k - 1] + Math.hypot(pts[k * 2] - pts[k * 2 - 2], pts[k * 2 + 1] - pts[k * 2 - 1]));
  const left: number[] = [];
  for (let k = 0; k < m; k++) left.push(Math.max(height(k), k > 0 ? left[k - 1] : 0));
  const right = new Array<number>(m);
  for (let k = m - 1; k >= 0; k--) right[k] = Math.max(height(k), k + 1 < m ? right[k + 1] : 0);
  for (let k = 1; k + 1 < m; k++) {
    if (height(k) >= Math.min(left[k], right[k])) continue;
    let b = k;
    while (b + 1 < m - 1 && height(b + 1) < Math.min(left[b + 1], right[b + 1])) b++;
    const a = k - 1;
    const z = b + 1;
    const lower = Math.min(height(a), height(z));
    if (along[z] - along[a] < (2 * lower * LEVEL_HEIGHT) / slope)
      for (let g = k; g <= b; g++) {
        bridge[g] = bridge[g] || bridge[a] || bridge[z];
        level[g] = Math.max(level[g], Math.min(level[a], level[z]));
      }
    k = b;
  }
  [bridge[0], level[0], bridge[m - 1], level[m - 1]] = kept;
}

/** What the other ways meeting at a connector say of it: raised, at what level. */
interface EndRule {
  bridge: boolean;
  level: number;
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
  fillChains(out);
  return out;
}

/**
 * Fills the gaps (`fillGaps`) along each run of pieces that meet end to end at connectors
 * nothing else meets: a dip there can meet nothing either, wherever the segments were cut (the
 * Williamsburg's westbound approach has no level on its last 200 m before the span's own
 * segment, which is at level 2 again).
 */
function fillChains(pieces: Piece[]): void {
  const keyOf = (p: Piece, id: string): string => `${p.kind === "rail" ? "rail" : "way"}:${id}`;
  const at = new Map<string, number[]>();
  pieces.forEach((p, i) => {
    if (p.tunnel) return;
    for (const id of new Set([p.a, p.b])) {
      const list = at.get(keyOf(p, id));
      if (list) list.push(i);
      else at.set(keyOf(p, id), [i]);
    }
  });
  /** The one other piece of the same kind through a connector only two pieces meet at, else -1. */
  const through = (i: number, id: string): number => {
    const list = at.get(keyOf(pieces[i], id));
    if (!list || list.length !== 2 || pieces[i].a === pieces[i].b) return -1;
    const j = list[0] === i ? list[1] : list[0];
    return pieces[j].kind === pieces[i].kind && pieces[j].a !== pieces[j].b ? j : -1;
  };
  // what every way says of each connector, for the ends of a run
  const said = new Map<string, EndRule>();
  pieces.forEach((p) => {
    if (p.tunnel) return;
    const m = p.level.length;
    for (const [id, k] of [
      [p.a, 0],
      [p.b, m - 1],
    ] as const) {
      const r = said.get(keyOf(p, id)) ?? { bridge: false, level: 0 };
      said.set(keyOf(p, id), { bridge: r.bridge || p.bridge[k], level: Math.max(r.level, p.level[k]) });
    }
  });
  const seen = new Uint8Array(pieces.length);
  pieces.forEach((p, i) => {
    if (p.tunnel || seen[i] || !(p.bridge.some(Boolean) || p.level.some((l) => l > 0))) return;
    // walk back to the run's first piece, then forward along it, each piece in its direction
    let first = i;
    let id = p.a;
    for (let guard = 0; guard < pieces.length; guard++) {
      const j = through(first, id);
      if (j < 0 || j === i) break;
      id = pieces[j].a === id ? pieces[j].b : pieces[j].a;
      first = j;
    }
    const run: { piece: number; reversed: boolean }[] = [];
    let cur = first;
    let entry = id;
    while (cur >= 0 && !seen[cur]) {
      seen[cur] = 1;
      const q = pieces[cur];
      const reversed = q.b === entry && q.a !== entry;
      run.push({ piece: cur, reversed });
      const exit = reversed ? q.a : q.b;
      cur = through(cur, exit);
      entry = exit;
    }
    const head = pieces[run[0].piece];
    const tail = pieces[run[run.length - 1].piece];
    const outer: [EndRule | undefined, EndRule | undefined] = [
      said.get(keyOf(head, run[0].reversed ? head.b : head.a)),
      said.get(keyOf(tail, run[run.length - 1].reversed ? tail.a : tail.b)),
    ];
    if (run.length === 1) {
      fillGaps(
        head.pts,
        head.bridge,
        head.level,
        head.link ? LINK_RAMP : RAMP,
        run[0].reversed ? [outer[1], outer[0]] : outer,
      );
      return;
    }
    // the run as one profile, each joint once
    const pts: number[] = [];
    const bridge: boolean[] = [];
    const level: number[] = [];
    const back: { piece: number; k: number }[][] = [];
    for (const { piece, reversed } of run) {
      const q = pieces[piece];
      const m = q.level.length;
      for (let x = 0; x < m; x++) {
        const k = reversed ? m - 1 - x : x;
        if (x === 0 && back.length > 0) {
          back[back.length - 1].push({ piece, k });
          continue;
        }
        pts.push(q.pts[k * 2], q.pts[k * 2 + 1]);
        bridge.push(q.bridge[k]);
        level.push(q.level[k]);
        back.push([{ piece, k }]);
      }
    }
    // a joint takes the higher of what its two pieces say
    back.forEach((owners, v) => {
      for (const { piece, k } of owners) {
        bridge[v] = bridge[v] || pieces[piece].bridge[k];
        level[v] = Math.max(level[v], pieces[piece].level[k]);
      }
    });
    const before = level.slice();
    const wasBridge = bridge.slice();
    fillGaps(pts, bridge, level, run.every(({ piece }) => pieces[piece].link) ? LINK_RAMP : RAMP, outer);
    // only what the fill changed goes back: a joint keeps what each of its pieces says
    back.forEach((owners, v) => {
      if (level[v] === before[v] && bridge[v] === wasBridge[v]) return;
      for (const { piece, k } of owners) {
        pieces[piece].bridge[k] = bridge[v];
        pieces[piece].level[k] = level[v];
      }
    });
  });
}
