import * as THREE from "three";
import type { WalkIndex } from "../walk-index";
import { WATER_Z } from "../world";
import {
  DAMP_STEPS,
  darkCutOf,
  DEEP_STEPS,
  GLINT_CELL,
  GLINT_FOR,
  GLINT_GRAZE,
  GLINT_REACH,
  GLINT_SHARE,
  GRAZE_ONE,
  GRAZE_TWO,
  LAP_CYCLES,
  LAP_DASH,
  LAP_FAR,
  LAP_NEAR,
  LAP_PERIOD,
  LAP_TRAVEL,
  FOOT_HEIGHT,
  LIGHT_CUT,
  LOOP,
  MIRROR_FOG_SHADES,
  QUIET_FAR,
  RIM_STEPS,
  SHADE_LIGHT,
  SHALLOW_STEPS,
  WOBBLE_CYCLES,
  WOBBLE_ONE,
  WOBBLE_STILL,
  WOBBLE_WAVE,
} from "../water";
import { DEEP, HALF, HIGH, LIT, OUTLINE, SHADE, SHADES, type Palette } from "./palette";

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

/**
 * The layer of what is not mirrored in the water: the sky, the water itself, the ground (the
 * shore's faces stand in for it), the edge of the data and the fog. The view's camera sees it,
 * the mirror's does not.
 */
export const NOT_MIRRORED = 1;

/** A number as GLSL writes a float. */
const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Kinds of tree crown in the atlas, by the map's temperate leaf ramps. */
export const TREE_RAMPS = ["leaf", "leafLight", "leafDark", "leafAutumn", "leafRed"] as const;
const TREE_W = 24;
const TREE_H = 40;

/** The pipeline's `mix` (scene/hash.ts), so a pattern comes out as the map's. */
export const HASH = /* glsl */ `
uint mixh(uint a, uint b) {
  uint h = a ^ (b * 0x9e3779b1u);
  h = (h ^ (h >> 16)) * 0x85ebca6bu;
  h = (h ^ (h >> 13)) * 0xc2b2ae35u;
  return h ^ (h >> 16);
}
uint hash2(int x, int y) { return mixh(uint(x), uint(y) + 0x632be5abu); }
`;

/** The greys the colours drain to when you go down: every shade of the palette's grey stones. */
export const GREY_RAMPS = ["greyStone", "darkStone", "concrete"] as const;
const GREYS = GREY_RAMPS.length * SHADES;

/** Those greys as colours, for a `greys` uniform. */
export function greysOf(palette: Palette): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const name of GREY_RAMPS)
    for (let shade = 0; shade < SHADES; shade++) {
      const [r, g, b] = palette.rgb(palette.ramp(name), shade);
      out.push(new THREE.Vector3(r / 255, g / 255, b / 255));
    }
  return out;
}

/**
 * Draining the colours (the wasted sequence): with `grey` from 0 to 1, that share of the pixels,
 * picked by a 4 × 4 Bayer pattern, take the palette grey nearest their brightness instead. A
 * pixel is a palette colour or a grey, never a mix of the two.
 */
const DRAIN = /* glsl */ `
uniform float grey; uniform vec3 greys[${GREYS}];
vec3 drained(vec3 c) {
  if (grey <= 0.0) return c;
  ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  if (grey < (float(b[q.x + q.y * 4]) + 0.5) / 16.0) return c;
  const vec3 Y = vec3(0.299, 0.587, 0.114);
  float l = dot(c, Y);
  vec3 best = greys[0];
  float d = 9.0;
  for (int i = 0; i < ${GREYS}; i++) {
    float e = abs(dot(greys[i], Y) - l);
    if (e < d) { d = e; best = greys[i]; }
  }
  return best;
}
`;

/**
 * The fog, the last thing every colour the walk draws goes through, then the drain: `fogged(c, d)`
 * at `d` metres from the eye. Its uniforms: fogColor, fogNear, fogFar, grey, greys.
 */
