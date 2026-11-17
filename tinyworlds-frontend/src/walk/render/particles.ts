import * as THREE from "three";
import { FOG_FAR, FOG_NEAR, HORIZON } from "./materials";
import { HALF, HIGH, LIT, SHADE, type Palette } from "./palette";

/**
 * Sparks, glass, smoke, fire, bubbles, foam and wakes: round points in the palette's colours
 * that fade by dithering (a 4 × 4 Bayer pattern drops more of their pixels as they go), never by
 * blending, after the spike's `cars.js`. World metres east, north and up, as everywhere.
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
const WATER_Z = -0.6;
const FOAM_Z = WATER_Z + 0.03;

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
}

const VERTEX = /* glsl */ `
attribute float size; attribute float alpha; attribute vec3 colour;
uniform float pscale;
varying vec3 vColour; varying float vAlpha; varying vec3 vMV;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vMV = mv.xyz; vColour = colour; vAlpha = alpha;
  gl_PointSize = max(1.0, size * pscale / -mv.z);
  gl_Position = projectionMatrix * mv;
}`;

const FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 fogColor; uniform float fogNear, fogFar;
varying vec3 vColour; varying float vAlpha; varying vec3 vMV;
const float B[16] = float[16](0., 8., 2., 10., 12., 4., 14., 6., 3., 11., 1., 9., 15., 7., 13., 5.);
void main() {
  if (length(gl_PointCoord - 0.5) > 0.5) discard;
  ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
  if (vAlpha < (B[q.x + q.y * 4] + 0.5) / 16.0) discard;
  gl_FragColor = vec4(mix(vColour, fogColor, smoothstep(fogNear, fogFar, length(vMV))), 1.0);
}`;

export class WalkParticles {
  private readonly bits: Bit[] = [];
  private readonly pos = new Float32Array(MAX * 3);
  private readonly col = new Float32Array(MAX * 3);
  private readonly size = new Float32Array(MAX);
  private readonly alpha = new Float32Array(MAX);
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

  constructor(
    private readonly scene: THREE.Scene,
    palette: Palette,
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
    this.geo.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        pscale: { value: 300 },
        fogColor: { value: HORIZON },
        fogNear: { value: FOG_NEAR },
        fogFar: { value: FOG_FAR },
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 2;
    // a point's size in pixels: the drawing's height over the view's (at a metre away)
    const buffer = new THREE.Vector2();
    this.points.onBeforeRender = (renderer, _scene, camera) => {
      renderer.getDrawingBufferSize(buffer);
      const fov = (camera as THREE.PerspectiveCamera).fov ?? 70;
      this.mat.uniforms.pscale.value = buffer.y / (2 * Math.tan((fov * Math.PI) / 360));
    };
    scene.add(this.points);
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
  ) {
    if (this.bits.length >= MAX) this.bits.shift();
    this.bits.push({ e, n, z, ve, vn, vz, life, max: life, s0, s1, colour, grav, floor, fades });
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

  /** A car catching fire: a burst of flame and black smoke over a body `length` m long. */
  wreck(e: number, n: number, z: number, length: number): void {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * 2 * Math.PI;
      const s = 1 + Math.random() * 5;
      this.emit(
        e + (Math.random() - 0.5) * length * 0.6,
        n + (Math.random() - 0.5) * length * 0.6,
        z + 0.8 + Math.random(),
        Math.sin(a) * s,
        Math.cos(a) * s,
        2 + Math.random() * 5,
        0.5 + Math.random() * 0.6,
        0.9,
        0.2,
        this.fire[i % 3],
        2,
        z,
        false,
      );
    }
    for (let i = 0; i < 12; i++)
      this.emit(
        e,
        n,
        z + 1.2,
        (Math.random() - 0.5) * 3,
        (Math.random() - 0.5) * 3,
        1.5 + Math.random() * 2,
        2.5 + Math.random(),
        1.2,
        3.5,
        this.smokeBlack,
        -0.4,
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
      0.7,
      0.15,
      this.fire[Math.floor(Math.random() * 3)],
      -1,
      z - 1,
      false,
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

  /** Something going into the water: a ring of foam `size` m across and a few drops. */
  splash(e: number, n: number, size: number): void {
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

  /** Moves them all on by dt seconds and hands the survivors to the points. */
  step(dt: number): void {
    const h = Math.max(0, dt);
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
      k++;
    }
    this.geo.setDrawRange(0, k);
    for (const a of Object.values(this.geo.attributes)) a.needsUpdate = true;
  }

  dispose(): void {
    this.scene.remove(this.points);
    this.geo.dispose();
    this.mat.dispose();
    this.bits.length = 0;
  }
}
