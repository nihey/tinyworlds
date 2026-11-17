import { clamp, smooth, wrap } from "./math";
import { EYE, SWIM_EYE, type Player } from "./player";
import { FOG_FAR } from "./render/materials";
import { EYES } from "./render/models";
import { sizeFor, sizeOf, type Vehicle } from "./vehicles";
import { wastedAt } from "./wasted";
import { WATER_Z, type WalkWorld } from "./world";

/**
 * Where the walk is seen from: your eyes on foot (a slight bob) or swimming (bobbing at the
 * surface), the chase camera behind what you drive or your eyes at its wheel, and the camera
 * lifting away from you lying in the street. Reduced motion: no bob, no shake, no widening view,
 * no lift.
 */

export interface Eye {
  e: number;
  n: number;
  z: number;
  /** radians from north, clockwise */
  yaw: number;
  /** radians, up positive */
  pitch: number;
  /** the vertical field of view, degrees */
  fov: number;
}

const FOV = 70;
/** The chase camera swings back behind this long after you last looked round, s. */
const LOOK_RETURN = 1.4;
const LOOK_PITCH = -0.1;
/** How fast the chase camera follows the heading, per second. */
const FOLLOW = 3.2;
/** Pointer movement to radians (looking round on foot, and at the wheel). */
export const MOUSE = 0.0021;
/** The boom from what you drive to the chase camera is looked along in this many steps, the last at the camera. */
const BOOM_STEPS = 7;
/** What counts as in view, either side of where the camera looks (generous: a wide screen, a wide view). */
const VIEW_HALF = 1.15;

export class Cameras {
  /** At the wheel: chasing behind, or your own eyes. */
  mode: "chase" | "wheel" = "chase";
  /** Where it looked from last. */
  eye: Eye;
  private camYaw = 0;
  private lookYaw = 0;
  private lookPitch = LOOK_PITCH;
  private lookIdle = LOOK_RETURN;
  private fov = FOV;
  private shake = 0;
  /** where you looked from as you went down, for the wasted camera to leave from */
  private downEye: Eye | null = null;

  constructor(
    start: { e: number; n: number; z: number; yaw: number },
    private readonly reduced: boolean,
  ) {
    this.eye = { e: start.e, n: start.n, z: start.z + EYE, yaw: start.yaw, pitch: 0, fov: FOV };
  }

  /** The pointer moved at the wheel: the camera looks round, and comes back behind a little later. */
  look(dx: number, dy: number): void {
    this.lookYaw = clamp(this.lookYaw + dx * MOUSE, -3, 3);
    this.lookPitch = clamp(this.lookPitch - dy * MOUSE, -0.7, 0.45);
    this.lookIdle = 0;
  }

  toggle(): void {
    this.mode = this.mode === "chase" ? "wheel" : "chase";
  }

  /** Getting in: behind it, looking ahead. */
  takeWheel(v: Vehicle): void {
    this.camYaw = v.yaw;
    this.lookYaw = 0;
    this.lookPitch = LOOK_PITCH;
    this.lookIdle = LOOK_RETURN;
  }

  /** Getting out: the view as on foot. */
  leaveWheel(): void {
    this.shake = 0;
    this.fov = FOV;
  }

  /** Out of a tunnel, facing out of it. */
  turnTo(yaw: number): void {
    this.camYaw = yaw;
  }

  /** A hit at the wheel shakes the camera (not under reduced motion). */
  bump(speed: number): void {
    if (!this.reduced) this.shake = Math.max(this.shake, Math.min(1.2, speed / 12));
  }

  /** Going down: where the camera leaves from. */
  down(): void {
    this.downEye = { ...this.eye };
  }

  /** The seconds go by: the look comes back, the shake dies. */
  tick(real: number): void {
    this.lookIdle += real;
    this.shake *= Math.exp(-6 * real);
  }

  /** Whether a point is about where the camera looks (or right beside it): nothing is brought in there. */
  readonly visible = (e: number, n: number): boolean => {
    const c = this.eye;
    const de = e - c.e;
    const dn = n - c.n;
    const d = Math.hypot(de, dn);
    if (d < 8) return true;
    if (d > FOG_FAR + 40) return false;
    return Math.abs(wrap(Math.atan2(de, dn) - c.yaw)) < VIEW_HALF;
  };

  /** Your eyes, on foot, swimming, or knocked down; `t` the clock, for the swimming bob. */
  onFoot(p: Player, t: number): Eye {
    let z = p.z + EYE;
    if (p.mode === "swim") z = WATER_Z + SWIM_EYE + (this.reduced ? 0 : Math.sin(t * 2.1) * 0.05);
    else if (p.mode === "down") z = p.z + 0.45;
    else if (!this.reduced && p.airFrom === null) z += Math.sin(p.bob) * 0.05;
    return (this.eye = { e: p.e, n: p.n, z, yaw: p.yaw, pitch: p.pitch, fov: FOV });
  }

