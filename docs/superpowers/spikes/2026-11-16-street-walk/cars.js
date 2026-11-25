// Street-level spike (throwaway): cars and people. Traffic on the real street network (one-way
// streets as they are, lights at the crossings), cars parked along the kerbs, people on the real
// sidewalks and crosswalks, and any car yours to drive and crash.
//
// World space: metres east (e) and north (n); three.js x = e, y = up, z = -n. Headings are compass
// degrees (0 north, clockwise). A model's front is -Z, its right +X. Angular velocity `w` is
// counter-clockwise, in rad/s.

import * as THREE from "three";

const RAD = Math.PI / 180;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapDeg = (a) => ((((a + 180) % 360) + 360) % 360) - 180;
function mulberry(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- models: boxes and tapered boxes, each face a part the shader colours ----------
const BODY = 0, GLASS = 1, TYRE = 2, HEAD = 3, TAIL = 4, SIGN = 5, TRIM = 6, STRIPE = 7, CARGO = 8, AMBER = 9;
const LAMP_R = 10, LAMP_Y = 11, LAMP_G = 12, HOUSING = 13, WSTRIPE = 14, POL_R = 15, POL_B = 16;
const SHIRT = 0, PANTS = 1, SKIN = 2, HAIR = 3, SHOE = 4;

function modelBuilder() {
  const pos = [], nor = [], part = [], limbs = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), nv = new THREE.Vector3(), mid = new THREE.Vector3();
  const M = { limb: 0 };
  function quad(p0, p1, p2, p3, centre, pt) {
    a.subVectors(p1, p0); b.subVectors(p2, p0); nv.crossVectors(a, b).normalize();
    mid.addVectors(p0, p2).multiplyScalar(0.5).sub(centre);
    let q = [p0, p1, p2, p3];
    if (nv.dot(mid) < 0) { q = [p0, p3, p2, p1]; nv.negate(); }
    for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i].x, q[i].y, q[i].z); nor.push(nv.x, nv.y, nv.z); part.push(pt); limbs.push(M.limb); }
  }
  M.prism = (bx0, bx1, bz0, bz1, y0, tx0, tx1, tz0, tz1, y1, parts) => {
    const P = typeof parts === "number" ? { top: parts, bottom: parts, front: parts, back: parts, side: parts } : parts;
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const b00 = V(bx0, y0, bz0), b10 = V(bx1, y0, bz0), b11 = V(bx1, y0, bz1), b01 = V(bx0, y0, bz1);
    const t00 = V(tx0, y1, tz0), t10 = V(tx1, y1, tz0), t11 = V(tx1, y1, tz1), t01 = V(tx0, y1, tz1);
    const c = V((bx0 + bx1 + tx0 + tx1) / 4, (y0 + y1) / 2, (bz0 + bz1 + tz0 + tz1) / 4);
    if (P.top != null) quad(t00, t10, t11, t01, c, P.top);
    if (P.bottom != null) quad(b00, b10, b11, b01, c, P.bottom);
    if (P.front != null) quad(b00, b10, t10, t00, c, P.front);
    if (P.back != null) quad(b01, b11, t11, t01, c, P.back);
    if (P.side != null) { quad(b00, b01, t01, t00, c, P.side); quad(b10, b11, t11, t10, c, P.side); }
  };
  M.box = (x0, x1, y0, y1, z0, z1, parts) => M.prism(x0, x1, z0, z1, y0, x0, x1, z0, z1, y1, parts);
  M.pair = (x0, x1, y0, y1, z0, z1, parts) => { M.box(x0, x1, y0, y1, z0, z1, parts); M.box(-x1, -x0, y0, y1, z0, z1, parts); };
  M.geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute("part", new THREE.Float32BufferAttribute(part, 1));
    g.setAttribute("limb", new THREE.Float32BufferAttribute(limbs, 1));
    return g;
  };
  return M;
}

