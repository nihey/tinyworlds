/**
 * The walk's network, from the pieces and their heights: nodes (connectors, numbered for the
 * whole city), street edges for traffic, walking edges for people, the elevated ways the walk
 * builds decks for, and the tunnels traffic passes through unseen. Points are flat e, n, z.
 */
import type { DeckAt } from "./heights.js";
import type { Piece } from "./pieces.js";

export interface NetNode {
  id: number;
  e: number;
  n: number;
  z: number;
  /** NODE_LIGHTS, NODE_PORTAL */
  flags: number;
  /** Radians from north, clockwise, modulo π: the widest street's, the lights' "along" phase. */
  bearing: number;
}

export interface NetStreet {
  /** Node ids. */
  a: number;
  b: number;
  /** Index into CAR_CLASSES. */
  cls: number;
  /** ST_* */
  flags: number;
  width: number;
  pts: number[];
}

export interface NetWalk {
  a: number;
  b: number;
  /** WK_* */
  flags: number;
  pts: number[];
}

export interface NetElevated {
  kind: 0 | 1 | 2;
  width: number;
  pts: number[];
  /** Per vertex, 1 where the walk builds the deck itself (the map has none there). */
  own: Uint8Array;
}

/** As walk.json has them: portals [e, n, heading into the tunnel (radians from north, clockwise)];
 * b null when the other end has no portal (closed by a barrier). */
export interface Tunnel {
  name: string;
  a: [number, number, number];
  b: [number, number, number] | null;
  length: number;
}

export interface Network {
  /** By connector id. */
  nodes: Map<string, NetNode>;
  streets: NetStreet[];
  walks: NetWalk[];
  elevated: NetElevated[];
  tunnels: Tunnel[];
}

export const NODE_LIGHTS = 1;
export const NODE_PORTAL = 2;
export const ST_LINK = 1;
export const ST_ONE_WAY_AB = 2;
export const ST_ONE_WAY_BA = 4;
export const ST_ELEVATED = 8;
export const WK_CROSSWALK = 1;
export const WK_ALONG = 2;
export const WK_ACROSS = 4;
export const WK_ELEVATED = 8;
export const ELEV_ROAD = 0;
export const ELEV_FOOTWAY = 1;
export const ELEV_RAIL = 2;

/** Metres: a vertex higher than this is off the ground. */
const OFF_GROUND = 0.3;
/** Metres: how far from its lights a crosswalk keeps to their phases. */
const LIGHTS_REACH = 25;
const MOTORWAY_OR_TRUNK = 1;

/** Radians from north, clockwise, of the way from (e0, n0) to (e1, n1), in [0, 2π). */
function heading(e0: number, n0: number, e1: number, n1: number): number {
  const h = Math.atan2(e1 - e0, n1 - n0);
  return h < 0 ? h + 2 * Math.PI : h;
}

/** The piece's direction leaving its end at connector `end` (0: a, 1: b). */
function leaving(p: Piece, end: 0 | 1): number {
  const m = p.pts.length / 2;
  const [k, j] = end === 0 ? [0, 1] : [m - 1, m - 2];
  return heading(p.pts[k * 2], p.pts[k * 2 + 1], p.pts[j * 2], p.pts[j * 2 + 1]);
}

function lengthOf(p: Piece): number {
  let s = 0;
  for (let i = 2; i < p.pts.length; i += 2)
    s += Math.hypot(p.pts[i] - p.pts[i - 2], p.pts[i + 1] - p.pts[i - 1]);
  return s;
}

function withZ(pts: number[], z: Float32Array, from = 0, to = z.length - 1): number[] {
  const out: number[] = [];
  for (let k = from; k <= to; k++) out.push(pts[k * 2], pts[k * 2 + 1], z[k]);
  return out;
}

/** The stretches of a piece off the ground, each with one ground vertex either side. */
function elevatedOf(p: Piece, z: Float32Array, deckAt: DeckAt, out: NetElevated[]): void {
  const kind = p.kind === "street" ? ELEV_ROAD : p.kind === "walk" ? ELEV_FOOTWAY : ELEV_RAIL;
  const m = z.length;
  for (let k = 0; k < m; k++) {
    if (z[k] <= OFF_GROUND) continue;
    let end = k;
    while (end + 1 < m && z[end + 1] > OFF_GROUND) end++;
    const from = Math.max(0, k - 1);
    const to = Math.min(m - 1, end + 1);
    const own = new Uint8Array(to - from + 1);
    for (let i = from; i <= to; i++) own[i - from] = deckAt(p.pts[i * 2], p.pts[i * 2 + 1]) === null ? 1 : 0;
    out.push({ kind, width: p.width, pts: withZ(p.pts, z, from, to), own });
    k = end;
  }
}

