import { R } from "../render/palette.js";
import { hashString, mix, pick, rand } from "../scene/hash.js";
import { F_FLOATING, F_NO_OUTLINE, G, Pattern, Roof } from "../scene/kinds.js";
import { chaikin, rect, ribbon } from "../scene/medieval.js";
import type { Look, SyntheticBuilder, SyntheticPlaceType } from "../scene/synthetic.js";
import {
  bigTree,
  block,
  camp,
  castle,
  city,
  crag,
  dome,
  facingEdge,
  grove,
  hall,
  harbour,
  holdfast,
  houses,
  isle,
  keep,
  LandMask,
  nearestOnPath,
  nearestWater,
  pathPQ,
  peak,
  polygon,
  range,
  roughen,
  round,
  ruin,
  settle,
  ship,
  sketch,
  toEN,
  toPQ,
  wallRing,
  ziggurat,
  type Style,
} from "../scene/worldkit.js";
import { generatedCity } from "./generated.js";
import {
  ARCHIPELAGOS,
  BIOMES,
  EAST,
  NORTH,
  BRAAVOS,
  BRAAVOS_ISLES,
  BRAAVOS_SHIELD,
  ESSOS,
  FEATURES,
  ISLANDS,
  LAKES,
  RANGES,
  REGIONS,
  RIVERS,
  ROADS,
  ROUTES,
  SOTHORYOS,
  THOUSAND_ISLANDS,
  TITAN,
  ULTHOS,
  WESTEROS,
  WORLD,
  type Corner,
  type Isle,
  type Region,
} from "./tinywesteros.land.js";
import { SITES, type Kit, type Site, type StyleName } from "./tinywesteros.places.js";

/**
 * The known world of A Song of Ice and Fire as one diorama: Westeros from the lands beyond the
 * Wall to Dorne, Essos from Braavos to Asshai, the islands and the seas between. It is drawn at
 * the scale of a toy: about four units to a kilometre, so that the whole of it fits on one map,
 * with every place on it as a model far bigger than it should be, like the pieces on a war table.
 *
 * The geography is sketched for this map (`tinywesteros.land.ts`) and roughened by code; no map
 * was traced and only names are borrowed. North is up: the layout is written in east and north
 * and turned into the builder's grid by `scene/worldkit.ts`.
 */

const SQ = Math.SQRT1_2;
/** A flat path of the sketch (east, north, east, north…) in units. */
const units = (values: number[]): number[] => values.map((v, i) => v * (i % 2 === 0 ? EAST : NORTH));
/** Corners of the sketch in units. */
const drawn = (pairs: ArrayLike<number>[]): number[] => sketch(pairs, EAST, NORTH);
const cornersOf = (list: Corner[]): number[] => drawn(list.map(([e, n]) => [e, n]));
/** A wobbly ring drawn in the sketch (centre and radius in its steps), in units. */
const isleOf = (e: number, n: number, r: number, seed: number, stretch = 1, turn = 0): number[] =>
  units(isle(e, n, r, seed, stretch, turn));
/** A world direction as a grid direction. */
const gridDir = (de: number, dn: number): [number, number] => [(de + dn) * SQ, (de - dn) * SQ];
const gridAngle = (de: number, dn: number): number => Math.atan2((de - dn) * SQ, (de + dn) * SQ);

const COAST = { amount: 0.15, minLen: 26 };
const BIOME_EDGE = { amount: 0.17, minLen: 34 };

// ---------------------------------------------------------------------------------------------
// what each part of the world builds with
// ---------------------------------------------------------------------------------------------

const STYLES: Record<StyleName, Style> = {
  north: {
    stone: R.greyStone,
    cone: R.roofSlate,
    roof: R.roofSlate,
    walls: [R.greyStone, R.timber, R.brownstone],
    roofs: [R.roofSlate, R.thatch, R.roofBrown],
    floor: G.DirtRoad,
  },
  watch: {
    stone: R.darkStone,
    roof: R.roofTar,
    walls: [R.timber, R.darkStone, R.brownstone],
    roofs: [R.roofTar, R.roofBrown],
    floor: G.DirtRoad,
  },
  wildling: {
    stone: R.timber,
    roof: R.thatch,
    walls: [R.timber, R.brownstone],
    roofs: [R.thatch, R.roofBrown],
    floor: -1,
  },
  iron: {
    stone: R.darkStone,
    roof: R.roofTar,
    walls: [R.darkStone, R.greyStone],
    roofs: [R.roofTar, R.roofSlate],
    floor: G.Rock,
  },
  river: {
    stone: R.greyStone,
    cone: R.roofRed,
    roof: R.roofRed,
    walls: [R.cream, R.greyStone, R.timber],
    roofs: [R.roofRed, R.roofBrown, R.thatch],
  },
  vale: {
    stone: R.whiteBrick,
    cone: R.roofSlate,
    roof: R.roofSlate,
    walls: [R.whiteBrick, R.limestone],
    roofs: [R.roofSlate, R.sidingBlue],
  },
  west: {
    stone: R.limestone,
    cone: R.roofRed,
    roof: R.roofRed,
    walls: [R.limestone, R.cream, R.tan],
    roofs: [R.roofRed, R.gold, R.roofTerracotta],
  },
  crown: {
    stone: R.limestone,
    cone: R.roofRed,
    roof: R.roofTerracotta,
    walls: [R.cream, R.tan, R.limestone, R.salmon],
    roofs: [R.roofTerracotta, R.roofClay, R.roofRed],
  },
  storm: {
    stone: R.darkStone,
    roof: R.roofSlate,
    walls: [R.greyStone, R.darkStone, R.timber],
    roofs: [R.roofSlate, R.roofTar],
  },
  reach: {
    stone: R.whiteBrick,
    cone: R.roofGreen,
    roof: R.roofGreen,
    walls: [R.whiteBrick, R.cream, R.limestone],
    roofs: [R.roofGreen, R.roofTerracotta, R.roofCopper],
  },
  dorne: {
    stone: R.yellowBrick,
    cone: R.gold,
    roof: R.ochre,
    walls: [R.ochre, R.yellowBrick, R.cream, R.whiteBrick],
    roofs: [R.ochre, R.roofClay, R.cream],
    flat: true,
    floor: G.Sand,
  },
  free: {
    stone: R.brickRed,
    roof: R.roofTerracotta,
    walls: [R.brickRed, R.cream, R.tan, R.salmon],
    roofs: [R.roofTerracotta, R.roofClay],
  },
  braavos: {
    stone: R.greyStone,
    cone: R.roofCopper,
    roof: R.roofCopper,
    walls: [R.greyStone, R.brickDark, R.limestone, R.darkStone],
    roofs: [R.roofSlate, R.roofCopper, R.roofRed],
  },
  tyrosh: {
    stone: R.roofTar,
    cone: R.roofCopper,
    roof: R.roofCopper,
    walls: [R.sidingBlue, R.rose, R.sidingYellow, R.mint, R.cream],
    roofs: [R.roofTerracotta, R.roofCopper, R.roofRed],
  },
  lys: {
    stone: R.whiteBrick,
    cone: R.rose,
    roof: R.rose,
    walls: [R.whiteBrick, R.rose, R.cream],
    roofs: [R.roofTerracotta, R.rose, R.roofWhite],
  },
  volantis: {
    stone: R.roofTar,
    roof: R.roofTerracotta,
    walls: [R.ochre, R.cream, R.brickRed, R.tan],
    roofs: [R.roofTerracotta, R.roofClay, R.ochre],
  },
  norvos: {
    stone: R.greyStone,
    cone: R.roofBrown,
    roof: R.roofBrown,
    walls: [R.greyStone, R.timber, R.cream],
    roofs: [R.roofBrown, R.roofSlate],
  },
  qohor: {
    stone: R.darkStone,
    cone: R.roofTar,
    roof: R.roofTar,
    walls: [R.timber, R.darkStone, R.brownstone],
    roofs: [R.roofTar, R.roofBrown],
  },
  sarnor: {
    stone: R.limestone,
    roof: R.limestone,
    walls: [R.limestone, R.whiteBrick],
    roofs: [R.limestone, R.roofWhite],
  },
  valyria: {
    stone: R.roofTar,
    roof: R.roofTar,
    walls: [R.roofTar, R.darkStone],
    roofs: [R.roofTar],
    floor: G.Rock,
  },
  ghis: {
    stone: R.ochre,
    roof: R.ochre,
    walls: [R.brickRed, R.yellowBrick, R.ochre, R.salmon, R.cream, R.sidingSage],
    roofs: [R.ochre, R.cream, R.salmon],
    flat: true,
  },
  astapor: {
    stone: R.brickRed,
    roof: R.brickRed,
    walls: [R.brickRed, R.brickDark, R.terraRoxa],
    roofs: [R.brickRed, R.roofRed],
    flat: true,
  },
  yunkai: {
    stone: R.yellowBrick,
    roof: R.yellowBrick,
    walls: [R.yellowBrick, R.sidingYellow, R.ochre],
    roofs: [R.yellowBrick, R.ochre],
    flat: true,
  },
  lhazar: {
    stone: R.ochre,
    roof: R.thatch,
    walls: [R.ochre, R.tan],
    roofs: [R.thatch, R.straw],
    floor: G.DirtRoad,
  },
  qarth: {
    stone: R.redStone,
    cone: R.gold,
    roof: R.gold,
    walls: [R.rose, R.salmon, R.mint, R.sidingSage, R.cream, R.sidingYellow],
    roofs: [R.roofCopper, R.gold, R.roofTerracotta, R.roofWhite],
  },
  bones: {
    stone: R.limestone,
    cone: R.roofRed,
    roof: R.roofRed,
    walls: [R.limestone, R.tan],
    roofs: [R.roofRed, R.ochre],
  },
  yiti: {
    stone: R.cream,
    tower: R.brickRed,
    cone: R.roofGreen,
    roof: R.roofGreen,
    walls: [R.cream, R.brickRed, R.whiteBrick],
    roofs: [R.roofGreen, R.gold, R.roofTerracotta],
  },
  shadow: {
    stone: R.roofTar,
    roof: R.asphaltDark,
    walls: [R.roofTar, R.darkStone, R.asphaltDark],
    roofs: [R.roofTar, R.asphaltDark],
    floor: G.Taxiway,
  },
  ibben: {
    stone: R.greyStone,
    roof: R.roofBrown,
    walls: [R.timber, R.greyStone, R.brownstone],
    roofs: [R.roofBrown, R.roofSlate],
  },
  summer: {
    stone: R.timber,
    roof: R.thatch,
    walls: [R.timber, R.tan, R.cream],
    roofs: [R.thatch, R.straw],
    floor: G.Sand,
  },
  sothoryos: {
    stone: R.sidingSage,
    roof: R.sidingSage,
    walls: [R.sidingSage, R.greyStone],
    roofs: [R.sidingSage],
    floor: -1,
  },
};

/** Size of each kind of model (units: the radius of its walls) unless a place says otherwise. */
const SIZE: Record<Kit, number> = {
  castle: 46,
  greatcastle: 64,
  holdfast: 30,
  tower: 16,
  ruin: 44,
  village: 42,
  town: 60,
  port: 60,
  city: 110,
  portcity: 110,
  pyramid: 80,
  camp: 46,
  weirwood: 34,
  special: 60,
};

/** The ground a place built by name takes up, and whether it stays exactly where it was sketched. */
const SPECIAL: Record<string, { r: number; fixed?: boolean }> = {
  "Fist of the First Men": { r: 56 },
  "Castle Black": { r: 62, fixed: true },
  "The Shadow Tower": { r: 40, fixed: true },
  "Eastwatch-by-the-Sea": { r: 44, fixed: true },
  "The Nightfort": { r: 52, fixed: true },
  Queensgate: { r: 30, fixed: true },
  Oakenshield: { r: 30, fixed: true },
  "Long Barrow": { r: 30, fixed: true },
  Winterfell: { r: 120 },
  "Moat Cailin": { r: 62, fixed: true },
  Pyke: { r: 40, fixed: true },
  "Nagga's Bones": { r: 46 },
  Riverrun: { r: 50 },
  "The Twins": { r: 120, fixed: true },
  Harrenhal: { r: 168 },
  "The Eyrie": { r: 96 },
  "Casterly Rock": { r: 116 },
  "King's Landing": { r: 196 },
  Dragonstone: { r: 60, fixed: true },
  "Storm's End": { r: 66 },
  Highgarden: { r: 128 },
  Oldtown: { r: 174 },
  Sunspear: { r: 70 },
  "Water Gardens": { r: 46 },
  Braavos: { r: 60, fixed: true },
  Volantis: { r: 60, fixed: true },
  Norvos: { r: 92 },
  Qohor: { r: 108 },
  "Vaes Dothrak": { r: 110, fixed: true },
  Valyria: { r: 90, fixed: true },
  Meereen: { r: 212 },
  Yunkai: { r: 138 },
  Astapor: { r: 158 },
  "Old Ghis": { r: 90 },
  Qarth: { r: 216 },
  Yin: { r: 196 },
  "The Five Forts": { r: 70, fixed: true },
  Asshai: { r: 262 },
};

