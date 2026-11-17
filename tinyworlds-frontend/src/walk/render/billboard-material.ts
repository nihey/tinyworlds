import * as THREE from "three";
import { GAP, pictogramBytes, PICTOGRAMS, TEXEL } from "./billboards";

/**
 * The billboards' shader: each screen is pixel art in LED pixels of `TEXEL` m, every pixel one
 * palette colour (no blending; where a gradient is wanted, a 4 × 4 Bayer pattern in the screen's
 * own pixels), a dark frame round it, a dark housing behind it, then the fog and the wasted
 * greying (`fogged`) like everything else. What each screen shows is in its instance's
 * attributes (`billboard-mesh.ts`), picked by `screenOf`:
 * 0. a slideshow: a flat field (plain, or its foot or top dithered into another colour) with big
 *    pictograms (one to three side by side), a new picture and the other colour scheme every 3 s
 *    (a 12 s loop);
 * 1. a ticker: a band of coloured blocks scrolling left 16 pixels a second (a 4 s loop), with a
 *    picture beside it;
 * 2. bands: four colours sweeping across (diagonal, sideways, or rings from the middle), their
 *    edges dithered (an 8 s loop);
 * 3. a pictogram blinking: between two palettes, on and off, or a pulse (a 2 s loop).
 * Every loop is a whole number of seconds dividing `SCREEN_LOOP`; under reduced motion each
 * screen keeps one frame. Far away, where a pixel of the screen is smaller than one drawn, whole
 * blocks of its pixels take one pixel's colour, so it does not shimmer.
 */

/** The housing behind a screen's face, m deep (its back stands this much less than `GAP` off the wall). */
export const HOUSING_DEPTH = 0.22;
/** The screens' clock runs round this many seconds: every loop divides it. */
export const SCREEN_LOOP = 120;

const f = (n: number) => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const BILLBOARD_VERTEX = /* glsl */ `
attribute float front;
attribute vec4 foot; attribute vec4 shape; attribute vec4 look; attribute vec4 cA; attribute vec4 cB;
varying vec2 vUv; flat varying float vFront; flat varying vec4 vShape; flat varying vec4 vLook;
flat varying vec4 vA; flat varying vec4 vB; flat varying float vSeed; varying vec3 vMV;
void main() {
  // shape: the wall's outward normal (east, north), the screen's width and height
  vec3 outward = vec3(shape.x, 0.0, -shape.y);
  vec3 right = vec3(-shape.y, 0.0, -shape.x);
  float off = ${f(GAP)} - ${f(HOUSING_DEPTH)} * (1.0 - position.z);
  vec3 p = foot.xyz + right * (position.x * shape.z) + vec3(0.0, position.y * shape.w, 0.0) + outward * off;
  vUv = position.xy; vFront = front; vShape = shape; vLook = look; vA = cA; vB = cB; vSeed = foot.w;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vMV = mv.xyz;
  gl_Position = projectionMatrix * mv;
}`;

