import { CELL } from "./geo";
import { WalkDataError, type CellArrays } from "./format";

/** Everything below is in world metres (east, north, height above the land), unless it says otherwise. */

export interface Volume {
  /** [e, n, e, n, …] per ring, outer first, even-odd */
  rings: Float32Array[];
  base: number;
  top: number;
  roofH: number;
  roofShape: number;
  wall: number;
  roof: number;
  glass: number;
  pattern: number;
  flags: number;
  seed: number;
  /** [e0, n0, e1, n1] around every ring */
  box: [number, number, number, number];
}

export interface GroundPoly {
  kind: number;
  order: number;
  rings: Float32Array[];
}

export interface GroundWay {
  kind: number;
  width: number;
  order: number;
  pts: Float32Array;
}

export interface Cable {
  kind: number;
  /** e, n, z */
  pts: Float32Array;
}

export interface RoadNode {
  id: number;
  e: number;
  n: number;
  z: number;
  lights: boolean;
  portal: boolean;
  /** radians, 0 to π: the widest street's bearing */
  bearing: number;
}

export interface StreetEdge {
  /** "a-b" */
  key: string;
  a: number;
  b: number;
  cls: number;
  link: boolean;
  /** 1 one-way a to b, -1 one-way b to a, 0 both ways */
  ow: 0 | 1 | -1;
  elevated: boolean;
  width: number;
  /** e, n, z */
  pts: Float32Array;
  /** along the polyline, in plan */
  length: number;
}

export interface WalkEdge {
  key: string;
  a: number;
  b: number;
  crosswalk: boolean;
  /** which signal phase lets people cross: 0 none, 1 the street's "along" phase, 2 "across" */
  phase: 0 | 1 | 2;
  elevated: boolean;
  pts: Float32Array;
  length: number;
}

export interface ElevatedWay {
  /** 0 road, 1 footway, 2 rail */
  kind: number;
  width: number;
  /** the deck's surface: e, n, z */
  pts: Float32Array;
  /** per vertex: 1 the walk builds the deck here, 0 the map's deck volume is there */
  own: Uint8Array;
}

export interface Mooring {
  e: number;
  n: number;
  /** radians */
  heading: number;
  kind: "speedboat" | "motorboat";
}

export interface WalkCell {
  i: number;
  j: number;
  key: string;
  volumes: Volume[];
  ground: GroundPoly[];
  ways: GroundWay[];
  /** e, n, kind per tree */
  trees: Float32Array;
  cables: Cable[];
  /** 100 × 100 cells of 2 m from the south-west corner, bit x + 100y LSB-first, 1 = water */
  mask: { mode: 0 | 1 | 2; bits: Uint8Array | null };
  /** per 2 m cell as the mask: the distance to land in 2 m steps; null for an all-land square */
  shore: Uint8Array | null;
  nodes: RoadNode[];
  streets: StreetEdge[];
  walks: WalkEdge[];
  elevated: ElevatedWay[];
  moorings: Mooring[];
}

const NONE: ArrayLike<number> = new Uint8Array(0);

