import * as THREE from "three";
import { StreetLighting } from "./city-light";
import type { BoatKind, CarKind } from "../kinds";
import { clamp } from "../math";
import type { Person } from "../people";
import { GRAVITY } from "../player";
import type { SignalPost } from "../signals";
import { sizeOf, type Vehicle } from "../vehicles";
import type { WalkIndex } from "../walk-index";
import { FOG, FOG_FAR, FOG_NEAR, GREY_RAMPS, HORIZON, greysOf } from "./materials";
import { SHADES, type Palette } from "./palette";

/**
 * What moves in the walk: every kind of car and boat, the people and you, as boxes and tapered
 * boxes in the map's palette (after the spike's `cars.js`). Each face belongs to a part (the
 * body, glass, a tyre, a lamp...) that the shader colours, in the tone the sun gives it as it
 * gives the walls theirs: the top lightest, the sunlit side lit, the far side in shade. One
 * instanced mesh per kind, filled again every frame.
 *
 * A model's own axes: x to its right, y up from the ground (a boat's waterline), z backwards (its
 * front is −z), as three.js has a camera; placed at (e, z, −n) turned by −yaw.
 */

// the parts of a vehicle
const BODY = 0;
const GLASS = 1;
const TYRE = 2;
const HEAD = 3;
const TAIL = 4;
const SIGN = 5;
const TRIM = 6;
const BAND = 7;
const CARGO = 8;
const AMBER = 9;
const STRIPE = 10;
const BAR_RED = 11;
const BAR_BLUE = 12;
const CABIN = 13;
const DECK = 14;
// the parts of a traffic signal
const LAMP_RED = 15;
const LAMP_YELLOW = 16;
const LAMP_GREEN = 17;
const HOUSING = 18;
const METAL = 19;
// the parts of a person
const SHIRT = 0;
const PANTS = 1;
const SKIN = 2;
const HAIR = 3;
const SHOE = 4;

/** Cars' paints by `Vehicle.color` (0 is red, as the traffic's `PAINT_RED`). */
const CAR_PAINTS = [
  "carRed",
  "carBlue",
  "carWhite",
  "carBlack",
  "steel",
  "greyStone",
  "sidingBlue",
  "ochre",
] as const;
const SPEEDBOAT_PAINTS = [
  "carWhite",
  "carRed",
  "carBlue",
  "carBlack",
  "taxi",
  "sidingBlue",
  "mint",
  "carWhite",
] as const;
/** A person's clothes, skin and hair: a ramp for each of `Person.look`'s numbers (0 to 7). */
const TOPS = [
  "carRed",
  "carBlue",
  "carWhite",
  "carBlack",
  "mint",
  "ochre",
  "sidingBlue",
  "ferryOrange",
] as const;
const BOTTOMS = [
  "carBlack",
  "sidingBlue",
  "darkStone",
  "tan",
  "steel",
  "carBlue",
  "greyStone",
  "brownstone",
] as const;
const SKINS = ["cream", "tan", "salmon", "ochre", "brownstone", "trunk", "rose", "dirt"] as const;
const HAIRS = [
  "carBlack",
  "darkStone",
  "trunk",
  "brownstone",
  "sand",
  "greyStone",
  "carBlack",
  "timber",
] as const;
/** Your own clothes, so you are told from the crowd when you lie in the street. */
const YOURS = { top: "libertyGreen", bottom: "carBlack", skin: "tan", hair: "trunk" } as const;
/** Parts' fixed colours. */
const FIXED = [
  "glassDark",
  "glassSilver",
  "asphaltDark",
  "markingWhite",
  "darkStone",
  "cream",
  "taxi",
  "libertyGreen",
  "pier",
  "ferryOrange",
] as const;

/** Every ramp the models paint with (and drain to): the palette must have them all. */
export const MODEL_RAMPS: readonly string[] = [
  ...new Set<string>([
    ...CAR_PAINTS,
    ...SPEEDBOAT_PAINTS,
    ...TOPS,
    ...BOTTOMS,
    ...SKINS,
    ...HAIRS,
    ...Object.values(YOURS),
    ...FIXED,
    ...GREY_RAMPS,
  ]),
];

/**
 * Where your eyes are at the wheel (or the helm): metres above the vehicle's ground (a boat's
 * waterline) and ahead of its middle. A car's driver sits on its left.
 */
export const EYES: Record<CarKind | BoatKind, [number, number]> = {
  hatchback: [1.15, 0],
  sedan: [1.15, -0.1],
  taxi: [1.15, -0.1],
  suv: [1.45, 0],
  pickup: [1.5, 0.2],
  limousine: [1.15, 1.6],
  police: [1.15, -0.1],
  muscle: [1.08, -0.6],
  sports: [0.95, -0.35],
  supercar: [0.88, -0.45],
  motorcycle: [1.58, 0.24],
  boxTruck: [2.0, 2.6],
  bus: [2.3, 5.3],
  speedboat: [1.55, 0.3],
  motorboat: [2.0, 1.2],
  ferry: [6.6, 4],
};

type Faces =
  number | { top?: number; bottom?: number; front?: number; back?: number; side?: number };

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** A model as it is put together: faces of boxes, frusta and extruded outlines, each with its part. */
class Shape {
  private pos: number[] = [];
  private nor: number[] = [];
  private part: number[] = [];
  private limbs: number[] = [];
  /** The limb the faces made now swing with (people: 1, 2 legs, 3, 4 arms). */
  limb = 0;

  private push(points: THREE.Vector3[], normal: THREE.Vector3, part: number) {
    for (const p of points) {
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(normal.x, normal.y, normal.z);
      this.part.push(part);
      this.limbs.push(this.limb);
    }
  }

  /** A quad, turned to face away from `centre`. */
  private quad(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    p2: THREE.Vector3,
    p3: THREE.Vector3,
    centre: THREE.Vector3,
    part: number,
  ) {
    const normal = new THREE.Vector3()
      .subVectors(p1, p0)
      .cross(new THREE.Vector3().subVectors(p2, p0))
      .normalize();
    const mid = new THREE.Vector3().addVectors(p0, p2).multiplyScalar(0.5).sub(centre);
    let q = [p0, p1, p2, p3];
    if (normal.dot(mid) < 0) {
      q = [p0, p3, p2, p1];
      normal.negate();
    }
    this.push([q[0], q[1], q[2], q[0], q[2], q[3]], normal, part);
  }

