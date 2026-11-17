import * as THREE from "three";
import type { WalkIndex } from "../walk-index";
import { DEEP, HALF, HIGH, LIT, SHADE, SHADES, type Palette } from "./palette";

/**
 * The walk's shaders, ported from the spike (`walk.html`): every surface picks one palette
 * colour per pixel from the map's own rules (window patterns, ground textures), then the fog.
 * The palette goes out exactly as it is: no lighting, no tone mapping, a linear output.
 */

/** The fog: none nearer than this, nothing but fog beyond that, metres. */
export const FOG_NEAR = 140;
export const FOG_FAR = 560;

/** Bytes as they go out (the output is linear: what is set is what is shown). */
const out = (r: number, g: number, b: number) =>
  new THREE.Color().setRGB(r / 255, g / 255, b / 255, THREE.LinearSRGBColorSpace);
/** The sky, and the haze at the horizon that the fog fades everything into. */
export const SKY = out(88, 144, 183);
export const HORIZON = out(170, 188, 194);

/** Kinds of tree crown in the atlas, by the map's temperate leaf ramps. */
export const TREE_RAMPS = ["leaf", "leafLight", "leafDark", "leafAutumn", "leafRed"] as const;
const TREE_W = 24;
const TREE_H = 40;

/** The pipeline's `mix` (scene/hash.ts), so a pattern comes out as the map's. */
const HASH = /* glsl */ `
uint mixh(uint a, uint b) {
  uint h = a ^ (b * 0x9e3779b1u);
  h = (h ^ (h >> 16)) * 0x85ebca6bu;
  h = (h ^ (h >> 13)) * 0xc2b2ae35u;
  return h ^ (h >> 16);
}
uint hash2(int x, int y) { return mixh(uint(x), uint(y) + 0x632be5abu); }
`;

const FOG = /* glsl */ `
uniform vec3 fogColor; uniform float fogNear, fogFar;
vec3 fogged(vec3 c, float d) { return mix(c, fogColor, smoothstep(fogNear, fogFar, d)); }
`;

const PALETTE = /* glsl */ `
uniform sampler2D pal;
vec3 C(float i) { return texelFetch(pal, ivec2(int(i), 0), 0).rgb; }
vec3 P(int ramp, int shade) { return texelFetch(pal, ivec2(ramp * ${SHADES} + clamp(shade, 0, 5), 0), 0).rgb; }
`;

/**
 * Walls: the map's window patterns (`render/chunk.ts`), one texel per map pixel (1/kz m), the
 * tone from the sun. `uvm` is metres along and up the wall; `look` its wall and glass ramps,
 * pattern and the low half of its seed; `dims` its length and height (m), tone and the seed's
 * high half.
 */
const WALL_VERTEX = /* glsl */ `
attribute vec2 uvm; attribute vec4 look; attribute vec4 dims;
varying vec2 vUV; flat varying vec4 vLook; flat varying vec4 vDims; varying vec3 vMV;
void main() {
  vUV = uvm; vLook = look; vDims = dims;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const WALL_FRAGMENT = /* glsl */ `