  /** In the dark of a tunnel: waiting at the far end, so its squares come in. */
  waiting(e: number, n: number, yaw: number): Eye {
    return (this.eye = { e, n, z: EYE, yaw, pitch: 0, fov: FOV });
  }

  /** The chase camera behind what you drive (`behind`: looking back), or your eyes at its wheel. */
  driving(v: Vehicle, real: number, behind: boolean, world: WalkWorld): Eye {
    const s = sizeFor(v);
    if (this.lookIdle > LOOK_RETURN) {
      this.lookYaw *= Math.exp(-3 * real);
      this.lookPitch += (LOOK_PITCH - this.lookPitch) * Math.min(1, 3 * real);
    }
    this.camYaw += wrap(v.yaw - this.camYaw) * Math.min(1, real * FOLLOW);
    const speed = Math.abs(v.v);
    const fov = this.reduced ? FOV : FOV + clamp((speed - 12) * 0.45, 0, 18);
    this.fov += (fov - this.fov) * Math.min(1, real * 3);
    const back = behind ? Math.PI : 0;
    const jig = () => (this.shake > 0.01 ? (Math.random() - 0.5) * this.shake * 0.6 : 0);
    if (this.mode === "wheel") {
      // a boat of its own size (the long ferry) has its wheelhouse as far along and as high as
      // its model, stretched with its length
      const longer = s.length / sizeOf(v.kind).length;
      const eh = EYES[v.kind][0] * longer;
      const ef = EYES[v.kind][1] * longer;
      const side = v.boat || v.kind === "motorcycle" ? 0 : -0.36;
      const sy = Math.sin(v.yaw);
      const cy = Math.cos(v.yaw);
      return (this.eye = {
        e: v.e + sy * ef + cy * side + jig(),
        n: v.n + cy * ef - sy * side,
        z: v.z + v.heave + eh + jig() * 0.5,
        yaw: v.yaw + this.lookYaw + back,
        pitch: this.lookPitch + 0.1,
        fov: this.fov,
      });
    }
    const yaw = this.camYaw + this.lookYaw + back;
    const dist = 4.5 + s.length * 0.8 + clamp(speed * 0.05, 0, 2);
    const flat = Math.cos(this.lookPitch) * dist;
    let ce = v.e - Math.sin(yaw) * flat;
    let cn = v.n - Math.cos(yaw) * flat;
    const cz = v.z + Math.max(0.8, 1.2 + s.height * 0.7 - Math.sin(this.lookPitch) * dist * 0.6);
    // a wall in the way brings it closer; a tower's opening the roadway passes through is a wall
    // to the camera (inside it, it would see the tower from within: flat grey)
    for (let step = 1; step <= BOOM_STEPS; step++) {
      const k = step / BOOM_STEPS;
      const pe = v.e + (ce - v.e) * k;
      const pn = v.n + (cn - v.n) * k;
      if (!world.blocked(pe, pn, 0.3, cz - 0.4, 0.8, false)) continue;
      const f = Math.max(0.1, k - 0.2);
      ce = v.e + (ce - v.e) * f;
      cn = v.n + (cn - v.n) * f;
      break;
    }
    const te = v.e + Math.sin(yaw) * 4;
    const tn = v.n + Math.cos(yaw) * 4;
    const tz = v.z + 1 + s.height * 0.45;
    return (this.eye = {
      e: ce + jig(),
      n: cn,
      z: cz + jig(),
      yaw: Math.atan2(te - ce, tn - cn),
      pitch: Math.atan2(tz - cz, Math.hypot(te - ce, tn - cn)),
      fov: this.fov,
    });
  }

  /**
   * The camera lifting away from you lying in the street, `t` seconds into the wasted sequence,
   * turning slowly as it rises, from where you saw last over the first half second. Under reduced
   * motion it stays where it was.
   */
  wasted(body: { e: number; n: number; z: number; yaw: number }, t: number): Eye {
    if (this.reduced) return this.eye;
    const k = smooth(wastedAt(t, false).lift);
    const back = 2.5 + 6 * k;
    const yaw = body.yaw + 0.6 * k;
    const e = body.e - Math.sin(yaw) * back;
    const n = body.n - Math.cos(yaw) * back;
    const z = body.z + 1.6 + 12 * k;
    const lifted: Eye = {
      e,
      n,
      z,
      yaw: Math.atan2(body.e - e, body.n - n),
      pitch: -Math.atan2(z - (body.z + 0.3), back),
      fov: FOV,
    };
    const from = this.downEye;
    const m = from ? smooth(Math.min(1, t / 0.5)) : 1;
    if (!from || m >= 1) return (this.eye = lifted);
    return (this.eye = {
      e: from.e + (lifted.e - from.e) * m,
      n: from.n + (lifted.n - from.n) * m,
      z: from.z + (lifted.z - from.z) * m,
      yaw: from.yaw + wrap(lifted.yaw - from.yaw) * m,
      pitch: from.pitch + (lifted.pitch - from.pitch) * m,
      fov: from.fov + (lifted.fov - from.fov) * m,
    });
  }
}