  /** A triangle facing along `out`. */
  private tri(
    a: THREE.Vector3,
    b: THREE.Vector3,
    c: THREE.Vector3,
    out: THREE.Vector3,
    part: number,
  ) {
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    if (normal.dot(out) < 0) this.push([a, c, b], normal.negate(), part);
    else this.push([a, b, c], normal, part);
  }

  /** A frustum: the rectangle [bx0, bx1] × [bz0, bz1] at y0 up to [tx0, tx1] × [tz0, tz1] at y1. */
  prism(
    bx0: number,
    bx1: number,
    bz0: number,
    bz1: number,
    y0: number,
    tx0: number,
    tx1: number,
    tz0: number,
    tz1: number,
    y1: number,
    faces: Faces,
  ) {
    const F =
      typeof faces === "number"
        ? { top: faces, bottom: faces, front: faces, back: faces, side: faces }
        : faces;
    const b00 = V(bx0, y0, bz0);
    const b10 = V(bx1, y0, bz0);
    const b11 = V(bx1, y0, bz1);
    const b01 = V(bx0, y0, bz1);
    const t00 = V(tx0, y1, tz0);
    const t10 = V(tx1, y1, tz0);
    const t11 = V(tx1, y1, tz1);
    const t01 = V(tx0, y1, tz1);
    const c = V((bx0 + bx1 + tx0 + tx1) / 4, (y0 + y1) / 2, (bz0 + bz1 + tz0 + tz1) / 4);
    if (F.top !== undefined) this.quad(t00, t10, t11, t01, c, F.top);
    if (F.bottom !== undefined) this.quad(b00, b10, b11, b01, c, F.bottom);
    if (F.front !== undefined) this.quad(b00, b10, t10, t00, c, F.front);
    if (F.back !== undefined) this.quad(b01, b11, t11, t01, c, F.back);
    if (F.side !== undefined) {
      this.quad(b00, b01, t01, t00, c, F.side);
      this.quad(b10, b11, t11, t10, c, F.side);
    }
  }

  box(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, faces: Faces) {
    this.prism(x0, x1, z0, z1, y0, x0, x1, z0, z1, y1, faces);
  }

  /** A box and its mirror across the middle (wheels, lamps). */
  pair(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, faces: Faces) {
    this.box(x0, x1, y0, y1, z0, z1, faces);
    this.box(-x1, -x0, y0, y1, z0, z1, faces);
  }

  /** A convex outline in plan, [x, z] points, stood from y0 to y1: a hull. */
  hull(
    outline: [number, number][],
    y0: number,
    y1: number,
    faces: { top?: number; bottom?: number; side: number },
  ) {
    const cx = outline.reduce((s, p) => s + p[0], 0) / outline.length;
    const cz = outline.reduce((s, p) => s + p[1], 0) / outline.length;
    const centre = V(cx, (y0 + y1) / 2, cz);
    const k = outline.length;
    for (let i = 0; i < k; i++) {
      const [ax, az] = outline[i];
      const [bx, bz] = outline[(i + 1) % k];
      this.quad(V(ax, y0, az), V(bx, y0, bz), V(bx, y1, bz), V(ax, y1, az), centre, faces.side);
    }
    for (let i = 1; i < k - 1; i++) {
      const [ax, az] = outline[0];
      const [bx, bz] = outline[i];
      const [qx, qz] = outline[i + 1];
      if (faces.top !== undefined)
        this.tri(V(ax, y1, az), V(bx, y1, bz), V(qx, y1, qz), V(0, 1, 0), faces.top);
      if (faces.bottom !== undefined)
        this.tri(V(ax, y0, az), V(bx, y0, bz), V(qx, y0, qz), V(0, -1, 0), faces.bottom);
    }
  }

  arrays() {
    return {
      position: new Float32Array(this.pos),
      normal: new Float32Array(this.nor),
      part: new Float32Array(this.part),
      limb: new Float32Array(this.limbs),
    };
  }
}

interface CarLines {
  len: number;
  hw: number;
  wheel: number;
  y0: number;
  y1: number;
  /** the cabin's foot (front, back) and top (front, back), along z */
  cab: [number, number, number, number];
  roof: number;
}

/** The common car: wheels, a body, bumpers, lamps and a glass cabin with a roof. */
function car(M: Shape, o: CarLines) {
  const hl = o.len / 2;
  for (const z of [-hl + 0.85, hl - 0.9])
    M.pair(o.hw - 0.24, o.hw + 0.03, 0, o.wheel, z - o.wheel / 2, z + o.wheel / 2, TYRE);
  M.box(-o.hw, o.hw, o.y0, o.y1, -hl, hl, BODY);
  M.box(-o.hw + 0.04, o.hw - 0.04, o.y0 - 0.05, o.y0 + 0.17, -hl - 0.06, -hl + 0.02, TRIM);
  M.box(-o.hw + 0.04, o.hw - 0.04, o.y0 - 0.05, o.y0 + 0.17, hl - 0.02, hl + 0.06, TRIM);
  M.pair(o.hw - 0.42, o.hw - 0.1, o.y1 - 0.2, o.y1 - 0.07, -hl - 0.03, -hl + 0.01, HEAD);
  M.pair(o.hw - 0.38, o.hw - 0.08, o.y1 - 0.2, o.y1 - 0.06, hl - 0.01, hl + 0.03, TAIL);
  const [bz0, bz1, tz0, tz1] = o.cab;
  M.prism(-o.hw + 0.05, o.hw - 0.05, bz0, bz1, o.y1, -o.hw + 0.17, o.hw - 0.17, tz0, tz1, o.roof, {
    top: BODY,
    front: GLASS,
    back: GLASS,
    side: GLASS,
  });
}