/** Where the Wall stands, in units: along one line of latitude, from the Gorge to the sea. */
const WALL = { west: -27 * EAST, east: -12 * EAST, n: 76 * NORTH, thick: 46 };

// ---------------------------------------------------------------------------------------------
// the land
// ---------------------------------------------------------------------------------------------

interface Shape {
  ring: number[];
  isle?: Isle;
  seed: number;
}

interface Land {
  mask: LandMask;
  westeros: number[];
  essos: number[];
  shapes: Shape[];
  /** Rivers by name: flat east, north in units. */
  rivers: Map<string, number[]>;
  lakes: { ring: number[]; eye?: number[] }[];
  /** Roads as laid, flat east, north in units, for whoever must keep off them. */
  roads: number[][];
}

function layLand(): Land {
  const westeros = roughen(cornersOf(WESTEROS), 11, COAST);
  const essos = roughen(cornersOf(ESSOS), 23, COAST);
  const shapes: Shape[] = [
    { ring: westeros, seed: 11 },
    { ring: essos, seed: 23 },
    { ring: roughen(cornersOf(SOTHORYOS), 31, COAST), seed: 31 },
    { ring: roughen(cornersOf(ULTHOS), 37, COAST), seed: 37 },
  ];
  const small = { amount: 0.12, minLen: 20 };
  ISLANDS.forEach((island, i) => {
    const seed = hashString(island.name) + i;
    const ring = isleOf(island.e, island.n, island.r, seed, island.stretch, island.turn);
    shapes.push({ ring: roughen(ring, seed, small), isle: island, seed });
  });
  for (let i = 0; i < THOUSAND_ISLANDS.count; i++) {
    const seed = mix(1000, i);
    const a = rand(seed, 1) * Math.PI * 2;
    const d = Math.sqrt(rand(seed, 2)) * THOUSAND_ISLANDS.spread;
    const e = THOUSAND_ISLANDS.e + Math.cos(a) * d * 1.5;
    const n = THOUSAND_ISLANDS.n + Math.sin(a) * d * 0.7;
    shapes.push({ ring: roughen(isleOf(e, n, 0.34 + rand(seed, 3) * 0.5, seed), seed, small), seed });
  }
  // Braavos: its hundred isles (eight of them), the rocks around the lagoon, the Titan's two feet
  BRAAVOS_ISLES.forEach(([de, dn, r], i) => {
    const ring = isle(BRAAVOS.e + de, BRAAVOS.n + dn, r, 500 + i, 1, 0, 10);
    shapes.push({ ring: roughen(ring, 500 + i, { amount: 0.06, minLen: 16 }), seed: 500 + i });
  });
  BRAAVOS_SHIELD.forEach(([de, dn, r, stretch, turn], i) => {
    const ring = isle(BRAAVOS.e + de, BRAAVOS.n + dn, r, 520 + i, stretch, turn);
    shapes.push({ ring: roughen(ring, 520 + i, small), seed: 520 + i });
  });
  for (const side of [-1, 1]) {
    const ring = isle(BRAAVOS.e + TITAN.de + side * 21, BRAAVOS.n + TITAN.dn + side * 21, 27, 540 + side);
    shapes.push({ ring, seed: 540 + side });
  }

  const mask = new LandMask(WORLD.west, WORLD.south, WORLD.east, WORLD.north, 6);
  for (const shape of shapes) mask.add(shape.ring);

  const lakes = LAKES.map((lake) => {
    const seed = hashString(lake.name);
    const ring = roughen(isleOf(lake.e, lake.n, lake.r, seed, lake.stretch ?? 1), seed, {
      amount: 0.07,
      minLen: 30,
    });
    mask.add(ring, false);
    if (lake.eye === undefined) return { ring };
    const eye = isle(lake.e * EAST, lake.n * NORTH, lake.eye * 100, seed + 1);
    mask.add(eye);
    return { ring, eye };
  });

  const rivers = new Map<string, number[]>();
  for (const river of RIVERS) {
    const seed = hashString(river.name);
    const rough = roughen(units(river.path), seed, { closed: false, amount: 0.09, minLen: 60 });
    const path = chaikin(rough, 1);
    rivers.set(river.name, path);
    mask.add(ribbon(path, river.width + 10), false);
  }
  return { mask, westeros, essos, shapes, rivers, lakes, roads: [] };
}

/** The far north is under snow, and the North is patched with it: holes in the grass where it shows. */
function snowPatches(): number[][] {
  const patches: number[][] = [];
  const taken: number[][] = [];
  for (let i = 0; i < 900; i++) {
    const seed = mix(4242, i);
    const e = (-47 + rand(seed, 1) * 60) * EAST;
    const n = (43 + rand(seed, 2) * 30) * NORTH;
    const north = (n / NORTH - 43) / 30;
    if (rand(seed, 3) > Math.pow(north, 1.5) * 0.9 + 0.04) continue;
    const r = 40 + rand(seed, 4) * (50 + north * 170);
    const stretch = 1.2 + rand(seed, 5);
    // holes in one polygon must not overlap, or the overlap turns back to grass
    const reach = r * stretch * 1.3;
    if (taken.some(([te, tn, tr]) => Math.hypot(e - te, n - tn) < reach + tr)) continue;
    taken.push([e, n, reach]);
    const ring = isle(e, n, r, seed, stretch, rand(seed, 6) * 3);
    patches.push(roughen(ring, seed, { amount: 0.14, minLen: 26 }));
  }
  return patches;
}

function paintGround(b: SyntheticBuilder, land: Land): void {
  for (const shape of land.shapes) b.ground(G.Land, pathPQ(shape.ring));

  // snow north of a line just below the Wall; grass south of it, torn open in the North
  const line = roughen(
    drawn([
      [-66, 72],
      [-40, 71],
      [-33.5, 71],
      [-29, 72.6],
      [-20, 72.2],
      [-12, 73.2],
      [-6, 71.6],
      [0, 71.5],
      [20, 73],
      [310, 78],
    ]),
    7,
    { closed: false, amount: 0.05, minLen: 60 },
  );
  b.ground(
    G.Snow,
    pathPQ(
      drawn([
        [-66, 42],
        [310, 42],
        [310, 120],
        [-66, 120],
      ]),
    ),
  );
  b.ground(G.Meadow, [
    pathPQ([
      ...line,
      ...drawn([
        [310, -85],
        [-66, -85],
      ]),
    ]),
    ...snowPatches().map((patch) => pathPQ(patch)),
  ]);

  BIOMES.forEach((biome, i) => {
    const seed = hashString(biome.name ?? `biome ${i}`);
    b.ground(biome.kind, pathPQ(roughen(drawn(biome.ring), seed, BIOME_EDGE)));
  });
  for (const shape of land.shapes) {
    const island = shape.isle;
    if (!island || island.cover === undefined) continue;
    const ring = isleOf(island.e, island.n, island.r * 0.84, shape.seed, island.stretch, island.turn);
    b.ground(island.cover, pathPQ(roughen(ring, shape.seed, { amount: 0.1, minLen: 20 })));
  }

  for (const lake of land.lakes)
    b.ground(G.Lake, lake.eye ? [pathPQ(lake.ring), pathPQ(lake.eye)] : pathPQ(lake.ring));
  for (const river of RIVERS) {
    const path = pathPQ(land.rivers.get(river.name)!);
    if (river.banks) b.line(G.Scrub, river.width + 26, path);
    b.line(G.Lake, river.width, path);
  }
}

// ---------------------------------------------------------------------------------------------
// places
// ---------------------------------------------------------------------------------------------

interface Placed {
  site: Site;
  e: number;
  n: number;
  p: number;
  q: number;
  /** Radius of the ground it takes. */
  r: number;
  seed: number;
  style: Style;
}

interface Ctx {
  b: SyntheticBuilder;
  land: Land;
  placed: Map<string, Placed>;
  /** Ground that is taken: [e, n, radius]. */
  claims: number[][];
}

const sizeOf = (site: Site): number => site.size ?? SIZE[site.kit];

function claimOf(site: Site): number {
  if (site.kit === "special") return SPECIAL[site.name]?.r ?? 60;
  const size = sizeOf(site);
  if (site.kit === "tower") return 30;
  if (site.kit === "castle" || site.kit === "greatcastle") return size * 1.16;
  return size * 1.06;
}

/** Put every place on dry ground, as near as may be to where it was sketched. */
function placeSites(land: Land): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  const wet: string[] = [];
  for (const site of SITES) {
    const r = claimOf(site);
    const fixed = site.kit === "special" && SPECIAL[site.name]?.fixed;
    // a weirwood grove on an island in a lake stays on it
    const still = fixed || site.name === "Isle of Faces";
    const [e, n] = still ? [site.e, site.n] : settle(land.mask, site.e, site.n, r);
    if (!still && !land.mask.has(e, n)) wet.push(site.name);
    const [p, q] = toPQ(e, n);
    placed.set(site.name, { site, e, n, p, q, r, seed: hashString(site.name), style: STYLES[site.style] });
  }
  if (wet.length > 0) throw new Error(`tinywesteros: in the water: ${wet.join(", ")}`);
  const list = [...placed.values()];
  const clash: string[] = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const c = list[j];
      if (Math.hypot(a.e - c.e, a.n - c.n) < a.r + c.r) clash.push(`${a.site.name} / ${c.site.name}`);
    }
  }
  if (clash.length > 0) throw new Error(`tinywesteros: on top of each other: ${clash.join(", ")}`);
  return placed;
}

const claimed = (claims: number[][], e: number, n: number, margin: number): boolean =>
  claims.some(([ce, cn, cr]) => Math.hypot(e - ce, n - cn) < cr + margin);

/** Which way the water lies from a walled place, for its piers. */
function portOf(
  land: Land,
  at: Placed,
  radius: number,
): { dp: number; dq: number; reach: number } | undefined {
  const water = nearestWater(land.mask, at.e, at.n, radius * 0.9, radius * 2.8);
  if (!water) return undefined;
  const [dp, dq] = gridDir(water.de, water.dn);
  return { dp, dq, reach: Math.max(44, water.dist - radius * 0.95 + 48) };
}

const dryAt =
  (land: Land, margin = 8) =>
  (p: number, q: number): boolean => {
    const [e, n] = toEN(p, q);
    return land.mask.holds(e, n, margin);
  };

const TYPE: Record<Kit, SyntheticPlaceType> = {
  castle: "landmark",
  greatcastle: "landmark",
  holdfast: "landmark",
  tower: "landmark",
  ruin: "landmark",
  village: "place",
  town: "place",
  port: "place",
  city: "place",
  portcity: "place",
  pyramid: "place",
  camp: "place",
  weirwood: "park",
  special: "landmark",
};

/** Build the model of a place that has no builder of its own. */
function buildKit(c: Ctx, at: Placed): void {
  const { b, land } = c;
  const { site, p, q, seed, style } = at;
  const size = sizeOf(site);
  const count = Math.round((size * size) / 230);
  switch (site.kit) {
    case "castle":
      castle(b, p, q, size, style, seed, { sides: seed % 4 === 0 ? 5 : 4, turn: (seed % 7) * 0.11 });
      break;
    case "greatcastle":
      castle(b, p, q, size, style, seed, { double: true, sides: 5, yard: 8 });
      break;
    case "holdfast":
      holdfast(b, p, q, size, style, seed);
      break;
    case "tower": {
      round(b, p, q, 9, 58, style.stone, { cone: style.cone });
      hall(b, p + 17, q + 9, 9, 5.5, 11, style.walls[0], style.roofs[0], { flat: style.flat });
      break;
    }
    case "ruin":
      ruin(b, p, q, size, style.stone, seed, 4 + (seed % 3), style.floor ?? G.Rock);
      break;
    case "village":
      city(b, p, q, size, style, seed, {
        open: true,
        houses: Math.max(8, count + 4),
        landmark: "none",
        houseSize: 6.5,
        ok: dryAt(land),
      });
      break;
    case "town":
    case "city":
      city(b, p, q, size, style, seed, {
        houses: count,
        landmark: seed % 3 === 0 ? "tower" : "keep",
        houseSize: 7,
        citadel: size > 100,
      });
      break;
    case "port":
    case "portcity":
      city(b, p, q, size, style, seed, {
        houses: count,
        landmark: site.kit === "portcity" ? "sept" : seed % 2 === 0 ? "tower" : "keep",
        houseSize: 7,
        citadel: size > 100,
        port: portOf(land, at, size),
        ok: dryAt(land),
      });
      break;
    case "pyramid":
      city(b, p, q, size, style, seed, {
        houses: count,
        landmark: "pyramid",
        tiers: [R.brickRed, R.ochre, R.yellowBrick],
        houseSize: 7,
        port: portOf(land, at, size),
        ok: dryAt(land),
      });
      break;
    case "camp":
      camp(b, p, q, size, seed, 16);
      break;
    case "weirwood":
      weirwoods(c, at);
      break;
    default:
      break;
  }
}