function car(M, o = {}) {
  const { len = 4.6, hw = 0.9, wheel = 0.64, y0 = 0.3, y1 = 0.8, cab = [-1.05, 1.3, -0.45, 0.95], roof = 1.42 } = o;
  const hl = len / 2;
  for (const z of [-hl + 0.85, hl - 0.9]) M.pair(hw - 0.24, hw + 0.03, 0, wheel, z - wheel / 2, z + wheel / 2, TYRE);
  M.box(-hw, hw, y0, y1, -hl, hl, BODY);
  M.box(-hw + 0.04, hw - 0.04, y0 - 0.05, y0 + 0.17, -hl - 0.06, -hl + 0.02, TRIM);
  M.box(-hw + 0.04, hw - 0.04, y0 - 0.05, y0 + 0.17, hl - 0.02, hl + 0.06, TRIM);
  M.pair(hw - 0.42, hw - 0.1, y1 - 0.2, y1 - 0.07, -hl - 0.03, -hl + 0.01, HEAD);
  M.pair(hw - 0.38, hw - 0.08, y1 - 0.2, y1 - 0.06, hl - 0.01, hl + 0.03, TAIL);
  M.prism(-hw + 0.05, hw - 0.05, cab[0], cab[1], y1, -hw + 0.17, hw - 0.17, cab[2], cab[3], roof, { top: BODY, front: GLASS, back: GLASS, side: GLASS });
}
// mass kg, grip (how fast sideways sliding dies), armor (how much a crash hurts), vmax m/s, acc m/s²,
// steer rad, wheelbase m, roof m (what you stand on), eye [height, z] at the wheel
const BASE = { mass: 1500, grip: 11, armor: 1, vmax: 42, vrev: 9, acc: 7, steer: 0.6, wheelbase: 2.75, roof: 1.42, eye: [1.15, 0.1] };
const TYPES = {
  sedan: { name: "sedan", len: 4.6, wid: 1.8, colors: ["carWhite", "carBlack", "carRed", "carBlue", "steel", "greyStone", "carBlack", "carWhite", "sidingBlue"], model: (M) => car(M) },
  taxi: { name: "taxi", len: 4.6, wid: 1.8, mass: 1600, vmax: 40, colors: ["taxi"], model: (M) => { car(M); M.box(-0.3, 0.3, 1.42, 1.62, 0.05, 0.42, SIGN); } },
  suv: {
    name: "SUV", len: 4.95, wid: 1.95, mass: 2100, grip: 10, vmax: 38, vrev: 8, acc: 6.2, steer: 0.56, wheelbase: 2.9, roof: 1.8, eye: [1.45, 0],
    colors: ["carBlack", "carBlack", "carWhite", "steel", "darkStone", "carBlue", "carRed"],
    model: (M) => { car(M, { len: 4.95, hw: 0.97, wheel: 0.74, y0: 0.38, y1: 1.02, cab: [-1.25, 2.3, -0.85, 2.2], roof: 1.8 }); M.pair(0.62, 0.7, 1.8, 1.86, -0.6, 2.0, TRIM); },
  },
  compact: {
    name: "hatchback", len: 3.9, wid: 1.72, mass: 1100, grip: 11.5, vmax: 40, acc: 7.5, steer: 0.66, wheelbase: 2.45, roof: 1.5, eye: [1.15, 0],
    colors: ["carRed", "carBlue", "mint", "carWhite", "ochre", "ipePink", "sidingSage", "taxi"],
    model: (M) => car(M, { len: 3.9, hw: 0.86, wheel: 0.6, y0: 0.3, y1: 0.82, cab: [-0.75, 1.62, -0.35, 1.5], roof: 1.5 }),
  },
  sports: {
    name: "sports car", len: 4.4, wid: 1.9, mass: 1350, grip: 13, vmax: 64, acc: 13, steer: 0.55, wheelbase: 2.6, roof: 1.18, eye: [0.95, 0.35],
    colors: ["carRed", "taxi", "carBlue", "carWhite", "carBlack", "ferryOrange"],
    model: (M) => {
      car(M, { len: 4.4, hw: 0.95, wheel: 0.62, y0: 0.22, y1: 0.66, cab: [-0.55, 1.2, -0.1, 0.95], roof: 1.18 });
      M.pair(0.6, 0.68, 0.66, 0.95, 1.85, 2.0, TRIM);
      M.box(-0.9, 0.9, 0.95, 1.0, 1.75, 2.15, BODY);
    },
  },
  supercar: {
    name: "supercar", len: 4.5, wid: 2.0, mass: 1400, grip: 14.5, vmax: 82, acc: 18, steer: 0.52, wheelbase: 2.7, roof: 1.1, eye: [0.88, 0.45],
    colors: ["carRed", "ferryOrange", "mint", "gold", "libertyGreen", "taxi", "carWhite"],
    model: (M) => {
      const hl = 2.25, hw = 1.0;
      for (const z of [-1.4, 1.35]) M.pair(hw - 0.26, hw + 0.03, 0, 0.66, z - 0.33, z + 0.33, TYRE);
      M.prism(-hw, hw, -hl, hl, 0.2, -hw + 0.04, hw - 0.04, -1.5, hl - 0.05, 0.64, BODY);
      M.prism(-hw + 0.12, hw - 0.12, -0.75, 1.45, 0.64, -0.6, 0.6, -0.05, 1.1, 1.1, { top: BODY, front: GLASS, side: GLASS, back: GLASS });
      M.box(-0.95, 0.95, 0.98, 1.03, 1.85, 2.2, BODY);
      M.pair(0.55, 0.63, 0.64, 0.98, 1.95, 2.1, TRIM);
      M.pair(hw - 0.42, hw - 0.12, 0.3, 0.38, -2.2, -2.05, HEAD);
      M.pair(hw - 0.45, hw - 0.1, 0.42, 0.55, hl - 0.06, hl - 0.02, TAIL);
      M.box(-0.7, 0.7, 0.18, 0.3, hl - 0.05, hl + 0.04, TRIM);
    },
  },
  muscle: {
    name: "muscle car", len: 4.9, wid: 1.9, mass: 1650, grip: 7.5, vmax: 60, acc: 12, steer: 0.55, wheelbase: 2.9, roof: 1.32, eye: [1.1, 0.6],
    colors: ["carBlack", "carRed", "carBlue", "ochre", "libertyGreen", "taxi"],
    model: (M) => {
      car(M, { len: 4.9, hw: 0.95, wheel: 0.68, y0: 0.3, y1: 0.86, cab: [-0.1, 1.55, 0.3, 1.35], roof: 1.32 });
      M.pair(0.12, 0.32, 0.86, 0.885, -2.45, -0.1, { top: WSTRIPE });
      M.pair(0.12, 0.32, 1.32, 1.345, 0.3, 1.35, { top: WSTRIPE });
      M.box(-0.3, 0.3, 0.86, 1.0, -1.6, -0.9, BODY);
    },
  },
  pickup: {
    name: "pickup", len: 5.3, wid: 2.0, mass: 2300, grip: 9.5, vmax: 40, acc: 6.5, steer: 0.55, wheelbase: 3.35, roof: 1.86, eye: [1.5, -0.2],
    colors: ["carRed", "carBlack", "carWhite", "steel", "carBlue", "darkStone"],
    model: (M) => {
      const hl = 2.65, hw = 1.0;
      for (const z of [-1.75, 1.6]) M.pair(hw - 0.26, hw + 0.03, 0, 0.78, z - 0.39, z + 0.39, TYRE);
      M.box(-hw, hw, 0.45, 1.08, -hl, hl, BODY);
      M.prism(-hw + 0.05, hw - 0.05, -1.05, 0.55, 1.08, -hw + 0.14, hw - 0.14, -0.65, 0.5, 1.86, { top: BODY, front: GLASS, side: GLASS, back: GLASS });
      M.pair(hw - 0.08, hw, 1.08, 1.3, 0.65, hl, BODY);
      M.box(-hw, hw, 1.08, 1.3, hl - 0.08, hl, BODY);
      M.box(-hw + 0.08, hw - 0.08, 1.08, 1.1, 0.65, hl - 0.08, { top: TRIM });
      M.box(-hw + 0.04, hw - 0.04, 0.4, 0.62, -hl - 0.07, -hl + 0.02, TRIM);
      M.pair(hw - 0.42, hw - 0.1, 0.85, 0.98, -hl - 0.03, -hl + 0.01, HEAD);
      M.pair(hw - 0.12, hw - 0.02, 0.75, 1.15, hl - 0.01, hl + 0.03, TAIL);
    },
  },
  limo: {
    name: "limousine", len: 6.9, wid: 1.86, mass: 2600, grip: 9, vmax: 40, acc: 5.5, steer: 0.5, wheelbase: 4.6, roof: 1.46, eye: [1.15, -0.9],
    colors: ["carBlack", "carBlack", "carBlack", "carWhite"],
    model: (M) => car(M, { len: 6.9, hw: 0.93, wheel: 0.66, y0: 0.32, y1: 0.84, cab: [-1.9, 2.75, -1.45, 2.45], roof: 1.46 }),
  },
  police: {
    name: "police car", len: 4.7, wid: 1.85, mass: 1800, grip: 12, vmax: 52, acc: 10, colors: ["carWhite"],
    model: (M) => {
      car(M, { len: 4.7, hw: 0.92 });
      M.box(-0.935, 0.935, 0.52, 0.62, -2.25, 2.25, { side: STRIPE });
      M.box(-0.6, -0.02, 1.42, 1.56, 0.1, 0.42, POL_R);
      M.box(0.02, 0.6, 1.42, 1.56, 0.1, 0.42, POL_B);
    },
  },
  van: {
    name: "box truck", len: 6.8, wid: 2.3, mass: 5500, grip: 9, armor: 2, vmax: 28, vrev: 6, acc: 3.6, steer: 0.55, wheelbase: 4.1, roof: 3.2, eye: [2.0, -2.35],
    colors: ["carWhite", "carRed", "carBlue", "steel", "taxi"],
    model: (M) => {
      const hl = 3.4, hw = 1.15;
      for (const z of [-2.55, 1.6, 2.55]) M.pair(hw - 0.3, hw + 0.02, 0, 0.9, z - 0.45, z + 0.45, TYRE);
      M.box(-hw + 0.05, hw - 0.05, 0.45, 1.3, -hl, -1.7, BODY);
      M.prism(-hw + 0.05, hw - 0.05, -3.2, -1.7, 1.3, -hw + 0.12, hw - 0.12, -2.75, -1.7, 2.4, { top: BODY, front: GLASS, side: GLASS, back: BODY });
      M.box(-hw, hw, 0.65, 3.2, -1.62, hl, CARGO);
      M.box(-hw + 0.08, hw - 0.08, 0.38, 0.6, -hl - 0.06, -hl + 0.02, TRIM);
      M.pair(hw - 0.45, hw - 0.12, 0.95, 1.1, -hl - 0.03, -hl + 0.01, HEAD);
      M.pair(hw - 0.3, hw - 0.08, 0.75, 0.95, hl - 0.01, hl + 0.03, TAIL);
    },
  },
  bus: {
    name: "bus", len: 12, wid: 2.55, mass: 12000, grip: 9, armor: 3, vmax: 24, vrev: 5, acc: 2.4, steer: 0.62, wheelbase: 6.6, roof: 3.0, eye: [2.3, -5.3],
    colors: ["carWhite"],
    model: (M) => {
      const hl = 6, hw = 1.27;
      for (const z of [-3.9, 3.3]) M.pair(hw - 0.32, hw + 0.02, 0, 1.0, z - 0.5, z + 0.5, TYRE);
      M.box(-hw, hw, 0.32, 3.0, -hl, hl, BODY);
      M.box(-hw - 0.015, hw + 0.015, 1.4, 2.55, -4.9, 5.6, { side: GLASS });
      M.box(-hw + 0.12, hw - 0.12, 1.5, 2.6, hl - 0.1, hl + 0.02, { back: GLASS });
      M.box(-hw + 0.1, hw - 0.1, 1.0, 2.6, -hl - 0.02, -hl + 0.1, { front: GLASS });
      M.box(-hw - 0.02, hw + 0.02, 0.95, 1.18, -hl + 0.1, hl - 0.1, { side: STRIPE });
      M.box(-0.95, 0.95, 2.66, 2.9, -hl - 0.04, -hl + 0.1, { front: AMBER });
      M.box(-0.75, 0.75, 3.0, 3.28, -2.2, 1.6, TRIM);
      M.box(-hw + 0.06, hw - 0.06, 0.25, 0.45, -hl - 0.07, -hl + 0.02, TRIM);
      M.pair(hw - 0.4, hw - 0.12, 0.6, 0.78, -hl - 0.04, -hl + 0.01, HEAD);
      M.pair(hw - 0.3, hw - 0.1, 0.6, 1.0, hl - 0.01, hl + 0.03, TAIL);
    },
  },
};
for (const T of Object.values(TYPES)) {
  Object.assign(T, { ...BASE, ...T });
  T.inertia = (T.mass * (T.len * T.len + T.wid * T.wid)) / 12;
}
const signalModel = (M) => {
  M.box(-0.07, 0.07, 0, 3.0, -0.07, 0.07, TRIM);
  M.box(-0.2, 0.2, 2.95, 4.05, -0.18, 0.18, HOUSING);
  for (const [y, p] of [[3.82, LAMP_R], [3.5, LAMP_Y], [3.18, LAMP_G]]) M.box(-0.11, 0.11, y - 0.11, y + 0.11, -0.23, -0.17, { front: p });
};
// a person, 1.75 m: legs swing about the hip (limbs 1, 2), arms about the shoulder (3, 4)
const personModel = (M) => {
  for (const [s, limb] of [[-1, 1], [1, 2]]) {
    M.limb = limb;
    M.box(Math.min(s * 0.03, s * 0.17), Math.max(s * 0.03, s * 0.17), 0.1, 0.88, -0.07, 0.08, PANTS);
    M.box(Math.min(s * 0.025, s * 0.175), Math.max(s * 0.025, s * 0.175), 0, 0.1, -0.12, 0.09, SHOE);
  }
  M.limb = 0;
  M.box(-0.2, 0.2, 0.86, 1.43, -0.11, 0.11, SHIRT);
  M.box(-0.07, 0.07, 1.43, 1.48, -0.06, 0.06, SKIN);
  M.box(-0.11, 0.11, 1.48, 1.72, -0.11, 0.11, SKIN);
  M.box(-0.12, 0.12, 1.66, 1.77, -0.12, 0.12, HAIR);
  M.box(-0.12, 0.12, 1.5, 1.66, 0.08, 0.12, HAIR);
  for (const [s, limb] of [[-1, 3], [1, 4]]) {
    M.limb = limb;
    M.box(Math.min(s * 0.2, s * 0.29), Math.max(s * 0.2, s * 0.29), 0.9, 1.42, -0.06, 0.06, SHIRT);
    M.box(Math.min(s * 0.205, s * 0.285), Math.max(s * 0.205, s * 0.285), 0.78, 0.9, -0.05, 0.05, SKIN);
  }
  M.limb = 0;
};

const MIX = {
  avenue: { taxi: 0.3, sedan: 0.15, suv: 0.14, compact: 0.07, limo: 0.06, van: 0.09, bus: 0.06, pickup: 0.03, police: 0.04, sports: 0.02, muscle: 0.02, supercar: 0.02 },
  highway: { sedan: 0.25, suv: 0.22, taxi: 0.1, compact: 0.06, van: 0.12, pickup: 0.08, sports: 0.05, muscle: 0.04, supercar: 0.03, police: 0.03, bus: 0.02 },
  street: { taxi: 0.24, sedan: 0.22, suv: 0.18, compact: 0.1, van: 0.1, pickup: 0.05, limo: 0.03, police: 0.03, sports: 0.02, muscle: 0.02, supercar: 0.01 },
  parked: { sedan: 0.28, suv: 0.26, compact: 0.14, pickup: 0.06, van: 0.07, taxi: 0.04, sports: 0.05, muscle: 0.04, limo: 0.02, supercar: 0.02, police: 0.02 },
};
const pick = (mix, r) => {
  const total = Object.values(mix).reduce((s, p) => s + p, 0);
  let acc = 0;
  for (const [k, p] of Object.entries(mix)) { acc += p / total; if (r < acc) return k; }
  return Object.keys(mix)[0];
};