const SEDAN: CarLines = {
  len: 4.7,
  hw: 0.9,
  wheel: 0.64,
  y0: 0.3,
  y1: 0.8,
  cab: [-1.05, 1.3, -0.45, 0.95],
  roof: 1.45,
};

function motorcycleModel(M: Shape) {
  for (const z of [-0.76, 0.76]) {
    // The straight edges and stepped corners make the two tyres read at the walk's pixel scale.
    M.box(-0.1, 0.1, 0, 0.1, z - 0.22, z + 0.22, TYRE);
    M.box(-0.1, 0.1, 0.1, 0.51, z - 0.34, z + 0.34, TYRE);
    M.box(-0.1, 0.1, 0.51, 0.61, z - 0.22, z + 0.22, TYRE);
    M.pair(0.1, 0.12, 0.18, 0.43, z - 0.15, z + 0.15, METAL);
  }
  M.box(-0.22, 0.22, 0.36, 0.68, -0.31, 0.39, TRIM); // frame and engine
  M.pair(0.13, 0.19, 0.3, 0.42, 0.05, 0.77, METAL); // swingarm
  M.pair(0.19, 0.26, 0.38, 0.51, 0.37, 0.91, METAL); // exhaust
  M.prism(-0.16, 0.16, -0.87, -0.7, 0.31, -0.12, 0.12, -0.62, -0.45, 1.02, METAL); // fork
  M.box(-0.14, 0.14, 0.61, 0.69, -0.99, -0.49, BODY); // front fender
  M.prism(-0.24, 0.24, -0.6, 0.19, 0.65, -0.17, 0.17, -0.44, 0.03, 1.02, BODY); // tank
  M.box(-0.19, 0.19, 0.62, 0.81, 0.16, 0.93, BODY); // rear fender
  M.box(-0.19, 0.19, 0.81, 0.93, 0.08, 0.75, TYRE); // seat
  M.box(-0.44, 0.44, 1.06, 1.15, -0.57, -0.46, TRIM); // handlebars
  M.box(-0.16, 0.16, 0.87, 1.06, -0.79, -0.57, { front: HEAD, side: TRIM, top: TRIM });
  M.box(-0.16, 0.16, 0.71, 0.83, 0.9, 0.97, { back: TAIL, side: TRIM, top: TRIM });
}