/** Reads one decoded square into typed records in world metres. Throws `WalkDataError` for arrays that disagree. */
export function readCell(decoded: { i: number; j: number; arrays: Partial<CellArrays> }): WalkCell {
  const { i, j, arrays } = decoded;
  const at = (name: string): ArrayLike<number> => arrays[name] ?? NONE;
  const oe = i * CELL;
  const on = j * CELL;
  const where = `square ${i}_${j}`;

  /** A per-item array must have exactly one entry per item (or `per` for each). */
  const count = (name: string, items: number, per = 1): ArrayLike<number> => {
    const a = at(name);
    if (a.length !== items * per)
      throw new WalkDataError(`${where}: ${name} is not ${items * per} long`);
    return a;
  };

  /** Rings out of a run of vertex counts: [e, n, …] from local dm. */
  const takeRings = (
    counts: ArrayLike<number>,
    xy: ArrayLike<number>,
    local: boolean,
    from: number,
  ) => {
    const rings: Float32Array[] = [];
    let p = from;
    for (let r = 0; r < counts.length; r++) {
      const k = counts[r];
      if (p + k * 2 > xy.length) throw new WalkDataError(`${where}: a ring runs past its vertices`);
      const ring = new Float32Array(k * 2);
      for (let v = 0; v < k; v++) {
        ring[v * 2] = (local ? oe : 0) + xy[p + v * 2] / 10;
        ring[v * 2 + 1] = (local ? on : 0) + xy[p + v * 2 + 1] / 10;
      }
      rings.push(ring);
      p += k * 2;
    }
    return { rings, end: p };
  };

  /** Splits `verts` (one count per item) over a flat array of `width` numbers per vertex. */
  const runs = (verts: ArrayLike<number>, flat: ArrayLike<number>, width: number, name: string) => {
    let total = 0;
    for (let x = 0; x < verts.length; x++) total += verts[x];
    if (total * width !== flat.length)
      throw new WalkDataError(`${where}: ${name} does not match its counts`);
  };

  // volumes
  const volRings = at("vol.rings");
  const volVerts = at("vol.verts");
  const volXY = at("vol.xy");
  const nv = volRings.length;
  const base = count("vol.base", nv);
  const top = count("vol.top", nv);
  const roofH = count("vol.roofH", nv);
  const roofShape = count("vol.roofShape", nv);
  const wall = count("vol.wall", nv);
  const roof = count("vol.roof", nv);
  const glass = count("vol.glass", nv);
  const pattern = count("vol.pattern", nv);
  const vflags = count("vol.flags", nv);
  const seed = count("vol.seed", nv);
  runs(volVerts, volXY, 2, "vol.xy");
  const volumes: Volume[] = [];
  let ringAt = 0;
  let xyAt = 0;
  for (let v = 0; v < nv; v++) {
    const k = volRings[v];
    if (ringAt + k > volVerts.length) throw new WalkDataError(`${where}: vol.verts is short`);
    const t = takeRings(
      Array.from({ length: k }, (_, r) => volVerts[ringAt + r]),
      volXY,
      true,
      xyAt,
    );
    ringAt += k;
    xyAt = t.end;
    let e0 = Infinity;
    let n0 = Infinity;
    let e1 = -Infinity;
    let n1 = -Infinity;
    for (const ring of t.rings)
      for (let q = 0; q < ring.length; q += 2) {
        e0 = Math.min(e0, ring[q]);
        e1 = Math.max(e1, ring[q]);
        n0 = Math.min(n0, ring[q + 1]);
        n1 = Math.max(n1, ring[q + 1]);
      }
    volumes.push({
      rings: t.rings,
      base: base[v] / 10,
      top: top[v] / 10,
      roofH: roofH[v] / 10,
      roofShape: roofShape[v],
      wall: wall[v],
      roof: roof[v],
      glass: glass[v],
      pattern: pattern[v],
      flags: vflags[v],
      seed: seed[v],
      box: [e0, n0, e1, n1],
    });
  }

  // ground polygons
  const gRings = at("gnd.rings");
  const gVerts = at("gnd.verts");
  const gXY = at("gnd.xy");
  const ng = gRings.length;
  const gKind = count("gnd.kind", ng);
  const gOrder = count("gnd.order", ng);
  runs(gVerts, gXY, 2, "gnd.xy");
  const ground: GroundPoly[] = [];
  ringAt = 0;
  xyAt = 0;
  for (let g = 0; g < ng; g++) {
    const k = gRings[g];
    if (ringAt + k > gVerts.length) throw new WalkDataError(`${where}: gnd.verts is short`);
    const t = takeRings(
      Array.from({ length: k }, (_, r) => gVerts[ringAt + r]),
      gXY,
      true,
      xyAt,
    );
    ringAt += k;
    xyAt = t.end;
    ground.push({ kind: gKind[g], order: gOrder[g], rings: t.rings });
  }

  // ground lines
  const wVerts = at("way.verts");
  const wXY = at("way.xy");
  const nw = wVerts.length;
  const wKind = count("way.kind", nw);
  const wWidth = count("way.width", nw);
  const wOrder = count("way.order", nw);
  runs(wVerts, wXY, 2, "way.xy");
  const ways: GroundWay[] = [];
  xyAt = 0;
  for (let w = 0; w < nw; w++) {
    const t = takeRings([wVerts[w]], wXY, true, xyAt);
    xyAt = t.end;
    ways.push({ kind: wKind[w], width: wWidth[w] / 10, order: wOrder[w], pts: t.rings[0] });
  }

  // trees
  const tXY = at("tree.xy");
  const nt = tXY.length / 2;
  const tKind = count("tree.kind", nt);
  const trees = new Float32Array(nt * 3);
  for (let t = 0; t < nt; t++) {
    trees[t * 3] = oe + tXY[t * 2] / 10;
    trees[t * 3 + 1] = on + tXY[t * 2 + 1] / 10;
    trees[t * 3 + 2] = tKind[t];
  }

  /** Lines of world-dm triples, as many as `verts` has entries. */
  const lines = (verts: ArrayLike<number>, xyz: ArrayLike<number>, name: string) => {
    runs(verts, xyz, 3, name);
    const out: Float32Array[] = [];
    let p = 0;
    for (let x = 0; x < verts.length; x++) {
      const pts = new Float32Array(verts[x] * 3);
      for (let q = 0; q < pts.length; q++) pts[q] = xyz[p + q] / 10;
      out.push(pts);
      p += pts.length;
    }
    return out;
  };
  const planLength = (pts: Float32Array) => {
    let len = 0;
    for (let q = 3; q < pts.length; q += 3)
      len += Math.hypot(pts[q] - pts[q - 3], pts[q + 1] - pts[q - 2]);
    return len;
  };

  // cables
  const cVerts = at("cab.verts");
  const cKind = count("cab.kind", cVerts.length);
  const cLines = lines(cVerts, at("cab.xyz"), "cab.xyz");
  const cables: Cable[] = cLines.map((pts, c) => ({ kind: cKind[c], pts }));

  // the mask
  const m = arrays.mask;
  let mask: WalkCell["mask"] = { mode: 0, bits: null };
  if (m && m.length > 0) {
    const mode = m[0];
    if (mode === 2) {
      if (m.length !== 1251) throw new WalkDataError(`${where}: a mixed mask is not 1251 long`);
      mask = { mode: 2, bits: (m as Uint8Array).subarray(1) };
    } else if (mode === 0 || mode === 1) mask = { mode, bits: null };
    else throw new WalkDataError(`${where}: unknown mask mode ${mode}`);
  }
  const sh = arrays.shore;
  if (sh && sh.length !== 0 && sh.length !== 10000)
    throw new WalkDataError(`${where}: shore is not 10000 long`);
  const shore = sh && sh.length === 10000 ? (sh as Uint8Array) : null;

  // the network
  const nId = at("node.id");
  const nn = nId.length;
  const nXYZ = count("node.xyz", nn, 3);
  const nFlags = count("node.flags", nn);
  const nBearing = count("node.bearing", nn);
  const nodes: RoadNode[] = [];
  for (let x = 0; x < nn; x++)
    nodes.push({
      id: nId[x],
      e: nXYZ[x * 3] / 10,
      n: nXYZ[x * 3 + 1] / 10,
      z: nXYZ[x * 3 + 2] / 10,
      lights: (nFlags[x] & 1) !== 0,
      portal: (nFlags[x] & 2) !== 0,
      bearing: (nBearing[x] / 255) * Math.PI,
    });

  const sVerts = at("st.verts");
  const ns = sVerts.length;
  const sA = count("st.a", ns);
  const sB = count("st.b", ns);
  const sCls = count("st.cls", ns);
  const sFlags = count("st.flags", ns);
  const sWidth = count("st.width", ns);
  const sLines = lines(sVerts, at("st.xyz"), "st.xyz");
  const streets: StreetEdge[] = sLines.map((pts, s) => ({
    key: `${sA[s]}-${sB[s]}`,
    a: sA[s],
    b: sB[s],
    cls: sCls[s],
    link: (sFlags[s] & 1) !== 0,
    ow: (sFlags[s] & 2) !== 0 ? 1 : (sFlags[s] & 4) !== 0 ? -1 : 0,
    elevated: (sFlags[s] & 8) !== 0,
    width: sWidth[s] / 10,
    pts,
    length: planLength(pts),
  }));

  const kVerts = at("wk.verts");
  const nk = kVerts.length;
  const kA = count("wk.a", nk);
  const kB = count("wk.b", nk);
  const kFlags = count("wk.flags", nk);
  const kLines = lines(kVerts, at("wk.xyz"), "wk.xyz");
  const walks: WalkEdge[] = kLines.map((pts, k) => ({
    key: `${kA[k]}-${kB[k]}`,
    a: kA[k],
    b: kB[k],
    crosswalk: (kFlags[k] & 1) !== 0,
    phase: (kFlags[k] & 2) !== 0 ? 1 : (kFlags[k] & 4) !== 0 ? 2 : 0,
    elevated: (kFlags[k] & 8) !== 0,
    pts,
    length: planLength(pts),
  }));

  const eVerts = at("elev.verts");
  const ne = eVerts.length;
  const eKind = count("elev.kind", ne);
  const eWidth = count("elev.width", ne);
  const eLines = lines(eVerts, at("elev.xyz"), "elev.xyz");
  const eOwn = at("elev.own");
  runs(eVerts, eOwn, 1, "elev.own");
  const elevated: ElevatedWay[] = [];
  let ownAt = 0;
  eLines.forEach((pts, x) => {
    const k = pts.length / 3;
    elevated.push({
      kind: eKind[x],
      width: eWidth[x] / 10,
      pts,
      own: Uint8Array.from({ length: k }, (_, q) => eOwn[ownAt + q]),
    });
    ownAt += k;
  });

  const mXY = at("moor.xy");
  const nm = mXY.length / 2;
  const mHeading = count("moor.heading", nm);
  const mKind = count("moor.kind", nm);
  const moorings: Mooring[] = [];
  for (let x = 0; x < nm; x++)
    moorings.push({
      e: mXY[x * 2] / 10,
      n: mXY[x * 2 + 1] / 10,
      heading: (mHeading[x] / 255) * 2 * Math.PI,
      kind: mKind[x] === 1 ? "motorboat" : "speedboat",
    });

  return {
    i,
    j,
    key: `${i}_${j}`,
    volumes,
    ground,
    ways,
    trees,
    cables,
    mask,
    shore,
    nodes,
    streets,
    walks,
    elevated,
    moorings,
  };
}