/** A weirwood: bone-white trunk, blood-red leaves. */
const weirwood = (b: SyntheticBuilder, p: number, q: number, size: number, base = 0): void =>
  bigTree(b, p, q, size, R.leafRed, R.weirwood, base);

function weirwoods(c: Ctx, at: Placed): void {
  const { b } = c;
  const { p, q, seed, style } = at;
  if (at.site.name === "High Heart") {
    // a hill crowned with a ring of stumps
    const top = crag(b, p, q, 44, 16, R.park, seed, 2, R.lawn);
    for (let i = 0; i < 13; i++) {
      const a = (i / 13) * Math.PI * 2;
      b.prism(p + Math.cos(a) * 17, q + Math.sin(a) * 17, 2.6, 7, top + 2.4, top, {
        wall: R.weirwood,
        roof: R.weirwood,
      });
    }
    return;
  }
  if (at.site.name === "Isle of Faces") {
    for (let i = 0; i < 13; i++) {
      const s = mix(seed, i);
      const a = rand(s, 1) * Math.PI * 2;
      const d = Math.sqrt(rand(s, 2)) * 27;
      weirwood(b, p + Math.cos(a) * d, q + Math.sin(a) * d, 11 + rand(s, 3) * 8);
    }
    return;
  }
  // a village around one great tree
  weirwood(b, p, q, 30);
  houses(b, p, q, 34, style, seed, { count: 6, size: 5.5, avoid: [[p, q, 13]] });
}

/** A tower that has started to come down: a shaft and a narrower, lopsided stump on top. */
function brokenTower(
  b: SyntheticBuilder,
  p: number,
  q: number,
  radius: number,
  height: number,
  wall: number,
  seed: number,
  base = 0,
): void {
  const shaft = height * (0.62 + rand(seed, 1) * 0.14);
  b.prism(p, q, radius, 10, base + shaft, base, {
    wall,
    roof: wall,
    glass: R.glassBlack,
    pattern: Pattern.Sparse,
  });
  const lean = radius * 0.24;
  b.prism(p + lean, q - lean * 0.6, radius * 0.72, 8, base + height * 0.9, base + shaft, {
    wall,
    roof: wall,
  });
  b.prism(p + lean * 1.7, q - lean, radius * 0.4, 6, base + height, base + height * 0.9, {
    wall,
    roof: wall,
  });
}

/** Tiers of wall under wide roofs, the last one peaked. */
function pagoda(
  b: SyntheticBuilder,
  p: number,
  q: number,
  half: number,
  tiers: number,
  tierH: number,
  wall: number,
  roof: number,
  base = 0,
): number {
  let at = base;
  for (let i = 0; i < tiers; i++) {
    const size = half * (1 - i * (0.62 / tiers));
    block(b, p, q, size, size, at + tierH, { wall, roof, glass: R.glassBlack, pattern: Pattern.Tall }, at);
    at += tierH;
    const eave = tierH * 0.3;
    if (i < tiers - 1) {
      block(b, p, q, size * 1.3, size * 1.3, at + eave, roof, at);
      at += eave;
    } else {
      b.volume(rect(p, q, size * 1.3, size * 1.3), at + tierH * 1.1, at, {
        wall: roof,
        roof,
        roofShape: Roof.Pyramid,
        roofH: tierH * 1.05,
      });
      at += tierH * 1.1;
    }
  }
  return at;
}

/** Slabs of fire lying on the ground. */
function lava(b: SyntheticBuilder, p: number, q: number, radius: number, seed: number): void {
  b.volume(polygon(p, q, radius, 9, seed, 0.4), 1.4, 0, {
    wall: R.flamboyant,
    roof: R.flamboyant,
    flags: F_NO_OUTLINE,
  });
  b.volume(polygon(p, q, radius * 0.5, 7, seed + 1, 0.35), 2, 0, {
    wall: R.ipeYellow,
    roof: R.ipeYellow,
    flags: F_NO_OUTLINE,
  });
}

/** A fort on the Wall: its ground, with the Wall to the north of it. */
const wallFort =
  (build: (c: Ctx, at: Placed) => void) =>
  (c: Ctx, at: Placed): void => {
    c.b.ground(G.DirtRoad, polygon(at.p, at.q, at.r, 12, at.seed, 0.06));
    build(c, at);
  };