/** Each road vehicle's model, at the size `CARS` gives it. */
const CAR_MODELS: Record<CarKind, (M: Shape) => void> = {
  motorcycle: motorcycleModel,
  hatchback: (M) =>
    car(M, {
      len: 3.9,
      hw: 0.875,
      wheel: 0.6,
      y0: 0.3,
      y1: 0.82,
      cab: [-0.75, 1.62, -0.35, 1.5],
      roof: 1.45,
    }),
  sedan: (M) => car(M, SEDAN),
  taxi: (M) => {
    car(M, SEDAN);
    // the roof sign, with nothing written on it
    M.box(-0.3, 0.3, 1.45, 1.62, 0.05, 0.42, SIGN);
  },
  suv: (M) => {
    car(M, {
      len: 4.8,
      hw: 0.975,
      wheel: 0.74,
      y0: 0.38,
      y1: 1.02,
      cab: [-1.2, 2.25, -0.85, 2.15],
      roof: 1.8,
    });
    M.pair(0.62, 0.7, 1.8, 1.86, -0.6, 2.0, TRIM);
  },
  pickup: (M) => {
    const hl = 2.7;
    const hw = 1.0;
    for (const z of [-1.8, 1.65]) M.pair(hw - 0.26, hw + 0.03, 0, 0.78, z - 0.39, z + 0.39, TYRE);
    M.box(-hw, hw, 0.45, 1.08, -hl, hl, BODY);
    M.prism(-hw + 0.05, hw - 0.05, -1.05, 0.55, 1.08, -hw + 0.14, hw - 0.14, -0.65, 0.5, 1.85, {
      top: BODY,
      front: GLASS,
      side: GLASS,
      back: GLASS,
    });
    // the open bed: its sides and tailgate, its floor dark
    M.pair(hw - 0.08, hw, 1.08, 1.3, 0.65, hl, BODY);
    M.box(-hw, hw, 1.08, 1.3, hl - 0.08, hl, BODY);
    M.box(-hw + 0.08, hw - 0.08, 1.08, 1.1, 0.65, hl - 0.08, { top: TRIM });
    M.box(-hw + 0.04, hw - 0.04, 0.4, 0.62, -hl - 0.07, -hl + 0.02, TRIM);
    M.pair(hw - 0.42, hw - 0.1, 0.85, 0.98, -hl - 0.03, -hl + 0.01, HEAD);
    M.pair(hw - 0.12, hw - 0.02, 0.75, 1.15, hl - 0.01, hl + 0.03, TAIL);
  },
  limousine: (M) =>
    car(M, {
      len: 8.5,
      hw: 1.0,
      wheel: 0.66,
      y0: 0.32,
      y1: 0.84,
      cab: [-2.6, 3.4, -2.2, 3.1],
      roof: 1.5,
    }),
  police: (M) => {
    car(M, {
      len: 4.9,
      hw: 0.925,
      wheel: 0.64,
      y0: 0.3,
      y1: 0.8,
      cab: [-1.1, 1.35, -0.5, 1.0],
      roof: 1.42,
    });
    // a blue band down each side and a light bar: no words, no crest
    M.box(-0.94, 0.94, 0.52, 0.62, -2.35, 2.35, { side: BAND });
    M.box(-0.6, -0.02, 1.42, 1.5, 0.1, 0.42, BAR_RED);
    M.box(0.02, 0.6, 1.42, 1.5, 0.1, 0.42, BAR_BLUE);
  },
  muscle: (M) => {
    car(M, {
      len: 4.9,
      hw: 0.95,
      wheel: 0.68,
      y0: 0.3,
      y1: 0.86,
      cab: [-0.1, 1.55, 0.3, 1.35],
      roof: 1.35,
    });
    // racing stripes over the bonnet and the roof, and a scoop
    M.pair(0.12, 0.32, 0.86, 0.885, -2.45, -0.1, { top: STRIPE });
    M.pair(0.12, 0.32, 1.35, 1.375, 0.3, 1.35, { top: STRIPE });
    M.box(-0.3, 0.3, 0.86, 1.0, -1.6, -0.9, BODY);
  },
  sports: (M) => {
    car(M, {
      len: 4.4,
      hw: 0.95,
      wheel: 0.62,
      y0: 0.22,
      y1: 0.66,
      cab: [-0.55, 1.2, -0.1, 0.95],
      roof: 1.18,
    });
    // the spoiler on its two legs
    M.pair(0.6, 0.68, 0.66, 0.95, 1.85, 2.0, TRIM);
    M.box(-0.9, 0.9, 0.95, 1.0, 1.75, 2.15, BODY);
  },
  supercar: (M) => {
    const hl = 2.25;
    const hw = 1.0;
    for (const z of [-1.4, 1.35]) M.pair(hw - 0.26, hw + 0.03, 0, 0.66, z - 0.33, z + 0.33, TYRE);
    // the wedge: low at the nose, rising to the back
    M.prism(-hw, hw, -hl, hl, 0.2, -hw + 0.04, hw - 0.04, -1.5, hl - 0.05, 0.64, BODY);
    M.prism(-hw + 0.12, hw - 0.12, -0.75, 1.45, 0.64, -0.6, 0.6, -0.05, 1.1, 1.1, {
      top: BODY,
      front: GLASS,
      side: GLASS,
      back: GLASS,
    });
    M.box(-0.95, 0.95, 0.98, 1.03, 1.85, 2.2, BODY);
    M.pair(0.55, 0.63, 0.64, 0.98, 1.95, 2.1, TRIM);
    M.pair(hw - 0.42, hw - 0.12, 0.3, 0.38, -2.2, -2.05, HEAD);
    M.pair(hw - 0.45, hw - 0.1, 0.42, 0.55, hl - 0.06, hl - 0.02, TAIL);
    M.box(-0.7, 0.7, 0.18, 0.3, hl - 0.05, hl + 0.04, TRIM);
  },
  boxTruck: (M) => {
    const hl = 3.75;
    const hw = 1.25;
    for (const z of [-2.8, 1.85, 2.8])
      M.pair(hw - 0.3, hw + 0.02, 0, 0.9, z - 0.45, z + 0.45, TYRE);
    M.box(-hw + 0.05, hw - 0.05, 0.45, 1.3, -hl, -1.9, BODY);
    M.prism(-hw + 0.05, hw - 0.05, -3.55, -1.9, 1.3, -hw + 0.12, hw - 0.12, -3.05, -1.9, 2.5, {
      top: BODY,
      front: GLASS,
      side: GLASS,
      back: BODY,
    });
    M.box(-hw, hw, 0.65, 3.4, -1.82, hl, CARGO);
    M.box(-hw + 0.08, hw - 0.08, 0.38, 0.6, -hl - 0.06, -hl + 0.02, TRIM);
    M.pair(hw - 0.45, hw - 0.12, 0.95, 1.1, -hl - 0.03, -hl + 0.01, HEAD);
    M.pair(hw - 0.3, hw - 0.08, 0.75, 0.95, hl - 0.01, hl + 0.03, TAIL);
  },
  bus: (M) => {
    const hl = 6;
    const hw = 1.275;
    for (const z of [-3.9, 3.3]) M.pair(hw - 0.32, hw + 0.02, 0, 1.0, z - 0.5, z + 0.5, TYRE);
    M.box(-hw, hw, 0.32, 3.0, -hl, hl, BODY);
    M.box(-hw - 0.015, hw + 0.015, 1.4, 2.55, -4.9, 5.6, { side: GLASS });
    M.box(-hw + 0.12, hw - 0.12, 1.5, 2.6, hl - 0.1, hl + 0.02, { back: GLASS });
    M.box(-hw + 0.1, hw - 0.1, 1.0, 2.6, -hl - 0.02, -hl + 0.1, { front: GLASS });
    M.box(-hw - 0.02, hw + 0.02, 0.95, 1.18, -hl + 0.1, hl - 0.1, { side: BAND });
    // the route sign: an amber bar, nothing written on it
    M.box(-0.95, 0.95, 2.66, 2.9, -hl - 0.04, -hl + 0.1, { front: AMBER });
    M.box(-0.75, 0.75, 3.0, 3.1, -2.2, 1.6, TRIM);
    M.box(-hw + 0.06, hw - 0.06, 0.25, 0.45, -hl - 0.07, -hl + 0.02, TRIM);
    M.pair(hw - 0.4, hw - 0.12, 0.6, 0.78, -hl - 0.04, -hl + 0.01, HEAD);
    M.pair(hw - 0.3, hw - 0.1, 0.6, 1.0, hl - 0.01, hl + 0.03, TAIL);
  },
};

/** A hull's outline in plan: a square stern, straight sides, the bow drawn to a point. */
function hullOutline(len: number, beam: number): [number, number][] {
  const hl = len / 2;
  const hw = beam / 2;
  const shoulder = -hl + len * 0.3;
  return [
    [0, -hl],
    [hw * 0.75, -hl + len * 0.12],
    [hw, shoulder],
    [hw, hl],
    [-hw, hl],
    [-hw, shoulder],
    [-hw * 0.75, -hl + len * 0.12],
  ];
}

