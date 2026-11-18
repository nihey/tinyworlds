import * as THREE from "three";
import type { StreetLighting } from "./city-light";
import { sizeFor, type Vehicle } from "../vehicles";
import { WATER_Z } from "../world";
import { FOG, FOG_FAR, FOG_NEAR, HASH, HORIZON, greysOf, NOT_MIRRORED } from "./materials";
import { HALF, HIGH, LIT, SHADE, type Palette } from "./palette";

/**
 * Sparks, glass, smoke, fire, bubbles, foam and wakes: round points in the palette's colours
 * that fade by dithering (a 4 × 4 Bayer pattern drops more of their pixels as they go), never by
 * blending, after the spike's `cars.js`. World metres east, north and up, as everywhere. And the
 * ripple rings a splash leaves on the water.
 */

const MAX = 1600;

/** Every ramp the particles are coloured from: the palette must have them all. */
export const PARTICLE_RAMPS: readonly string[] = [
  "taxi",
  "cream",
  "markingWhite",
  "ferryOrange",
  "carRed",
  "glassSilver",
  "greyStone",
  "carBlack",
  "foam",
  "waterShallow",
];
/** The water's surface, where foam floats and bubbles break. */
const FOAM_Z = WATER_Z + 0.03;

/** Rings on the water at once (the oldest gives way), the frames each goes through and how long each lasts, s. */
const RINGS = 12;
export const RING_FRAMES = 5;
export const RING_FRAME = 0.2;
/** How much wider each frame of a ring is than the last, metres, over its splash's size. */
const RING_GROW = 0.7;
const RING_GROW_PER_SIZE = 0.25;

/**
 * Ripple rings: each a quad on the water round its splash, in which a ring one pixel wide
 * (whatever the distance) grows by whole frames, `RING_FRAMES` of `RING_FRAME` s, and breaks up
 * as it goes: each frame leaves out more of its arcs. Palette colours, the fog and the drain, no
 * blending. `ring` is the splash's [e, n, when, size].
 */