const SPECIALS: Record<string, (c: Ctx, at: Placed) => void> = {
  "Fist of the First Men": ({ b }, at) => {
    const top = crag(b, at.p, at.q, 48, 34, R.greyStone, at.seed, 3, R.snow);
    wallRing(b, polygon(at.p, at.q, 26, 11, at.seed, 0.05), {
      height: 5,
      thickness: 3.4,
      wall: R.greyStone,
      towerRadius: 0,
      towerHeight: 0,
      bare: true,
      open: [4],
      base: top,
    });
  },

  "Castle Black": wallFort(({ b }, at) => {
    const st = at.style;
    const towers: [number, number, number, number][] = [
      [-30, -8, 9, 46],
      [12, -26, 7.5, 60],
      [34, 10, 8, 40],
      [-10, 30, 6.5, 34],
    ];
    for (const [dp, dq, r, h] of towers) round(b, at.p + dp, at.q + dq, r, h, st.stone);
    hall(b, at.p - 4, at.q + 2, 16, 8, 14, R.timber, R.roofBrown);
    hall(b, at.p + 20, at.q + 34, 12, 6, 11, R.timber, R.roofTar);
    hall(b, at.p - 36, at.q + 22, 10, 6, 10, R.brownstone, R.roofTar);
    houses(b, at.p, at.q, 50, st, at.seed, {
      count: 5,
      size: 5,
      avoid: [
        [at.p - 30, at.q - 8, 14],
        [at.p + 12, at.q - 26, 12],
        [at.p + 34, at.q + 10, 13],
        [at.p - 10, at.q + 30, 11],
        [at.p - 4, at.q + 2, 20],
        [at.p + 20, at.q + 34, 15],
        [at.p - 36, at.q + 22, 13],
      ],
    });
    // the switchback stair and the winch cage, up the face of the Wall
    const foot = WALL.n - WALL.thick / 2 - 7;
    const angle = Math.PI / 4;
    for (let i = 0; i < 10; i++) {
      const [sp, sq] = toPQ(at.e - 12 + (i % 2 === 0 ? -6 : 6), foot);
      block(b, sp, sq, 8, 2.4, 15 * (i + 1), R.timber, 15 * i, angle);
    }
    const [cp, cq] = toPQ(at.e + 20, foot);
    block(b, cp, cq, 2.2, 2, 152, R.steel, 0, angle);
  }),
  "The Shadow Tower": wallFort(({ b }, at) => {
    round(b, at.p, at.q, 11, 82, R.roofTar, { crown: true });
    hall(b, at.p + 20, at.q + 8, 11, 6, 11, R.timber, R.roofTar);
    hall(b, at.p - 16, at.q + 16, 9, 5, 9, R.darkStone, R.roofTar);
  }),
  "Eastwatch-by-the-Sea": wallFort(({ b }, at) => {
    holdfast(b, at.p, at.q, 36, at.style, at.seed, { palisade: R.darkStone, floor: -1 });
    const [dp, dq] = gridDir(1, -0.25);
    const [hp, hq] = toPQ(at.e + 44, at.n - 18);
    harbour(b, hp, hq, dp, dq, 40, 70, at.seed, R.roofTar);
  }),
  "The Nightfort": wallFort(({ b }, at) => {
    ruin(b, at.p, at.q, 46, R.darkStone, at.seed, 6, -1);
  }),
  Queensgate: wallFort(({ b }, at) => ruin(b, at.p, at.q, 26, R.darkStone, at.seed, 3, -1)),
  Oakenshield: wallFort(({ b }, at) => {
    round(b, at.p, at.q, 8, 40, R.darkStone);
    hall(b, at.p + 15, at.q + 8, 9, 5, 9, R.timber, R.roofTar);
  }),
  "Long Barrow": wallFort(({ b }, at) => holdfast(b, at.p, at.q, 26, at.style, at.seed, { floor: -1 })),

  Winterfell: (c, at) => {
    const { b } = c;
    const { p, q, seed, style } = at;
    castle(b, p, q, 96, style, seed, { double: true, sides: 6, yard: 9 });
    // the godswood in one corner of the inner ward: pines around the heart tree
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      bigTree(b, p + 37 + Math.cos(a) * 15, q + 37 + Math.sin(a) * 14, 13 + rand(seed, i) * 5, R.pine);
    }
    weirwood(b, p + 37, q + 37, 30);
    // the glass gardens, the broken tower, and the winter town outside the gate
    hall(b, p - 40, q + 26, 13, 6, 9, R.greyStone, R.glassGreen, { pattern: Pattern.Ribbon });
    brokenTower(b, p - 38, q - 40, 7, 50, R.darkStone, seed);
    const [tp, tq] = toPQ(at.e + 40, at.n - 175);
    b.ground(G.DirtRoad, polygon(tp, tq, 62, 12, seed + 9, 0.12));
    houses(b, tp, tq, 56, style, seed + 9, { count: 18, size: 6 });
    b.place({ n: "Winter town", t: "place", p: tp, q: tq, b: "Winterfell", r: 62, s: 1.5 });
    c.claims.push([at.e + 40, at.n - 175, 66]);
  },

  "Moat Cailin": ({ b }, at) => {
    const { p, q, seed } = at;
    // three towers left of twenty, in the bog: one squat, one leaning, one slender
    round(b, p - 22, q + 6, 14, 34, R.darkStone);
    for (let i = 0; i < 4; i++)
      b.prism(p + 16 + i * 2.6, q - 20 - i * 1.4, 9 - i * 0.5, 9, 13 * (i + 1), 13 * i, {
        wall: R.darkStone,
        roof: R.darkStone,
      });
    brokenTower(b, p + 26, q + 24, 6.5, 62, R.darkStone, seed);
    for (let i = 0; i < 12; i++) {
      const s = mix(seed, i);
      const a = rand(s, 1) * Math.PI * 2;
      const d = 20 + rand(s, 2) * 36;
      block(
        b,
        p + Math.cos(a) * d,
        q + Math.sin(a) * d,
        4 + rand(s, 3) * 5,
        3,
        2.5 + rand(s, 4) * 4,
        R.roofTar,
        0,
        a,
      );
    }
  },

  Pyke: (c, at) => {
    const { b, land } = c;
    const { seed, style } = at;
    // the keep on the shore, and three more on stacks out in the sea, bridge to bridge
    const water = nearestWater(land.mask, at.e, at.n, 12, 260) ?? { de: 0, dn: -1, dist: 80 };
    const e0 = at.e + water.de * (water.dist - 34);
    const n0 = at.n + water.dn * (water.dist - 34);
    const angle = gridAngle(water.de, water.dn);
    const stacks: [number, number, number, number][] = [
      [0, 32, 30, 38],
      [70, 21, 42, 30],
      [122, 17, 46, 24],
      [168, 13, 40, 44],
    ];
    let last: [number, number, number] | null = null;
    stacks.forEach(([out, r, h, tall], i) => {
      const [p, q] = toPQ(e0 + water.de * out, n0 + water.dn * out);
      const top = crag(b, p, q, r, h, R.darkStone, seed + i, 3);
      if (i === 0) keep(b, p, q, 13, tall, style, { base: top });
      else if (i === 3) round(b, p, q, 6.5, tall, R.darkStone, { base: top, cone: R.roofTar });
      else
        block(
          b,
          p,
          q,
          8,
          7,
          top + tall,
          { wall: R.darkStone, roof: R.roofTar, pattern: Pattern.Sparse },
          top,
        );
      if (last) {
        const span = Math.hypot(p - last[0], q - last[1]);
        const deck = Math.min(top, last[2]) - 1;
        block(
          b,
          (p + last[0]) / 2,
          (q + last[1]) / 2,
          span / 2,
          2.4,
          deck + 2.4,
          { wall: R.timber, roof: R.timber, flags: F_FLOATING },
          deck,
          angle,
        );
      }
      last = [p, q, top];
    });
    const [p, q] = toPQ(e0, n0);
    at.p = p;
    at.q = q;
  },

  "Nagga's Bones": ({ b }, at) => {
    // the ribs of a sea dragon, standing in two rows
    for (let i = 0; i < 7; i++) {
      for (const side of [-1, 1]) {
        const rp = at.p - 30 + i * 10;
        const rq = at.q + side * (13 - Math.abs(i - 3) * 1.4);
        b.prism(rp, rq, 2.4, 6, 22, 0, { wall: R.weirwood, roof: R.weirwood });
        b.prism(rp, rq - side * 3.4, 1.9, 6, 36, 22, { wall: R.weirwood, roof: R.weirwood });
      }
    }
  },

  Riverrun: ({ b, land }, at) => {
    const { p, q, seed } = at;
    // three-sided, between two rivers, a corner pointing downstream
    const style: Style = { ...at.style, stone: R.redStone, tower: R.redStone };
    castle(b, p, q, 44, style, seed, { sides: 3, turn: Math.PI / 4 - Math.PI / 3, keepHeight: 26, yard: 3 });
    // the third side is a moat cut from one river to the other
    const north = nearestOnPath(land.rivers.get("Red Fork")!, at.e - 62, at.n + 40);
    const south = nearestOnPath(land.rivers.get("Tumblestone")!, at.e - 62, at.n - 40);
    b.line(G.Lake, 12, pathPQ([north.x, north.y, at.e - 62, at.n, south.x, south.y]));
  },

  "The Twins": ({ b, land }, at) => {
    const { seed, style } = at;
    const here = nearestOnPath(land.rivers.get("Green Fork")!, at.e, at.n);
    // across the river: the normal with east in it
    const ne = here.ty > 0 ? here.ty : -here.ty;
    const nn = here.ty > 0 ? -here.tx : here.tx;
    const [cp, cq] = toPQ(here.x, here.y);
    const angle = gridAngle(ne, nn);
    const off = 20 / 2 + 58;
    for (const side of [-1, 1]) {
      const [p, q] = toPQ(here.x + ne * off * side, here.y + nn * off * side);
      castle(b, p, q, 40, style, seed + side, { keepHeight: 30, yard: 3, turn: angle });
    }
    block(b, cp, cq, off - 36, 6, 13, { wall: R.greyStone, roof: R.cobble, flags: F_FLOATING }, 9, angle);
    for (const t of [-0.5, 0.5]) {
      const [p, q] = toPQ(here.x + ne * t * 20, here.y + nn * t * 20);
      block(b, p, q, 3, 6, 9, R.greyStone, 0, angle);
    }
    round(b, cp, cq, 8.5, 34, style.stone, { base: 13, cone: style.cone });
    at.p = cp;
    at.q = cq;
  },

  Harrenhal: (c, at) => {
    const { b } = c;
    const { p, q, seed } = at;
    b.ground(G.Rock, polygon(p, q, 160, 14, seed, 0.05));
    wallRing(b, polygon(p, q, 146, 5, seed, 0.06), {
      height: 34,
      thickness: 16,
      wall: R.darkStone,
      towerRadius: 15,
      towerHeight: 50,
      gates: [4],
    });
    // five towers, each one melted out of true
    const names = ["Kingspyre Tower", "Widow's Tower", "Tower of Dread", "Wailing Tower", "Tower of Ghosts"];
    const heights = [176, 128, 150, 112, 138];
    names.forEach((name, i) => {
      const a = (i / 5) * Math.PI * 2 + 0.5;
      const tp = p + Math.cos(a) * 76;
      const tq = q + Math.sin(a) * 76;
      const r = 23 + rand(seed, i) * 9;
      const h = heights[i];
      const wall = i % 2 === 0 ? R.darkStone : R.roofTar;
      b.prism(tp, tq, r, 12, h * 0.52, 0, { wall, roof: wall, glass: R.glassBlack, pattern: Pattern.Sparse });
      b.prism(tp + r * 0.14, tq - r * 0.1, r * 0.84, 10, h * 0.8, h * 0.52, { wall, roof: wall });
      b.prism(tp + r * 0.32, tq - r * 0.2, r * 0.58, 8, h * 0.94, h * 0.8, { wall, roof: wall });
      b.prism(tp + r * 0.52, tq - r * 0.3, r * 0.3, 6, h, h * 0.94, { wall, roof: wall });
      b.place({ n: name, t: "landmark", p: tp, q: tq, b: "Harrenhal", r: 50, s: 2 });
    });
    // the Hall of a Hundred Hearths and the godswood
    hall(b, p, q, 34, 15, 30, R.darkStone, R.roofSlate, { pattern: Pattern.Tall });
    for (let i = 0; i < 7; i++)
      bigTree(b, p - 100 + rand(seed, i + 20) * 34, q + 74 + rand(seed, i + 30) * 30, 10, R.leafDark);
    weirwood(b, p - 84, q + 90, 15);
  },

  "The Eyrie": (c, at) => {
    const { b } = c;
    const { p, q, seed, style } = at;
    // the Giant's Lance, and the castle on its shoulder: seven slim white towers
    const top = crag(b, p, q, 72, 250, R.greyStone, seed, 6, R.snow);
    block(b, p, q, 13, 11, top + 26, { wall: R.whiteBrick, roof: R.roofSlate, pattern: Pattern.Tall }, top);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const tp = p + Math.cos(a) * 21;
      const tq = q + Math.sin(a) * 19;
      round(b, tp, tq, 4.6, 40 + (i % 3) * 9, R.whiteBrick, { base: top, cone: R.sidingBlue, coneRise: 2.6 });
    }
    // Alyssa's Tears down the face, and the Gates of the Moon at the foot
    block(
      b,
      p - 47,
      q + 47,
      1.6,
      1.2,
      150,
      { wall: R.foam, roof: R.foam, flags: F_NO_OUTLINE },
      0,
      Math.PI / 4,
    );
    const gp = p - 104;
    const gq = q + 62;
    castle(b, gp, gq, 30, style, seed + 3, { yard: 2 });
    b.place({ n: "Gates of the Moon", t: "landmark", p: gp, q: gq, b: "The Vale", r: 60, s: 1.5 });
    b.place({ n: "Giant's Lance", t: "park", p, q: q - 30, b: "The Vale", r: 58, s: 0.75 });
    const [ge, gn] = toEN(gp, gq);
    c.claims.push([ge, gn, 40]);
  },

  "Casterly Rock": ({ b }, at) => {
    const { p, q, seed } = at;
    const style: Style = { ...at.style, cone: R.gold };
    const top = crag(b, p, q, 104, 180, R.tan, seed, 5, R.limestone);
    castle(b, p, q, 40, style, seed, { base: top, keepHeight: 36, yard: 3 });
    // the Lion's Mouth, at the foot
    block(
      b,
      p - 62,
      q + 62,
      16,
      6,
      30,
      { wall: R.limestone, roof: R.gold, pattern: Pattern.Tall },
      0,
      Math.PI / 4,
    );
  },

  "King's Landing": (c, at) => {
    const { b, land } = c;
    const { p, q, seed, style } = at;
    const hills: [string, number, number, number, number][] = [
      ["Red Keep", 96, -92, 54, 24],
      ["Great Sept of Baelor", -86, -30, 40, 14],
      ["Dragonpit", 10, 96, 44, 17],
    ];
    const spots = hills.map(([name, de, dn, r, h]) => {
      const [hp, hq] = toPQ(at.e + de, at.n + dn);
      return { name, hp, hq, r, h };
    });
    city(b, p, q, 186, style, seed, {
      houses: 190,
      houseSize: 6.5,
      landmark: "none",
      wallHeight: 17,
      port: portOf(land, at, 186),
      avoid: spots.map((s) => [s.hp, s.hq, s.r + 4]),
      ok: dryAt(land),
    });
    // Aegon's High Hill: the Red Keep
    const keepHill = spots[0];
    const red: Style = { ...style, stone: R.redStone, tower: R.redStone, cone: R.roofRed, roof: R.roofRed };
    const top = crag(b, keepHill.hp, keepHill.hq, keepHill.r, keepHill.h, R.tan, seed + 1, 2, R.cobble);
    castle(b, keepHill.hp, keepHill.hq, 42, red, seed + 1, { base: top, keepHeight: 44, yard: 4, sides: 5 });
    // Visenya's Hill: the Great Sept, a dome of marble and seven crystal towers
    const sept = spots[1];
    const septTop = crag(b, sept.hp, sept.hq, sept.r, sept.h, R.tan, seed + 2, 2, R.plaza);
    dome(b, sept.hp, sept.hq, 19, 32, R.whiteBrick, R.glassSilver, septTop);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const tp = sept.hp + Math.cos(a) * 28;
      const tq = sept.hq + Math.sin(a) * 28;
      round(b, tp, tq, 3.4, 44, R.whiteBrick, {
        base: septTop,
        cone: R.glassSilver,
        coneRise: 3,
        crown: false,
      });
    }
    // Rhaenys's Hill: the Dragonpit, its dome fallen in
    const pit = spots[2];
    const pitTop = crag(b, pit.hp, pit.hq, pit.r, pit.h, R.tan, seed + 3, 2, R.gravel);
    for (let i = 0; i < 14; i++) {
      if (i === 3 || i === 4 || i === 10) continue;
      const a = (i / 14) * Math.PI * 2;
      const wp = pit.hp + Math.cos(a) * 28;
      const wq = pit.hq + Math.sin(a) * 28;
      block(b, wp, wq, 6.6, 3.4, pitTop + 16 + (i % 3) * 5, R.darkStone, pitTop, a + Math.PI / 2);
    }
    const ranks = [92, 88, 86];
    spots.forEach((s, i) =>
      b.place({ n: s.name, t: "landmark", p: s.hp, q: s.hq, b: "King's Landing", r: ranks[i], s: 1.5 }),
    );
  },

  Dragonstone: ({ b }, at) => {
    const { seed } = at;
    // the Dragonmont smoking over the island, and the black castle on the shore under it
    const [mp, mq] = toPQ(at.e + 34, at.n + 40);
    peak(b, mp, mq, 78, 200, R.roofTar, seed, R.flamboyant);
    const [p, q] = toPQ(at.e - 50, at.n - 44);
    const style: Style = {
      ...at.style,
      stone: R.roofTar,
      tower: R.roofTar,
      cone: R.darkStone,
      roof: R.darkStone,
    };
    const top = crag(b, p, q, 50, 16, R.darkStone, seed + 1, 2);
    castle(b, p, q, 38, style, seed, { base: top, keepHeight: 20, yard: 2, sides: 5 });
    // the Stone Drum
    round(b, p - 6, q - 4, 12, 52, R.roofTar, { base: top });
    at.p = p;
    at.q = q;
    b.place({ n: "Dragonmont", t: "park", p: mp, q: mq, b: "Dragonstone", r: 70, s: 0.75 });
  },

  "Storm's End": ({ b }, at) => {
    const { p, q, seed } = at;
    // one curtain wall with no way in to be seen, and one colossal drum tower
    const top = crag(b, p, q, 60, 24, R.greyStone, seed, 2, R.cobble);
    wallRing(b, polygon(p, q, 48, 14, seed, 0.02), {
      height: 30,
      thickness: 12,
      wall: R.greyStone,
      towerRadius: 0,
      towerHeight: 0,
      bare: true,
      base: top,
    });
    const tip = round(b, p, q, 23, 104, R.greyStone, { base: top, sides: 16 });
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      block(b, p + Math.cos(a) * 24, q + Math.sin(a) * 24, 3, 3, tip + 8, R.greyStone, tip - 2, a);
    }
    hall(b, p + 30, q + 16, 8, 5, 10, R.greyStone, R.roofSlate, { base: top });
  },

  Highgarden: (c, at) => {
    const { b } = c;
    const { p, q, seed, style } = at;
    // three rings of white wall climbing a green hill, a maze of briar between the outer two
    b.ground(G.Garden, polygon(p, q, 190, 16, seed, 0.12));
    const tiers: [number, number, number][] = [
      [122, 9, R.park],
      [84, 18, R.lawn],
      [52, 27, R.plaza],
    ];
    tiers.forEach(([r, h, top], i) => {
      b.prism(p, q, r, 20, h, i === 0 ? 0 : tiers[i - 1][1], { wall: R.limestone, roof: top });
      wallRing(b, polygon(p, q, r - 5, 12, seed, 0.02), {
        height: 11 + i * 3,
        thickness: 5,
        wall: R.whiteBrick,
        cone: i === 2 ? R.roofCopper : R.roofGreen,
        towerRadius: 5 + i * 0.5,
        towerHeight: 20 + i * 6,
        gates: [2 + i],
        base: h,
      });
    });
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * Math.PI * 2 + 0.1;
      bigTree(
        b,
        p + Math.cos(a) * 101,
        q + Math.sin(a) * 101,
        7,
        pick([R.rose, R.ipePink, R.leafLight], seed, i),
        R.leafDark,
        9,
      );
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      bigTree(
        b,
        p + Math.cos(a) * 66,
        q + Math.sin(a) * 66,
        9,
        i % 4 === 0 ? R.ipeYellow : R.leafLight,
        R.timber,
        18,
      );
    }
    keep(b, p - 6, q - 4, 15, 46, style, { base: 27 });
    for (const [dp, dq, h] of [
      [22, -20, 78],
      [-28, 16, 66],
      [14, 26, 58],
    ])
      round(b, p + dp, q + dq, 4.6, h, R.whiteBrick, { base: 27, cone: R.roofCopper, coneRise: 2.6 });
    dome(b, p + 24, q + 6, 9, 20, R.whiteBrick, R.roofGreen, 27);
  },

  Oldtown: (c, at) => {
    const { b, land } = c;
    const { p, q, seed, style } = at;
    const size = 164;
    const port = portOf(land, at, size);
    city(b, p, q, size, { ...style, stone: R.limestone }, seed, {
      houses: 150,
      houseSize: 6.5,
      landmark: "sept",
      citadel: true,
      wallHeight: 16,
      port,
      ok: dryAt(land),
    });
    b.place({
      n: "The Citadel",
      t: "museum",
      p: p - size * 0.46,
      q: q + size * 0.3,
      b: "Oldtown",
      r: 86,
      s: 1.5,
    });
    b.place({
      n: "Starry Sept",
      t: "landmark",
      p: p + size * 0.1,
      q: q - size * 0.12,
      b: "Oldtown",
      r: 70,
      s: 1.5,
    });
    // the Hightower, on Battle Island out in the sound
    const [he, hn] = openWaterNear(land, -31.5 * EAST, -30.7 * NORTH, 46, 400);
    const [tp, tq] = toPQ(he, hn);
    const island = polygon(tp, tq, 36, 10, seed + 5, 0.1);
    b.ground(G.Land, island);
    b.ground(G.Rock, island);
    block(b, tp, tq, 22, 22, 26, { wall: R.roofTar, roof: R.darkStone, pattern: Pattern.Sparse }, 0);
    let base = 26;
    for (const r of [15, 12.6, 10.4, 8.4, 6.6]) {
      round(b, tp, tq, r, 60, R.whiteBrick, { base, sides: 12 });
      base += 60;
    }
    b.prism(tp, tq, 5, 8, base + 12, base, { wall: R.gold, roof: R.gold });
    b.prism(tp, tq, 4.4, 8, base + 30, base + 12, {
      wall: R.flamboyant,
      roof: R.flamboyant,
      roofShape: Roof.Pyramid,
      roofH: 18,
      flags: F_NO_OUTLINE,
    });
    b.place({ n: "The Hightower", t: "landmark", p: tp, q: tq, b: "Oldtown", r: 93, s: 1 });
  },

  Sunspear: (c, at) => {
    const { b, land } = c;
    const { p, q, seed, style } = at;
    castle(b, p, q, 56, style, seed, { sides: 5, keepHeight: 30, yard: 5 });
    // the Tower of the Sun under its golden dome, and the Spear Tower
    dome(b, p + 18, q - 26, 12, 40, R.yellowBrick, R.gold);
    round(b, p - 30, q - 6, 5.2, 132, R.cream, { cone: R.gold, coneRise: 4 });
    // the shadow city huddled against the walls on the landward side
    const inland = nearestWater(land.mask, at.e, at.n, 40, 400) ?? { de: 1, dn: 0, dist: 100 };
    const [sp, sq] = toPQ(at.e - inland.de * 132, at.n - inland.dn * 132);
    b.ground(G.Sand, polygon(sp, sq, 70, 12, seed + 4, 0.12));
    houses(b, sp, sq, 66, style, seed + 4, { count: 30, size: 6, ok: dryAt(land) });
    b.place({ n: "Shadow city", t: "place", p: sp, q: sq, b: "Sunspear", r: 60, s: 1.5 });
    const [se, sn] = toEN(sp, sq);
    c.claims.push([se, sn, 72]);
    const port = portOf(land, at, 56);
    if (port) harbour(b, p + port.dp * 58, q + port.dq * 58, port.dp, port.dq, 50, port.reach, seed);
  },

  "Water Gardens": ({ b }, at) => {
    const { p, q, seed } = at;
    // a pleasure palace of pink marble among pools and blood orange trees
    b.ground(G.Lawn, polygon(p, q, 44, 12, seed, 0.06));
    for (const [dp, dq] of [
      [-16, 14],
      [8, 22],
      [22, -4],
    ])
      b.ground(G.Pool, rect(p + dp, q + dq, 9, 5));
    hall(b, p - 6, q - 16, 20, 8, 14, R.rose, R.roofTerracotta, { pattern: Pattern.Tall });
    dome(b, p - 6, q - 16, 7, 26, R.rose, R.roofWhite);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      bigTree(b, p + Math.cos(a) * 36, q + Math.sin(a) * 36, 7, i % 3 === 0 ? R.leafAutumn : R.leafLight);
    }
  },

  Braavos: (c, at) => {
    const { b, land } = c;
    const { seed, style } = at;
    const isles = BRAAVOS_ISLES.map(([de, dn, r], i) => {
      const [p, q] = toPQ(BRAAVOS.e + de, BRAAVOS.n + dn);
      return { p, q, r, i };
    });
    // every isle paved and crowded with tall houses; a bridge to each neighbour
    land.shapes
      .filter((s) => s.seed >= 500 && s.seed < 500 + isles.length)
      .forEach((s) => b.ground(G.Cobble, pathPQ(s.ring)));
    for (const a of isles)
      for (const o of isles)
        if (a.i < o.i && Math.hypot(a.p - o.p, a.q - o.q) < 172) b.line(G.Pier, 5, [a.p, a.q, o.p, o.q]);
    const marks: (((p: number, q: number) => void) | null)[] = [
      // the Sealord's Palace
      (p, q) => {
        dome(b, p, q, 15, 34, R.limestone, R.roofCopper);
        round(b, p + 20, q - 6, 4, 46, R.limestone, { cone: R.roofCopper, coneRise: 2.4 });
        round(b, p - 18, q + 10, 4, 40, R.limestone, { cone: R.roofCopper, coneRise: 2.4 });
      },
      // the Iron Bank
      (p, q) => {
        block(b, p, q, 17, 12, 30, { wall: R.greyStone, roof: R.darkStone, pattern: Pattern.Tall });
        for (let i = 0; i < 5; i++)
          b.prism(p - 14 + i * 7, q + 14.5, 1.7, 6, 24, 0, { wall: R.limestone, roof: R.limestone });
      },
      // the Temple of the Moonsingers
      (p, q) => dome(b, p, q, 16, 30, R.whiteBrick, R.roofWhite),
      // the House of Black and White, on its knoll
      (p, q) => {
        const top = crag(b, p, q, 20, 9, R.greyStone, seed + 7, 2);
        block(b, p - 5, q, 5, 8, top + 22, R.roofTar, top);
        block(b, p + 5, q, 5, 8, top + 22, R.whiteBrick, top);
        b.volume(rect(p, q, 11, 9), top + 30, top + 22, {
          wall: R.roofTar,
          roof: R.roofTar,
          roofShape: Roof.Pitched,
          roofH: 8,
        });
      },
      // the Sept-Beyond-the-Sea
      (p, q) => {
        dome(b, p, q, 10, 24, R.cream, R.roofSlate);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          round(b, p + Math.cos(a) * 15, q + Math.sin(a) * 15, 2.2, 26, R.cream, {
            cone: R.roofSlate,
            crown: false,
          });
        }
      },
      null,
      // the Arsenal: sheds where a galley is built in a day
      (p, q) => {
        for (let i = 0; i < 3; i++) hall(b, p - 12 + i * 12, q, 4.6, 17, 11, R.brickDark, R.roofSlate);
      },
      null,
    ];
    const NAMES = [
      "Sealord's Palace",
      "Iron Bank",
      "Temple of the Moonsingers",
      "House of Black and White",
      "Sept-Beyond-the-Sea",
      "",
      "The Arsenal",
      "",
    ];
    for (const a of isles) {
      const mark = marks[a.i];
      mark?.(a.p, a.q);
      if (mark)
        b.place({
          n: NAMES[a.i],
          t: "landmark",
          p: a.p,
          q: a.q,
          b: "Braavos",
          r: a.i === 3 ? 88 : a.i === 1 ? 86 : 72,
          s: 2,
        });
      houses(b, a.p, a.q, a.r * 0.86, style, seed + a.i, {
        count: Math.round((a.r * a.r) / 120),
        size: 5.6,
        tall: 1.7,
        avoid: mark ? [[a.p, a.q, a.i === 0 ? 26 : 21]] : [],
        ok: dryAt(land, 7),
      });
    }
    // the Purple Harbor and the Ragman's
    const [hp, hq] = toPQ(BRAAVOS.e + 44, BRAAVOS.n + 150);
    const [dp, dq] = gridDir(0.5, 1);
    harbour(b, hp, hq, dp, dq, 60, 60, seed, R.brickDark);
    // the Titan, astride the way in
    const [tp, tq] = toPQ(BRAAVOS.e + TITAN.de, BRAAVOS.n + TITAN.dn);
    const bronze = R.glassBronze;
    for (const side of [-1, 1]) {
      const top = crag(b, tp + side * 30, tq, 24, 20, R.darkStone, seed + 40 + side, 2);
      block(b, tp + side * 30, tq, 9, 9, 122, R.darkStone, top);
    }
    block(b, tp, tq, 42, 12, 142, bronze, 118);
    block(b, tp, tq, 25, 11, 204, bronze, 142);
    block(b, tp, tq, 36, 10, 206, bronze, 190);
    block(b, tp, tq, 9, 9, 228, bronze, 206);
    block(b, tp, tq, 3, 11, 238, R.roofCopper, 228);
    block(b, tp + 40, tq, 5, 5, 252, bronze, 192);
    block(b, tp + 40, tq, 2.2, 2.2, 284, R.steel, 252);
    block(b, tp - 40, tq, 5, 6, 200, bronze, 150);
    b.place({ n: "Titan of Braavos", t: "landmark", p: tp, q: tq, b: "Braavos", r: 94, s: 1 });
    // the sweetwater river: an aqueduct in from the mainland
    const n = BRAAVOS.n + 40;
    let e = BRAAVOS.e + 150;
    const from = e;
    while (e < from + 420 && !land.mask.has(e, n)) e += 8;
    const span = e + 30 - from;
    const [ap, aq] = toPQ(from + span / 2, n);
    block(
      b,
      ap,
      aq,
      span / 2,
      2.6,
      21,
      { wall: R.greyStone, roof: R.waterShallow, flags: F_FLOATING },
      17,
      Math.PI / 4,
    );
    for (let d = 0; d <= span; d += 22) {
      const [pp, pq] = toPQ(from + d, n);
      block(b, pp, pq, 2.6, 2.6, 17, R.greyStone, 0, Math.PI / 4);
    }
  },

  Volantis: (c, at) => {
    const { b, land } = c;
    const { seed, style } = at;
    const here = nearestOnPath(land.rivers.get("The Rhoyne")!, at.e, at.n);
    const ee = here.ty > 0 ? here.ty : -here.ty;
    const en = here.ty > 0 ? -here.tx : here.tx;
    const angle = gridAngle(ee, en);
    const ok = dryAt(land);
    // east of the river: Old Volantis behind the Black Wall, and the sprawl around it
    const [op, oq] = toPQ(here.x + ee * 150, here.y + en * 150);
    b.ground(G.Cobble, polygon(op, oq, 230, 16, seed, 0.1));
    wallRing(b, polygon(op, oq, 92, 16, seed, 0.02), {
      height: 38,
      thickness: 17,
      wall: R.roofTar,
      towerRadius: 0,
      towerHeight: 0,
      bare: true,
    });
    const old: Style = {
      ...style,
      walls: [R.whiteBrick, R.cream, R.limestone],
      roofs: [R.gold, R.roofTerracotta],
    };
    dome(b, op, oq, 15, 34, R.whiteBrick, R.gold);
    houses(b, op, oq, 70, old, seed + 1, { count: 16, size: 9, avoid: [[op, oq, 22]] });
    houses(b, op, oq, 226, style, seed + 2, { count: 120, size: 6.5, avoid: [[op, oq, 108]], ok });
    b.place({ n: "Black Wall", t: "landmark", p: op, q: oq, b: "Volantis", r: 88, s: 1.5 });
    // west of it: the temple of the Lord of Light, bigger than any other
    const [wp, wq] = toPQ(here.x - ee * 142, here.y - en * 142);
    b.ground(G.Cobble, polygon(wp, wq, 128, 14, seed + 3, 0.1));
    const [rp, rq] = toPQ(here.x - ee * 170, here.y - en * 170 + 30);
    ziggurat(b, rp, rq, 36, 92, 7, [R.roofRed, R.flamboyant, R.ochre, R.gold]);
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ]) {
      const tip = round(b, rp + su * 38, rq + sv * 38, 4, 54, R.roofRed, { crown: false });
      b.prism(rp + su * 38, rq + sv * 38, 3.4, 6, tip + 9, tip, {
        wall: R.ipeYellow,
        roof: R.ipeYellow,
        roofShape: Roof.Pyramid,
        roofH: 9,
      });
    }
    houses(b, wp, wq, 124, style, seed + 4, { count: 56, size: 6.5, avoid: [[rp, rq, 56]], ok });
    b.place({ n: "Temple of the Lord of Light", t: "landmark", p: rp, q: rq, b: "Volantis", r: 80, s: 1.5 });
    // the Long Bridge between them, lined with shops
    const [bp, bq] = toPQ(here.x, here.y);
    block(b, bp, bq, 50, 8, 13, { wall: R.roofTar, roof: R.cobble, flags: F_FLOATING }, 9, angle);
    for (const t of [-0.5, 0, 0.5]) {
      const [pp, pq] = toPQ(here.x + ee * t * 34, here.y + en * t * 34);
      block(b, pp, pq, 3, 8, 9, R.roofTar, 0, angle);
    }
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const [sp, sq] = toPQ(here.x + ee * i * 11, here.y + en * i * 11);
      block(
        b,
        sp,
        sq,
        4,
        3,
        21,
        { wall: R.ochre, roof: R.roofTerracotta, pattern: Pattern.House },
        13,
        angle,
      );
    }
    b.place({ n: "Long Bridge", t: "bridge", p: bp, q: bq, b: "Volantis", r: 78, s: 2 });
    const water = nearestWater(land.mask, here.x - ee * 142, here.y - en * 142 - 60, 30, 400);
    if (water) {
      const [dp, dq] = gridDir(water.de, water.dn);
      const [hp, hq] = toPQ(
        here.x - ee * 142 + water.de * (water.dist - 20),
        here.y - en * 142 - 60 + water.dn * (water.dist - 20),
      );
      harbour(b, hp, hq, dp, dq, 90, 70, seed);
    }
    at.p = bp;
    at.q = bq;
    const [oe, on] = toEN(op, oq);
    const [we, wn] = toEN(wp, wq);
    c.claims.push([oe, on, 236], [we, wn, 134]);
  },

  Norvos: (c, at) => {
    const { b } = c;
    const { p, q, seed, style } = at;
    // the low town by the river, and the high town of the bearded priests on its hill
    city(b, p, q, 84, style, seed, { houses: 30, houseSize: 6.5, landmark: "none" });
    const [hp, hq] = toPQ(at.e + 20, at.n + 150);
    const top = crag(b, hp, hq, 58, 34, R.greyStone, seed + 1, 3, R.cobble);
    castle(b, hp, hq, 38, style, seed + 1, { base: top, keepHeight: 26, yard: 2 });
    // the three bells
    for (const [dp, dq, h] of [
      [-16, 22, 60],
      [20, 12, 52],
      [8, -24, 46],
    ])
      round(b, hp + dp, hq + dq, 4.4, h, R.greyStone, { base: top, cone: R.roofCopper, coneRise: 2 });
    c.claims.push([at.e + 20, at.n + 150, 64]);
  },

  Qohor: ({ b }, at) => {
    city(b, at.p, at.q, 100, at.style, at.seed, {
      houses: 44,
      houseSize: 6.5,
      landmark: "pyramid",
      tiers: [R.roofTar, R.darkStone],
    });
  },

  "Vaes Dothrak": (c, at) => {
    const { b } = c;
    const { seed } = at;
    // no walls: a godsway from the horse gate towards the Mother of Mountains, and along it the
    // halls and the plunder of every people the horselords have met
    const dir = [0.84, 0.54];
    const side = [-dir[1], dir[0]];
    const at0 = (along: number, off: number): [number, number] =>
      toPQ(at.e + dir[0] * along + side[0] * off, at.n + dir[1] * along + side[1] * off);
    b.line(G.DirtRoad, 26, [...at0(-300, 0), ...at0(300, 0)]);
    for (const s of [-1, 1]) {
      // a stallion rearing: hind legs, a body rising in steps, the head high over the road
      const steps: [number, number, number][] = [
        [34, 0, 30],
        [26, 24, 48],
        [17, 42, 64],
        [8, 58, 76],
      ];
      steps.forEach(([off, base, top], i) => {
        const [sp, sq] = at0(-300, s * off);
        block(b, sp, sq, i === 0 ? 4 : 6, 4, top, R.glassBronze, base, gridAngle(side[0], side[1]));
      });
    }
    const kinds = STYLES;
    for (let i = 0; i < 46; i++) {
      const s = mix(seed, i);
      const along = -260 + (i / 46) * 540 + (rand(s, 1) - 0.5) * 10;
      const off = (i % 2 === 0 ? 1 : -1) * (26 + rand(s, 2) * 74);
      const [hp, hq] = at0(along, off);
      const roll = s % 6;
      if (roll === 0)
        b.prism(hp, hq, 7, 7, 9, 0, { wall: R.tan, roof: R.cream, roofShape: Roof.Pyramid, roofH: 7.5 });
      else if (roll === 1) hall(b, hp, hq, 13, 6, 9, R.timber, R.thatch);
      else if (roll === 2) ziggurat(b, hp, hq, 7, 13, 3, [R.limestone, R.ochre]);
      else if (roll === 3) {
        b.prism(hp, hq, 2.4, 6, 24, 0, { wall: R.greyStone, roof: R.greyStone });
        b.prism(hp, hq, 3.4, 6, 30, 24, { wall: R.gold, roof: R.gold });
      } else {
        const from = pick([kinds.free, kinds.ghis, kinds.qarth, kinds.yiti, kinds.sarnor], s, 5);
        hall(b, hp, hq, 9, 6, 10, pick(from.walls, s, 6), pick(from.roofs, s, 7), { flat: from.flat });
      }
    }
    const [mp, mq] = at0(120, 120);
    camp(b, mp, mq, 44, seed + 1, 18);
    const [np, nq] = at0(-130, -124);
    camp(b, np, nq, 44, seed + 2, 18);
    const [dp, dq] = at0(300, 0);
    hall(b, dp, dq, 30, 12, 15, R.timber, R.thatch, { angle: gridAngle(side[0], side[1]) });
    const [gp, gq] = at0(-300, 0);
    b.place({ n: "Horse Gate", t: "landmark", p: gp, q: gq, b: "Vaes Dothrak", r: 76, s: 2 });
    for (const along of [-240, 240]) c.claims.push([at.e + dir[0] * along, at.n + dir[1] * along, 110]);
  },

  Valyria: ({ b }, at) => {
    const { p, q, seed } = at;
    // towers of fused black stone, twisted and broken, among rivers of fire
    for (let i = 0; i < 11; i++) {
      const s = mix(seed, i);
      const a = (i / 11) * Math.PI * 2 + rand(s, 1) * 0.4;
      const d = 18 + rand(s, 2) * 62;
      brokenTower(
        b,
        p + Math.cos(a) * d,
        q + Math.sin(a) * d,
        5 + rand(s, 3) * 5,
        50 + rand(s, 4) * 100,
        R.roofTar,
        s,
      );
    }
    for (let i = 0; i < 6; i++) {
      const s = mix(seed, i + 50);
      const a = rand(s, 1) * Math.PI * 2;
      lava(
        b,
        p + Math.cos(a) * (30 + rand(s, 2) * 50),
        q + Math.sin(a) * (30 + rand(s, 2) * 50),
        9 + rand(s, 3) * 9,
        s,
      );
    }
    ziggurat(b, p, q, 20, 30, 4, [R.roofTar, R.darkStone]);
  },

  Meereen: (c, at) => {
    const { b, land } = c;
    const { p, q, seed, style } = at;
    const size = 200;
    const bricks = [R.brickRed, R.ochre, R.yellowBrick, R.salmon, R.sidingBlue, R.cream, R.roofGreen, R.rose];
    const great: [number, number, number] = [p + 24, q - 30, 92];
    const small: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3;
      const d = size * (0.52 + rand(seed, i) * 0.22);
      small.push([p + Math.cos(a) * d, q + Math.sin(a) * d, 20 + rand(seed, i + 20) * 10]);
    }
    const kept = small.filter(([sp, sq, r]) => Math.hypot(sp - great[0], sq - great[1]) > r + 96);
    const pit: [number, number, number] = [p - 70, q + 44, 34];
    const graces: [number, number, number] = [p - 40, q - 76, 26];
    city(b, p, q, size, style, seed, {
      houses: 200,
      houseSize: 6.5,
      landmark: "none",
      wallHeight: 20,
      port: portOf(land, at, size),
      avoid: [great, pit, graces, ...kept.map(([sp, sq, r]) => [sp, sq, r * 1.5])],
      ok: dryAt(land),
    });
    // the Great Pyramid, in bricks of every colour
    const top = ziggurat(b, great[0], great[1], 64, 190, 11, bricks);
    b.prism(great[0], great[1], 6, 8, top + 12, top, {
      wall: R.gold,
      roof: R.gold,
      roofShape: Roof.Pyramid,
      roofH: 10,
    });
    kept.forEach(([sp, sq, r], i) =>
      ziggurat(b, sp, sq, r, r * 2.6, 6, [bricks[i % bricks.length], bricks[(i + 3) % bricks.length]]),
    );
    // Daznak's Pit: tiers of benches around the sand
    b.prism(pit[0], pit[1], 21, 14, 0.8, 0, { wall: R.sand, roof: R.sand, flags: F_NO_OUTLINE });
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      block(
        b,
        pit[0] + Math.cos(a) * 27,
        pit[1] + Math.sin(a) * 27,
        5.6,
        4.4,
        13,
        R.brickRed,
        0,
        a + Math.PI / 2,
      );
    }
    // the Temple of the Graces
    dome(b, graces[0], graces[1], 19, 36, R.cream, R.gold);
    b.place({
      n: "Great Pyramid of Meereen",
      t: "landmark",
      p: great[0],
      q: great[1],
      b: "Meereen",
      r: 93,
      s: 1,
    });
    b.place({ n: "Daznak's Pit", t: "landmark", p: pit[0], q: pit[1], b: "Meereen", r: 72, s: 2 });
    b.place({
      n: "Temple of the Graces",
      t: "landmark",
      p: graces[0],
      q: graces[1],
      b: "Meereen",
      r: 70,
      s: 2,
    });
  },

  Yunkai: (c, at) => slaverCity(c, at, 130, [R.yellowBrick, R.ochre], 3),
  Astapor: (c, at) => {
    slaverCity(c, at, 150, [R.brickRed, R.roofRed], 4);
    // the Plaza of Pride: the harpy on her column
    const { b } = c;
    const hp = at.p - 60;
    const hq = at.q - 40;
    b.prism(hp, hq, 2.6, 8, 30, 0, { wall: R.brickRed, roof: R.brickRed });
    block(b, hp, hq, 5, 2, 38, R.gold, 30);
    b.place({ n: "Plaza of Pride", t: "landmark", p: hp, q: hq, b: "Astapor", r: 66, s: 2 });
  },

  "Old Ghis": ({ b }, at) => {
    const { p, q, seed } = at;
    // what dragonfire left: half a pyramid and a field of brick
    ruin(b, p, q, 84, R.brickRed, seed, 6, G.Sand);
    for (let i = 0; i < 4; i++) {
      const size = 46 * (1 - i * 0.14);
      block(b, p, q, size, size, 16 * (i + 1), i % 2 === 0 ? R.brickRed : R.ochre, 16 * i);
    }
    block(b, p + 12, q - 8, 18, 12, 76, R.brickDark, 64);
  },

  Qarth: (c, at) => {
    const { b, land } = c;
    const { p, q, seed, style } = at;
    // three walls: red sandstone, grey granite, black marble
    const port = portOf(land, at, 204);
    const walls: [number, number, number, number][] = [
      [204, 13, R.redStone, 7],
      [186, 19, R.greyStone, 8],
      [168, 26, R.roofTar, 9],
    ];
    const towers = [
      [p + 60, q - 70],
      [p - 80, q - 30],
      [p + 10, q + 84],
      [p - 50, q + 60],
      [p + 96, q + 20],
      [p - 10, q - 104],
    ];
    const hallAt: [number, number, number] = [p + 16, q - 20, 40];
    for (const [r, h, wall, tower] of walls.slice(0, 2)) {
      const ring = polygon(p, q, r, 14, seed, 0.03);
      wallRing(b, ring, {
        height: h,
        thickness: 7,
        wall,
        towerRadius: tower,
        towerHeight: h * 1.5,
        gates: [3, 10],
        open: port ? [facingEdge(ring, p, q, port.dp, port.dq)] : [],
      });
    }
    b.ground(G.Cobble, polygon(p, q, 204, 14, seed, 0.03));
    const inner: Style = { ...style, stone: R.roofTar, tower: R.roofTar };
    city(b, p, q, 168, inner, seed, {
      sides: 14,
      houses: 150,
      houseSize: 6.5,
      landmark: "none",
      wallHeight: 26,
      port: port ? { ...port, reach: port.reach + 40 } : undefined,
      avoid: [hallAt, ...towers.map(([tp, tq]) => [tp, tq, 10])],
      ok: dryAt(land),
    });
    // the Hall of a Thousand Thrones, and the slender towers of the Pureborn
    dome(b, hallAt[0], hallAt[1], 27, 50, R.cream, R.gold);
    towers.forEach(([tp, tq], i) =>
      round(b, tp, tq, 4.4, 70 + (i % 3) * 22, pick(style.walls, seed, i), { cone: R.gold, coneRise: 3 }),
    );
    // the House of the Undying, outside the walls among its black trees
    const [up, uq] = toPQ(at.e - 250, at.n + 150);
    if (land.mask.holds(at.e - 250, at.n + 150, 44)) {
      block(b, up, uq, 30, 11, 9, { wall: R.greyStone, roof: R.darkStone });
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        bigTree(b, up + Math.cos(a) * 34, uq + Math.sin(a) * 26, 9, R.carBlue, R.carBlack);
      }
      b.place({ n: "House of the Undying", t: "landmark", p: up, q: uq, b: "Qarth", r: 80, s: 2 });
      c.claims.push([at.e - 250, at.n + 150, 46]);
    }
    b.place({
      n: "Hall of a Thousand Thrones",
      t: "landmark",
      p: hallAt[0],
      q: hallAt[1],
      b: "Qarth",
      r: 72,
      s: 2,
    });
  },

  Yin: (c, at) => {
    const { b, land } = c;
    const { p, q, seed, style } = at;
    const palace: [number, number, number] = [p + 14, q - 20, 60];
    const lesser: [number, number, number][] = [
      [p - 84, q - 50, 20],
      [p + 96, q + 30, 20],
      [p - 30, q + 96, 20],
      [p + 60, q - 110, 20],
    ];
    city(b, p, q, 184, style, seed, {
      houses: 170,
      houseSize: 6.5,
      landmark: "none",
      wallHeight: 17,
      port: portOf(land, at, 184),
      avoid: [palace, ...lesser],
      ok: dryAt(land),
    });
    // the palace of the god-emperors, tier on tier under jade roofs
    block(b, palace[0], palace[1], 48, 48, 7, { wall: R.cream, roof: R.plaza });
    pagoda(b, palace[0], palace[1], 28, 6, 17, R.brickRed, R.roofGreen, 7);
    lesser.forEach(([lp, lq], i) =>
      pagoda(b, lp, lq, 11, 3 + (i % 2), 12, R.cream, i % 2 === 0 ? R.gold : R.roofGreen),
    );
    b.place({
      n: "Palace of the God-Emperors",
      t: "landmark",
      p: palace[0],
      q: palace[1],
      b: "Yin",
      r: 74,
      s: 1.5,
    });
  },

  "The Five Forts": (c, at) => {
    const { b } = c;
    // five of them in a line along the edge of the waste, each of one fused black stone
    for (let i = 0; i < 5; i++) {
      const e = at.e + (i - 2) * 125;
      const n = at.n + (i - 2) * 350;
      const [p, q] = toPQ(e, n);
      b.ground(G.Rock, polygon(p, q, 74, 12, at.seed + i, 0.05));
      block(b, p, q, 48, 48, 66, { wall: R.roofTar, roof: R.asphaltDark });
      for (const [su, sv] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ])
        block(b, p + su * 46, q + sv * 46, 14, 14, 82, { wall: R.roofTar, roof: R.asphaltDark });
      block(b, p, q, 20, 20, 104, { wall: R.asphaltDark, roof: R.roofTar, pattern: Pattern.Sparse }, 66);
      if (i !== 2) c.claims.push([e, n, 78]);
    }
  },

  Asshai: (c, at) => {
    const { b, land } = c;
    const { p, q, seed, style } = at;
    const size = 250;
    const spires: [number, number, number][] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + 0.2;
      const d = size * (0.2 + rand(seed, i) * 0.56);
      spires.push([p + Math.cos(a) * d, q + Math.sin(a) * d, 13]);
    }
    const temples: [number, number, number][] = [
      [p + 30, q - 40, 40],
      [p - 110, q + 70, 30],
      [p + 120, q + 90, 30],
    ];
    city(b, p, q, size, style, seed, {
      sides: 14,
      houses: 230,
      houseSize: 8.5,
      tall: 1.7,
      landmark: "none",
      wallHeight: 24,
      port: portOf(land, at, size),
      avoid: [...spires, ...temples],
      ok: dryAt(land),
    });
    // black stone that drinks the light; here and there a window burning green
    const lit: Look = { wall: R.roofTar, roof: R.asphaltDark, glass: R.glassTeal, pattern: Pattern.Tall };
    spires.forEach(([sp, sq], i) => {
      const h = 80 + rand(seed, i + 30) * 110;
      block(b, sp, sq, 7, 7, h, lit);
      b.volume(rect(sp, sq, 7.6, 7.6), h + 26, h, {
        wall: R.roofTar,
        roof: R.asphaltDark,
        roofShape: Roof.Pyramid,
        roofH: 25,
      });
    });
    temples.forEach(([tp, tq, r], i) =>
      ziggurat(
        b,
        tp,
        tq,
        r * 0.8,
        r * 1.5,
        5,
        i === 0 ? [R.roofTar, R.asphaltDark] : [R.darkStone, R.roofTar],
      ),
    );
  },
};