const BOAT_MODELS: Record<BoatKind, (M: Shape) => void> = {
  speedboat: (M) => {
    M.hull(hullOutline(6.5, 2.4), -0.4, 0.55, { top: DECK, bottom: BODY, side: BODY });
    // the windscreen, the console and the outboard
    M.prism(-0.9, 0.9, -0.6, -0.5, 0.55, -0.85, 0.85, -0.35, -0.25, 1.05, {
      front: GLASS,
      side: GLASS,
      back: GLASS,
      top: TRIM,
    });
    M.box(-0.6, 0.6, 0.55, 0.95, 0.3, 1.1, CABIN);
    M.box(-0.25, 0.25, -0.1, 0.9, 3.25, 3.6, TRIM);
  },
  motorboat: (M) => {
    M.hull(hullOutline(10, 3.4), -0.6, 0.9, { top: DECK, bottom: BODY, side: BODY });
    M.box(-1.2, 1.2, 0.9, 2.1, -2.0, 2.6, { side: CABIN, back: CABIN });
    M.prism(-1.2, 1.2, -2.6, -2.0, 0.9, -1.1, 1.1, -2.0, -1.9, 2.1, { front: GLASS, side: CABIN });
    M.box(-1.22, 1.22, 1.35, 1.8, -1.6, 2.2, { side: GLASS });
    M.box(-1.3, 1.3, 2.1, 2.25, -2.1, 2.8, TRIM);
    M.box(-0.05, 0.05, 2.25, 2.6, 0.5, 0.6, TRIM);
  },
  ferry: (M) => {
    M.hull(hullOutline(30, 9), -1.2, 2.0, { top: DECK, bottom: BODY, side: BODY });
    M.box(-4.0, 4.0, 2.0, 4.2, -10, 12, { side: CABIN, front: CABIN, back: CABIN, top: TRIM });
    M.box(-4.02, 4.02, 2.8, 3.7, -9, 11, { side: GLASS });
    M.box(-3.2, 3.2, 4.2, 6.0, -7, 8, { side: CABIN, front: CABIN, back: CABIN, top: TRIM });
    M.box(-3.22, 3.22, 4.7, 5.5, -6.5, 7.5, { side: GLASS });
    M.box(-2.0, 2.0, 6.0, 7.0, -5.5, -2.5, { side: GLASS, front: GLASS, top: CABIN, back: CABIN });
    M.box(-0.6, 0.6, 6.0, 7.0, 3, 4.5, TRIM);
  },
};

/** A person, 1.77 m: the legs swing about the hip (limbs 1, 2), the arms about the shoulder (3, 4). */
function personModel(M: Shape) {
  for (const [s, limb] of [
    [-1, 1],
    [1, 2],
  ]) {
    M.limb = limb;
    M.box(
      Math.min(s * 0.03, s * 0.17),
      Math.max(s * 0.03, s * 0.17),
      0.1,
      0.88,
      -0.07,
      0.08,
      PANTS,
    );
    M.box(
      Math.min(s * 0.025, s * 0.175),
      Math.max(s * 0.025, s * 0.175),
      0,
      0.1,
      -0.12,
      0.09,
      SHOE,
    );
  }
  M.limb = 0;
  M.box(-0.2, 0.2, 0.86, 1.43, -0.11, 0.11, SHIRT);
  M.box(-0.07, 0.07, 1.43, 1.48, -0.06, 0.06, SKIN);
  M.box(-0.11, 0.11, 1.48, 1.72, -0.11, 0.11, SKIN);
  M.box(-0.12, 0.12, 1.66, 1.77, -0.12, 0.12, HAIR);
  M.box(-0.12, 0.12, 1.5, 1.66, 0.08, 0.12, HAIR);
  for (const [s, limb] of [
    [-1, 3],
    [1, 4],
  ]) {
    M.limb = limb;
    M.box(Math.min(s * 0.2, s * 0.29), Math.max(s * 0.2, s * 0.29), 0.9, 1.42, -0.06, 0.06, SHIRT);
    M.box(
      Math.min(s * 0.205, s * 0.285),
      Math.max(s * 0.205, s * 0.285),
      0.78,
      0.9,
      -0.05,
      0.05,
      SKIN,
    );
  }
  M.limb = 0;
}

/** Sitting over the seat with hands on the grips and feet on the pegs. */
function riderModel(M: Shape) {
  M.prism(-0.2, 0.2, 0.05, 0.4, 0.91, -0.21, 0.21, -0.28, 0.02, 1.4, SHIRT);
  M.pair(0.12, 0.26, 0.79, 0.94, -0.18, 0.35, PANTS);
  M.pair(0.19, 0.29, 0.51, 0.82, -0.16, 0.01, PANTS);
  M.pair(0.19, 0.3, 0.44, 0.54, -0.2, 0.07, SHOE);
  for (const side of [-1, 1]) {
    const grip = side * 0.35;
    const shoulder = side * 0.22;
    M.prism(
      grip - 0.055,
      grip + 0.055,
      -0.54,
      -0.41,
      1.13,
      shoulder - 0.075,
      shoulder + 0.075,
      -0.24,
      -0.08,
      1.38,
      SHIRT,
    );
  }
  M.box(-0.08, 0.08, 1.39, 1.48, -0.25, -0.08, SKIN);
  M.box(-0.14, 0.14, 1.46, 1.71, -0.37, -0.07, HAIR); // helmet
  M.box(-0.12, 0.12, 1.54, 1.63, -0.388, -0.36, SHOE); // visor
}

/** A traffic signal on its post, 4 m tall, its three lamps (red over yellow over green) facing forward. */
function signalModel(M: Shape) {
  M.box(-0.07, 0.07, 0, 3.0, -0.07, 0.07, TRIM);
  M.box(-0.2, 0.2, 2.95, 4.05, -0.18, 0.18, HOUSING);
  for (const [y, part] of [
    [3.82, LAMP_RED],
    [3.5, LAMP_YELLOW],
    [3.18, LAMP_GREEN],
  ])
    M.box(-0.11, 0.11, y - 0.11, y + 0.11, -0.23, -0.17, { front: part });
}

// ---- the shaders

const PALETTE = /* glsl */ `
uniform sampler2D pal;
vec3 P(int ramp, int shade) { return texelFetch(pal, ivec2(ramp * ${SHADES} + clamp(shade, 0, 5), 0), 0).rgb; }
`;

/** A face's tone, as the walls take theirs from the sun: top 5, underside 1, lit 4, half 3, shade 2. */
const TONE = /* glsl */ `
  vec3 nw = normalize(mat3(m) * normal);
  float l = dot(vec2(nw.x, -nw.z), sun);
  vTone = nw.y > 0.7 ? 5 : nw.y < -0.7 ? 1 : l > 0.25 ? 4 : l > -0.25 ? 3 : 2;
`;

