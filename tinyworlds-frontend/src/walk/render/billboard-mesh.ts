import * as THREE from "three";
import { FRAME, HOUSING, SCHEMES, type Panel, type Tone } from "./billboards";
import { SHADES, type Palette } from "./palette";

/**
 * A square's billboards as one instanced mesh (one draw call): each screen a box, its face at
 * `GAP` off the wall showing its pixel art, its sides the dark housing (the shader is
 * `billboard-material.ts`). In metres from the square's south-west corner, like the square's
 * other meshes (x east, y up, z south).
 */

/** The box's corners per face: x along the screen (0 left, 1 right, seen from the front), y up, z out (1 the face). */
function boxGeometry(): THREE.InstancedBufferGeometry {
  const pos: number[] = [];
  const front: number[] = [];
  const index: number[] = [];
  const face = (corners: number[][], isFront: boolean) => {
    const v0 = pos.length / 3;
    for (const c of corners) pos.push(c[0], c[1], c[2]);
    for (let k = 0; k < 4; k++) front.push(isFront ? 1 : 0);
    index.push(v0, v0 + 1, v0 + 2, v0, v0 + 2, v0 + 3);
  };
  face(
    [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
    true,
  );
  face(
    [
      [0, 1, 0],
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
    ],
    false,
  );
  face(
    [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
    false,
  );
  face(
    [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    false,
  );
  face(
    [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
    false,
  );
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("front", new THREE.Float32BufferAttribute(front, 1));
  g.setIndex(index);
  return g;
}

/** The schemes, the frame and the housing as palette indices, made once per palette (null: a palette without them). */
const indexCache = new WeakMap<
  Palette,
  { schemes: number[][]; frame: number; housing: number } | null
>();
export function screenColours(
  palette: Palette,
): { schemes: number[][]; frame: number; housing: number } | null {
  let got = indexCache.get(palette);
  if (got === undefined) {
    const at = ([name, shade]: Tone) => palette.ramp(name) * SHADES + shade;
    try {
      got = {
        schemes: SCHEMES.map((s) => s.map(at)),
        frame: at(FRAME),
        housing: at(HOUSING),
      };
    } catch {
      // a world whose palette lacks the screens' ramps shows none
      got = null;
    }
    indexCache.set(palette, got);
  }
  return got;
}

/** One square's screens as a mesh in `material`, its origin at (oe, on) world metres; null for none. */
export function billboardMesh(
  panels: readonly Panel[],
  palette: Palette,
  material: THREE.Material,
  oe: number,
  on: number,
): THREE.Mesh | null {
  const colours = screenColours(palette);
  if (!colours || panels.length === 0) return null;
  const count = panels.length;
  const foot = new Float32Array(count * 4);
  const shape = new Float32Array(count * 4);
  const look = new Float32Array(count * 4);
  const cA = new Float32Array(count * 4);
  const cB = new Float32Array(count * 4);
  const box = new THREE.Box3();
  const corner = new THREE.Vector3();
  panels.forEach((p, k) => {
    // the bottom-left of its face as seen from the front: the wall's right is (−nn, ne)
    const le = p.e + p.nn * (p.w / 2);
    const ln = p.n - p.ne * (p.w / 2);
    foot.set([le - oe, p.z, -(ln - on), p.screen.seed], k * 4);
    shape.set([p.ne, p.nn, p.w, p.h], k * 4);
    look.set([p.screen.template, p.screen.picto, p.screen.variant, p.screen.phase], k * 4);
    cA.set(colours.schemes[p.screen.a], k * 4);
    cB.set(colours.schemes[p.screen.b], k * 4);
    for (const [s, up] of [
      [0, 0],
      [1, 1],
    ]) {
      const e = le - p.nn * p.w * s + p.ne;
      const n = ln + p.ne * p.w * s + p.nn;
      box.expandByPoint(corner.set(e - oe, p.z + p.h * up, -(n - on)));
    }
  });
  const geometry = boxGeometry();
  geometry.setAttribute("foot", new THREE.InstancedBufferAttribute(foot, 4));
  geometry.setAttribute("shape", new THREE.InstancedBufferAttribute(shape, 4));
  geometry.setAttribute("look", new THREE.InstancedBufferAttribute(look, 4));
  geometry.setAttribute("cA", new THREE.InstancedBufferAttribute(cA, 4));
  geometry.setAttribute("cB", new THREE.InstancedBufferAttribute(cB, 4));
  geometry.instanceCount = count;
  geometry.boundingBox = box;
  geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  return mesh;
}