/** Astapor and Yunkai: one colour of brick each, a great pyramid and a few lesser ones. */
function slaverCity(c: Ctx, at: Placed, size: number, bricks: number[], lesser: number): void {
  const { b, land } = c;
  const { p, q, seed, style } = at;
  const great: [number, number, number] = [p + size * 0.1, q - size * 0.14, size * 0.36];
  const small: [number, number, number][] = [];
  for (let i = 0; i < lesser; i++) {
    const a = (i / lesser) * Math.PI * 2 + 1.9;
    small.push([p + Math.cos(a) * size * 0.58, q + Math.sin(a) * size * 0.58, size * 0.13]);
  }
  city(b, p, q, size, style, seed, {
    houses: Math.round((size * size) / 190),
    houseSize: 6.5,
    landmark: "none",
    port: portOf(land, at, size),
    avoid: [great, ...small.map(([sp, sq, r]) => [sp, sq, r * 1.5])],
    ok: dryAt(land),
  });
  ziggurat(b, great[0], great[1], size * 0.27, size * 0.7, 8, bricks);
  for (const [sp, sq, r] of small) ziggurat(b, sp, sq, r, r * 2.5, 5, bricks);
}

/** The nearest spot to a point with open water all round it, looking no further than `reach`. */
function openWaterNear(land: Land, e: number, n: number, clear: number, reach: number): [number, number] {
  for (let dist = 0; dist <= reach; dist += 10) {
    const turns = dist === 0 ? 1 : 20;
    for (let a = 0; a < turns; a++) {
      const angle = (a / turns) * Math.PI * 2;
      const we = e + Math.cos(angle) * dist;
      const wn = n + Math.sin(angle) * dist;
      if (isOpenWater(land, we, wn, clear)) return [we, wn];
    }
  }
  return [e, n];
}