const VEHICLE_VERTEX = /* glsl */ `
attribute float part; attribute float ramp; attribute float lit; attribute float dmg;
uniform vec2 sun;
flat varying int vPart; flat varying int vRamp; flat varying int vLit; flat varying int vTone;
flat varying float vDmg; varying vec3 vMV; varying vec3 vLocal;
void main() {
  mat4 m = modelMatrix * instanceMatrix;
  ${TONE}
  vec3 p = position;
  if (dmg > 0.0) {
    // crumpled: the same push for every face at a corner, so nothing splits
    float h1 = fract(sin(dot(position, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float h2 = fract(sin(dot(position, vec3(39.346, 11.135, 83.155))) * 23421.631);
    p.y -= step(0.45, position.y) * h1 * min(dmg, 1.0) * 0.24;
    p.x *= 1.0 - h2 * min(dmg, 1.0) * 0.1;
    p.z *= 1.0 - h1 * min(dmg, 1.0) * 0.05;
  }
  vPart = int(part + 0.5); vRamp = int(ramp + 0.5); vLit = int(lit + 0.5); vDmg = dmg;
  vLocal = position;
  vec4 mv = viewMatrix * m * vec4(p, 1.0);
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

function vehicleFragment(r: (name: string) => number) {
  return /* glsl */ `
precision highp float; precision highp int;
uniform float time;
${FOG} ${PALETTE}
flat varying int vPart; flat varying int vRamp; flat varying int vLit; flat varying int vTone;
flat varying float vDmg; varying vec3 vMV; varying vec3 vLocal;
void main() {
  int t = vTone, p = vPart;
  bool wrecked = vDmg >= 1.0;
  bool flash = fract(time * 2.5) < 0.5 && !wrecked;
  vec3 c;
  if (p == ${BODY}) c = wrecked ? P(${r("carBlack")}, t - 1) : P(vRamp, t - (vDmg > 0.6 ? 1 : 0));
  else if (p == ${GLASS}) {
    // from 35% the glass cracks: a scatter of bright bits on the glass itself, 11 cm each
    ivec3 q = ivec3(floor(vLocal * 9.0 + 100.0));
    c = vDmg > 0.35 && (q.x + q.y * 2 + q.z * 3) % 5 == 0 ? P(${r("glassSilver")}, 5) : P(${r("glassDark")}, t - 1);
  }
  else if (p == ${TYRE}) c = P(${r("asphaltDark")}, t == 5 ? 1 : 0);
  else if (p == ${HEAD}) c = wrecked ? P(${r("darkStone")}, 1) : P(${r("markingWhite")}, 5);
  else if (p == ${TAIL}) c = vLit == 1 ? P(${r("carRed")}, 5) : P(${r("carRed")}, 2);
  else if (p == ${SIGN}) c = P(${r("cream")}, 5);
  else if (p == ${TRIM}) c = P(${r("darkStone")}, t - 1);
  else if (p == ${BAND}) c = P(${r("carBlue")}, t);
  else if (p == ${CARGO}) c = wrecked ? P(${r("carBlack")}, t - 1) : P(${r("carWhite")}, t);
  else if (p == ${AMBER}) c = P(${r("taxi")}, 5);
  else if (p == ${STRIPE}) c = P(${r("markingWhite")}, t);
  else if (p == ${BAR_RED}) c = flash ? P(${r("carRed")}, 5) : P(${r("carRed")}, 1);
  else if (p == ${BAR_BLUE}) c = !flash && !wrecked ? P(${r("carBlue")}, 5) : P(${r("carBlue")}, 1);
  else if (p == ${CABIN}) c = P(${r("carWhite")}, t);
  else if (p == ${DECK}) c = P(${r("pier")}, t);
  // a signal: its lit lamp (0 red, 1 yellow, 2 green) shines, the others are dark
  else if (p == ${LAMP_RED}) c = vLit == 0 ? P(${r("carRed")}, 5) : P(${r("darkStone")}, 1);
  else if (p == ${LAMP_YELLOW}) c = vLit == 1 ? P(${r("taxi")}, 5) : P(${r("darkStone")}, 1);
  else if (p == ${LAMP_GREEN}) c = vLit == 2 ? P(${r("libertyGreen")}, 5) : P(${r("darkStone")}, 1);
  else if (p == ${HOUSING}) c = P(${r("taxi")}, t - 1);
  else if (p == ${METAL}) c = P(${r("steel")}, t);
  else c = P(${r("taxi")}, t - 1);
  bool lamp = !wrecked && (p == ${HEAD} || (p == ${TAIL} && vLit == 1) ||
    (p == ${BAR_RED} && flash) || (p == ${BAR_BLUE} && !flash));
  lamp = lamp || (p == ${LAMP_RED} && vLit == 0) || (p == ${LAMP_YELLOW} && vLit == 1) || (p == ${LAMP_GREEN} && vLit == 2);
  gl_FragColor = vec4(lamp ? emissive(c, length(vMV)) : fogged(c, length(vMV)), 1.0);
}`;
}

const PERSON_VERTEX = /* glsl */ `
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
  if (L > 0) {
    float y = p.y - py, z = p.z, c = cos(ang), s = sin(ang);
    p.y = py + y * c - z * s;
    p.z = y * s + z * c;
  }
  vPart = int(part + 0.5); vCols = ivec4(cols + 0.5);
  vec4 mv = viewMatrix * m * vec4(p, 1.0);
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

function personFragment(r: (name: string) => number) {
  return /* glsl */ `
precision highp float; precision highp int;
${FOG} ${PALETTE}
flat varying int vPart; flat varying int vTone; flat varying ivec4 vCols; varying vec3 vMV;
void main() {
  int t = vTone == 5 ? 4 : vTone;
  vec3 c = vPart == ${SHIRT} ? P(vCols.x, t) : vPart == ${PANTS} ? P(vCols.y, t)
    : vPart == ${SKIN} ? P(vCols.z, t) : vPart == ${HAIR} ? P(vCols.w, t - 1)
    : P(${r("asphaltDark")}, 1);
  gl_FragColor = vec4(fogged(c, length(vMV)), 1.0);
}`;
}