export async function createCars(ctx) {
  const { scene, camera, renderer, PAL, RI, FOG, commonUniforms, SUN, blocked, cellReady, act, keyName, getStick, me, walkEl } = ctx;
  const ROADS = await fetch("world/roads.json", { cache: "no-store" }).then((r) => r.json());
  const NODES = ROADS.nodes, EDGES = ROADS.edges.filter((E) => E.a !== E.b), WALKS = ROADS.walks;
  const nNodes = NODES.length / 2;
  const palRGB = (ramp, shade) => PAL.rgb[RI[ramp] * 6 + shade].map((v) => v / 255);

  // ---------- polylines ----------
  const polyOf = (pts) => {
    const cum = [0];
    for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
    return { pts, cum, len: cum[cum.length - 1] };
  };
  /** [e, n, unit tangent e, unit tangent n] at distance s along a polyline (clamped) */
  function at(P, s) {
    s = clamp(s, 0, P.len);
    let lo = 0, hi = P.cum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (P.cum[m] <= s) lo = m; else hi = m; }
    const seg = P.cum[hi] - P.cum[lo];
    const de = P.pts[hi * 2] - P.pts[lo * 2], dn = P.pts[hi * 2 + 1] - P.pts[lo * 2 + 1];
    const t = seg > 1e-6 ? (s - P.cum[lo]) / seg : 0, l = Math.hypot(de, dn) || 1;
    return [P.pts[lo * 2] + de * t, P.pts[lo * 2 + 1] + dn * t, de / l, dn / l];
  }
  function sub(P, s0, s1) {
    const a = at(P, s0), pts = [a[0], a[1]];
    for (let i = 0; i < P.cum.length; i++) if (P.cum[i] > s0 + 0.05 && P.cum[i] < s1 - 0.05) pts.push(P.pts[i * 2], P.pts[i * 2 + 1]);
    const b = at(P, Math.max(s1, s0 + 0.01));
    pts.push(b[0], b[1]);
    return polyOf(pts);
  }
  /** the polyline moved `off` metres to its right (negative: left), mitred */
  function offsetPoly(p, off) {
    const n = p.length / 2, out = new Array(p.length);
    const segN = (j) => { const de = p[j * 2 + 2] - p[j * 2], dn = p[j * 2 + 3] - p[j * 2 + 1], l = Math.hypot(de, dn) || 1; return [dn / l, -de / l]; };
    for (let i = 0; i < n; i++) {
      let ne = 0, nn = 0;
      if (i > 0) { const s = segN(i - 1); ne += s[0]; nn += s[1]; }
      if (i < n - 1) { const s = segN(i); ne += s[0]; nn += s[1]; }
      const l = Math.hypot(ne, nn) || 1;
      ne /= l; nn /= l;
      let m = 1;
      if (i > 0 && i < n - 1) { const s = segN(i); m = 1 / Math.max(0.5, ne * s[0] + nn * s[1]); }
      out[i * 2] = p[i * 2] + ne * off * m;
      out[i * 2 + 1] = p[i * 2 + 1] + nn * off * m;
    }
    return polyOf(out);
  }
  const reversed = (p) => { const out = []; for (let i = p.length - 2; i >= 0; i -= 2) out.push(p[i], p[i + 1]); return out; };

  // ---------- the street network ----------
  const touch = Array.from({ length: nNodes }, () => []);
  const deps = Array.from({ length: nNodes }, () => []);
  EDGES.forEach((E, ei) => {
    E.poly = polyOf(E.p);
    E.len = E.poly.len;
    E.lanes = E.ow ? clamp(Math.floor((E.w - 4.4) / 3.1), 1, 5) : clamp(Math.floor((E.w / 2 - 2.2) / 3.1), 1, 3);
    touch[E.a].push(ei);
    touch[E.b].push(ei);
    if (E.ow >= 0) deps[E.a].push({ ei, dir: 1 });
    if (E.ow <= 0) deps[E.b].push({ ei, dir: -1 });
  });
  const laneOff = (E, k) => (E.ow ? (k - (E.lanes - 1) / 2) * 3.1 : 1.55 + 3.1 * k);
  const laneCache = new Map();
  function lanePoly(ei, dir, k) {
    const key = ei * 16 + (dir > 0 ? 0 : 8) + k;
    let P = laneCache.get(key);
    if (!P) { const E = EDGES[ei]; laneCache.set(key, (P = offsetPoly(dir > 0 ? E.p : reversed(E.p), laneOff(E, k)))); }
    return P;
  }
  function leaveAng(ei, node) {
    const E = EDGES[ei], d = Math.min(6, E.len * 0.5);
    const p0 = at(E.poly, node === E.a ? 0 : E.len), p1 = at(E.poly, node === E.a ? d : E.len - d);
    return Math.atan2(p1[0] - p0[0], p1[1] - p0[1]);
  }
  function rAt(ei, node) {
    const E = EDGES[ei], es = touch[node];
    if (es.length < 3) return Math.min(0.6, E.len * 0.3);
    let w = 0;
    for (const o of es) if (o !== ei) w = Math.max(w, EDGES[o].w);
    return Math.min(w / 2 + 1.0, E.len * 0.42);
  }
  // lights: at crossings of three ways or more; two phases, along the widest street and across it
  const sig = new Uint8Array(nNodes), refAng = new Float32Array(nNodes);
  for (let n = 0; n < nNodes; n++) {
    const es = touch[n];
    if (es.length < 3 || es.every((ei) => EDGES[ei].c === "motorway" || EDGES[ei].c === "trunk")) continue;
    sig[n] = 1;
    let w = -1;
    for (const ei of es) if (EDGES[ei].w > w) { w = EDGES[ei].w; refAng[n] = leaveAng(ei, n); }
  }
  const groupOf = (ei, node) => (Math.abs(Math.sin(leaveAng(ei, node) - refAng[node])) < 0.5 ? 0 : 1);
  const CYCLE = 34;
  const phaseX = (group, t) => (t + (group ? CYCLE / 2 : 0)) % CYCLE;
  /** 0 green, 1 yellow, 2 red */
  const light = (group, t) => { const x = phaseX(group, t); return x < 13 ? 0 : x < 16 ? 1 : 2; };
  const greenLeft = (group, t) => { const x = phaseX(group, t); return x < 13 ? 13 - x : 0; };

  // spatial grids (100 m)
  const GM = 100;
  const gk = (e, n) => `${Math.floor(e / GM)}_${Math.floor(n / GM)}`;
  const gridPush = (grid, e, n, v) => { const k = gk(e, n); let l = grid.get(k); if (!l) grid.set(k, (l = [])); l.push(v); return k; };
  function gridNear(grid, e, n, r, fn) {
    const i0 = Math.floor((e - r) / GM), i1 = Math.floor((e + r) / GM), j0 = Math.floor((n - r) / GM), j1 = Math.floor((n + r) / GM);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const l = grid.get(`${i}_${j}`); if (l) for (const v of l) fn(v); }
  }
  function gridOfPolys(list) {
    const grid = new Map();
    list.forEach((X, i) => {
      const seen = new Set();
      for (let s = 0; s <= X.len + 1; s += 15) { const p = at(X.poly, s), k = gk(p[0], p[1]); if (!seen.has(k)) { seen.add(k); gridPush(grid, p[0], p[1], i); } }
    });
    return grid;
  }
  const egrid = gridOfPolys(EDGES);

  // ---------- where people walk ----------
  const ftouch = Array.from({ length: nNodes }, () => []);
  WALKS.forEach((W, wi) => { W.poly = polyOf(W.p); W.len = W.poly.len; ftouch[W.a].push(wi); ftouch[W.b].push(wi); });
  for (const W of WALKS) {
    if (!W.x) continue;
    const m = at(W.poly, W.len / 2);
    let best = -1, bd = 30;
    gridNear(egrid, m[0], m[1], 30, (ei) => {
      for (const nd of [EDGES[ei].a, EDGES[ei].b]) if (sig[nd]) { const d = Math.hypot(NODES[nd * 2] - m[0], NODES[nd * 2 + 1] - m[1]); if (d < bd) { bd = d; best = nd; } }
    });
    if (best < 0) continue;
    const a0 = at(W.poly, 0), a1 = at(W.poly, W.len);
    W.sig = best;
    W.pg = Math.abs(Math.sin(Math.atan2(a1[0] - a0[0], a1[1] - a0[1]) - refAng[best])) < 0.5 ? 0 : 1; // the phase you cross with
  }
  const wgrid = gridOfPolys(WALKS);
  const walkCache = new Map();
  function walkPoly(wi, dir) {
    const key = wi * 2 + (dir > 0 ? 0 : 1);
    let P = walkCache.get(key);
    if (!P) walkCache.set(key, (P = dir > 0 ? WALKS[wi].poly : polyOf(reversed(WALKS[wi].p))));
    return P;
  }

  // ---------- cars ----------
  let nextId = 1;
  function makeCar(kind, e, n, h, mode, r = Math.random) {
    const T = TYPES[kind];
    const c = { id: nextId++, kind, T, ramp: RI[T.colors[Math.floor(r() * T.colors.length)]], e, n, h: 0, len: T.len, wid: T.wid, mode, speed: 0, lit: 0, ve: 0, vn: 0, w: 0, dmg: 0, fire: 0, sndT: 0 };
    setH(c, h);
    return c;
  }
  function setH(c, h) { c.h = ((h % 360) + 360) % 360; c.sh = Math.sin(c.h * RAD); c.ch = Math.cos(c.h * RAD); }
  function obbDist(o, e, n) {
    const de = e - o.e, dn = n - o.n;
    const f = de * o.sh + dn * o.ch, r = de * o.ch - dn * o.sh;
    return Math.hypot(Math.max(0, Math.abs(f) - o.len / 2), Math.max(0, Math.abs(r) - o.wid / 2));
  }
  function hitsBuilding(c, e, n, h) {
    const s = Math.sin(h * RAD), co = Math.cos(h * RAD), hl = c.len / 2 - 0.15, hw = c.wid / 2 - 0.2;
    for (const f of [-hl, 0, hl]) for (const r of [-hw, hw]) if (blocked(e + s * f + co * r, n + co * f - s * r)) return true;
    return false;
  }
  const speedOf = (c) => (c.mode === "traffic" ? c.speed : Math.hypot(c.ve, c.vn));

  // parked: along the kerbs, both sides, facing the traffic beside them
  const pgrid = new Map();
  const PARK = new Set(["residential", "tertiary", "secondary", "primary", "unclassified"]);
  let nParked = 0;
  EDGES.forEach((E, ei) => {
    if (!PARK.has(E.c) || E.len < 22) return;
    const outer = E.ow ? ((E.lanes - 1) / 2) * 3.1 + 1.25 : 1.55 + 3.1 * (E.lanes - 1) + 1.25;
    const off = E.w / 2 - 1.15;
    if (off - 0.95 < outer) return;
    const R = mulberry(ei * 7919 + 17);
    for (const side of [1, -1]) {
      const P = offsetPoly(E.p, side * off);
      const facing = E.ow ? E.ow : side;
      const s1 = P.len - rAt(ei, E.b) - 3;
      for (let s = rAt(ei, E.a) + 3 + R() * 3; s < s1; ) {
        const kind = pick(MIX.parked, R());
        const len = TYPES[kind].len;
        if (s + len > s1) break;
        if (R() < 0.66) {
          const [e, n, te, tn] = at(P, s + len / 2);
          const c = makeCar(kind, e, n, Math.atan2(te * facing, tn * facing) / RAD, "parked", R);
          c.cell = gridPush(pgrid, e, n, c);
          nParked++;
        }
        s += len + 1.0 + R() * 1.6;
      }
    }
  });
  // a red supercar waiting where you start
  {
    let best = null, bd = 40;
    gridNear(pgrid, me.e, me.n, 40, (c) => { const d = Math.hypot(c.e - me.e, c.n - me.n); if (d < bd) { bd = d; best = c; } });
    if (best) Object.assign(best, { kind: "supercar", T: TYPES.supercar, len: TYPES.supercar.len, wid: TYPES.supercar.wid, ramp: RI.carRed });
  }

  // signal posts: one per way into a crossing, on its right, facing the cars that come
  const sgrid = new Map();
  let nSignals = 0;
  for (let node = 0; node < nNodes; node++) {
    if (!sig[node]) continue;
    for (const ei of touch[node]) {
      const E = EDGES[ei];
      if (!((E.b === node && E.ow >= 0) || (E.a === node && E.ow <= 0))) continue;
      const ang = leaveAng(ei, node), r = rAt(ei, node);
      const ne = NODES[node * 2] + Math.sin(ang) * r, nn = NODES[node * 2 + 1] + Math.cos(ang) * r;
      const out = E.w / 2 + 0.8;
      const s = { e: ne - Math.cos(ang) * out, n: nn + Math.sin(ang) * out, h: ang / RAD, node, group: groupOf(ei, node) };
      gridPush(sgrid, s.e, s.n, s);
      nSignals++;
    }
  }

  // ---------- traffic ----------
  const traffic = [], loose = [], peds = [];
  let vis = [], visSig = [], gatherT = 0;
  const drive = { car: null, steer: 0, view: 0, look: 0, lookPitch: -6, lookT: 0, camYaw: 0, pitch: 0, shake: 0, vf: 0, accel: 0 };
  const TARGET = 70, SPAWN_R = 320, DESPAWN_R = 380;
  function laneLeg(ei, dir, lane, s0, s1) {
    const E = EDGES[ei], P = sub(lanePoly(ei, dir, lane), s0, s1);
    const end = dir > 0 ? E.b : E.a;
    P.speed = E.v;
    if (sig[end]) P.stop = { node: end, group: groupOf(ei, end) };
    return P;
  }
  function spawn(fe, fn, rMin, rMax) {
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const list = egrid.get(gk(fe + Math.sin(a) * r, fn + Math.cos(a) * r));
      if (!list?.length) continue;
      const ei = list[Math.floor(Math.random() * list.length)], E = EDGES[ei];
      if (E.len < 14) continue;
      const dir = E.ow ? E.ow : Math.random() < 0.5 ? 1 : -1;
      const lane = Math.floor(Math.random() * E.lanes);
      const P = lanePoly(ei, dir, lane);
      const r0 = rAt(ei, dir > 0 ? E.a : E.b), r1 = rAt(ei, dir > 0 ? E.b : E.a);
      if (P.len - r0 - r1 < 6) continue;
      const s = r0 + Math.random() * (P.len - r0 - r1 - 3);
      const [pe, pn] = at(P, s);
      if (Math.hypot(pe - me.e, pn - me.n) < rMin) continue;
      if (traffic.some((o) => Math.abs(o.e - pe) < 12 && Math.abs(o.n - pn) < 12)) continue;
      if (loose.some((o) => Math.abs(o.e - pe) < 8 && Math.abs(o.n - pn) < 8)) continue;
      const kind = pick(E.c === "motorway" || E.c === "trunk" ? MIX.highway : E.c === "primary" || E.c === "secondary" ? MIX.avenue : MIX.street, Math.random());
      const c = makeCar(kind, pe, pn, 0, "traffic");
      Object.assign(c, { legs: [laneLeg(ei, dir, lane, s, P.len - r1)], d: 0, tail: { ei, dir, lane }, temper: 0.82 + Math.random() * 0.28, speed: E.v * 0.5, wait: 0, ghost: 0 });
      traffic.push(c);
      return c;
    }
    return null;
  }
  function appendNext(c) {
    const { ei, dir, lane } = c.tail, E = EDGES[ei];
    const node = dir > 0 ? E.b : E.a;
    const last = c.legs[c.legs.length - 1];
    const end = at(last, last.len);
    let opts = deps[node].filter((o) => o.ei !== ei);
    if (!opts.length) {
      if (!E.ow) opts = [{ ei, dir: -dir }];
      else { c.dead = true; return; }
    }
    const inAng = Math.atan2(end[2], end[3]);
    const scored = opts.map((o) => {
      const turn = wrapDeg((leaveAng(o.ei, node) - inAng) / RAD);
      return { ...o, turn, w: Math.abs(turn) < 30 ? 4 : Math.abs(turn) < 150 ? 1 : 0.05 };
    });
    let r = Math.random() * scored.reduce((s, o) => s + o.w, 0), next = scored[0];
    for (const o of scored) { r -= o.w; if (r <= 0) { next = o; break; } }
    const E2 = EDGES[next.ei];
    const lane2 = next.turn > 30 ? E2.lanes - 1 : next.turn < -30 ? 0 : Math.min(lane, E2.lanes - 1);
    const P2 = lanePoly(next.ei, next.dir, lane2);
    let r0 = rAt(next.ei, node), r1 = P2.len - rAt(next.ei, next.dir > 0 ? E2.b : E2.a);
    if (r1 - r0 < 0.6) { const m = (r0 + r1) / 2; r0 = m - 0.3; r1 = m + 0.3; }
    const st = at(P2, r0);
    const D = Math.hypot(st[0] - end[0], st[1] - end[1]), k = Math.max(D * 0.42, 0.5);
    const c1 = [end[0] + end[2] * k, end[1] + end[3] * k], c2 = [st[0] - st[2] * k, st[1] - st[3] * k];
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, u = 1 - t;
      pts.push(
        u * u * u * end[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * st[0],
        u * u * u * end[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * st[1],
      );
    }
    const turnLeg = polyOf(pts);
    const a = Math.abs(next.turn);
    turnLeg.speed = a < 20 ? Math.min(E.v, E2.v) : 4.5 + 7 * Math.max(0, 1 - a / 95);
    c.legs.push(turnLeg, laneLeg(next.ei, next.dir, lane2, r0, r1));
    c.tail = { ei: next.ei, dir: next.dir, lane: lane2 };
  }
  function sample(c, x) {
    let i = 0;
    while (i < c.legs.length - 1 && x > c.legs[i].len) { x -= c.legs[i].len; i++; }
    return at(c.legs[i], x);
  }
  const ahead = (c) => { let s = -c.d; for (const L of c.legs) s += L.len; return s; };

  function stepTraffic(dt, t, focusE, focusN) {
    for (let i = traffic.length - 1; i >= 0; i--) {
      const c = traffic[i];
      if (Math.hypot(c.e - focusE, c.n - focusN) > DESPAWN_R || (c.dead && ahead(c) < 0.5)) traffic.splice(i, 1);
    }
    for (let k = 0; k < 3 && traffic.length < TARGET; k++) spawn(focusE, focusN, traffic.length < TARGET * 0.5 ? 30 : 170, SPAWN_R);

    const movers = traffic.concat(loose, peds);
    if (drive.car) movers.push(drive.car);
    else movers.push({ e: me.e, n: me.n, h: 0, sh: 0, ch: 1, len: 0.7, wid: 0.7, walker: true });
    for (const c of vis) if (c.moved && c.mode !== "loose") movers.push(c);

    for (const c of traffic) {
      for (let k = 0; k < 12 && !c.dead && ahead(c) < 60; k++) appendNext(c);
      c.gap = Infinity;
      c.blocker = null;
      const look = 10 + c.speed * 2.2, front = c.len / 2;
      const cand = [];
      for (const o of movers) {
        if (o === c || (c.ghost > 0 && !o.walker && !o.ped)) continue;
        if (Math.abs(o.e - c.e) < look + 14 && Math.abs(o.n - c.n) < look + 14) cand.push(o);
      }
      if (!cand.length) continue;
      for (let s = front * 0.5; s <= front + look && c.gap === Infinity; s += 1.5) {
        const p = sample(c, c.d + s);
        for (const o of cand) if (obbDist(o, p[0], p[1]) < c.wid / 2 + 0.3) { c.gap = s - front; c.blocker = o; break; }
      }
    }
    for (const c of traffic) {
      if (c.blocker && c.blocker.blocker === c && c.id < c.blocker.id) c.gap = Infinity;
      let want = c.legs[0].speed * c.temper, s = -c.d, red = false;
      for (const L of c.legs) {
        if (s > 80) break;
        want = Math.min(want, Math.sqrt((L.speed * c.temper) ** 2 + 2 * 2.6 * Math.max(0, s)));
        if (L.stop) {
          const toStop = s + L.len - 1;
          if (toStop > -0.5) {
            const st = light(L.stop.group, t);
            if (st === 2 || (st === 1 && toStop > (c.speed * c.speed) / 7 + 1)) {
              want = Math.min(want, toStop < 0.5 ? 0 : Math.sqrt(2 * 3 * toStop));
              red = toStop < 30;
              break;
            }
          }
        }
        s += L.len;
      }
      if (c.gap < Infinity) want = Math.min(want, c.gap < 2 ? 0 : Math.sqrt(2 * 3.5 * (c.gap - 2)));
      if (c.stunned > 0) { c.stunned -= dt; want = 0; }
      if (c.dmg >= 1) want = 0;
      c.lit = want < c.speed - 0.4 || c.speed < 0.3 ? 1 : 0;
      c.speed = want > c.speed ? Math.min(want, c.speed + 2.4 * dt) : Math.max(want, c.speed - 8 * dt);
      c.wait = c.speed < 0.2 && !red && c.blocker && !c.blocker.walker && !c.blocker.ped ? c.wait + dt : 0;
      if (c.wait > 10) { c.ghost = 4; c.wait = 0; }
      if (c.ghost > 0) c.ghost -= dt;
      c.d += c.speed * dt;
      while (c.legs.length > 1 && c.d > c.legs[0].len + 3) { c.d -= c.legs[0].len; c.legs.shift(); }
      const p = sample(c, c.d), q0 = sample(c, c.d - 1.2), q1 = sample(c, c.d + 1.2);
      c.e = p[0];
      c.n = p[1];
      if (Math.hypot(q1[0] - q0[0], q1[1] - q0[1]) > 0.05) setH(c, Math.atan2(q1[0] - q0[0], q1[1] - q0[1]) / RAD);
    }
  }

  // ---------- crashes: every car a box that can be pushed, spun and broken ----------
  function knockLoose(c) {
    if (c.mode === "traffic") {
      traffic.splice(traffic.indexOf(c), 1);
      c.ve = c.sh * c.speed;
      c.vn = c.ch * c.speed;
    } else if (c.mode === "parked" && c.cell) {
      const l = pgrid.get(c.cell);
      l.splice(l.indexOf(c), 1);
      c.cell = null;
    }
    c.mode = "loose";
    c.moved = true;
    c.rest = false;
    c.lit = 0;
    if (!loose.includes(c)) loose.push(c);
    if (!vis.includes(c)) vis.push(c);
  }
  const corners = (c) => {
    const hl = c.len / 2, hw = c.wid / 2, out = [];
    for (const [f, r] of [[hl, hw], [hl, -hw], [-hl, -hw], [-hl, hw]]) out.push(c.e + c.sh * f + c.ch * r, c.n + c.ch * f - c.sh * r);
    return out;
  };
  const insideBox = (c, e, n) => {
    const de = e - c.e, dn = n - c.n;
    return Math.abs(de * c.sh + dn * c.ch) <= c.len / 2 && Math.abs(de * c.ch - dn * c.sh) <= c.wid / 2;
  };
  /** separating axes of two boxes: the push that frees A from B (normal from B to A), and where they touch */
  function overlap(A, B) {
    const ca = corners(A), cb = corners(B);
    let best = Infinity, bx = 0, by = 0;
    for (const [ax, ay] of [[A.sh, A.ch], [A.ch, -A.sh], [B.sh, B.ch], [B.ch, -B.sh]]) {
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (let i = 0; i < 8; i += 2) {
        const pa = ca[i] * ax + ca[i + 1] * ay, pb = cb[i] * ax + cb[i + 1] * ay;
        a0 = Math.min(a0, pa); a1 = Math.max(a1, pa); b0 = Math.min(b0, pb); b1 = Math.max(b1, pb);
      }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (o < best) { best = o; bx = ax; by = ay; }
    }
    if ((A.e - B.e) * bx + (A.n - B.n) * by < 0) { bx = -bx; by = -by; }
    let pe = 0, pn = 0, k = 0;
    for (let i = 0; i < 8; i += 2) {
      if (insideBox(B, ca[i], ca[i + 1])) { pe += ca[i]; pn += ca[i + 1]; k++; }
      if (insideBox(A, cb[i], cb[i + 1])) { pe += cb[i]; pn += cb[i + 1]; k++; }
    }
    if (!k) { pe = (A.e + B.e) / 2; pn = (A.n + B.n) / 2; k = 1; }
    return { ne: bx, nn: by, depth: best, pe: pe / k, pn: pn / k };
  }
  function resolve(A, B, hit) {
    const { ne, nn, depth, pe, pn } = hit;
    const bTraffic = B.mode === "traffic";
    const mA = A.T.mass, mB = B.T.mass, IA = A.T.inertia, IB = B.T.inertia;
    const vBe = bTraffic ? B.sh * B.speed : B.ve, vBn = bTraffic ? B.ch * B.speed : B.vn;
    const rAe = pe - A.e, rAn = pn - A.n, rBe = pe - B.e, rBn = pn - B.n;
    const vAp = [A.ve - A.w * rAn, A.vn + A.w * rAe], vBp = [vBe - B.w * rBn, vBn + B.w * rBe];
    const vrel = (vAp[0] - vBp[0]) * ne + (vAp[1] - vBp[1]) * nn;
    // push apart (traffic stays on its rails unless knocked off them)
    const shareA = bTraffic ? 1 : mB / (mA + mB);
    const mvA = depth * shareA + 0.01, mvB = depth - depth * shareA + 0.01;
    if (!hitsBuilding(A, A.e + ne * mvA, A.n + nn * mvA, A.h)) { A.e += ne * mvA; A.n += nn * mvA; }
    if (!bTraffic && !hitsBuilding(B, B.e - ne * mvB, B.n - nn * mvB, B.h)) { B.e -= ne * mvB; B.n -= nn * mvB; B.moved = true; }
    if (vrel >= 0) return;
    const rAx = rAe * nn - rAn * ne, rBx = rBe * nn - rBn * ne;
    const j = (-(1 + 0.25) * vrel) / (1 / mA + 1 / mB + (rAx * rAx) / IA + (rBx * rBx) / IB);
    A.ve += (j * ne) / mA; A.vn += (j * nn) / mA; A.w += (rAx * j) / IA;
    A.rest = false;
    if (bTraffic && j / mB < 2.2) { B.stunned = 2.5; B.speed = 0; }
    else {
      if (B.mode !== "loose" && B.mode !== "player") knockLoose(B);
      B.ve -= (j * ne) / mB; B.vn -= (j * nn) / mB; B.w -= (rBx * j) / IB;
      B.rest = false;
    }
    hurt(A, (-vrel * 2 * mB) / (mA + mB), pe, pn);
    hurt(B, (-vrel * 2 * mA) / (mA + mB), pe, pn);
  }
  function hurt(c, imp, pe, pn) {
    if (imp < 2.2) return;
    const was = c.dmg;
    c.dmg = Math.min(1, c.dmg + (Math.max(0, imp - 3) * 0.022) / c.T.armor);
    const now = performance.now();
    if (now - c.sndT > 150) { c.sndT = now; crashSound(imp, pe, pn); burst(pe, pn, imp); }
    if (c === drive.car) drive.shake = Math.max(drive.shake, Math.min(1.2, imp / 12));
    if (was < 1 && c.dmg >= 1) wreck(c);
  }
  function wreck(c) {
    c.fire = 9;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 6.28, s = 1 + Math.random() * 5;
      emit(c.e + (Math.random() - 0.5) * c.len * 0.6, 0.8 + Math.random(), c.n + (Math.random() - 0.5) * c.len * 0.6, Math.sin(a) * s, 2 + Math.random() * 5, Math.cos(a) * s, 0.5 + Math.random() * 0.6, 0.9, 0.2, FIRE[i % 3], 2);
    }
    for (let i = 0; i < 12; i++) emit(c.e, 1.2, c.n, (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3, 2.5 + Math.random(), 1.2, 3.5, SMOKE_DARK, -0.4);
    boomSound(c.e, c.n);
    for (const p of peds) if (Math.hypot(p.e - c.e, p.n - c.n) < 7 && p.state === "walk") knock(p, { ve: (p.e - c.e) * 1.5, vn: (p.n - c.n) * 1.5 });
    panicAround(c.e, c.n, 40);
  }

  function controlPlayer(c, dt) {
    const T = c.T, st = getStick();
    const dead = c.dmg >= 1;
    const thr = dead ? 0 : clamp((act("accelerate") ? 1 : 0) - (act("brake") ? 1 : 0) - st.y, -1, 1);
    const steerIn = clamp((act("steerRight") ? 1 : 0) - (act("steerLeft") ? 1 : 0) + st.x, -1, 1);
    const hb = act("handbrake");
    let vf = c.ve * c.sh + c.vn * c.ch, vl = c.ve * c.ch - c.vn * c.sh;
    const before = vf, acc = T.acc * (1 - c.dmg * 0.45);
    if (thr > 0.05) {
      if (vf < -0.5) vf = Math.min(0, vf + 11 * thr * dt);
      else vf += acc * thr * Math.max(0, 1 - vf / T.vmax) * dt;
    } else if (thr < -0.05) {
      if (vf > 0.5) vf = Math.max(0, vf + 11 * thr * dt);
      else vf = Math.max(-T.vrev, vf + 4.5 * thr * dt);
    } else vf -= Math.sign(vf) * Math.min(Math.abs(vf), (0.7 + 0.008 * vf * vf + (dead ? 4 : 0)) * dt);
    if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5 * dt);
    vl *= Math.exp(-(hb ? 1.4 : T.grip) * dt);
    const lock = T.steer / (1 + Math.abs(vf) / 15);
    drive.steer += (steerIn * lock - drive.steer) * Math.min(1, dt * 7);
    c.w *= Math.exp(-4 * dt);
    const yaw = (vf / T.wheelbase) * Math.tan(drive.steer) * (hb ? 1.4 : 1);
    const oldH = c.h;
    setH(c, c.h + ((yaw - c.w) * dt) / RAD);
    if (hitsBuilding(c, c.e, c.n, c.h)) { setH(c, oldH); c.w = 0; }
    c.ve = c.sh * vf + c.ch * vl;
    c.vn = c.ch * vf - c.sh * vl;
    drive.accel = (vf - before) / Math.max(dt, 1e-3);
    drive.vf = vf;
  }
  function controlLoose(c, dt) {
    let vf = c.ve * c.sh + c.vn * c.ch, vl = c.ve * c.ch - c.vn * c.sh;
    vf -= Math.sign(vf) * Math.min(Math.abs(vf), (c.dmg >= 1 ? 6 : 1.4) * dt);
    vl -= Math.sign(vl) * Math.min(Math.abs(vl), 9 * dt);
    c.w -= Math.sign(c.w) * Math.min(Math.abs(c.w), 2.5 * dt);
    const oldH = c.h;
    setH(c, c.h - (c.w * dt) / RAD);
    if (hitsBuilding(c, c.e, c.n, c.h)) { setH(c, oldH); c.w = 0; }
    c.ve = c.sh * vf + c.ch * vl;
    c.vn = c.ch * vf - c.sh * vl;
    if (Math.abs(vf) + Math.abs(vl) < 0.05 && Math.abs(c.w) < 0.03) { c.ve = c.vn = c.w = 0; c.rest = true; }
  }
  function integrate(c, dt) {
    if (c.rest) return;
    const ne = c.e + c.ve * dt, nn = c.n + c.vn * dt;
    if (!hitsBuilding(c, ne, nn, c.h)) { c.e = ne; c.n = nn; return; }
    const ve0 = c.ve, vn0 = c.vn, fwd = Math.sign(c.ve * c.sh + c.vn * c.ch) || 1;
    if (!hitsBuilding(c, ne, c.n, c.h)) { c.e = ne; c.vn *= -0.25; c.ve *= 0.85; }
    else if (!hitsBuilding(c, c.e, nn, c.h)) { c.n = nn; c.ve *= -0.25; c.vn *= 0.85; }
    else { c.ve *= -0.3; c.vn *= -0.3; }
    const imp = Math.hypot(c.ve - ve0, c.vn - vn0) / 1.25;
    c.w += (Math.random() - 0.5) * imp * 0.12;
    hurt(c, imp, c.e + c.sh * fwd * c.len * 0.5, c.n + c.ch * fwd * c.len * 0.5);
  }
  function physics(dt) {
    const bodies = loose.filter((c) => !c.rest);
    if (drive.car) bodies.push(drive.car);
    if (!bodies.length) return;
    let vmax = 0;
    for (const c of bodies) vmax = Math.max(vmax, Math.hypot(c.ve, c.vn));
    const steps = clamp(Math.ceil((vmax * dt) / 0.5), 1, 8), h = dt / steps;
    const others = traffic.concat(vis);
    for (let s = 0; s < steps; s++) {
      for (const c of bodies) { if (c === drive.car) controlPlayer(c, h); else controlLoose(c, h); integrate(c, h); }
      for (const A of bodies)
        for (const B of others) {
          if (B === A || (B.mode === "loose" && !B.rest && B.id < A.id)) continue;
          if (Math.abs(B.e - A.e) > 9 || Math.abs(B.n - A.n) > 9) continue;
          const hit = overlap(A, B);
          if (hit) resolve(A, B, hit);
        }
    }
  }

  // ---------- people ----------
  const PED_TARGET = 150, PED_R = 170, PED_DESPAWN = 210;
  const names = (l) => l.filter((n) => n in RI).map((n) => RI[n]);
  const SHIRTS = names(["carRed", "carBlue", "carWhite", "carBlack", "mint", "ochre", "rose", "sidingBlue", "sidingSage", "gold", "ipePink", "libertyGreen", "ferryOrange", "taxi", "greyStone", "cream", "flamboyant"]);
  const PANTS_ = names(["carBlack", "sidingBlue", "darkStone", "tan", "steel", "carBlue", "greyStone", "brownstone"]);
  const SKINS = names(["cream", "tan", "salmon", "ochre", "brownstone", "trunk"]);
  const HAIRS = names(["carBlack", "darkStone", "trunk", "brownstone", "sand", "greyStone", "carBlack"]);
  const any = (l) => l[Math.floor(Math.random() * l.length)];
  function spawnPed(rMin, rMax) {
    for (let tries = 0; tries < 6; tries++) {
      const a = Math.random() * Math.PI * 2, r = rMin + Math.random() * (rMax - rMin);
      const list = wgrid.get(gk(me.e + Math.sin(a) * r, me.n + Math.cos(a) * r));
      if (!list?.length) continue;
      const wi = list[Math.floor(Math.random() * list.length)];
      if (WALKS[wi].len < 3) continue;
      const dir = Math.random() < 0.5 ? 1 : -1, P = walkPoly(wi, dir), s = Math.random() * P.len;
      const [pe, pn] = at(P, s);
      if (Math.hypot(pe - me.e, pn - me.n) < rMin || blocked(pe, pn)) continue;
      const p = {
        id: nextId++, ped: true, e: pe, n: pn, h: 0, sh: 0, ch: 1, len: 0.5, wid: 0.5,
        legs: [{ P: sub(P, s, P.len), cw: null }], d: 0, tail: { wi, dir },
        base: 1.15 + Math.random() * 0.5, v: 1.2, phase: Math.random() * 6.28, amp: 0.5, side: (Math.random() - 0.5) * 1.4,
        cols: [any(SHIRTS), any(PANTS_), any(SKINS), any(HAIRS)], state: "walk", jay: Math.random() < 0.06, panic: 0, t: 0, fall: 0, cool: 0,
      };
      peds.push(p);
      return;
    }
  }
  const pedAhead = (p) => { let s = -p.d; for (const L of p.legs) s += L.P.len; return s; };
  function pedSample(p, x) {
    let i = 0;
    while (i < p.legs.length - 1 && x > p.legs[i].P.len) { x -= p.legs[i].P.len; i++; }
    return at(p.legs[i].P, x);
  }
  function pedAppend(p) {
    const { wi, dir } = p.tail, W = WALKS[wi], node = dir > 0 ? W.b : W.a;
    const last = p.legs[p.legs.length - 1].P, end = at(last, last.len), inAng = Math.atan2(end[2], end[3]);
    let opts = ftouch[node].filter((w) => w !== wi).map((w) => ({ wi: w, dir: WALKS[w].a === node ? 1 : -1 }));
    if (!opts.length) opts = [{ wi, dir: -dir }];
    const scored = opts.map((o) => {
      const P = walkPoly(o.wi, o.dir), s0 = at(P, 0), s1 = at(P, Math.min(4, P.len));
      const turn = wrapDeg((Math.atan2(s1[0] - s0[0], s1[1] - s0[1]) - inAng) / RAD);
      return { ...o, w: Math.abs(turn) < 35 ? 3 : Math.abs(turn) < 150 ? 1.2 : 0.1 };
    });
    let r = Math.random() * scored.reduce((s, o) => s + o.w, 0), next = scored[0];
    for (const o of scored) { r -= o.w; if (r <= 0) { next = o; break; } }
    const W2 = WALKS[next.wi];
    p.legs.push({ P: walkPoly(next.wi, next.dir), cw: W2.x && W2.sig !== undefined ? W2 : null });
    p.tail = { wi: next.wi, dir: next.dir };
  }
  function panicAround(e, n, r) {
    for (const p of peds) if (p.state === "walk" && Math.abs(p.e - e) < r && Math.abs(p.n - n) < r) p.panic = 5 + Math.random() * 3;
  }
  function knock(p, c) {
    p.state = "down";
    p.ve = c.ve * 0.8 + (Math.random() - 0.5) * 2;
    p.vn = c.vn * 0.8 + (Math.random() - 0.5) * 2;
    p.t = 3.5 + Math.random() * 2;
    p.fall = 0;
    p.fallDir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < 6; i++) emit(p.e, 0.2, p.n, (Math.random() - 0.5) * 2, 0.5 + Math.random(), (Math.random() - 0.5) * 2, 0.8, 0.3, 0.9, DUST, -0.3);
    panicAround(p.e, p.n, 25);
  }
  /** back on your feet: walk to where you were going */
  function repath(p) {
    const L0 = p.legs[0], tgt = at(L0.P, p.d);
    p.legs = [{ P: polyOf([p.e, p.n, tgt[0], tgt[1]]), cw: null }, { P: sub(L0.P, p.d, L0.P.len), cw: L0.cw }, ...p.legs.slice(1)];
    p.d = 0;
  }
  function stepPeds(dt, t) {
    for (let i = peds.length - 1; i >= 0; i--) if (Math.hypot(peds[i].e - me.e, peds[i].n - me.n) > PED_DESPAWN) peds.splice(i, 1);
    for (let k = 0; k < 4 && peds.length < PED_TARGET; k++) spawnPed(peds.length < PED_TARGET * 0.5 ? 12 : 90, PED_R);
    const fast = [];
    if (drive.car && speedOf(drive.car) > 2) fast.push(drive.car);
    for (const c of loose) if (!c.rest && speedOf(c) > 2) fast.push(c);
    for (const p of peds) {
      if (p.state !== "walk") {
        const ne = p.e + p.ve * dt, nn = p.n + p.vn * dt;
        if (!blocked(ne, nn)) { p.e = ne; p.n = nn; } else { p.ve = p.vn = 0; }
        const sp = Math.hypot(p.ve, p.vn), dec = p.state === "down" ? 7 : 4;
        if (sp > 0) { const k = Math.max(0, sp - dec * dt) / sp; p.ve *= k; p.vn *= k; }
        p.t -= dt;
        if (p.state === "down") { p.fall = Math.min(1, p.fall + dt * 5); p.amp = 0; }
        else p.phase += dt * 14;
        if (p.t <= 0) { p.state = "walk"; p.fall = 0; p.panic = 5; repath(p); }
        continue;
      }
      for (let k = 0; k < 6 && pedAhead(p) < 25; k++) pedAppend(p);
      let want = p.panic > 0 ? 4.3 : p.base;
      if (p.panic > 0) p.panic -= dt;
      if (p.cool > 0) p.cool -= dt;
      if (p.legs.length > 1 && p.legs[1].cw && !p.jay && p.panic <= 0) {
        const toEnd = p.legs[0].P.len - p.d;
        if (toEnd < 1.5 && greenLeft(p.legs[1].cw.pg, t) < 4) want = toEnd < 0.3 ? 0 : Math.min(want, toEnd);
      }
      p.v += clamp(want - p.v, -6 * dt, 3 * dt);
      p.d += p.v * dt;
      while (p.legs.length > 1 && p.d > p.legs[0].P.len) { p.d -= p.legs[0].P.len; p.legs.shift(); }
      const a = pedSample(p, p.d), b0 = pedSample(p, p.d - 0.5), b1 = pedSample(p, p.d + 0.5);
      if (Math.hypot(b1[0] - b0[0], b1[1] - b0[1]) > 0.05) setH(p, Math.atan2(b1[0] - b0[0], b1[1] - b0[1]) / RAD);
      p.e = a[0] + p.ch * p.side;
      p.n = a[1] - p.sh * p.side;
      p.phase += p.v * dt * 3.6;
      p.amp += ((p.v > 0.1 ? Math.min(0.8, 0.3 + p.v * 0.12) : 0) - p.amp) * Math.min(1, dt * 8);
      for (const c of fast) {
        const dE = p.e - c.e, dN = p.n - c.n;
        if (Math.abs(dE) > 14 || Math.abs(dN) > 14) continue;
        if (obbDist(c, p.e, p.n) < 0.3) {
          knock(p, c);
          c.ve *= 0.97; c.vn *= 0.97;
          if (c === drive.car) drive.shake = Math.max(drive.shake, 0.25);
          break;
        }
        const cs = Math.hypot(c.ve, c.vn);
        if (cs > 6 && p.cool <= 0) {
          const ue = c.ve / cs, un = c.vn / cs, along = dE * ue + dN * un, across = dE * un - dN * ue;
          if (along > 0 && along < 11 && Math.abs(across) < c.wid / 2 + 1) {
            p.cool = 2;
            if (Math.random() < 0.75) { const s = Math.sign(across) || 1; p.state = "dodge"; p.ve = un * s * 5.5; p.vn = -ue * s * 5.5; p.t = 0.55; }
          }
        }
      }
    }
  }

  // ---------- smoke, fire, sparks: round pixels, dithered as they fade ----------
  const PMAX = 1200;
  const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3), pSize = new Float32Array(PMAX), pAlpha = new Float32Array(PMAX);
  const pgeo = new THREE.BufferGeometry();
  pgeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute("size", new THREE.BufferAttribute(pSize, 1).setUsage(THREE.DynamicDrawUsage));
  pgeo.setAttribute("alpha", new THREE.BufferAttribute(pAlpha, 1).setUsage(THREE.DynamicDrawUsage));
  const pmat = new THREE.ShaderMaterial({
    uniforms: { ...commonUniforms(), pscale: { value: 300 } },
    vertexShader: `
      attribute float size; attribute float alpha; attribute vec3 color;
      uniform float pscale;
      varying vec3 vColor; varying float vAlpha; varying vec3 vMV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vMV = mv.xyz; vColor = color; vAlpha = alpha;
        gl_PointSize = max(1.0, size * pscale / -mv.z);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float; ${FOG}
      varying vec3 vColor; varying float vAlpha; varying vec3 vMV;
      const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
      void main() {
        if (length(gl_PointCoord - 0.5) > 0.5) discard;
        ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
        if (vAlpha < (B[q.x + q.y * 4] + 0.5) / 16.0) discard;
        gl_FragColor = vec4(fogged(vColor, length(vMV)), 1.0);
      }`,
  });
  const points = new THREE.Points(pgeo, pmat);
  points.frustumCulled = false;
  points.renderOrder = 2;
  scene.add(points);
  const parts = [];
  const SPARK = [palRGB("taxi", 5), palRGB("cream", 5), palRGB("markingWhite", 5)];
  const FIRE = [palRGB("taxi", 5), palRGB("ferryOrange", 5), palRGB("carRed", 4)];
  const SMOKE = palRGB("greyStone", 4), SMOKE_DARK = palRGB("darkStone", 2), DUST = palRGB("pavement", 3), GLASS_BITS = palRGB("glassSilver", 5);
  /** a particle; grav > 0 falls, < 0 rises (buoyant smoke) */
  function emit(x, y, z, vx, vy, vz, life, s0, s1, col, grav = 0) {
    if (parts.length >= PMAX) parts.shift();
    parts.push({ x, y, z, vx, vy, vz, life, max: life, s0, s1, col, grav });
  }
  function burst(pe, pn, imp) {
    const n = Math.min(26, Math.round(imp * 1.6));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, s = 1 + Math.random() * imp * 0.35;
      emit(pe, 0.5 + Math.random() * 0.6, pn, Math.sin(a) * s, 1 + Math.random() * 4, Math.cos(a) * s, 0.3 + Math.random() * 0.4, 0.12, 0.06, SPARK[i % 3], 12);
    }
    if (imp > 7) for (let i = 0; i < 8; i++) emit(pe, 1, pn, (Math.random() - 0.5) * 5, 1 + Math.random() * 3, (Math.random() - 0.5) * 5, 0.6, 0.1, 0.1, GLASS_BITS, 12);
    for (let i = 0; i < 3; i++) emit(pe, 0.6, pn, (Math.random() - 0.5) * 1.5, 0.6, (Math.random() - 0.5) * 1.5, 1.2, 0.5, 1.6, SMOKE, -0.2);
  }
  const tmpV2 = new THREE.Vector2();
  function stepParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i];
      q.life -= dt;
      if (q.life <= 0) { parts[i] = parts[parts.length - 1]; parts.pop(); continue; }
      q.vy -= q.grav * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) { q.y = 0.05; q.vy *= -0.3; q.vx *= 0.6; q.vz *= 0.6; }
      if (q.grav < 0) { q.vx *= 1 - dt; q.vz *= 1 - dt; }
    }
    let n = 0;
    for (const q of parts) {
      const k = 1 - q.life / q.max;
      pPos[n * 3] = q.x; pPos[n * 3 + 1] = q.y; pPos[n * 3 + 2] = -q.z;
      pCol.set(q.col, n * 3);
      pSize[n] = q.s0 + (q.s1 - q.s0) * k;
      pAlpha[n] = q.grav < 0 ? Math.min(1, (1 - k) * 1.6) : 1;
      n++;
    }
    pgeo.setDrawRange(0, n);
    for (const a of Object.values(pgeo.attributes)) a.needsUpdate = true;
    pmat.uniforms.pscale.value = renderer.getDrawingBufferSize(tmpV2).y / (2 * Math.tan((camera.fov * RAD) / 2));
  }
  /** damaged engines smoke; wrecks burn, then smoke black */
  function smokers(dt) {
    const all = traffic.concat(vis);
    if (drive.car) all.push(drive.car);
    for (const c of all) {
      if (c.dmg < 0.55 || Math.abs(c.e - me.e) > 150 || Math.abs(c.n - me.n) > 150) continue;
      const fe = c.e + c.sh * (c.len / 2 - 0.9), fn = c.n + c.ch * (c.len / 2 - 0.9), y = c.T.roof * 0.65;
      if (c.fire > 0) {
        c.fire -= dt;
        for (let k = 0; k < 3; k++) if (Math.random() < dt * 30) emit(fe + (Math.random() - 0.5) * c.wid, y, fn + (Math.random() - 0.5) * c.wid, Math.random() - 0.5, 2 + Math.random() * 2, Math.random() - 0.5, 0.5, 0.7, 0.15, FIRE[k], -1);
      }
      const rate = c.dmg >= 1 ? 10 : (c.dmg - 0.5) * 14;
      if (Math.random() < rate * dt) emit(fe, y, fn, (Math.random() - 0.5) * 0.6, 1 + Math.random() * 0.6, (Math.random() - 0.5) * 0.6, 2.4, 0.4, 2.2, c.dmg >= 1 ? SMOKE_DARK : SMOKE, -0.3);
    }
  }

  // ---------- sound ----------
  let audio;
  const ac = () => (audio ??= new AudioContext());
  function noise(len, vol, cutoff) {
    const a = ac(), buf = a.createBuffer(1, Math.floor(a.sampleRate * len), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    src.buffer = buf; f.type = "lowpass"; f.frequency.value = cutoff; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination);
    src.start();
  }
  function crashSound(imp, pe, pn) {
    const dist = Math.hypot(pe - me.e, pn - me.n);
    if (dist < 80) noise(0.35, clamp(imp / 25, 0.04, 0.45) * (1 - dist / 80), 500 + imp * 70);
  }
  function boomSound(pe, pn) {
    const dist = Math.hypot(pe - me.e, pn - me.n);
    if (dist < 150) noise(1.4, 0.6 * (1 - dist / 150), 260);
  }
  function honk() {
    const a = ac(), g = a.createGain(), t = a.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
    g.gain.setValueAtTime(0.06, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
    g.connect(a.destination);
    for (const f of [392, 494]) { const o = a.createOscillator(); o.type = "square"; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.4); }
    if (drive.car) panicAround(drive.car.e, drive.car.n, 12);
  }

  // ---------- what is drawn: instanced models in the map's palette ----------
  const P_FN = `vec3 P(int ramp, int shade) { return texelFetch(pal, ivec2(ramp * 6 + clamp(shade, 0, 5), 0), 0).rgb; }`;
  const TONE = `
    vec3 nw = normalize(mat3(m) * normal);
    float l = dot(vec2(nw.x, -nw.z), sun);
    vTone = nw.y > 0.7 ? 5 : nw.y < -0.7 ? 1 : l > 0.25 ? 4 : l > -0.25 ? 3 : 2;`;
  const carMat = new THREE.ShaderMaterial({
    uniforms: { ...commonUniforms(), sun: { value: new THREE.Vector2(SUN.x, SUN.y) }, time: { value: 0 } },
    vertexShader: `
      attribute float part; attribute float ramp; attribute float lit; attribute float dmg;
      uniform vec2 sun;
      flat varying int vPart; flat varying int vRamp; flat varying int vLit; flat varying int vTone; flat varying float vDmg; varying vec3 vMV;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        ${TONE}
        vec3 p = position;
        if (dmg > 0.0) {   // crumple: the same push for every face at a corner, so nothing splits
          float h1 = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float h2 = fract(sin(dot(position, vec3(39.346, 11.135, 83.155))) * 23421.631);
          p.y -= step(0.45, position.y) * h1 * dmg * 0.24;
          p.x *= 1.0 - h2 * dmg * 0.1;
          p.z *= 1.0 - h1 * dmg * 0.05;
        }
        vPart = int(part + 0.5); vRamp = int(ramp + 0.5); vLit = int(lit + 0.5); vDmg = dmg;
        vec4 mv = viewMatrix * m * vec4(p, 1.0);
        vMV = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float; precision highp int;
      uniform sampler2D pal; uniform float time; ${FOG}
      flat varying int vPart; flat varying int vRamp; flat varying int vLit; flat varying int vTone; flat varying float vDmg; varying vec3 vMV;
      ${P_FN}
      void main() {
        int t = vTone, p = vPart;
        bool wrecked = vDmg >= 1.0;
        bool flash = fract(time * 2.5) < 0.5 && !wrecked;
        vec3 c;
        if (p == ${BODY}) c = wrecked ? P(${RI.darkStone}, t - 2) : P(vRamp, t - (vDmg > 0.6 ? 1 : 0));
        else if (p == ${GLASS}) {
          ivec2 q = ivec2(gl_FragCoord.xy);
          c = vDmg > 0.35 && (q.x + q.y * 2) % 5 == 0 ? P(${RI.glassSilver}, 5) : P(${RI.glassDark}, t - 1);
        }
        else if (p == ${TYRE}) c = P(${RI.asphaltDark}, t == 5 ? 1 : 0);
        else if (p == ${HEAD}) c = wrecked ? P(${RI.darkStone}, 1) : P(${RI.markingWhite}, 5);
        else if (p == ${TAIL}) c = vLit == 1 ? P(${RI.carRed}, 5) : P(${RI.carRed}, 2);
        else if (p == ${SIGN}) c = P(${RI.cream}, 5);
        else if (p == ${TRIM}) c = P(${RI.darkStone}, t - 1);
        else if (p == ${STRIPE}) c = P(${RI.carBlue}, t);
        else if (p == ${CARGO}) c = wrecked ? P(${RI.darkStone}, t - 1) : P(${RI.carWhite}, t);
        else if (p == ${AMBER}) c = P(${RI.taxi}, 5);
        else if (p == ${WSTRIPE}) c = P(${RI.markingWhite}, t);
        else if (p == ${POL_R}) c = flash ? P(${RI.carRed}, 5) : P(${RI.carRed}, 1);
        else if (p == ${POL_B}) c = !flash && !wrecked ? P(${RI.carBlue}, 5) : P(${RI.carBlue}, 1);
        else if (p == ${LAMP_R}) c = vLit == 2 ? P(${RI.carRed}, 5) : P(${RI.darkStone}, 1);
        else if (p == ${LAMP_Y}) c = vLit == 1 ? P(${RI.taxi}, 5) : P(${RI.darkStone}, 1);
        else if (p == ${LAMP_G}) c = vLit == 0 ? P(${RI.mint}, 5) : P(${RI.darkStone}, 1);
        else c = P(${RI.taxi}, t - 1);
        gl_FragColor = vec4(fogged(c, length(vMV)), 1.0);
      }`,
  });
  const pedMat = new THREE.ShaderMaterial({
    uniforms: { ...commonUniforms(), sun: { value: new THREE.Vector2(SUN.x, SUN.y) } },
    vertexShader: `
      attribute float part; attribute float limb; attribute float phase; attribute float amp; attribute vec4 cols;
      uniform vec2 sun;
      flat varying int vPart; flat varying int vTone; flat varying ivec4 vCols; varying vec3 vMV;
      void main() {
        mat4 m = modelMatrix * instanceMatrix;
        ${TONE}
        vec3 p = position;
        int L = int(limb + 0.5);
        float sw = sin(phase) * amp;
        float ang = L == 1 ? sw : L == 2 ? -sw : L == 3 ? -sw * 0.8 : L == 4 ? sw * 0.8 : 0.0;
        float py = L <= 2 ? 0.88 : 1.4;
        if (L > 0) { float y = p.y - py, z = p.z, c = cos(ang), s = sin(ang); p.y = py + y * c - z * s; p.z = y * s + z * c; }
        vPart = int(part + 0.5); vCols = ivec4(cols + 0.5);
        vec4 mv = viewMatrix * m * vec4(p, 1.0);
        vMV = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      precision highp float; precision highp int;
      uniform sampler2D pal; ${FOG}
      flat varying int vPart; flat varying int vTone; flat varying ivec4 vCols; varying vec3 vMV;
      ${P_FN}
      void main() {
        int t = vTone == 5 ? 4 : vTone;
        vec3 c = vPart == ${SHIRT} ? P(vCols.x, t) : vPart == ${PANTS} ? P(vCols.y, t) : vPart == ${SKIN} ? P(vCols.z, t) : vPart == ${HAIR} ? P(vCols.w, t - 1) : P(${RI.asphaltDark}, 1);
        gl_FragColor = vec4(fogged(c, length(vMV)), 1.0);
      }`,
  });
  function pool(model, cap, mat, attrs) {
    const M = modelBuilder();
    model(M);
    const g = M.geometry();
    const A = {};
    for (const [name, size] of Object.entries(attrs)) g.setAttribute(name, (A[name] = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size)));
    const mesh = new THREE.InstancedMesh(g, mat, cap);
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    return { mesh, cap, n: 0, A };
  }
  const CAPS = { sedan: 600, taxi: 300, suv: 600, compact: 300, sports: 120, supercar: 80, muscle: 100, pickup: 150, limo: 80, police: 80, van: 250, bus: 60 };
  const CAR_ATTRS = { ramp: 1, lit: 1, dmg: 1 };
  const pools = Object.fromEntries(Object.entries(CAPS).map(([k, cap]) => [k, pool(TYPES[k].model, cap, carMat, CAR_ATTRS)]));
  pools.signal = pool(signalModel, 900, carMat, CAR_ATTRS);
  const pedPool = pool(personModel, 400, pedMat, { phase: 1, amp: 1, cols: 4 });
  const mtx = new THREE.Matrix4(), quat = new THREE.Quaternion(), eul = new THREE.Euler(0, 0, 0, "YXZ"), P3 = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
  function place(pl, e, y, n, h, pitch = 0, roll = 0) {
    if (pl.n >= pl.cap) return -1;
    eul.set(pitch, -h * RAD, roll);
    quat.setFromEuler(eul);
    P3.set(e, y, -n);
    mtx.compose(P3, quat, ONE);
    pl.mesh.setMatrixAt(pl.n, mtx);
    return pl.n++;
  }
  function putCar(c, lit, pitch = 0) {
    const pl = pools[c.kind], i = place(pl, c.e, 0, c.n, c.h, pitch);
    if (i < 0) return;
    pl.A.ramp.array[i] = c.ramp;
    pl.A.lit.array[i] = lit;
    pl.A.dmg.array[i] = c.dmg;
  }
  function flush() {
    for (const pl of [...Object.values(pools), pedPool]) {
      pl.mesh.count = pl.n;
      pl.mesh.instanceMatrix.needsUpdate = true;
      for (const a of Object.values(pl.A)) a.needsUpdate = true;
      pl.n = 0;
    }
  }

  // parked cars and signals near you, gathered a few times a second
  const VIS_R = 300;
  function gather(fe, fn) {
    vis = [];
    gridNear(pgrid, fe, fn, VIS_R, (c) => {
      if (Math.hypot(c.e - fe, c.n - fn) > VIS_R) return;
      if (!c.ok) { if (!cellReady(c.e, c.n)) return; c.ok = hitsBuilding(c, c.e, c.n, c.h) ? -1 : 1; }
      if (c.ok > 0) vis.push(c);
    });
    for (let i = loose.length - 1; i >= 0; i--) {
      const d = Math.hypot(loose[i].e - fe, loose[i].n - fn);
      if (d > 700) loose.splice(i, 1);
      else if (d < VIS_R) vis.push(loose[i]);
    }
    visSig = [];
    gridNear(sgrid, fe, fn, VIS_R, (s) => { if (Math.hypot(s.e - fe, s.n - fn) < VIS_R) visSig.push(s); });
  }

  // ---------- you, driving ----------
  const hud = document.createElement("div");
  hud.className = "sign";
  hud.style.cssText = "right:12px;bottom:12px;display:none";
  const btn = document.createElement("button");
  btn.style.cssText = "position:absolute;right:12px;bottom:56px;display:none;padding:12px 18px;border:0;border-radius:10px;background:var(--taxi);color:var(--sign);font:600 15px system-ui";
  walkEl.append(hud, btn);
  btn.addEventListener("click", (e) => { e.stopPropagation(); enterOrExit(); });
  let flashMsg = "", flashT = 0;
  const flash = (m) => { flashMsg = m; flashT = performance.now(); };

  function nearestCar(e, n, maxD) {
    let best = null, bd = maxD;
    for (const list of [traffic, vis])
      for (const c of list) {
        if (Math.abs(c.e - e) > 10 || Math.abs(c.n - n) > 10) continue;
        const d = obbDist(c, e, n);
        if (d < bd) { bd = d; best = c; }
      }
    return best;
  }
  function enter(c) {
    if (c.mode === "traffic") { traffic.splice(traffic.indexOf(c), 1); c.ve = c.sh * c.speed; c.vn = c.ch * c.speed; }
    else if (loose.includes(c)) loose.splice(loose.indexOf(c), 1);
    else if (c.cell) { const l = pgrid.get(c.cell); l.splice(l.indexOf(c), 1); c.cell = null; }
    vis = vis.filter((v) => v !== c);
    c.mode = "player";
    c.rest = false;
    drive.car = c;
    drive.steer = 0;
    drive.camYaw = c.h;
    drive.look = 0;
    drive.lookPitch = -6;
    c.lit = 0;
  }
  function exit() {
    const c = drive.car;
    if (Math.hypot(c.ve, c.vn) > 4) return flash("Slow down to get out");
    const re = c.ch, rn = -c.sh;
    for (const [sr, sf] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const e = c.e + re * sr * (c.wid / 2 + 0.6) + c.sh * sf * (c.len / 2 + 0.7);
      const n = c.n + rn * sr * (c.wid / 2 + 0.6) + c.ch * sf * (c.len / 2 + 0.7);
      if (blocked(e, n) || !walkerProbe(e, n, 0, 0.3)) continue;
      me.e = e; me.n = n; me.yaw = c.h; me.pitch = 0; me.y = 0; me.vy = 0;
      c.mode = "loose";
      c.moved = true;
      loose.push(c);
      vis.push(c);
      drive.car = null;
      camera.fov = 70;
      camera.updateProjectionMatrix();
      return;
    }
    flash("No room to get out here");
  }
  function enterOrExit() {
    if (drive.car) return exit();
    const c = nearestCar(me.e, me.n, 2.4);
    if (c) enter(c);
  }
  /** for you on foot: null where a car is in the way, else the height you stand at (a roof, or 0) */
  function walkerProbe(e, n, y, step) {
    let ground = 0;
    for (const list of [traffic, vis])
      for (const c of list) {
        if (Math.abs(c.e - e) > 8 || Math.abs(c.n - n) > 8) continue;
        const d = obbDist(c, e, n);
        if (d > 0.3) continue;
        const top = c.T.roof * (c.dmg >= 1 ? 0.85 : 1);
        if (top > y + step) return null;
        if (d < 0.05) ground = Math.max(ground, top);
      }
    return { ground };
  }

  function driveCamera(dt, now) {
    const c = drive.car, T = c.T;
    if (now - drive.lookT > 1400) { drive.look *= Math.exp(-dt * 3); drive.lookPitch += (-6 - drive.lookPitch) * Math.min(1, dt * 3); }
    drive.shake *= Math.exp(-dt * 6);
    drive.pitch += (clamp(-drive.accel * 0.004, -0.05, 0.05) - drive.pitch) * Math.min(1, dt * 6);
    const jig = drive.shake > 0.01 ? (Math.random() - 0.5) * drive.shake * 0.6 : 0;
    const behind = act("lookBehind") ? 180 : 0;
    const fov = 70 + clamp((Math.abs(drive.vf) - 12) * 0.45, 0, 18);
    if (Math.abs(camera.fov - fov) > 0.2) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix(); }
    if (drive.view === 0) {
      drive.camYaw += wrapDeg(c.h - drive.camYaw) * Math.min(1, dt * 3.2);
      const yaw = (drive.camYaw + drive.look + behind) * RAD, pitch = drive.lookPitch * RAD;
      const dist = 4.5 + c.len * 0.8 + clamp(Math.abs(drive.vf) * 0.05, 0, 2), back = Math.cos(pitch) * dist;
      let ce = c.e - Math.sin(yaw) * back, cn = c.n - Math.cos(yaw) * back;
      for (let s = 0.15; s <= 1; s += 0.15) {
        const pe = c.e + (ce - c.e) * s, pn = c.n + (cn - c.n) * s;
        if (blocked(pe, pn)) { ce = c.e + (ce - c.e) * Math.max(0.1, s - 0.2); cn = c.n + (cn - c.n) * Math.max(0.1, s - 0.2); break; }
      }
      const ch = Math.max(0.8, 1.2 + T.roof * 0.7 - Math.sin(pitch) * dist * 0.6);
      camera.position.set(ce + jig, ch + jig, -cn);
      camera.lookAt(c.e + Math.sin(yaw) * 4, 1.0 + T.roof * 0.45, -(c.n + Math.cos(yaw) * 4));
    } else {
      const [eh, ef] = T.eye, re = c.ch, rn = -c.sh;
      camera.position.set(c.e + c.sh * -ef + re * -0.36 + jig, eh + jig * 0.5, -(c.n + c.ch * -ef + rn * -0.36));
      camera.rotation.set((drive.lookPitch + 9) * RAD, -(c.h + drive.look + behind) * RAD, 0);
    }
  }

  // ---------- the frame ----------
  function update(dt, now) {
    const t = now / 1000;
    if (now - gatherT > 250) { gatherT = now; gather(me.e, me.n); }
    stepTraffic(dt, t, me.e, me.n);
    physics(dt);
    if (drive.car) {
      me.e = drive.car.e; me.n = drive.car.n; me.yaw = drive.car.h;
      driveCamera(dt, now);
    } else if (camera.fov !== 70) { camera.fov = 70; camera.updateProjectionMatrix(); }
    stepPeds(dt, t);
    smokers(dt);
    stepParts(dt);
    carMat.uniforms.time.value = t;

    for (const c of traffic) putCar(c, c.lit);
    for (const c of vis) putCar(c, 0);
    if (drive.car) putCar(drive.car, drive.vf > 0.3 && act("brake") ? 1 : 0, drive.pitch);
    for (const s of visSig) {
      const i = place(pools.signal, s.e, 0, s.n, s.h);
      if (i >= 0) { pools.signal.A.lit.array[i] = light(s.group, t); pools.signal.A.dmg.array[i] = 0; }
    }
    for (const p of peds) {
      const lying = p.state === "down" ? p.fall : 0;
      const i = place(pedPool, p.e, lying * 0.13, p.n, p.h, (-(p.fallDir || 1) * lying * Math.PI) / 2);
      if (i < 0) continue;
      pedPool.A.phase.array[i] = p.phase;
      pedPool.A.amp.array[i] = p.state === "dodge" ? 0.9 : p.amp;
      pedPool.A.cols.array.set(p.cols, i * 4);
    }
    flush();

    // what you can do
    let text = "", button = "";
    if (drive.car) {
      const c = drive.car, mph = Math.round(Math.abs(drive.vf) * 2.237);
      const state = c.dmg >= 1 ? " · <b>wrecked</b>" : c.dmg > 0.02 ? ` · damage ${Math.round(c.dmg * 100)}%` : "";
      text = `<b>${mph} mph</b> · ${c.T.name}${state} · <b>${keyName("exit")}</b> get out · <b>${keyName("camera")}</b> camera · <b>${keyName("handbrake")}</b> handbrake · <b>${keyName("horn")}</b> horn · <b>${keyName("lookBehind")}</b> look back`;
      button = "Get out";
    } else {
      const c = nearestCar(me.e, me.n, 2.4);
      if (c) { text = `<b>${keyName("enter")}</b> get in the ${c.T.name}${c.dmg >= 1 ? " (wrecked)" : ""}`; button = `Get in the ${c.T.name}`; }
    }
    if (now - flashT < 1600) text = `<b>${flashMsg}</b>`;
    hud.style.display = text ? "" : "none";
    if (hud.innerHTML !== text) hud.innerHTML = text;
    btn.style.display = button && matchMedia("(pointer: coarse)").matches ? "" : "none";
    if (btn.textContent !== button) btn.textContent = button;
  }

  console.log(`[cars] ${EDGES.length} street pieces, ${WALKS.length} walking pieces, ${nSignals} signals, ${nParked} parked cars`);
  return {
    get driving() { return !!drive.car; },
    update,
    enterOrExit,
    honk,
    view() { if (drive.car) drive.view = 1 - drive.view; },
    look(dYaw, dPitch) { drive.look = clamp(drive.look + dYaw, -170, 170); drive.lookPitch = clamp(drive.lookPitch + dPitch, -40, 25); drive.lookT = performance.now(); },
    walkerProbe,
    traffic,
    peds,
    get vis() { return vis; },
    debug: { drive, loose, hitsBuilding, obbDist, TYPES },
  };
}