/** Open water all round a point: nothing dry within `radius`. */
function isOpenWater(land: Land, e: number, n: number, radius: number): boolean {
  if (land.mask.has(e, n)) return false;
  for (let a = 0; a < 12; a++) {
    const angle = (a / 12) * Math.PI * 2;
    if (land.mask.has(e + Math.cos(angle) * radius, n + Math.sin(angle) * radius)) return false;
  }
  return true;
}

function buildSites(c: Ctx): void {
  const { b } = c;
  for (const at of c.placed.values()) {
    const { site } = at;
    if (site.kit === "special") {
      const build = SPECIALS[site.name];
      if (!build) throw new Error(`tinywesteros: no builder for ${site.name}`);
      build(c, at);
    } else buildKit(c, at);
    const s = at.r > 180 ? 0.5 : at.r > 100 ? 0.75 : at.r > 58 ? 1 : 1.5;
    b.place({ n: site.name, t: TYPE[site.kit], p: at.p, q: at.q, b: site.of, r: site.rank, s });
  }
}

// ---------------------------------------------------------------------------------------------
// the Wall, the mountains, the roads
// ---------------------------------------------------------------------------------------------

function raiseWall(b: SyntheticBuilder): void {
  const angle = Math.PI / 4;
  const ice: Look = { wall: R.sidingBlue, roof: R.snow };
  for (let e = WALL.west, i = 0; e < WALL.east; i++) {
    // blocks of ice of uneven length and height, their south faces in one plane
    const len = Math.min(46 + rand(76, i) * 70, WALL.east - e);
    const [p, q] = toPQ(e + len / 2, WALL.n);
    block(b, p, q, len / 2 + 0.5, WALL.thick / 2, 146 + rand(77, i) * 32, ice, 0, angle);
    // the foot of it, where the ice has slumped
    if (i % 3 !== 0) {
      const [fp, fq] = toPQ(e + len / 2, WALL.n - WALL.thick / 2 - 4);
      block(b, fp, fq, len / 2 + 0.5, 7 + rand(80, i) * 5, 14 + rand(78, i) * 30, ice, 0, angle);
    }
    e += len;
  }
  const [p, q] = toPQ((WALL.west + WALL.east) / 2, WALL.n);
  b.place({ n: "The Wall", t: "landmark", p, q, b: "The North", r: 99, s: 0.3 });
}