precision highp float; precision highp int;
uniform float kz; uniform int doorRamp;
${HASH} ${FOG} ${PALETTE}
varying vec2 vUV; flat varying vec4 vLook; flat varying vec4 vDims; varying vec3 vMV;
void main() {
  int wall = int(vLook.x), glass = int(vLook.y), pattern = int(vLook.z), tone = int(vDims.z);
  uint seed = uint(vLook.w) | (uint(vDims.w) << 16);
  int lenPx = max(1, int(round(vDims.x * kz)));
  int wallH = max(1, int(round(vDims.y * kz)));
  int c = clamp(int(floor(vUV.x * kz)), 0, lenPx - 1);
  int vv = clamp(int(floor(vUV.y * kz)), 0, wallH - 1);
  vec3 wallC = P(wall, tone), wallHi = P(wall, tone + 1), wallLo = P(wall, tone - 1);
  vec3 winC = P(glass, tone == ${LIT} ? ${SHADE} : ${DEEP}), winHi = P(glass, tone == ${LIT} ? ${LIT} : ${SHADE});
  int F = pattern == 3 ? 6 : 8;
  float bayM = pattern == 3 ? 2.0 : pattern == 4 ? 6.0 : pattern == 6 ? 4.0 : pattern == 5 ? 3.6 : 3.0;
  int B = int(round(bayM * kz));
  if (B < 4) B = 0; else if (B > 14) B = 14;
  int bays = B > 0 ? (lenPx - 1) / B : 0;
  int margin = B > 0 ? (lenPx - bays * B + 1) / 2 : 0;
  int u = c - margin;
  bool inBay = B > 0 && u >= 0 && u < bays * B;
  int bi = inBay ? u / B : -1;
  int ub = inBay ? u - bi * B : -1;
  bool tallEnough = wallH >= 3 * F;
  vec3 col = wallC;
  int vf = vv % F;
  if (vv == wallH - 1 && wallH >= 4) col = wallHi;
  else if (pattern == 1) {            // punched windows, shopfronts below
    if (vv == wallH - 2 && tallEnough) col = wallLo;
    else if (ub >= 0) {
      if (tallEnough && vv < F - 1) {
        if (vv == F - 2) col = wallLo; else if (ub > 0 && vv > 0) col = winC;
      } else if (vf >= 2 && vf < F - 2 && ub >= 2 && ub < B - 1)
        col = (vf == F - 3 && (mixh(seed + uint(bi), uint(vv / F)) & 7u) == 0u) ? winHi : winC;
    }
  } else if (pattern == 2) {          // ribbon windows
    if (vv == wallH - 2 && tallEnough) col = wallLo;
    else if (vf >= 3 && vf < F - 1 && !(ub == 0 && bi % 3 == 0) && bi >= 0) col = winC;
  } else if (pattern == 3) {          // curtain wall
    if (ub < 0 || vf == 0 || ub == 0) col = wallLo;
    else {
      int fi = vv / F;
      uint pane = mixh(seed ^ uint(bi * 131), uint(fi)) & 15u;
      if ((bi + fi * 2 + int(seed & 63u)) % 19 < 4 || pane == 0u) col = wallHi;
      else if (pane == 1u) col = wallLo;
    }
  } else if (pattern == 4) {          // sparse openings
    if (ub >= 2 && ub < B - 2 && vf >= 3 && vf < F - 1 && (mixh(seed + uint(bi * 7), uint(vv / F)) & 3u) == 0u) col = winC;
  } else if (pattern == 5) {          // a house: windows and its door
    if (bi == 0 && vv < 5 && ub >= 2 && ub < 4) col = P(doorRamp, tone - 1);
    else if (ub >= 2 && ub < B - 2 && vf >= 3 && vf < F - 1 && !(bi == 0 && vv < F)) col = winC;
  } else if (pattern == 6) {          // tall windows between piers
    if (ub >= 2 && ub < B - 2 && vv >= 3 && vv < wallH - 4) col = (vv & 7) == 7 ? wallLo : winC;
  }
  // far away a texel is smaller than a pixel: settle on the wall's average instead of shimmering
  float fw = max(fwidth(vUV.x * kz), fwidth(vUV.y * kz));
  vec3 average = pattern == 0 ? wallC : mix(wallC, winC, 0.28);
  col = mix(col, average, smoothstep(0.55, 1.4, fw));
  gl_FragColor = vec4(fogged(col, length(vMV)), 1.0);
}`;

/**
 * Ground, roofs, ways and decks: a colour, an alternate scattered by texel, and a pattern
 * (0 speckle, 1 paving grid, 2 mown stripes, 3 a street: speckle and a dashed line down the
 * middle of one over 9 m), the texels on the street grid. `paint` is [colour, alternate, how
 * often, pattern] as palette indices; `lane` is [across −1…1, width], `along` metres.
 * With GROUND, a square's ground: nothing outside the square, nothing where its mask is water.
 */
const FLAT_VERTEX = /* glsl */ `
attribute vec4 paint; attribute vec2 lane; attribute float along;
varying vec3 vW; varying vec2 vLocal; flat varying vec4 vPaint; varying vec2 vLane; varying vec3 vMV; varying float vAlong;
void main() {
  vPaint = paint; vLane = lane; vAlong = along;
  vLocal = vec2(position.x, -position.z);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const FLAT_FRAGMENT = /* glsl */ `
precision highp float; precision highp int;
uniform float kz; uniform vec2 gridRot; uniform float laneColour;
#ifdef GROUND
uniform sampler2D mask; uniform float masked; uniform float side;
#endif
${HASH} ${FOG} ${PALETTE}
varying vec3 vW; varying vec2 vLocal; flat varying vec4 vPaint; varying vec2 vLane; varying vec3 vMV; varying float vAlong;
void main() {
#ifdef GROUND
  if (vLocal.x < 0.0 || vLocal.y < 0.0 || vLocal.x >= side || vLocal.y >= side) discard;
  if (masked > 0.5 && texture2D(mask, vLocal / side).r > 0.5) discard;
#endif
  // texels on the street grid (east = x, north = -z)
  vec2 en = vec2(vW.x, -vW.z);
  vec2 g = vec2(en.x * gridRot.x - en.y * gridRot.y, en.x * gridRot.y + en.y * gridRot.x) * kz;
  ivec2 t = ivec2(floor(g));
  float r = float(hash2(t.x, t.y) & 1023u) / 1024.0;
  int pat = int(vPaint.w);
  vec3 col = C(vPaint.x);
  if (pat == 0) { if (r < vPaint.z) col = C(vPaint.y); }
  else if (pat == 1) { if ((t.x & 7) == 0 || (t.y & 7) == 0) col = C(vPaint.y); }
  else if (pat == 2) { if (((t.x >> 3) & 1) == 0) col = C(vPaint.y); }
  else if (pat == 3) {
    if (r < vPaint.z) col = C(vPaint.y);
    float w = vLane.y;
    if (w > 9.0 && abs(vLane.x) * w * 0.5 < 0.12 && fract(vAlong / 6.0) < 0.5) col = C(laneColour);
  }
  gl_FragColor = vec4(fogged(col, length(vMV)), 1.0);
}`;

/**
 * Trees: an upright pixel crown that always faces you. `corner` is the quad's corner (x across
 * −0.5…0.5, y up 0…1); per tree `offset` (its foot) and `look` (height in metres, crown kind).
 * The atlas holds the kinds side by side, its first row the trunk's foot.
 */
const TREE_VERTEX = /* glsl */ `
attribute vec2 corner; attribute vec3 offset; attribute vec2 look;
uniform vec3 camRight; uniform float treeKinds;
varying vec2 vUv; varying vec3 vMV;
void main() {
  vUv = vec2((look.y + corner.x + 0.5) / treeKinds, corner.y);
  vec3 p = offset + camRight * corner.x * look.x * 0.62 + vec3(0.0, corner.y * look.x, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const TREE_FRAGMENT = /* glsl */ `
precision highp float;
uniform sampler2D map; ${FOG}
varying vec2 vUv; varying vec3 vMV;
void main() {
  vec4 c = texture2D(map, vUv);
  if (c.a < 0.5) discard;
  gl_FragColor = vec4(fogged(c.rgb, length(vMV)), 1.0);
}`;

/** Cables and truss members: thin lines, `colour` a palette index. */
const LINE_VERTEX = /* glsl */ `
attribute float colour;
flat varying float vColour; varying vec3 vMV;
void main() {
  vColour = colour;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const LINE_FRAGMENT = /* glsl */ `
precision highp float;
${FOG} ${PALETTE}
flat varying float vColour; varying vec3 vMV;
void main() { gl_FragColor = vec4(fogged(C(vColour), length(vMV)), 1.0); }`;

/**
 * Water: an opaque plane under the land, in the map's water colours, the open water's short
 * bright and dark dashes (`render/ground.ts`) changing block by block. (A plain stand-in: the
 * layered water replaces it.)
 */
const WATER_VERTEX = /* glsl */ `
varying vec3 vW; varying vec3 vMV;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const WATER_FRAGMENT = /* glsl */ `
precision highp float; precision highp int;
uniform float kz; uniform vec2 gridRot; uniform float time; uniform int waterRamp;
${HASH} ${FOG} ${PALETTE}
varying vec3 vW; varying vec3 vMV;
void main() {
  vec2 en = vec2(vW.x, -vW.z);
  vec2 g = vec2(en.x * gridRot.x - en.y * gridRot.y, en.x * gridRot.y + en.y * gridRot.x) * kz;
  ivec2 t = ivec2(floor(g));
  int bx = t.x >> 3, by = t.y >> 2;
  // each block of dashes changes at its own moment, so the water shimmers rather than blinks
  int tick = int(floor(time * 0.9 + float(hash2(bx, by) & 255u) / 256.0));
  uint r = hash2(bx + tick * 977, by);
  vec3 col = P(waterRamp, ${LIT});
  if ((t.y & 3) == int(r & 3u)) {
    int start = int((r >> 2) & 3u), xi = t.x & 7;
    if (xi >= start && xi < start + 3) {
      uint roll = (r >> 5) & 15u;
      if (roll < 3u) col = P(waterRamp, ${HIGH});
      else if (roll == 3u) col = P(waterRamp, ${HALF});
    }
  }
  gl_FragColor = vec4(fogged(col, length(vMV)), 1.0);
}`;

/**
 * The edge of the data: a wall that shows what the far fog shows, the haze below the horizon
 * and the sky above it, so the city ends in fog.
 */
const EDGE_VERTEX = /* glsl */ `
varying vec3 vW;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EDGE_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 fogColor; uniform vec3 skyColor;
varying vec3 vW;
void main() { gl_FragColor = vec4(vW.y < cameraPosition.y ? fogColor : skyColor, 1.0); }`;

export interface WalkMaterials {
  /** Walls of buildings, deck slabs, parapets, columns and the shore's edge. */
  wall: THREE.ShaderMaterial;
  /** Roofs, a slab's underside, a parapet's top. */
  roof: THREE.ShaderMaterial;
  /** The roadway on a deck: drawn forward in depth, so it shows over the ground where a ramp comes down. */
  deck: THREE.ShaderMaterial;
  tree: THREE.ShaderMaterial;
  cable: THREE.ShaderMaterial;
  water: THREE.ShaderMaterial;
  edge: THREE.ShaderMaterial;
  /**
   * A square's own ground materials: its colours (no depth, painted in rank order), then its
   * depth (no colour), both cut out where `mask` (a 100 × 100 water mask, null for all land)
   * is water. Dispose of both with the square; the mask is the caller's.
   */
  ground(mask: THREE.Texture | null): { colour: THREE.ShaderMaterial; depth: THREE.ShaderMaterial };
  /** Once a frame: the clock (seconds) and the camera, for the water and the trees. */
  frame(time: number, camera: THREE.Camera): void;
  dispose(): void;
}

/** One crown of the atlas, in canvas order (row 0 the top), as palette indices (−1 empty). */
function crown(seed: number, leaf: number, trunk: number): Int16Array {
  const px = new Int16Array(TREE_W * TREE_H).fill(-1);
  const at = (ramp: number, shade: number) => ramp * SHADES + shade;
  for (let y = 26; y < TREE_H; y++)
    for (let x = 11; x < 13; x++) px[y * TREE_W + x] = at(trunk, x === 11 ? HALF : SHADE);
  let s = seed;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 30; y++)
    for (let x = 0; x < TREE_W; x++) {
      const dx = (x - 11.5) / 11.5;
      const dy = (y - 14) / 14;
      if (dx * dx + dy * dy > 1 - rnd() * 0.18) continue;
      const lightSide = dx * 0.8 - dy * 0.6;
      const shade =
        lightSide + rnd() * 0.5 > 0.55
          ? HIGH
          : lightSide + rnd() * 0.5 > 0.05
            ? LIT
            : lightSide + rnd() * 0.4 > -0.45
              ? HALF
              : SHADE;
      px[y * TREE_W + x] = at(leaf, shade);
    }
  return px;
}

/** The crowns side by side, the first row of the texture the trunks' feet (so they stand up). */
function treeAtlas(palette: Palette): THREE.DataTexture {
  const kinds = TREE_RAMPS.length;
  const W = TREE_W * kinds;
  const data = new Uint8Array(W * TREE_H * 4);
  const trunk = palette.ramp("trunk");
  TREE_RAMPS.forEach((name, k) => {
    const px = crown(7 + k * 4, palette.ramp(name), trunk);
    for (let y = 0; y < TREE_H; y++)
      for (let x = 0; x < TREE_W; x++) {
        const c = px[y * TREE_W + x];
        if (c < 0) continue;
        const o = ((TREE_H - 1 - y) * W + k * TREE_W + x) * 4;
        const [r, g, b] = palette.rgb(Math.floor(c / SHADES), c % SHADES);
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 255;
      }
  });
  const t = new THREE.DataTexture(data, W, TREE_H, THREE.RGBAFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

export function makeMaterials(palette: Palette, ix: WalkIndex): WalkMaterials {
  const grid = (ix.gridDeg * Math.PI) / 180;
  const shared = {
    pal: { value: palette.texture },
    kz: { value: ix.geo.kz },
    gridRot: { value: new THREE.Vector2(Math.cos(grid), Math.sin(grid)) },
    fogColor: { value: HORIZON },
    fogNear: { value: FOG_NEAR },
    fogFar: { value: FOG_FAR },
    time: { value: 0 },
    laneColour: { value: palette.ramp("markingWhite") * SHADES + LIT },
  };

  const wall = new THREE.ShaderMaterial({
    uniforms: { ...shared, doorRamp: { value: palette.ramp("brownstone") } },
    vertexShader: WALL_VERTEX,
    fragmentShader: WALL_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: FLAT_VERTEX,
    fragmentShader: FLAT_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const deck = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: FLAT_VERTEX,
    fragmentShader: FLAT_FRAGMENT,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
  });
  const atlas = treeAtlas(palette);
  const camRight = new THREE.Vector3(1, 0, 0);
  const tree = new THREE.ShaderMaterial({
    uniforms: {
      ...shared,
      map: { value: atlas },
      camRight: { value: camRight },
      treeKinds: { value: TREE_RAMPS.length },
    },
    vertexShader: TREE_VERTEX,
    fragmentShader: TREE_FRAGMENT,
  });
  const cable = new THREE.ShaderMaterial({
    uniforms: shared,
    vertexShader: LINE_VERTEX,
    fragmentShader: LINE_FRAGMENT,
  });
  const water = new THREE.ShaderMaterial({
    uniforms: { ...shared, waterRamp: { value: palette.ramp("water") } },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
  });
  const edge = new THREE.ShaderMaterial({
    uniforms: { fogColor: shared.fogColor, skyColor: { value: SKY } },
    vertexShader: EDGE_VERTEX,
    fragmentShader: EDGE_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const land = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat);
  land.needsUpdate = true;

  return {
    wall,
    roof,
    deck,
    tree,
    cable,
    water,
    edge,
    ground(mask) {
      const uniforms = {
        ...shared,
        mask: { value: mask ?? land },
        masked: { value: mask ? 1 : 0 },
        side: { value: ix.cell },
      };
      const colour = new THREE.ShaderMaterial({
        uniforms,
        defines: { GROUND: 1 },
        vertexShader: FLAT_VERTEX,
        fragmentShader: FLAT_FRAGMENT,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const depth = new THREE.ShaderMaterial({
        uniforms,
        defines: { GROUND: 1 },
        vertexShader: FLAT_VERTEX,
        fragmentShader: FLAT_FRAGMENT,
        side: THREE.DoubleSide,
        colorWrite: false,
      });
      return { colour, depth };
    },
    frame(time, camera) {
      shared.time.value = time;
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
      if (camRight.lengthSq() < 1e-8) camRight.set(1, 0, 0);
      camRight.normalize();
    },
    dispose() {
      for (const m of [wall, roof, deck, tree, cable, water, edge]) m.dispose();
      atlas.dispose();
      land.dispose();
    },
  };
}