// ---- the instanced meshes

type Base = ReturnType<Shape["arrays"]>;

/** One kind's instances: grown (doubled) whenever a frame needs more than it holds. */
class Pool {
  mesh: THREE.InstancedMesh;
  attrs: Record<string, THREE.InstancedBufferAttribute> = {};
  n = 0;
  private cap: number;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly base: Base,
    private readonly sizes: Record<string, number>,
    private readonly material: THREE.ShaderMaterial,
    cap = 16,
  ) {
    this.cap = cap;
    this.mesh = this.build(cap);
    scene.add(this.mesh);
  }

  private build(cap: number): THREE.InstancedMesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.base.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(this.base.normal, 3));
    g.setAttribute("part", new THREE.BufferAttribute(this.base.part, 1));
    g.setAttribute("limb", new THREE.BufferAttribute(this.base.limb, 1));
    const attrs: Record<string, THREE.InstancedBufferAttribute> = {};
    for (const [name, size] of Object.entries(this.sizes)) {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * size), size);
      a.setUsage(THREE.DynamicDrawUsage);
      g.setAttribute(name, a);
      attrs[name] = a;
    }
    const mesh = new THREE.InstancedMesh(g, this.material, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    this.attrs = attrs;
    return mesh;
  }

  /** The next instance's index, the pool doubled when it is full. */
  next(): number {
    if (this.n >= this.cap) {
      const old = this.mesh;
      const oldAttrs = this.attrs;
      this.cap *= 2;
      this.mesh = this.build(this.cap);
      (this.mesh.instanceMatrix.array as Float32Array).set(
        old.instanceMatrix.array as Float32Array,
      );
      for (const [name, a] of Object.entries(oldAttrs))
        (this.attrs[name].array as Float32Array).set(a.array as Float32Array);
      this.scene.remove(old);
      old.geometry.dispose();
      this.scene.add(this.mesh);
    }
    return this.n++;
  }

  flush(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of Object.values(this.attrs)) a.needsUpdate = true;
    this.n = 0;
  }

  dispose(): void {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
  }
}

const VEHICLE_ATTRS = { ramp: 1, lit: 1, dmg: 1 };
const PERSON_ATTRS = { phase: 1, amp: 1, cols: 4 };

/** How far a swimmer's figure stands below the water, so the head is just above it. */
const SWIM_SINK = 1.35;
/** How high a figure lying down is lifted, so its front is not in the ground. */
const LYING = 0.13;

/** Every model of the walk in one scene; fill it each frame between `begin` and `end`. */
export class WalkModels {
  private readonly pools = new Map<string, Pool>();
  private readonly vehicleMat: THREE.ShaderMaterial;
  private readonly personMat: THREE.ShaderMaterial;
  private readonly ramp: (name: string) => number;
  private readonly matrix = new THREE.Matrix4();
  private readonly quat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly at = new THREE.Vector3();
  private readonly one = new THREE.Vector3(1, 1, 1);
  private readonly stretch = new THREE.Vector3(1, 1, 1);
  private readonly yours: [number, number, number, number];
  private readonly grey = { value: 0 };

  constructor(
    private readonly scene: THREE.Scene,
    palette: Palette,
    ix: WalkIndex,
    lighting = new StreetLighting(),
  ) {
    this.ramp = (name) => palette.ramp(name);
    const sun = (ix.sunDeg * Math.PI) / 180;
    const shared = {
      ...lighting.uniforms,
      pal: { value: palette.texture },
      sun: { value: new THREE.Vector2(Math.sin(sun), Math.cos(sun)) },
      fogColor: { value: HORIZON },
      fogNear: { value: FOG_NEAR },
      fogFar: { value: FOG_FAR },
      grey: this.grey,
      greys: { value: greysOf(palette) },
    };
    this.vehicleMat = new THREE.ShaderMaterial({
      uniforms: { ...shared, time: { value: 0 } },
      vertexShader: VEHICLE_VERTEX,
      fragmentShader: vehicleFragment(this.ramp),
    });
    this.personMat = new THREE.ShaderMaterial({
      uniforms: shared,
      vertexShader: PERSON_VERTEX,
      fragmentShader: personFragment(this.ramp),
    });
    const kinds: [string, (M: Shape) => void][] = [
      ...(Object.entries(CAR_MODELS) as [string, (M: Shape) => void][]),
      ...(Object.entries(BOAT_MODELS) as [string, (M: Shape) => void][]),
    ];
    for (const [kind, model] of kinds) {
      const M = new Shape();
      model(M);
      this.pools.set(kind, new Pool(scene, M.arrays(), VEHICLE_ATTRS, this.vehicleMat));
    }
    const M = new Shape();
    personModel(M);
    const person = M.arrays();
    this.pools.set("person", new Pool(scene, person, PERSON_ATTRS, this.personMat, 64));
    this.pools.set("you", new Pool(scene, person, PERSON_ATTRS, this.personMat, 1));
    const rider = new Shape();
    riderModel(rider);
    this.pools.set("motorcyclist", new Pool(scene, rider.arrays(), PERSON_ATTRS, this.personMat));
    const post = new Shape();
    signalModel(post);
    this.pools.set("signal", new Pool(scene, post.arrays(), VEHICLE_ATTRS, this.vehicleMat, 64));
    this.yours = [
      this.ramp(YOURS.top),
      this.ramp(YOURS.bottom),
      this.ramp(YOURS.skin),
      this.ramp(YOURS.hair),
    ];
  }

  /** Starts a frame: nothing drawn yet. */
  begin(): void {
    for (const p of this.pools.values()) p.n = 0;
  }