function raiseMountains(c: Ctx): number {
  const { b, land, claims } = c;
  const ok = (p: number, q: number, radius: number): boolean => {
    const [e, n] = toEN(p, q);
    if (!land.mask.holds(e, n, radius * 0.92)) return false;
    if (claimed(claims, e, n, radius + 10)) return false;
    // leave the passes open
    for (const road of land.roads) if (nearestOnPath(road, e, n).dist < radius + 9) return false;
    // nothing leans on the Wall
    if (e > WALL.west - 150 && e < WALL.east + 150 && Math.abs(n - WALL.n) < radius + 70) return false;
    return true;
  };
  let peaks = 0;
  for (const mountains of RANGES) {
    const path = pathPQ(units(mountains.path));
    peaks += range(b, path, {
      width: mountains.width,
      height: mountains.height,
      rock: mountains.rock,
      cap:
        mountains.capAbove !== undefined
          ? { above: mountains.capAbove, of: mountains.cap ?? R.snow }
          : undefined,
      floor: mountains.floor,
      spacing: mountains.spacing,
      seed: hashString(mountains.name),
      ok,
    });
    if (mountains.rank !== undefined) {
      const mid = Math.floor(mountains.path.length / 4) * 2;
      const [mp, mq] = toPQ(mountains.path[mid] * EAST, mountains.path[mid + 1] * NORTH);
      b.place({ n: mountains.name, t: "park", p: mp, q: mq, b: mountains.of, r: mountains.rank, s: 0.3 });
    }
  }
  // the Mother of Mountains, alone over the grass
  const mother = [171.6 * EAST, 31.6 * NORTH];
  const [mp, mq] = toPQ(mother[0], mother[1]);
  if (!claimed(claims, mother[0], mother[1], 220)) peak(b, mp, mq, 215, 430, R.greyStone, 9, R.snow);
  b.place({ n: "Mother of Mountains", t: "park", p: mp, q: mq, b: "Dothraki Sea", r: 82, s: 0.5 });
  // peaks on the islands that have them: fire on the black ones
  for (const shape of land.shapes) {
    const island = shape.isle;
    if (!island?.peaks) continue;
    const rock = island.rock ?? R.greyStone;
    for (let i = 0; i < island.peaks; i++) {
      const s = mix(shape.seed, i + 70);
      const a = rand(s, 1) * Math.PI * 2;
      const d = rand(s, 2) * island.r * 0.34;
      const e = (island.e + Math.cos(a) * d * (island.stretch ?? 1)) * EAST;
      const n = (island.n + Math.sin(a) * d) * NORTH;
      const radius = 44 + rand(s, 3) * 26;
      if (!land.mask.holds(e, n, radius * 0.9) || claimed(claims, e, n, radius + 8)) continue;
      const [p, q] = toPQ(e, n);
      peak(b, p, q, radius, radius * (1.5 + rand(s, 4)), rock, s, rock === R.roofTar ? R.flamboyant : R.snow);
      peaks++;
    }
  }
  return peaks;
}

function layRoads(c: Ctx): void {
  const { b, land, placed } = c;
  for (const road of ROADS) {
    const pts: number[] = [];
    for (const stop of road.via) {
      if (typeof stop === "string") {
        const at = placed.get(stop);
        if (!at) throw new Error(`tinywesteros: the ${road.name} goes to ${stop}, which is nowhere`);
        pts.push(at.e, at.n);
      } else pts.push(stop[0] * EAST, stop[1] * NORTH);
    }
    const rough = roughen(pts, hashString(road.name), { closed: false, amount: 0.05, minLen: 90 });
    const path = chaikin(rough, 1);
    land.roads.push(path);
    b.line(road.kind, road.width, pathPQ(path));
    if (road.rank !== undefined) {
      const mid = Math.floor(path.length / 4) * 2;
      const [p, q] = toPQ(path[mid], path[mid + 1]);
      b.place({ n: road.name, t: "street", p, q, b: road.of, r: road.rank, s: 0.4 });
    }
  }
}