interface Meeting {
  streets: number;
  /** Some street here is neither motorway nor trunk. */
  minor: boolean;
  widest: number;
}

/**
 * Tunnels: the tunnel street pieces chained through the connectors they share. A portal is a
 * connector of theirs that an open street ends at; a tunnel runs from one portal to each other
 * portal it reaches without passing another (the shortest way through), or, from a portal that
 * reaches none, to the farthest point it can go.
 */
function tunnelsOf(
  pieces: Piece[],
  isPortal: (id: string) => boolean,
): { tunnels: Tunnel[]; portals: Set<string> } {
  const inside = new Map<string, number[]>();
  const portals: string[] = [];
  pieces.forEach((p, i) => {
    if (!p.tunnel || p.kind !== "street" || p.a === p.b) return;
    for (const c of [p.a, p.b]) {
      let list = inside.get(c);
      if (!list) {
        inside.set(c, (list = []));
        if (isPortal(c)) portals.push(c);
      }
      list.push(i);
    }
  });
  const lengths = new Map<number, number>();
  const len = (i: number): number => {
    let s = lengths.get(i);
    if (s === undefined) lengths.set(i, (s = lengthOf(pieces[i])));
    return s;
  };
  const order = new Map(portals.map((c, k) => [c, k]));
  const portalAt = (i: number, c: string): [number, number, number] => {
    const p = pieces[i];
    const end = p.a === c ? 0 : 1;
    const k = end === 0 ? 0 : p.pts.length / 2 - 1;
    return [p.pts[k * 2], p.pts[k * 2 + 1], leaving(p, end)];
  };

  const tunnels: Tunnel[] = [];
  const used = new Set<string>();
  const marked = new Set<string>();
  for (const from of portals) {
    // a Dijkstra through the tunnel's pieces that stops at every other portal
    const dist = new Map<string, number>([[from, 0]]);
    const via = new Map<string, number>();
    const done = new Set<string>();
    const reached: string[] = [];
    for (;;) {
      let u: string | null = null;
      for (const [c, d] of dist) if (!done.has(c) && (u === null || d < dist.get(u)!)) u = c;
      if (u === null) break;
      done.add(u);
      reached.push(u);
      if (u !== from && order.has(u)) continue;
      for (const i of inside.get(u) ?? []) {
        const w = pieces[i].a === u ? pieces[i].b : pieces[i].a;
        const d = dist.get(u)! + len(i);
        if (d < (dist.get(w) ?? Infinity)) {
          dist.set(w, d);
          via.set(w, i);
        }
      }
    }
    const ends = reached.filter((c) => c !== from && order.has(c));
    if (ends.length === 0) {
      let far = from;
      for (const c of reached) if (dist.get(c)! > dist.get(far)!) far = c;
      if (far !== from) ends.push(far);
    }
    for (const to of ends) {
      const pair = [from, to].sort().join("\n");
      if (used.has(pair)) continue;
      used.add(pair);
      marked.add(from);
      if (order.has(to)) marked.add(to);
      // the way through, from the far end back to this portal
      const path: number[] = [];
      for (let c = to; c !== from;) {
        const i = via.get(c)!;
        path.push(i);
        c = pieces[i].a === c ? pieces[i].b : pieces[i].a;
      }
      const names = new Map<string, number>();
      for (const i of [...path].reverse())
        if (pieces[i].name) names.set(pieces[i].name, (names.get(pieces[i].name) ?? 0) + len(i));
      let name = "";
      for (const [n, s] of names) if (!name || s > names.get(name)!) name = n;
      tunnels.push({
        name,
        a: portalAt(path[path.length - 1], from),
        b: order.has(to) ? portalAt(path[0], to) : null,
        length: dist.get(to)!,
      });
    }
  }
  return { tunnels, portals: marked };
}