export const FOG = /* glsl */ `
uniform vec3 fogColor; uniform float fogNear, fogFar;
${DRAIN}
vec3 fogged(vec3 c, float d) { return drained(mix(c, fogColor, smoothstep(fogNear, fogFar, d))); }
`;

const PALETTE = /* glsl */ `
uniform sampler2D pal;
vec3 C(float i) { return texelFetch(pal, ivec2(int(i), 0), 0).rgb; }
vec3 P(int ramp, int shade) { return texelFetch(pal, ivec2(ramp * ${SHADES} + clamp(shade, 0, 5), 0), 0).rgb; }
`;

/**
 * The map's texels: (east, north) metres to the street grid's texel coordinates (`gridRot` its
 * cosine and sine, `kz` texels a metre) and back, so the water's and the damp ground's shapes
 * step in the same texels as the ground's patterns.
 */
const GRID = /* glsl */ `
vec2 toGrid(vec2 en) { return vec2(en.x * gridRot.x - en.y * gridRot.y, en.x * gridRot.y + en.y * gridRot.x) * kz; }
vec2 fromGrid(vec2 g) { g /= kz; return vec2(g.x * gridRot.x + g.y * gridRot.y, -g.x * gridRot.y + g.y * gridRot.x); }
`;

/** A wall's pattern for the shore's own face: blank, and marked so in the mirror (it is not something standing in the water). */
export const SHORE_FACE = 7;

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
  vec3 average = pattern == 0 || pattern == ${SHORE_FACE} ? wallC : mix(wallC, winC, 0.28);
  col = mix(col, average, smoothstep(0.55, 1.4, fw));
  // the shore's own face says so in the alpha, which only the water's mirror keeps
  gl_FragColor = vec4(fogged(col, length(vMV)), pattern == ${SHORE_FACE} ? 0.5 : 1.0);
}`;

/**
 * Ground, roofs, ways and decks: a colour, an alternate scattered by texel, and a pattern
 * (0 speckle, 1 paving grid, 2 mown stripes, 3 a street: speckle and a dashed line down the
 * middle of one over 9 m), the texels on the street grid. `paint` is [colour, alternate, how
 * often, pattern] as palette indices; `lane` is [across −1…1, width], `along` metres.
 * With GROUND, a square's ground: nothing outside the square, nothing where its mask is water,
 * and one shade darker within 2 m of the water (damp), but not on a pier's deck.
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
uniform sampler2D mask; uniform float masked; uniform float side; uniform sampler2D shore; uniform int pierRamp;
#endif
${HASH} ${FOG} ${PALETTE} ${GRID}
varying vec3 vW; varying vec2 vLocal; flat varying vec4 vPaint; varying vec2 vLane; varying vec3 vMV; varying float vAlong;
void main() {
#ifdef GROUND
  if (vLocal.x < 0.0 || vLocal.y < 0.0 || vLocal.x >= side || vLocal.y >= side) discard;
  if (masked > 0.5 && texture2D(mask, vLocal / side).r > 0.5) discard;
#endif
  // texels on the street grid (east = x, north = -z)
  vec2 en = vec2(vW.x, -vW.z);
  vec2 g = toGrid(en);
  ivec2 t = ivec2(floor(g));
  float r = float(hash2(t.x, t.y) & 1023u) / 1024.0;
  int pat = int(vPaint.w);
  float idx = vPaint.x;
  if (pat == 0) { if (r < vPaint.z) idx = vPaint.y; }
  else if (pat == 1) { if ((t.x & 7) == 0 || (t.y & 7) == 0) idx = vPaint.y; }
  else if (pat == 2) { if (((t.x >> 3) & 1) == 0) idx = vPaint.y; }
  else if (pat == 3) {
    if (r < vPaint.z) idx = vPaint.y;
    float w = vLane.y;
    if (w > 9.0 && abs(vLane.x) * w * 0.5 < 0.12 && fract(vAlong / 6.0) < 0.5) idx = laneColour;
  }
#ifdef GROUND
  // damp: the land's distance to the water, at the middle of this texel
  if (masked > 0.5) {
    int c = int(idx + 0.5);
    vec2 uv = (vLocal + fromGrid(vec2(t) + 0.5) - en) / side;
    if (texture2D(shore, uv).a * ${f(255 / 64)} < ${f(DAMP_STEPS)} && c / ${SHADES} != pierRamp && c % ${SHADES} > 0)
      idx = float(c - 1);
  }
#endif
  gl_FragColor = vec4(fogged(C(idx), length(vMV)), 1.0);
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
 * Water: an opaque surface 0.6 m under the land, in layers that each pick one palette tone per
 * pixel, never a blend (`../water.ts` has the rules and their numbers):
 * 1. depth: the square's shore field (`shore.ts`) at the middle of the pixel's map texel: the
 *    shallow teal band at the shore, a light rim, the base, the deep shade;
 * 2. sky: a shade or two lighter where it is seen at a grazing angle;
 * 3. reflections: the mirror's picture of what stands by the water (`WalkView`), read at the
 *    pixel's place flipped, in three flat tones (the darker of it and the water wins), its rows
 *    moved sideways by whole pixels by how far under their foot they are, a shade lighter at a
 *    time with the fog along the mirrored path;
 * 4. the shore: where it is lit and near, light dashes lapping along it two or three cells out;
 *    where it is far or in shade (quiet), a dark line where the water meets it instead; a broken
 *    light line at the foot of what stands in the water (piers, piles, boats), never above it;
 * 5. glints: short dashes on the open water, new places every loop.
 * Every motion runs a whole number of times in `LOOP`; under reduced motion nothing moves (the
 * lapping stays on its near ring) and there are no glints. The open water under everything has
 * no shore (`known` 0): deep, then the sky and the reflections.
 */
const WATER_VERTEX = /* glsl */ `
varying vec3 vW; varying vec3 vMV; varying vec2 vLocal;
void main() {
  vLocal = vec2(position.x, -position.z);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vec4 mv = viewMatrix * w;
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

const WATER_FRAGMENT = /* glsl */ `
precision highp float; precision highp int;
uniform float kz; uniform vec2 gridRot; uniform float side;
uniform sampler2D shore; uniform sampler2D mask; uniform float known;
uniform float loopT; uniform float loopN; uniform float still;
uniform int waterRamp; uniform int shallowRamp; uniform int foamRamp;
uniform vec2 sun; uniform float waterY; uniform vec2 screen;
uniform float mirrorOn; uniform sampler2D mirrorColour; uniform sampler2D mirrorDepth;
uniform mat4 mirrorProjInv; uniform mat4 mirrorWorld; uniform float darkCut;
uniform mat4 projectionMatrix;
${HASH} ${FOG} ${PALETTE} ${GRID}
varying vec3 vW; varying vec3 vMV; varying vec2 vLocal;
const vec3 LUMA = vec3(0.299, 0.587, 0.114);
const float TAU = 6.28318530718;
// a tone: x the ramp (0 water, 1 shallow, 2 foam), y the shade

// steps from the land at a texel's middle (the field's R, in sixteenths)
float stepsAt(vec2 cell, vec2 base) {
  return texture(shore, (fromGrid(cell + 0.5) + base) / side).r * ${f(255 / 16)};
}
bool landAt(vec2 cell, vec2 base) {
  return texture(mask, (fromGrid(cell + 0.5) + base) / side).r < 0.5;
}
int wobble(float rows, float t, float y) {
  float amp = rows < ${f(WOBBLE_STILL)} ? 0.0 : rows < ${f(WOBBLE_ONE)} ? 1.0 : 2.0;
  float period = ${f(LOOP / WOBBLE_CYCLES)};
  float phase = mod(t, period) / period + y / ${f(WOBBLE_WAVE)};
  return int(floor(amp * sin(TAU * phase) + 0.5));
}
bool glint(float age, int dx) {
  if (!(age >= 0.0 && age < ${f(GLINT_FOR)})) return false;
  int frame = int(floor(age / ${f(GLINT_FOR / 4)}));
  int a = abs(dx);
  if (frame == 0) return a == 0;
  if (frame == 1) return a <= 1;
  if (frame == 2) return a <= 2;
  return a == 2 || a == 3;
}
// the mirror's picture at texel p: what it shows, metres along the mirrored path, how many rows
// (of the mirror's) this pixel is under that thing's foot on the water, and whether it is the
// waterline of something standing in the water
struct Mirrored { bool hit; vec3 colour; float path; float rows; bool foot; };
Mirrored mirrored(ivec2 p, vec2 size) {
  Mirrored m = Mirrored(false, vec3(0.0), 0.0, 1e3, false);
  float d = texelFetch(mirrorDepth, p, 0).r;
  if (d >= 1.0) return m;
  vec4 v = mirrorProjInv * vec4((vec2(p) + 0.5) / size * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  v.xyz /= v.w;
  vec3 q = (mirrorWorld * vec4(v.xyz, 1.0)).xyz;
  vec4 foot = projectionMatrix * viewMatrix * vec4(q.x, waterY, q.z, 1.0);
  vec4 c = texelFetch(mirrorColour, p, 0);
  m.hit = true;
  m.colour = c.rgb;
  m.path = length(v.xyz);
  m.rows = ((foot.y / foot.w * 0.5 + 0.5) * screen.y - gl_FragCoord.y) * size.y / screen.y;
  // the waterline of something standing in the water (not the shore's face), near enough to see
  m.foot = c.a > 0.75 && q.y - waterY < ${f(FOOT_HEIGHT)} && m.path < fogNear;
  return m;
}

void main() {
  vec2 en = vec2(vW.x, -vW.z);
  vec2 cell = floor(toGrid(en));
  vec2 base = vLocal - en;
  float dist = length(vMV);
  float steps = known > 0.5 ? stepsAt(cell, base) : 99.0;

  // 1. depth
  ivec2 tone = steps < ${f(SHALLOW_STEPS)} ? ivec2(1, ${LIT})
    : steps < ${f(RIM_STEPS)} ? ivec2(0, ${LIT})
    : steps < ${f(DEEP_STEPS)} ? ivec2(0, ${HALF})
    : ivec2(0, ${SHADE});

  // 2. the sky, at a grazing angle
  float grazing = 1.0 - abs(normalize(vW - cameraPosition).y);
  if (tone.x == 0) tone.y = min(${HIGH}, tone.y + (grazing >= ${f(GRAZE_TWO)} ? 2 : grazing >= ${f(GRAZE_ONE)} ? 1 : 0));

  // 3. reflections
  bool shown = false;
  bool foot = false;
  if (mirrorOn > 0.5) {
    vec2 size = vec2(textureSize(mirrorDepth, 0));
    ivec2 p = ivec2(floor(vec2(gl_FragCoord.x / screen.x, 1.0 - gl_FragCoord.y / screen.y) * size));
    Mirrored here = mirrored(p, size);
    if (here.hit) {
      int dx = still > 0.5 ? 0 : wobble(here.rows, loopT, float(p.y));
      ivec2 pw = ivec2(clamp(p.x + dx, 0, int(size.x) - 1), p.y);
      vec3 c = here.colour;
      bool hit = true;
      if (dx != 0) {
        float dw = texelFetch(mirrorDepth, pw, 0).r;
        hit = dw < 1.0;
        c = texelFetch(mirrorColour, pw, 0).rgb;
      }
      if (hit) {
        float luma = dot(c, LUMA) * 255.0;
        int r = luma < darkCut ? ${OUTLINE} : luma < ${f(LIGHT_CUT)} ? ${DEEP} : ${SHADE};
        // what is far along the mirrored path goes into the fog a whole shade at a time
        r += int(floor(smoothstep(fogNear, fogFar, here.path) * ${f(MIRROR_FOG_SHADES)}));
        shown = r < tone.y;
        tone.y = min(tone.y, r);
      }
      foot = here.foot && here.rows < 1.0;
    } else if (steps >= ${f(SHALLOW_STEPS)}) {
      // beside a foot on the same row, below it or level, never above
      for (int k = -2; k <= 2; k++) {
        if (k == 0 || foot) continue;
        ivec2 q = ivec2(clamp(p.x + k, 0, int(size.x) - 1), p.y);
        if (texelFetch(mirrorDepth, q, 0).r >= 1.0) continue;
        Mirrored m = mirrored(q, size);
        foot = m.foot && m.rows > -0.5 && m.rows < 1.0;
      }
    }
  }
  if (foot && steps >= ${f(SHALLOW_STEPS)}) {
    // a broken light line at the waterline of what stands in the water
    float tick = still > 0.5 ? 0.0 : floor(loopT * 2.0);
    if ((hash2(int(floor(gl_FragCoord.x / 2.0)), int(tick)) & 3u) != 0u) tone = ivec2(2, ${LIT});
  }

  // 4. the shore
  if (known > 0.5 && steps < ${f(LAP_FAR + 1)}) {
    vec4 sh = texture(shore, (fromGrid(cell + 0.5) + base) / side);
    vec2 out_ = sh.gb * 2.0 - 1.0;
    float len = length(out_);
    out_ = len > 0.05 ? out_ / len : vec2(0.0);
    bool quiet = dist > ${f(QUIET_FAR)} || dot(out_, sun) < ${f(SHADE_LIGHT)};
    if (steps < ${f(SHALLOW_STEPS)}) {
      // where a quiet shore meets the water: a dark line along it
      if (quiet && (landAt(cell + vec2(1.0, 0.0), base) || landAt(cell - vec2(1.0, 0.0), base) ||
                    landAt(cell + vec2(0.0, 1.0), base) || landAt(cell - vec2(0.0, 1.0), base)))
        tone = ivec2(0, ${DEEP});
    } else if (!quiet) {
      // lapping: the first texels past the ring, in dashes running along the shore
      float half_ = ${f(LOOP / LAP_CYCLES / 2)};
      float ring = still > 0.5 || mod(loopT, 2.0 * half_) < half_ ? ${f(LAP_NEAR)} : ${f(LAP_FAR)};
      if (steps >= ring && (stepsAt(cell + vec2(1.0, 0.0), base) < ring || stepsAt(cell - vec2(1.0, 0.0), base) < ring ||
                            stepsAt(cell + vec2(0.0, 1.0), base) < ring || stepsAt(cell - vec2(0.0, 1.0), base) < ring)) {
        // along the shore, its direction in sixteen steps so a bend keeps its dashes whole
        float a = round(atan(out_.y, out_.x) / (TAU / 16.0)) * (TAU / 16.0);
        float s = dot(fromGrid(cell + 0.5), vec2(-sin(a), cos(a)));
        if (still < 0.5) s -= ${f((LAP_TRAVEL * LAP_PERIOD) / LOOP)} * loopT;
        if (len > 0.05 && fract(s / ${f(LAP_PERIOD)}) < ${f(LAP_DASH)}) tone = ivec2(1, ${HIGH});
      }
    }
  }

  // 5. glints on the open water, not on a reflection
  if (still < 0.5 && !shown && !foot && tone.x == 0 && steps >= ${f(RIM_STEPS)} && dist < ${f(GLINT_REACH)} && grazing < ${f(GLINT_GRAZE)}) {
    vec2 sq = floor(en / ${f(GLINT_CELL)});
    uint h = mixh(hash2(int(sq.x), int(sq.y)), uint(loopN));
    if (float(h & 255u) < ${f(GLINT_SHARE * 256)}) {
      float age = loopT - float((h >> 8) & 255u) / 256.0 * ${f(LOOP - GLINT_FOR)};
      vec2 at = (sq + 0.25 + 0.5 * vec2(float((h >> 16) & 255u), float((h >> 24) & 255u)) / 256.0) * ${f(GLINT_CELL)};
      vec4 c = projectionMatrix * viewMatrix * vec4(at.x, waterY, -at.y, 1.0);
      if (c.w > 0.0) {
        vec2 sp = floor((c.xy / c.w * 0.5 + 0.5) * screen);
        vec2 d = floor(gl_FragCoord.xy) - sp;
        if (d.y == 0.0 && glint(age, int(d.x))) tone = ivec2(2, ${HIGH});
      }
    }
  }

  int ramp = tone.x == 0 ? waterRamp : tone.x == 1 ? shallowRamp : foamRamp;
  gl_FragColor = vec4(fogged(P(ramp, tone.y), dist), 1.0);
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
${DRAIN}
varying vec3 vW;
void main() { gl_FragColor = vec4(drained(vW.y < cameraPosition.y ? fogColor : skyColor), 1.0); }`;

/** The sky: a dome round the camera in the sky's colour, drained like everything else. */
const SKY_VERTEX = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const SKY_FRAGMENT = /* glsl */ `
precision highp float;
uniform vec3 skyColor;
${DRAIN}
void main() { gl_FragColor = vec4(drained(skyColor), 1.0); }`;

/** The mirror's picture: its colours and depths, its projection's inverse and its camera's place. */
export interface Mirror {
  colour: THREE.Texture;
  depth: THREE.Texture;
  projectionInverse: THREE.Matrix4;
  world: THREE.Matrix4;
}

export interface WalkMaterials {
  /** Walls of buildings, deck slabs, parapets, columns and the shore's edge. */
  wall: THREE.ShaderMaterial;
  /** Roofs, a slab's underside, a parapet's top. */
  roof: THREE.ShaderMaterial;
  /** The roadway on a deck: drawn forward in depth, so it shows over the ground where a ramp comes down. */
  deck: THREE.ShaderMaterial;
  tree: THREE.ShaderMaterial;
  cable: THREE.ShaderMaterial;
  /** The open water under everything: deep where no square says otherwise; it writes no depth. */
  water: THREE.ShaderMaterial;
  edge: THREE.ShaderMaterial;
  /** The sky's dome: drawn first, behind everything. */
  sky: THREE.ShaderMaterial;
  /**
   * A square's own ground materials: its colours (no depth, painted in rank order), then its
   * depth (no colour), both cut out where `mask` (a 100 × 100 water mask, null for all land)
   * is water. Dispose of both with the square; the mask is the caller's.
   */
  ground(
    mask: THREE.Texture | null,
    shore?: THREE.Texture | null,
  ): { colour: THREE.ShaderMaterial; depth: THREE.ShaderMaterial };
  /**
   * A square's own water, shaded by its shore field (`shoreTexture`) and cut along its mask
   * (null for a square all of water). Dispose of it with the square; the textures are the caller's.
   */
  waterOf(mask: THREE.Texture | null, shore: THREE.Texture): THREE.ShaderMaterial;
  /** What the mirror saw this frame, for the water to read; null: no reflections. */
  mirror(m: Mirror | null): void;
  /** Under reduced motion the water stands still: no wobble, no glints, the lapping on its near ring. */
  setStill(still: boolean): void;
  /** Once a frame: the clock (seconds), the camera and the drawing's size in pixels, for the water and the trees. */
  frame(time: number, camera: THREE.Camera, width: number, height: number): void;
  /** Drains the colours to the palette's greys, 0 (none) to 1 (all): the wasted sequence. */
  setGrey(amount: number): void;
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
    laneColour: { value: palette.ramp("markingWhite") * SHADES + LIT },
    grey: { value: 0 },
    greys: { value: greysOf(palette) },
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
  // the water: the open plane and each square's share every uniform but their own field and mask
  const texel = (r: number, g: number, b: number, a: number) => {
    const t = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat);
    t.needsUpdate = true;
    return t;
  };
  /** A shore field with no shore: open water, dry land. */
  const open = texel(255, 128, 128, 255);
  const sea = texel(255, 255, 255, 255);
  const blank = texel(0, 0, 0, 255);
  const lumas: number[] = [];
  for (let c = 0; c < palette.size; c++) {
    if (c % SHADES === OUTLINE) continue;
    const [r, g, b] = palette.rgb(Math.floor(c / SHADES), c % SHADES);
    lumas.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  const sun = (ix.sunDeg * Math.PI) / 180;
  const waterShared = {
    ...shared,
    side: { value: ix.cell },
    loopT: { value: 0 },
    loopN: { value: 0 },
    still: { value: 0 },
    waterRamp: { value: palette.ramp("water") },
    shallowRamp: { value: palette.ramp("waterShallow") },
    foamRamp: { value: palette.ramp("foam") },
    sun: { value: new THREE.Vector2(Math.sin(sun), Math.cos(sun)) },
    waterY: { value: WATER_Z },
    screen: { value: new THREE.Vector2(1, 1) },
    mirrorOn: { value: 0 },
    mirrorColour: { value: blank as THREE.Texture },
    mirrorDepth: { value: blank as THREE.Texture },
    mirrorProjInv: { value: new THREE.Matrix4() },
    mirrorWorld: { value: new THREE.Matrix4() },
    darkCut: { value: darkCutOf(lumas) },
  };
  const waterMaterial = (mask: THREE.Texture, shore: THREE.Texture, known: boolean) =>
    new THREE.ShaderMaterial({
      uniforms: {
        ...waterShared,
        shore: { value: shore },
        mask: { value: mask },
        known: { value: known ? 1 : 0 },
      },
      vertexShader: WATER_VERTEX,
      fragmentShader: WATER_FRAGMENT,
    });
  const water = waterMaterial(sea, open, false);
  water.depthWrite = false;
  const edge = new THREE.ShaderMaterial({
    uniforms: {
      fogColor: shared.fogColor,
      skyColor: { value: SKY },
      grey: shared.grey,
      greys: shared.greys,
    },
    vertexShader: EDGE_VERTEX,
    fragmentShader: EDGE_FRAGMENT,
    side: THREE.DoubleSide,
  });
  const sky = new THREE.ShaderMaterial({
    uniforms: { skyColor: { value: SKY }, grey: shared.grey, greys: shared.greys },
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
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
    sky,
    ground(mask, shore) {
      const uniforms = {
        ...shared,
        mask: { value: mask ?? land },
        masked: { value: mask ? 1 : 0 },
        side: { value: ix.cell },
        shore: { value: shore ?? open },
        pierRamp: { value: palette.ramp("pier") },
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
    waterOf(mask, shore) {
      return waterMaterial(mask ?? sea, shore, true);
    },
    mirror(m) {
      waterShared.mirrorOn.value = m ? 1 : 0;
      waterShared.mirrorColour.value = m?.colour ?? blank;
      waterShared.mirrorDepth.value = m?.depth ?? blank;
      if (m) {
        waterShared.mirrorProjInv.value.copy(m.projectionInverse);
        waterShared.mirrorWorld.value.copy(m.world);
      }
    },
    setStill(still) {
      waterShared.still.value = still ? 1 : 0;
    },
    setGrey(amount) {
      shared.grey.value = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
    },
    frame(time, camera, width, height) {
      // the loop's clock, and which loop it is (the glints' places), kept small for the shader
      const t = Math.max(0, time);
      waterShared.loopT.value = t % LOOP;
      waterShared.loopN.value = Math.floor(t / LOOP) % 65536;
      waterShared.screen.value.set(Math.max(1, width), Math.max(1, height));
      camRight.setFromMatrixColumn(camera.matrixWorld, 0).setY(0);
      if (camRight.lengthSq() < 1e-8) camRight.set(1, 0, 0);
      camRight.normalize();
    },
    dispose() {
      for (const m of [wall, roof, deck, tree, cable, water, edge, sky]) m.dispose();
      atlas.dispose();
      land.dispose();
      for (const t of [open, sea, blank]) t.dispose();
    },
  };
}