// ---------------------------------------------------------------------------------------------
// life: hamlets, camps, ships, ice, the haunted forest
// ---------------------------------------------------------------------------------------------

/** Country with people in it, in steps of the sketch: [west, south, east, north, hamlets]. */
const SETTLED: [number, number, number, number, number][] = [
  [-44, -36, 22, 33, 150],
  [-42, 34, 10, 72, 46],
  [30, -18, 92, 33, 150],
  [106, -13, 150, 0, 24],
  [206, -14, 262, 14, 110],
];

function scatterLife(c: Ctx): void {
  const { b, land, claims, placed } = c;
  const sites = [...placed.values()];
  const ranges = RANGES.map((m) => ({ path: units(m.path), half: m.width / 2 }));
  const high = (e: number, n: number, margin: number): boolean =>
    ranges.some((m) => nearestOnPath(m.path, e, n).dist < m.half + margin);

  // hamlets, in the manner of whatever stands nearest
  SETTLED.forEach(([west, south, east, north, count], box) => {
    for (let i = 0; i < count; i++) {
      const s = mix(9000 + box, i);
      const e = (west + rand(s, 1) * (east - west)) * EAST;
      const n = (south + rand(s, 2) * (north - south)) * NORTH;
      if (!land.mask.holds(e, n, 40) || claimed(claims, e, n, 46) || high(e, n, 30)) continue;
      if (land.roads.some((road) => nearestOnPath(road, e, n).dist < 36)) continue;
      let near = sites[0];
      let best = Infinity;
      for (const at of sites) {
        const d = Math.hypot(at.e - e, at.n - n);
        if (d < best && at.site.style !== "watch" && at.site.style !== "valyria") {
          best = d;
          near = at;
        }
      }
      const [p, q] = toPQ(e, n);
      houses(b, p, q, 26, near.style, s, { count: 4 + (s % 4), size: 5.6 });
      claims.push([e, n, 30]);
    }
  });

  // khalasars on the grass, the Jogos Nhai on theirs, the free folk in the snow
  const camps: [number, number, number, number, number][] = [
    [95, 2, 182, 36, 12],
    [205, 24, 266, 38, 6],
    [-27, 79, -3, 100, 5],
  ];
  camps.forEach(([west, south, east, north, count], box) => {
    let made = 0;
    for (let i = 0; i < count * 4 && made < count; i++) {
      const s = mix(9500 + box, i);
      const e = (west + rand(s, 1) * (east - west)) * EAST;
      const n = (south + rand(s, 2) * (north - south)) * NORTH;
      if (!land.mask.holds(e, n, 56) || claimed(claims, e, n, 70) || high(e, n, 40)) continue;
      const [p, q] = toPQ(e, n);
      camp(b, p, q, 40, s, 14);
      claims.push([e, n, 50]);
      made++;
    }
  });

  // ships on the sea lanes
  ROUTES.forEach((route, r) => {
    const path = units(route.path);
    for (let i = 2; i + 2 < path.length; i += 4) {
      const e = (path[i] + path[i + 2]) / 2 + (rand(r, i) - 0.5) * 160;
      const n = (path[i + 1] + path[i + 3]) / 2 + (rand(r, i + 1) - 0.5) * 160;
      if (!isOpenWater(land, e, n, 60)) continue;
      const [p, q] = toPQ(e, n);
      const sail = pick([R.cream, R.whiteBrick, R.roofRed, R.sidingYellow], r, i);
      ship(b, p, q, 44, gridAngle(path[i + 2] - path[i], path[i + 3] - path[i + 1]), R.timber, sail);
    }
  });

  // ice adrift in the north
  for (let i = 0; i < 70; i++) {
    const s = mix(9900, i);
    const e = (-58 + rand(s, 1) * 130) * EAST;
    const n = (77 + rand(s, 2) * 32) * NORTH;
    if (!isOpenWater(land, e, n, 70)) continue;
    const [p, q] = toPQ(e, n);
    const r = 12 + rand(s, 3) * 22;
    peak(b, p, q, r, r * (0.7 + rand(s, 4) * 0.8), R.sidingBlue, s, R.snow);
  }

  // the haunted forest: trees standing in the snow, one by one
  const forest = pathPQ(
    roughen(
      drawn([
        [-25.6, 77.4],
        [-11.6, 77.2],
        [-7.6, 82],
        [-3, 84.6],
        [-4.6, 93],
        [-1.6, 99],
        [-6, 103],
        [-20, 101.6],
        [-26.4, 94],
        [-27, 85],
      ]),
      606,
      { amount: 0.1, minLen: 40 },
    ),
  );
  grove(b, forest, 60, 606, (p, q) => {
    const [e, n] = toEN(p, q);
    return land.mask.has(e, n) && !claimed(claims, e, n, 6);
  });
  const [fp, fq] = toPQ(-15 * EAST, 90 * NORTH);
  b.place({ n: "Haunted Forest", t: "park", p: fp, q: fq, b: "Beyond the Wall", r: 80, s: 0.3 });
}

// ---------------------------------------------------------------------------------------------
// names: regions, seas, rivers, islands
// ---------------------------------------------------------------------------------------------

/** The stretch of a roughened coast between two named corners, the way the coast runs. */
function coastBetween(ring: number[], corners: Corner[], from: string, to: string): number[] {
  const find = (tag: string): number => {
    const corner = corners.find((c) => c[2] === tag);
    if (!corner) throw new Error(`tinywesteros: no corner called ${tag}`);
    for (let i = 0; i < ring.length; i += 2)
      if (ring[i] === corner[0] * EAST && ring[i + 1] === corner[1] * NORTH) return i / 2;
    throw new Error(`tinywesteros: corner ${tag} is not on its coast`);
  };
  const a = find(from);
  const z = find(to);
  const n = ring.length / 2;
  const out: number[] = [];
  for (let i = a, k = 0; ; i = (i + 1) % n, k++) {
    // every other point is plenty for an outline; the ends are kept
    if (k % 2 === 0 || i === z) out.push(ring[i * 2], ring[i * 2 + 1]);
    if (i === z) break;
  }
  return out;
}

/** The outline of a region: coast where it has coast, a made-up border elsewhere. */
function regionRing(region: Region, land: Land): number[] {
  const coast = region.coast === "westeros" ? land.westeros : land.essos;
  const corners = region.coast === "westeros" ? WESTEROS : ESSOS;
  const out: number[] = [];
  const join = (x: number, y: number): void => {
    if (out.length === 0) {
      out.push(x, y);
      return;
    }
    const lx = out[out.length - 2];
    const ly = out[out.length - 1];
    if (lx === x && ly === y) return;
    const border = roughen([lx, ly, x, y], 97, { closed: false, amount: 0.07, minLen: 80 });
    out.push(...border.slice(2));
  };
  for (const piece of region.ring) {
    if (typeof piece === "string") {
      const [from, to] = piece.split(">");
      const stretch = coastBetween(coast, corners, from, to);
      join(stretch[0], stretch[1]);
      out.push(...stretch.slice(2));
    } else for (const [e, n] of piece) join(e * EAST, n * NORTH);
  }
  // back to the start: along the Wall the border is the Wall, straight
  const wall = out[1] === WALL.n && out[out.length - 1] === WALL.n;
  if (!wall) {
    const close = roughen([out[out.length - 2], out[out.length - 1], out[0], out[1]], 97, {
      closed: false,
      amount: 0.07,
      minLen: 80,
    });
    out.push(...close.slice(2, -2));
  }
  return out;
}

/** Keep an outline on the map. */
function onMap(ring: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < ring.length; i += 2) {
    out.push(
      Math.max(WORLD.west + 30, Math.min(WORLD.east - 30, ring[i])),
      Math.max(WORLD.south + 30, Math.min(WORLD.north - 30, ring[i + 1])),
    );
  }
  return out;
}

function nameTheWorld(c: Ctx): void {
  const { b, land, placed } = c;
  for (const region of REGIONS) b.hood(region.name, region.of, pathPQ(onMap(regionRing(region, land))));
  for (const group of ARCHIPELAGOS) {
    const ring = roughen(drawn(group.ring), hashString(group.name), { amount: 0.06, minLen: 80 });
    b.hood(group.name, group.of, pathPQ(onMap(ring)));
  }
  BIOMES.forEach((biome, i) => {
    if (!biome.name) return;
    const seed = hashString(biome.name ?? `biome ${i}`);
    const ring = roughen(drawn(biome.ring), seed, BIOME_EDGE);
    if (biome.as === "hood") {
      b.hood(biome.name, biome.of ?? "Essos", pathPQ(onMap(ring)));
      return;
    }
    let e = 0;
    let n = 0;
    for (const [ce, cn] of biome.ring) {
      e += (ce * EAST) / biome.ring.length;
      n += (cn * NORTH) / biome.ring.length;
    }
    const [p, q] = toPQ(e, n);
    b.place({ n: biome.name, t: "park", p, q, b: biome.of, r: biome.rank ?? 50, s: 0.4 });
  });
  // the Bone Mountains are a region too
  const bones = RANGES.find((m) => m.name === "Bone Mountains");
  if (bones) b.hood("The Bones", "Essos", pathPQ(ribbon(units(bones.path), bones.width * 1.1)));

  // islands that are not already a place by the same name
  const seen = new Set<string>([...placed.keys()]);
  const counts = new Map<string, number>();
  for (const island of ISLANDS) counts.set(island.name, (counts.get(island.name) ?? 0) + 1);
  for (const island of ISLANDS) {
    if (seen.has(island.name) || counts.get(island.name) !== 1) continue;
    seen.add(island.name);
    const [p, q] = toPQ(island.e * EAST, island.n * NORTH);
    b.place({ n: island.name, t: "place", p, q, b: island.of, r: island.r > 2 ? 66 : 48, s: 0.5 });
  }
  const [tp, tq] = toPQ(THOUSAND_ISLANDS.e * EAST, THOUSAND_ISLANDS.n * NORTH);
  b.place({ n: "Thousand Islands", t: "place", p: tp, q: tq, b: "Shivering Sea", r: 50, s: 0.3 });

  for (const lake of LAKES) {
    const [p, q] = toPQ(lake.e * EAST, lake.n * NORTH);
    b.place({ n: lake.name, t: "park", p, q, b: lake.of, r: lake.r > 1.4 ? 74 : 52, s: 0.5 });
  }
  for (const river of RIVERS) {
    if (river.rank === undefined) continue;
    const path = land.rivers.get(river.name)!;
    const mid = Math.floor(path.length / 4) * 2;
    const [p, q] = toPQ(path[mid], path[mid + 1]);
    b.place({ n: river.name, t: "place", p, q, b: river.of, r: river.rank, s: 0.4 });
  }
  for (const [name, e, n, of, rank, scale] of FEATURES) {
    const [p, q] = toPQ(e * EAST, n * NORTH);
    b.place({ n: name, t: "place", p, q, b: of, r: rank, s: scale });
  }
  for (const route of ROUTES) b.route(route.name, pathPQ(chaikin(units(route.path), 2)));
}

// ---------------------------------------------------------------------------------------------

function generate(b: SyntheticBuilder): void {
  const land = layLand();
  const placed = placeSites(land);
  const claims = [...placed.values()].map((at) => [at.e, at.n, at.r]);
  const c: Ctx = { b, land, placed, claims };

  b.limits(
    pathPQ([
      WORLD.west,
      WORLD.south,
      WORLD.east,
      WORLD.south,
      WORLD.east,
      WORLD.north,
      WORLD.west,
      WORLD.north,
    ]),
  );
  paintGround(b, land);
  layRoads(c);
  buildSites(c);
  raiseWall(b);
  raiseMountains(c);
  scatterLife(c);
  nameTheWorld(c);
}

const [startP, startQ] = toPQ(3 * EAST, 5 * NORTH);
const [cardP, cardQ] = toPQ(4 * EAST, 8 * NORTH);

export const tinywesteros = generatedCity({
  id: "tinywesteros",
  title: "Westeros and Essos",
  accent: "#d9b45a",
  betaDeg: 45,
  start: { p: startP, q: startQ, scale: 0.12 },
  card: { p: cardP, q: cardQ, shrink: 18 },
  // the frame cuts the edge; the fog only has to stay clear of it
  fog: { start: 80, end: 160 },
  framed: true,
  flora: "temperate",
  attribution: [
    "Unofficial fan-made map, generated by code",
    "Places from A Song of Ice and Fire © George R. R. Martin",
  ],
  generate,
});