/** The fragment shader, given the walk's own GLSL chunks (its hash, fog and palette). */
export function billboardFragment(chunks: { hash: string; fog: string; palette: string }): string {
  const count = PICTOGRAMS.length;
  return /* glsl */ `
precision highp float; precision highp int;
uniform float clock; uniform float still; uniform sampler2D picto; uniform float housing; uniform float frameC;
${chunks.hash} ${chunks.fog} ${chunks.palette}
varying vec2 vUv; flat varying float vFront; flat varying vec4 vShape; flat varying vec4 vLook;
flat varying vec4 vA; flat varying vec4 vB; flat varying float vSeed; varying vec3 vMV;

float bayer(ivec2 q) {
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(m[(q.x & 3) + (q.y & 3) * 4]) + 0.5) / 16.0;
}
// pictogram k's pixel p (x right, y down from its top): 0 nothing, 1 the figure, 2 its second colour
int pic(int k, ivec2 p) {
  if (p.x < 0 || p.y < 0 || p.x > 15 || p.y > 15) return 0;
  return int(texelFetch(picto, ivec2(p.x, k * 16 + p.y), 0).r * 255.0 + 0.5);
}
// pictogram k drawn s screen pixels a pixel, its bottom-left at o: 0 the field, 1, 2, or 3 its shadow
int figure(int k, ivec2 q, ivec2 o, int s) {
  ivec2 d = q - o;
  if (d.x < 0 || d.x >= 17 * s || d.y < -s || d.y >= 16 * s) return 0;
  ivec2 p = ivec2(d.x / s, 15 - int(floor(float(d.y) / float(s))));
  int v = pic(k, p);
  if (v != 0) return v;
  // the shadow: a pixel down and to the right of the figure's
  return pic(k, p - ivec2(1, 1)) != 0 ? 3 : 0;
}
// a field in c.x with up to three pictograms from k on; field 1 dithers its foot into the
// accent, field 2 its top; shrink makes them a step smaller (the pulse)
float picture(ivec2 p, int w, int h, vec4 c, int k, float b, int shrink, bool shown, int field) {
  float g = (float(p.y) + 0.5) / float(h);
  if (field == 2) g = 1.0 - g;
  float bg = (field != 0 && g < 0.3 && (0.3 - g) / 0.3 > b) ? c.z : c.x;
  if (!shown) return bg;
  int s = max(1, (min(w, h) * 3) / 64 - shrink);
  int S = 16 * s;
  if (S + s > w || S + s > h) return bg;
  int n = clamp((w + S / 2) / (S + S / 2), 1, 3);
  int gap = (w - n * S) / (n + 1);
  int y0 = (h - S) / 2;
  for (int i = 0; i < 3; i++) {
    if (i >= n) break;
    int v = figure((k + i * 3) % ${count}, p, ivec2(gap + i * (S + gap), y0), s);
    if (v == 1) return c.y;
    if (v == 2) return c.z;
    if (v == 3) return c.w;
  }
  return bg;
}
// a band of blocks scrolling left: a pattern 64 pixels long, 16 pixels a second
float ticker(ivec2 p, int h0, int bandH, float t) {
  if (p.y == h0 || p.y == h0 + bandH - 1) return vB.w;
  int x = (p.x + int(floor(t * 16.0))) % 64;
  uint hh = mixh(uint(vSeed) + 17u, uint(x / 8));
  if (x % 8 >= 3 + int(hh % 5u)) return vB.w;
  uint pick = (hh >> 8) % 3u;
  return pick == 0u ? vB.y : pick == 1u ? vB.z : vA.y;
}
float bands(ivec2 p, int w, int h, float t, int variant, float b) {
  int bw = clamp(min(w, h) / 4, 4, 16);
  float period = float(4 * bw);
  // all four colours go by once in 8 s
  float off = floor(t * period / 8.0);
  float s;
  if (variant == 0) s = float(p.x + p.y) + off;
  else if (variant == 1) s = float(p.x) + off;
  else s = off - float(max(abs(2 * p.x + 1 - w), abs(2 * p.y + 1 - h)) / 2);
  float m = mod(s, period);
  int i = int(floor(m / float(bw)));
  float fr = (m - float(i * bw)) / float(bw);
  // the last part of each band dithered into the next
  if (fr > 0.6 && (fr - 0.6) / 0.4 > b) i = (i + 1) % 4;
  return i == 0 ? vA.x : i == 1 ? vA.y : i == 2 ? vB.x : vB.y;
}
float screen(ivec2 q, int W, int H, float t) {
  int fr = (W >= 80 && H >= 40) ? 2 : 1;
  if (q.x < fr || q.y < fr || q.x >= W - fr || q.y >= H - fr) return frameC;
  ivec2 p = q - ivec2(fr);
  int w = W - 2 * fr, h = H - 2 * fr;
  int tpl = int(vLook.x + 0.5), k = int(vLook.y + 0.5), variant = int(vLook.z + 0.5);
  float b = bayer(p);
  if (tpl == 1) {
    // the band at the foot, at the top, or both, a picture in the rest
    int bandH = clamp(h / 4, 4, 12);
    bool foot = variant != 1, top = variant != 0;
    if (foot && p.y < bandH) return ticker(p, 0, bandH, t);
    if (top && p.y >= h - bandH) return ticker(p, h - bandH, bandH, t + 2.0);
    int y0 = foot ? bandH : 0;
    int hh = h - (foot ? bandH : 0) - (top ? bandH : 0);
    return picture(p - ivec2(0, y0), w, hh, vA, k, b, 0, true, 0);
  }
  if (tpl == 2) return bands(p, w, h, t, variant, b);
  if (tpl == 3) {
    bool on = mod(t, 2.0) < 1.0;
    if (variant == 0) return picture(p, w, h, on ? vA : vB, k, b, 0, true, 0);
    if (variant == 1) return picture(p, w, h, vA, k, b, 0, on, 1);
    return picture(p, w, h, vA, k, b, on ? 0 : 1, true, 2);
  }
  // the slideshow: a new picture every 3 s, the schemes taking turns
  int slide = int(mod(floor(t / 3.0), 4.0));
  return picture(p, w, h, slide % 2 == 0 ? vA : vB, (k + slide * 5) % ${count}, b, 0, true, variant);
}

void main() {
  // what changes from pixel to pixel first, where every pixel takes the same path
  vec2 tex = vUv * vShape.zw / ${f(TEXEL)};
  float fw = max(fwidth(tex.x), fwidth(tex.y));
  float dist = length(vMV);
  if (vFront < 0.5) {
    gl_FragColor = vec4(fogged(C(housing), dist), 1.0);
    return;
  }
  int W = int(round(vShape.z / ${f(TEXEL)}));
  int H = int(round(vShape.w / ${f(TEXEL)}));
  ivec2 q = clamp(ivec2(floor(tex)), ivec2(0), ivec2(W - 1, H - 1));
  int B = 1 << clamp(int(floor(log2(max(fw, 1.0)))), 0, 4);
  if (B > 1) q = min((q / B) * B + B / 2, ivec2(W - 1, H - 1));
  float t = mod((still > 0.5 ? 0.0 : clock) + vLook.w, ${f(SCREEN_LOOP)});
  gl_FragColor = vec4(fogged(C(screen(q, W, H, t)), dist), 1.0);
}`;
}

/** The pictograms as a texture, 16 wide, 16 rows each one under the other: 0, 1 or 2 per texel. */
export function pictogramTexture(): THREE.DataTexture {
  const bytes = pictogramBytes();
  const t = new THREE.DataTexture(bytes, 16, bytes.length / 16, THREE.RedFormat);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
