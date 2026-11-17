import { sizeFor, type Vehicle } from "./vehicles";

/**
 * A car or a boat as a box on the ground, for collisions: centre (east, north), yaw (radians from
 * north, clockwise), half length along the yaw and half width, mass (Infinity for what nothing
 * moves), velocity in the world's axes and turning (radians per second, clockwise).
 */
export interface Body {
  e: number;
  n: number;
  yaw: number;
  hl: number;
  hw: number;
  mass: number;
  ve: number;
  vn: number;
  w: number;
}

/** How deep two boxes overlap, the way that frees `a` from `b` (a unit vector), and where they touch. */
export interface Hit {
  depth: number;
  ne: number;
  nn: number;
  pe: number;
  pn: number;
}

/** A corner on the other box's edge counts as inside it. */
const EDGE = 1e-6;
/** Pushed this much further apart than the overlap, so they are clear of each other. */
const SLOP = 0.001;

/** How far a box reaches either side of its centre along a unit axis. */
function extent(b: Body, ax: number, ay: number): number {
  const s = Math.sin(b.yaw);
  const c = Math.cos(b.yaw);
  return b.hl * Math.abs(s * ax + c * ay) + b.hw * Math.abs(c * ax - s * ay);
}

function inside(b: Body, e: number, n: number): boolean {
  const s = Math.sin(b.yaw);
  const c = Math.cos(b.yaw);
  const de = e - b.e;
  const dn = n - b.n;
  return Math.abs(de * s + dn * c) <= b.hl + EDGE && Math.abs(de * c - dn * s) <= b.hw + EDGE;
}

function corners(b: Body): number[] {
  const s = Math.sin(b.yaw);
  const c = Math.cos(b.yaw);
  const out: number[] = [];
  for (const [f, r] of [
    [b.hl, b.hw],
    [b.hl, -b.hw],
    [-b.hl, -b.hw],
    [-b.hl, b.hw],
  ])
    out.push(b.e + s * f + c * r, b.n + c * f - s * r);
  return out;
}

/**
 * Whether two boxes overlap, by separating axes (each box's two): null when some axis parts them,
 * else the shallowest overlap, along the axis that gives it, turned to point from `b` to `a`. They
 * touch at the middle of the corners of each that are inside the other.
 */
export function overlap(a: Body, b: Body): Hit | null {
  const de = a.e - b.e;
  const dn = a.n - b.n;
  const sa = Math.sin(a.yaw);
  const ca = Math.cos(a.yaw);
  const sb = Math.sin(b.yaw);
  const cb = Math.cos(b.yaw);
  let depth = Infinity;
  let ne = 0;
  let nn = 0;
  for (const [ax, ay] of [
    [sa, ca],
    [ca, -sa],
    [sb, cb],
    [cb, -sb],
  ]) {
    const o = extent(a, ax, ay) + extent(b, ax, ay) - Math.abs(de * ax + dn * ay);
    if (o <= 0) return null;
    if (o < depth) {
      depth = o;
      ne = ax;
      nn = ay;
    }
  }
  if (de * ne + dn * nn < 0) {
    ne = -ne;
    nn = -nn;
  }
  let pe = 0;
  let pn = 0;
  let k = 0;
  const ka = corners(a);
  const kb = corners(b);
  for (let i = 0; i < 8; i += 2) {
    if (inside(b, ka[i], ka[i + 1])) {
      pe += ka[i];
      pn += ka[i + 1];
      k++;
    }
    if (inside(a, kb[i], kb[i + 1])) {
      pe += kb[i];
      pn += kb[i + 1];
      k++;
    }
  }
  if (k === 0) return { depth, ne, nn, pe: (a.e + b.e) / 2, pn: (a.n + b.n) / 2 };
  return { depth, ne, nn, pe: pe / k, pn: pn / k };
}

/**
 * Answers a hit: pushes the two apart (each by the other's share of the mass: what cannot move
 * stays), then, if they were closing, applies an impulse at the point they touch with a little
 * bounce (`restitution`), which spins each by where it was struck. Returns the speed they were
 * closing at along the normal, m/s (0 if they were already parting): what `applyDamage` takes.
 */
export function resolve(a: Body, b: Body, hit: Hit, restitution = 0.25): number {
  const { ne, nn, depth, pe, pn } = hit;
  const ia = 1 / a.mass;
  const ib = 1 / b.mass;
  const im = ia + ib;
  // from each centre to the contact, and the speed of each at it (w turns clockwise: a point
  // north of the centre moves east)
  const rae = pe - a.e;
  const ran = pn - a.n;
  const rbe = pe - b.e;
  const rbn = pn - b.n;
  const vae = a.ve + a.w * ran;
  const van = a.vn - a.w * rae;
  const vbe = b.ve + b.w * rbn;
  const vbn = b.vn - b.w * rbe;
  const vrel = (vae - vbe) * ne + (van - vbn) * nn;
  if (!(im > 0)) return vrel < 0 ? -vrel : 0;
  const pa = ((depth + SLOP) * ia) / im;
  const pb = ((depth + SLOP) * ib) / im;
  a.e += ne * pa;
  a.n += nn * pa;
  b.e -= ne * pb;
  b.n -= nn * pb;
  if (vrel >= 0) return 0;
  // a box's moment of inertia about its centre: m (L² + W²) / 12
  const iia = (3 * ia) / (a.hl * a.hl + a.hw * a.hw);
  const iib = (3 * ib) / (b.hl * b.hl + b.hw * b.hw);
  const xa = rae * nn - ran * ne;
  const xb = rbe * nn - rbn * ne;
  const j = (-(1 + restitution) * vrel) / (im + xa * xa * iia + xb * xb * iib);
  a.ve += j * ne * ia;
  a.vn += j * nn * ia;
  a.w -= j * xa * iia;
  b.ve -= j * ne * ib;
  b.vn -= j * nn * ib;
  b.w += j * xb * iib;
  return -vrel;
}

/** A vehicle as a box, its speeds along and across its heading turned into east and north. */
export function bodyOf(v: Vehicle): Body {
  const size = sizeFor(v);
  const s = Math.sin(v.yaw);
  const c = Math.cos(v.yaw);
  return {
    e: v.e,
    n: v.n,
    yaw: v.yaw,
    hl: size.length / 2,
    hw: size.width / 2,
    mass: size.mass,
    ve: v.v * s + v.vs * c,
    vn: v.v * c - v.vs * s,
    w: v.w,
  };
}

/** Puts a body's place and speeds back on its vehicle. */
export function applyBody(v: Vehicle, b: Body): void {
  v.e = b.e;
  v.n = b.n;
  v.yaw = b.yaw;
  const s = Math.sin(b.yaw);
  const c = Math.cos(b.yaw);
  v.v = b.ve * s + b.vn * c;
  v.vs = b.ve * c - b.vn * s;
  v.w = b.w;
}