export function buildNetwork(pieces: Piece[], z: Float32Array[], deckAt: DeckAt): Network {
  const nodes = new Map<string, NetNode>();
  const meetings: Meeting[] = [];
  const streets: NetStreet[] = [];
  const walks: NetWalk[] = [];
  const elevated: NetElevated[] = [];
  const crosswalks: [NetWalk, Piece][] = [];

  const nodeAt = (id: string, p: Piece, zs: Float32Array, end: 0 | 1): NetNode => {
    let node = nodes.get(id);
    if (!node) {
      const k = end === 0 ? 0 : zs.length - 1;
      node = { id: nodes.size, e: p.pts[k * 2], n: p.pts[k * 2 + 1], z: zs[k], flags: 0, bearing: 0 };
      nodes.set(id, node);
      meetings.push({ streets: 0, minor: false, widest: -1 });
    }
    return node;
  };
  const meet = (node: NetNode, p: Piece, end: 0 | 1): void => {
    const at = meetings[node.id];
    at.streets++;
    if (p.cls > MOTORWAY_OR_TRUNK) at.minor = true;
    if (p.width > at.widest) {
      at.widest = p.width;
      node.bearing = leaving(p, end) % Math.PI;
    }
  };

  pieces.forEach((p, i) => {
    const zs = z[i];
    if (p.tunnel) return;
    elevatedOf(p, zs, deckAt, elevated);
    if (p.kind === "rail") return;
    const a = nodeAt(p.a, p, zs, 0);
    const b = nodeAt(p.b, p, zs, 1);
    const up = zs.some((v) => v > OFF_GROUND);
    if (p.kind === "street") {
      const flags =
        (p.link ? ST_LINK : 0) |
        (p.ow === 1 ? ST_ONE_WAY_AB : 0) |
        (p.ow === -1 ? ST_ONE_WAY_BA : 0) |
        (up ? ST_ELEVATED : 0);
      streets.push({ a: a.id, b: b.id, cls: p.cls, flags, width: p.width, pts: withZ(p.pts, zs) });
      meet(a, p, 0);
      meet(b, p, 1);
    } else {
      const walk = {
        a: a.id,
        b: b.id,
        flags: (p.crosswalk ? WK_CROSSWALK : 0) | (up ? WK_ELEVATED : 0),
        pts: withZ(p.pts, zs),
      };
      walks.push(walk);
      if (p.crosswalk) crosswalks.push([walk, p]);
    }
  });

  // lights: three streets or more, not all motorway or trunk, on the ground
  const lights = new Map<number, NetNode[]>();
  const cellKey = (e: number, n: number): number =>
    (Math.floor(e / LIGHTS_REACH) + 32768) * 65536 + Math.floor(n / LIGHTS_REACH) + 32768;
  for (const node of nodes.values()) {
    const at = meetings[node.id];
    if (at.streets < 3 || !at.minor || node.z > OFF_GROUND) continue;
    node.flags |= NODE_LIGHTS;
    const key = cellKey(node.e, node.n);
    const list = lights.get(key);
    if (list) list.push(node);
    else lights.set(key, [node]);
  }

  // a crosswalk near lights crosses with the phase its direction runs with
  for (const [walk, p] of crosswalks) {
    const m = p.pts.length / 2;
    let best: NetNode | null = null;
    let bestD = Infinity;
    for (const k of [0, m - 1]) {
      const e = p.pts[k * 2];
      const n = p.pts[k * 2 + 1];
      for (let de = -1; de <= 1; de++)
        for (let dn = -1; dn <= 1; dn++)
          for (const node of lights.get(cellKey(e + de * LIGHTS_REACH, n + dn * LIGHTS_REACH)) ?? []) {
            const d = Math.hypot(node.e - e, node.n - n);
            if (d <= LIGHTS_REACH && (best === null || d < bestD)) {
              best = node;
              bestD = d;
            }
          }
    }
    if (!best) continue;
    const dir = heading(p.pts[0], p.pts[1], p.pts[m * 2 - 2], p.pts[m * 2 - 1]) % Math.PI;
    const diff = Math.abs(dir - best.bearing);
    walk.flags |= Math.min(diff, Math.PI - diff) <= Math.PI / 4 ? WK_ALONG : WK_ACROSS;
  }

  const openStreetEnd = (c: string): boolean => {
    const node = nodes.get(c);
    return node !== undefined && meetings[node.id].streets > 0;
  };
  const { tunnels, portals } = tunnelsOf(pieces, openStreetEnd);
  for (const c of portals) nodes.get(c)!.flags |= NODE_PORTAL;

  return { nodes, streets, walks, elevated, tunnels };
}
