/**
 * The whole map is drawn from one indexed palette: a few dozen materials, each a ramp of six
 * shades. Shading never mixes colours, it only moves along a ramp, which is what keeps the
 * output looking like pixel art instead of a render.
 *
 *   0 outline   1 deep shade   2 shade / cast shadow   3 half-light   4 lit   5 highlight
 *
 * Ramps are built with hue shifting: shades lean towards blue-violet, highlights towards warm
 * yellow, the way pixel artists pick ramps by hand.
 */
export const SHADES = 6;
export const S_OUTLINE = 0;
export const S_DEEP = 1;
export const S_SHADE = 2;
export const S_HALF = 3;
export const S_LIT = 4;
export const S_HIGH = 5;

/** Base colour = the lit shade (4). Order matters: a ramp's id is its position here. */
const RAMP_DEFS = {
  // ---- ground
  water: "#3d82ab",
  waterShallow: "#55a0be",
  foam: "#cfeaf0",
  pavement: "#cbc5b6",
  asphalt: "#787c82",
  asphaltDark: "#62666d",
  asphaltLight: "#969a9e",
  marking: "#ecd67a",
  markingWhite: "#e4e3db",
  park: "#84b45e",
  lawn: "#9ac56a",
  forest: "#5f9449",
  scrub: "#8aa765",
  wetland: "#7fa08a",
  sand: "#e9dba9",
  rock: "#a5a096",
  dirt: "#bfa67f",
  plaza: "#dcd4c2",
  pier: "#bfa685",
  concrete: "#b9b7af",
  gravel: "#958b7a",
  court: "#4f93bb",
  courtGreen: "#5fa873",
  track: "#c76d4c",
  pool: "#63d3e2",
  // ---- walls
  brickRed: "#ad5d49",
  brickDark: "#8d5546",
  brownstone: "#84634f",
  tan: "#cdae8a",
  cream: "#e6d6b4",
  limestone: "#d9cfba",
  whiteBrick: "#e7e3d9",
  greyStone: "#aeada6",
  darkStone: "#817d76",
  yellowBrick: "#d9bf88",
  rose: "#cfa391",
  sidingBlue: "#b7cfdb",
  sidingYellow: "#ecdfa3",
  sidingSage: "#abc1a2",
  steel: "#8f9aa3",
  // ---- glass
  glassBlue: "#62a0c8",
  glassTeal: "#55a9aa",
  glassDark: "#41678a",
  glassGreen: "#70b19f",
  glassBronze: "#927a5b",
  glassBlack: "#414851",
  glassSilver: "#aabfce",
  // ---- roofs
  roofTar: "#62656b",
  roofGravel: "#928f87",
  roofSilver: "#bcc0c2",
  roofWhite: "#dfddd5",
  roofCopper: "#72b8a0",
  roofTerracotta: "#bc6c4e",
  roofSlate: "#64707d",
  roofBrown: "#80644f",
  roofRed: "#aa4d3e",
  // ---- things
  leaf: "#5c9a45",
  leafLight: "#7fb352",
  leafDark: "#487f44",
  leafAutumn: "#d99a3e",
  leafRed: "#c5573a",
  trunk: "#7a5a43",
  taxi: "#f4c21f",
  carRed: "#c8473c",
  carBlue: "#4b78b4",
  carWhite: "#e9e9e6",
  carBlack: "#3a3d42",
  gold: "#e5bd4f",
  libertyGreen: "#7fc3a8",
  ferryOrange: "#e8822e",
  // ---- added for cities beyond New York (new ramps go last: a ramp's id is its position)
  cane: "#7dab4b",
  caneYoung: "#a6c765",
  straw: "#cdb877",
  terraRoxa: "#a85a41",
  salmon: "#e3ab8d",
  ochre: "#d9a862",
  mint: "#bcd6ba",
  roofClay: "#c9805a",
  ipeYellow: "#edc531",
  ipePink: "#d98bb4",
  flamboyant: "#dd5a33",
  steppe: "#bfb47f",
  steppeDark: "#96905c",
  roofGreen: "#5f8c6a",
  // ---- a medieval town (generated cities)
  snow: "#edf1f4",
  cobble: "#a59e93",
  dirtRoad: "#a58d67",
  thatch: "#c9aa5f",
  timber: "#70503a",
  redStone: "#c2725b",
  weirwood: "#ebe6dc",
  pine: "#3c6a4e",
} as const;

export type RampName = keyof typeof RAMP_DEFS;
export const RAMP_NAMES = Object.keys(RAMP_DEFS) as RampName[];

/** Ramp ids by name: `R.brickRed` is a small integer; palette index = id · 6 + shade. */
export const R = Object.fromEntries(RAMP_NAMES.map((name, i) => [name, i])) as Record<RampName, number>;

export const RAMP_COUNT = RAMP_NAMES.length;
/** Colour buffers are Uint16: this index means nothing was drawn (fully transparent). */
export const TRANSPARENT = 0xffff;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Where shadows lean (a deep indigo) and where highlights lean (a warm white). */
const SHADOW_TINT: [number, number, number] = [36, 40, 86];
const LIGHT_TINT: [number, number, number] = [255, 246, 216];
/** Per shade: brightness relative to the lit colour, then how far to pull towards the shadow tint. */
const SHADE_MUL = [0.44, 0.58, 0.72, 0.87, 1, 1];
const SHADE_TINT = [0.4, 0.28, 0.16, 0.06, 0, 0];
const HIGHLIGHT = 0.26;

const mixChannel = (a: number, b: number, t: number): number => Math.round(a + (b - a) * t);

/**
 * Six shades of one material. Darker shades are the lit colour dimmed and pulled towards indigo,
 * the highlight is pulled towards warm white: shadows go cool, light goes warm, whatever the hue.
 */
export function buildRamp(hex: string): [number, number, number][] {
  const base = hexToRgb(hex);
  return SHADE_MUL.map((mul, i) => {
    if (i === SHADES - 1)
      return base.map((c, ch) => mixChannel(c, LIGHT_TINT[ch], HIGHLIGHT)) as [number, number, number];
    return base.map((c, ch) => mixChannel(c * mul, SHADOW_TINT[ch], SHADE_TINT[i])) as [
      number,
      number,
      number,
    ];
  });
}

/** RGBA for every palette index, as a Uint32Array in little-endian ABGR (what a Uint8 RGBA view expects). */
export function buildPalette(): { rgba: Uint32Array; rgb: [number, number, number][] } {
  const rgba = new Uint32Array(RAMP_COUNT * SHADES);
  const rgb: [number, number, number][] = [];
  RAMP_NAMES.forEach((name, rampId) => {
    buildRamp(RAMP_DEFS[name]).forEach(([r, g, b], shade) => {
      rgba[rampId * SHADES + shade] = (255 << 24) | (b << 16) | (g << 8) | r;
      rgb[rampId * SHADES + shade] = [r, g, b];
    });
  });
  return { rgba, rgb };
}

/** The ramp whose lit colour is closest to an arbitrary colour (for explicit OSM facade/roof colours). */
export function nearestRamp(hex: string, candidates: number[]): number {
  const [r, g, b] = hexToRgb(hex);
  let best = candidates[0];
  let bestD = Infinity;
  for (const id of candidates) {
    const [cr, cg, cb] = hexToRgb(RAMP_DEFS[RAMP_NAMES[id]]);
    // weighted RGB distance: cheap and close enough to perceptual for picking a material
    const d = 2 * (r - cr) ** 2 + 4 * (g - cg) ** 2 + 3 * (b - cb) ** 2;
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

export const idx = (ramp: number, shade: number): number => ramp * SHADES + shade;