  private place(
    pool: Pool,
    e: number,
    z: number,
    n: number,
    yaw: number,
    pitch: number,
    roll: number,
    scale: THREE.Vector3 = this.one,
  ): number {
    const i = pool.next();
    this.euler.set(pitch, -yaw, roll, "YXZ");
    this.quat.setFromEuler(this.euler);
    this.at.set(e, z, -n);
    this.matrix.compose(this.at, this.quat, scale);
    pool.mesh.setMatrixAt(i, this.matrix);
    return i;
  }

  /** A car's or a boat's paint: its colour, or what its kind always wears. */
  private paint(v: Vehicle): number {
    switch (v.kind) {
      case "taxi":
        return this.ramp("taxi");
      case "police":
      case "bus":
        return this.ramp("carWhite");
      case "limousine":
        return this.ramp(v.color === 2 ? "carWhite" : "carBlack");
      case "ferry":
        // the Staten Island boat is orange, as on the map
        return this.ramp(v.color === 1 ? "ferryOrange" : "carBlue");
      case "speedboat":
        return this.ramp(SPEEDBOAT_PAINTS[v.color & 7]);
      case "motorboat":
        return this.ramp(v.color % 2 === 1 ? "cream" : "carWhite");
      default:
        return this.ramp(CAR_PAINTS[v.color & 7]);
    }
  }

  /** A car or a boat where it is, `brake` lighting its tail lamps. A sunk one is not drawn. */
  vehicle(v: Vehicle, brake = false, hideRider = false): void {
    if (v.state === "sunk") return;
    const pool = this.pools.get(v.kind);
    if (!pool) return;
    // a vehicle of its own size (the long ferry) is its kind's model stretched to it, as much
    // taller as it is longer (as `sizeFor` has its height)
    let scale = this.one;
    if (v.size) {
      const kind = sizeOf(v.kind);
      const longer = v.size.length / kind.length;
      scale = this.stretch.set(v.size.width / kind.width, longer, longer);
    }
    const occupied = v.kind === "motorcycle" && (v.state === "traffic" || v.state === "driven");
    const roll = occupied
      ? clamp(Math.atan((Math.max(0, v.v) * v.w) / GRAVITY), -0.46, 0.46)
      : v.roll;
    const i = this.place(pool, v.e, v.z + v.heave, v.n, v.yaw, 0, -roll, scale);
    pool.attrs.ramp.array[i] = this.paint(v);
    pool.attrs.lit.array[i] = brake ? 1 : 0;
    pool.attrs.dmg.array[i] = v.fuse !== null ? 0.99 : v.state === "wrecked" ? 1 : v.damage;
    if (occupied && !hideRider) this.motorcyclist(v, roll);
  }

  private motorcyclist(v: Vehicle, roll: number): void {
    const pool = this.pools.get("motorcyclist")!;
    const i = this.place(pool, v.e, v.z, v.n, v.yaw, 0, -roll);
    const cols = pool.attrs.cols.array as Float32Array;
    const paint = v.color & 7;
    cols[i * 4] = v.state === "driven" ? this.yours[0] : this.ramp(TOPS[paint]);
    cols[i * 4 + 1] = v.state === "driven" ? this.yours[1] : this.ramp(BOTTOMS[paint]);
    cols[i * 4 + 2] = v.state === "driven" ? this.yours[2] : this.ramp(SKINS[paint]);
    cols[i * 4 + 3] = this.ramp("carWhite");
  }

  /** Someone in the street: walking, running, waiting, lying where they fell, or swimming. */
  person(p: Person): void {
    const pool = this.pools.get("person")!;
    const down = p.state === "down";
    const z = p.state === "swimming" ? p.z - SWIM_SINK : down ? p.z + LYING : p.z;
    const i = this.place(pool, p.e, z, p.n, p.yaw, down ? -Math.PI / 2 : 0, 0);
    pool.attrs.phase.array[i] = p.phase;
    pool.attrs.amp.array[i] =
      p.state === "walking"
        ? 0.55
        : p.state === "running" || p.state === "dodging"
          ? 0.9
          : p.state === "swimming"
            ? 0.7
            : 0;
    const cols = pool.attrs.cols.array as Float32Array;
    cols[i * 4] = this.ramp(TOPS[p.look.top & 7]);
    cols[i * 4 + 1] = this.ramp(BOTTOMS[p.look.bottom & 7]);
    cols[i * 4 + 2] = this.ramp(SKINS[p.look.skin & 7]);
    cols[i * 4 + 3] = this.ramp(HAIRS[p.look.hair & 7]);
  }

  /** You, in your own clothes: standing, or lying in the street (`lying` true). */
  you(e: number, n: number, z: number, yaw: number, lying: boolean): void {
    const pool = this.pools.get("you")!;
    const i = this.place(pool, e, lying ? z + LYING : z, n, yaw, lying ? -Math.PI / 2 : 0, 0);
    pool.attrs.phase.array[i] = 0;
    pool.attrs.amp.array[i] = 0;
    (pool.attrs.cols.array as Float32Array).set(this.yours, i * 4);
  }

  /** A traffic signal on its post, `lit` its lamp that is on (0 red, 1 yellow, 2 green). */
  signal(post: SignalPost, lit: 0 | 1 | 2): void {
    const pool = this.pools.get("signal")!;
    const i = this.place(pool, post.e, post.z, post.n, post.yaw, 0, 0);
    pool.attrs.ramp.array[i] = 0;
    pool.attrs.lit.array[i] = lit;
    pool.attrs.dmg.array[i] = 0;
  }

  /** Drains the colours to the palette's greys, 0 (none) to 1 (all): the wasted sequence. */
  setGrey(amount: number): void {
    this.grey.value = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  }

  /** Ends a frame: what was put in is what is drawn; `time` (s) flashes the police lights. */
  end(time: number): void {
    for (const p of this.pools.values()) p.flush();
    this.vehicleMat.uniforms.time.value = time;
  }

  /** How many of each are drawn this frame: for a check. */
  counts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, p] of this.pools) out[k] = p.mesh.count;
    return out;
  }

  dispose(): void {
    for (const p of this.pools.values()) p.dispose();
    this.pools.clear();
    this.vehicleMat.dispose();
    this.personMat.dispose();
  }
}