const RING_VERTEX = /* glsl */ `
attribute vec2 corner; attribute vec4 ring;
varying vec2 vAt; flat varying vec4 vRing; varying vec3 vMV;
void main() {
  vRing = ring;
  float r = ring.w * 0.5 + ${RING_FRAMES}.0 * (${RING_GROW} + ${RING_GROW_PER_SIZE} * ring.w) + 0.5;
  vAt = corner * r;
  vec4 mv = modelViewMatrix * vec4(ring.x + vAt.x, ${FOAM_Z.toFixed(2)}, -(ring.y + vAt.y), 1.0);
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const RING_FRAGMENT = /* glsl */ `
precision highp float;
uniform float now; uniform vec3 shades[3];
${HASH} ${FOG}
varying vec2 vAt; flat varying vec4 vRing; varying vec3 vMV;
void main() {
  // the derivative first, where every pixel of the quad takes the same path
  float d = length(vAt);
  float px = max(fwidth(d), 0.02);
  float age = now - vRing.z;
  int frame = int(floor(age / ${RING_FRAME}));
  if (age < 0.0 || frame >= ${RING_FRAMES}) discard;
  float r = vRing.w * 0.5 + float(frame + 1) * (${RING_GROW} + ${RING_GROW_PER_SIZE} * vRing.w);
  if (abs(d - r) > px * 0.6) discard;
  // breaking up: of 24 arcs, each frame after the first leaves out more
  float a = atan(vAt.y, vAt.x) / 6.28318530718 + 0.5;
  uint arc = uint(floor(a * 24.0));
  uint h = mixh(arc, uint(mod(vRing.z * 997.0, 65536.0)));
  if (float(h & 255u) < float(frame) / ${RING_FRAMES}.0 * 256.0 * 0.8) discard;
  gl_FragColor = vec4(fogged(shades[min(2, frame / 2)], length(vMV)), 1.0);
}`;

type Colour = [number, number, number];

interface Bit {
  e: number;
  n: number;
  z: number;
  ve: number;
  vn: number;
  vz: number;
  life: number;
  max: number;
  /** size in metres at birth and at death */
  s0: number;
  s1: number;
  colour: Colour;
  /** m/s² down (negative rises, like smoke) */
  grav: number;
  /** what it bounces on */
  floor: number;
  /** fades as it goes (smoke, foam), or stays whole to the end (sparks) */
  fades: boolean;
  flame: boolean;
}

const VERTEX = /* glsl */ `
attribute float size; attribute float alpha; attribute float flame; attribute vec3 colour;
uniform float pscale;
varying vec3 vColour; varying float vAlpha; varying float vFlame; varying vec3 vMV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vMV = mv.xyz; vColour = colour; vAlpha = alpha; vFlame = flame;
  gl_PointSize = max(1.0, size * pscale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
${FOG}
varying vec3 vColour; varying float vAlpha; varying float vFlame; varying vec3 vMV;
const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
void main() {
  if (vFlame > 0.5) {
    float up = 1.0 - gl_PointCoord.y;
    float centre = 0.5 + 0.14 * sin(vMV.x * 2.0 + up * 4.0) * up;
    float width = 0.62 * (1.0 - up) * smoothstep(0.0, 0.32, up);
    if (abs(gl_PointCoord.x - centre) > width) discard;
  } else if (length(gl_PointCoord - 0.5) > 0.5) discard;
  ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
  if (vAlpha < (B[q.x + q.y * 4] + 0.5) / 16.0) discard;
  gl_FragColor = vec4(vFlame > 0.5 ? emissive(vColour, length(vMV)) : fogged(vColour, length(vMV)), 1.0);
}`;

export class WalkParticles {
  private readonly bits: Bit[] = [];
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
  private readonly tongues = new Float32Array(MAX);
  private readonly geo = new THREE.BufferGeometry();
  private readonly mat: THREE.ShaderMaterial;
  private readonly points: THREE.Points;
  private readonly spark: Colour[];
  private readonly fire: Colour[];
  private readonly glass: Colour;
  private readonly smokeGrey: Colour;
  private readonly smokeBlack: Colour;
  private readonly foam: Colour[];
  private readonly drop: Colour;
  private readonly rings = new THREE.BufferGeometry();
  private readonly ringData = new Float32Array(RINGS * 4 * 4);
  private readonly ringMat: THREE.ShaderMaterial;
  private readonly ringMesh: THREE.Mesh;
  private nextRing = 0;
  /** The particles' own clock, s: the rings' frames count on it. */
  private clock = 0;

  constructor(
    private readonly scene: THREE.Scene,
    palette: Palette,
    lighting: StreetLighting,
  ) {
    const c = (ramp: string, shade: number): Colour =>
      palette.rgb(palette.ramp(ramp), shade).map((v) => v / 255) as Colour;
    this.spark = [c("taxi", HIGH), c("cream", HIGH), c("markingWhite", HIGH)];
    this.fire = [c("taxi", HIGH), c("ferryOrange", HIGH), c("carRed", LIT)];
    this.glass = c("glassSilver", HIGH);
    this.smokeGrey = c("greyStone", LIT);
    this.smokeBlack = c("carBlack", SHADE);
    this.foam = [c("foam", HIGH), c("foam", LIT), c("waterShallow", HIGH)];
    this.drop = c("waterShallow", HALF);

    const attr = (a: Float32Array, n: number) =>
      new THREE.BufferAttribute(a, n).setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute("position", attr(this.pos, 3));
    this.geo.setAttribute("colour", attr(this.col, 3));
    this.geo.setAttribute("size", attr(this.size, 1));
    this.geo.setAttribute("alpha", attr(this.alpha, 1));
    this.geo.setAttribute("flame", attr(this.tongues, 1));
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        pscale: { value: 300 },
        ...lighting.uniforms,
        fogColor: { value: HORIZON },
        fogNear: { value: FOG_NEAR },
        fogFar: { value: FOG_FAR },
        grey: { value: 0 },
        greys: { value: greysOf(palette) },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    // most of them float on the water or hang just over it: not in its mirror
    this.points.layers.set(NOT_MIRRORED);
    // a point's size in pixels: the drawing's height over the view's (at a metre away)
    const buffer = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(buffer);
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 70;
      this.mat.uniforms.pscale.value = buffer.y / (2 * Math.tan((fov * Math.PI) / 360));
    };
    scene.add(this.points);

    // the rings: a quad each, its corners and its splash
    const corners: number[] = [];
    const index: number[] = [];
    for (let k = 0; k < RINGS; k++) {
      corners.push(-1, -1, 1, -1, 1, 1, -1, 1);
      index.push(k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3);
    }
    // a ring not yet made is long gone
    for (let v = 0; v < RINGS * 4; v++) this.ringData[v * 4 + 2] = -1e6;
    this.rings.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(new Float32Array(RINGS * 12), 3),
    );
    this.rings.setAttribute("corner", new THREE.Float32BufferAttribute(corners, 2));
    this.rings.setAttribute("ring", attr(this.ringData, 4));
    this.rings.setIndex(index);
    const shade = (ramp: string, s: number) =>
      new THREE.Vector3(...palette.rgb(palette.ramp(ramp), s).map((v) => v / 255));
    this.ringMat = new THREE.ShaderMaterial({
      uniforms: {
        now: { value: 0 },
        shades: { value: [shade("foam", HIGH), shade("foam", LIT), shade("waterShallow", HIGH)] },
        ...lighting.uniforms,
        fogColor: { value: HORIZON },
        fogNear: { value: FOG_NEAR },
        fogFar: { value: FOG_FAR },
        grey: this.mat.uniforms.grey,
        greys: this.mat.uniforms.greys,
      },
      vertexShader: RING_VERTEX,
      fragmentShader: RING_FRAGMENT,
      depthWrite: false,
    });
    this.ringMesh = new THREE.Mesh(this.rings, this.ringMat);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.renderOrder = 2;
    this.ringMesh.layers.set(NOT_MIRRORED);
    scene.add(this.ringMesh);
  }

  /** Drains the colours to the palette's greys, 0 (none) to 1 (all): the wasted sequence. */
  setGrey(amount: number): void {
    this.mat.uniforms.grey.value = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  }

  /** How many are in the air: for a check. */
  get count(): number {
    return this.bits.length;
  }

  private emit(
    e: number,
    n: number,
    z: number,
    ve: number,
    vn: number,
    vz: number,
    life: number,
    s0: number,
    s1: number,
    colour: Colour,
    grav: number,
    floor: number,
    fades: boolean,
    flame = false,
  ) {
    if (this.bits.length >= MAX) this.bits.shift();
    this.bits.push({
      e,
      n,
      z,
      ve,
      vn,
      vz,
      life,
      max: life,
      s0,
      s1,
      colour,
      grav,
      floor,
      fades,
      flame,
    });
  }

  /** A hit at `speed` m/s: sparks, bits of glass when it was hard, a puff of dust. */
  sparks(e: number, n: number, z: number, speed: number): void {
    const count = Math.min(26, Math.round(speed * 1.6));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * 2 * Math.PI;
      const s = 1 + Math.random() * speed * 0.35;
      this.emit(
        e,
        n,
        z + 0.5 + Math.random() * 0.6,
        Math.sin(a) * s,
        Math.cos(a) * s,
        1 + Math.random() * 4,
        0.3 + Math.random() * 0.4,
        0.12,
        0.06,
        this.spark[i % 3],
        12,
        z,
        false,
      );
    }
    if (speed > 7)
      for (let i = 0; i < 8; i++)
        this.emit(
          e,
          n,
          z + 1,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 5,
          1 + Math.random() * 3,
          0.6,
          0.1,
          0.1,
          this.glass,
          12,
          z,
          false,
        );
    for (let i = 0; i < 3; i++)
      this.emit(
        e,
        n,
        z + 0.6,
        (Math.random() - 0.5) * 1.5,
        (Math.random() - 0.5) * 1.5,
        0.6,
        1.2,
        0.5,
        1.6,
        this.smokeGrey,
        -0.2,
        z,
        true,
      );
  }

  private engine(v: Vehicle): [number, number, number] {
    const size = sizeFor(v);
    const front = size.length / 2 - 0.9;
    return [v.e + Math.sin(v.yaw) * front, v.n + Math.cos(v.yaw) * front, v.z + size.height * 0.65];
  }

  /** The initial flames are visible as soon as a critical vehicle starts its fuse. */
  ignite(v: Vehicle): void {
    const [e, n, z] = this.engine(v);
    const width = sizeFor(v).width;
    for (let i = 0; i < 12; i++) this.flame(e, n, z, width);
    this.smoke(e, n, z, true);
  }

  /** A bright expanding core, a burst of flame and sparks, then a rising smoke column. */
  explode(v: Vehicle): void {
    const { e, n, z } = v;
    const size = sizeFor(v);
    const roof = z + size.height;
    const scale = Math.sqrt(size.width / 1.8);
    this.emit(e, n, roof, 0, 0, 3, 0.16, 1.8 * scale, 5.6 * scale, this.spark[2], 0, z, true);
    this.emit(e, n, roof, 0, 0, 3, 0.32, 2.4 * scale, 5.2 * scale, this.fire[0], -1, z, true);
    for (let i = 0; i < 48; i++) {
      const angle = ((i + Math.random()) / 48) * 2 * Math.PI;
      const speed = (2 + Math.random() * 7) * scale;
      this.emit(
        e + (Math.random() - 0.5) * size.width,
        n + (Math.random() - 0.5) * size.width,
        roof + Math.random(),
        Math.sin(angle) * speed,
        Math.cos(angle) * speed,
        1.5 + Math.random() * 5,
        0.3 + Math.random() * 0.55,
        1.3 * scale,
        0.4 * scale,
        this.fire[i % 3],
        5,
        z,
        true,
      );
    }
    this.sparks(e, n, roof - 0.8, 15 * scale);
    for (let i = 0; i < 24; i++)
      this.emit(
        e + (Math.random() - 0.5) * size.width,
        n + (Math.random() - 0.5) * size.width,
        roof + Math.random(),
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        1.5 + Math.random() * 3,
        2.8 + Math.random() * 1.8,
        0.5 * scale,
        4.8 * scale,
        i % 4 === 0 ? this.smokeGrey : this.smokeBlack,
        -0.6,
        z,
        true,
      );
  }

  /** A puff of smoke from a damaged engine: grey, or black from a wreck. */
  smoke(e: number, n: number, z: number, black: boolean): void {
    this.emit(
      e,
      n,
      z,
      (Math.random() - 0.5) * 0.6,
      (Math.random() - 0.5) * 0.6,
      1 + Math.random() * 0.6,
      2.4,
      0.4,
      2.2,
      black ? this.smokeBlack : this.smokeGrey,
      -0.3,
      z - 2,
      true,
    );
  }

  /** One flame licking up from a burning wreck, within `spread` m of (e, n). */
  flame(e: number, n: number, z: number, spread: number): void {
    this.emit(
      e + (Math.random() - 0.5) * spread,
      n + (Math.random() - 0.5) * spread,
      z,
      Math.random() - 0.5,
      Math.random() - 0.5,
      2 + Math.random() * 2,
      0.5,
      0.95,
      0.15,
      this.fire[Math.floor(Math.random() * 3)],
      -1,
      z - 1,
      true,
      true,
    );
  }

  /** Bubbles breaking on the water over something going under, within `spread` m of (e, n). */
  bubbles(e: number, n: number, spread: number): void {
    this.emit(
      e + (Math.random() - 0.5) * spread,
      n + (Math.random() - 0.5) * spread,
      FOAM_Z,
      0,
      0,
      0.15 + Math.random() * 0.2,
      0.4 + Math.random() * 0.4,
      0.12,
      0.3,
      this.foam[Math.floor(Math.random() * 3)],
      0,
      FOAM_Z,
      true,
    );
  }

  /** A ripple ring on the water at (e, n) round a splash `size` m across: an event, so it shows under reduced motion too. */
  ripple(e: number, n: number, size: number): void {
    const k = this.nextRing;
    this.nextRing = (k + 1) % RINGS;
    for (let v = 0; v < 4; v++)
      this.ringData.set([e, n, this.clock, Math.max(0.5, size)], (k * 4 + v) * 4);
    this.rings.attributes.ring.needsUpdate = true;
  }

  /** Something going into the water: a ring of foam `size` m across, a few drops and a ripple ring. */
  splash(e: number, n: number, size: number): void {
    this.ripple(e, n, size);
    const ring = Math.round(14 + size * 4);
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * 2 * Math.PI + Math.random() * 0.2;
      const r = size * 0.5;
      this.emit(
        e + Math.sin(a) * r,
        n + Math.cos(a) * r,
        FOAM_Z,
        Math.sin(a) * 1.2,
        Math.cos(a) * 1.2,
        0,
        0.9 + Math.random() * 0.4,
        0.35,
        0.6,
        this.foam[i % 3],
        0,
        FOAM_Z,
        true,
      );
    }
    for (let i = 0; i < 10; i++)
      this.emit(
        e + (Math.random() - 0.5) * size,
        n + (Math.random() - 0.5) * size,
        FOAM_Z,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        2 + Math.random() * 3,
        0.7,
        0.15,
        0.1,
        this.drop,
        12,
        FOAM_Z,
        false,
      );
  }

  /** Foam left behind a boat's stern (at e, n, heading `yaw`), spreading either side of a hull `width` m wide. */
  wake(e: number, n: number, yaw: number, width: number): void {
    const re = Math.cos(yaw);
    const rn = -Math.sin(yaw);
    for (const side of [-1, 1]) {
      const off = (width / 2) * side * (0.6 + Math.random() * 0.4);
      this.emit(
        e + re * off,
        n + rn * off,
        FOAM_Z,
        re * side * 0.6,
        rn * side * 0.6,
        0,
        1.4 + Math.random() * 0.6,
        0.4,
        1.1,
        this.foam[Math.floor(Math.random() * 3)],
        0,
        FOAM_Z,
        true,
      );
    }
  }

  /**
   * What a vehicle gives off over `h` seconds: smoke from a damaged engine (from 55%, black from
   * a wreck), flames while a wreck burns, bubbles over what sinks, foam behind a boat under way.
   */
  from(v: Vehicle, h: number): void {
    if (v.state === "sunk" || !(h > 0)) return;
    const s = sizeFor(v);
    const sy = Math.sin(v.yaw);
    const cy = Math.cos(v.yaw);
    if (v.state === "sinking") {
      if (Math.random() < h * 20) this.bubbles(v.e, v.n, s.width);
      return;
    }
    if (!v.boat && v.damage >= 0.55) {
      const [fe, fn, z] = this.engine(v);
      if (v.fuse !== null || v.fire > 0)
        for (let k = 0; k < 3; k++) if (Math.random() < h * 30) this.flame(fe, fn, z, s.width);
      const wrecked = v.state === "wrecked";
      if (Math.random() < (wrecked ? 10 : (v.damage - 0.5) * 14) * h)
        this.smoke(fe, fn, z, wrecked);
    }
    if (v.boat && Math.abs(v.v) > 2 && Math.random() < h * Math.abs(v.v) * 1.5)
      this.wake(v.e - sy * (s.length / 2), v.n - cy * (s.length / 2), v.yaw, s.width);
  }

  /** Moves them all on by dt seconds and hands the survivors to the points. */
  step(dt: number): void {
    const h = Math.max(0, dt);
    this.clock += h;
    this.ringMat.uniforms.now.value = this.clock;
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const q = this.bits[i];
      q.life -= h;
      if (q.life <= 0) {
        this.bits[i] = this.bits[this.bits.length - 1];
        this.bits.pop();
        continue;
      }
      q.vz -= q.grav * h;
      q.e += q.ve * h;
      q.n += q.vn * h;
      q.z += q.vz * h;
      if (q.z < q.floor) {
        q.z = q.floor;
        q.vz *= -0.3;
        q.ve *= 0.6;
        q.vn *= 0.6;
      }
      if (q.grav < 0) {
        q.ve *= 1 - h;
        q.vn *= 1 - h;
      }
    }
    let k = 0;
    for (const q of this.bits) {
      const age = 1 - q.life / q.max;
      this.pos[k * 3] = q.e;
      this.pos[k * 3 + 1] = q.z;
      this.pos[k * 3 + 2] = -q.n;
      this.col.set(q.colour, k * 3);
      this.size[k] = q.s0 + (q.s1 - q.s0) * age;
      this.alpha[k] = q.fades ? Math.min(1, (1 - age) * 1.6) : 1;
      this.tongues[k] = q.flame ? 1 : 0;
      k++;
    }
    this.geo.setDrawRange(0, k);
    for (const a of Object.values(this.geo.attributes)) a.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points, this.ringMesh);
    this.geo.dispose();
    this.mat.dispose();
    this.rings.dispose();
    this.ringMat.dispose();
    this.bits.length = 0;
  }
}
