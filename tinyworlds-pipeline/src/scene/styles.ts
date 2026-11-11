import { nearestRamp, R } from "../render/palette.js";
import { pick, rand } from "./hash.js";
import { Pattern, Roof } from "./kinds.js";

/**
 * What a building looks like. There is no architecture in the data, only a footprint, a height
 * and sometimes a class, so the look is inferred the way you would guess walking past: small and
 * low is a house with a pitched roof, four to six storeys is a brick walk-up, a slab is postwar
 * white brick, a tall thin thing is glass.
 */
export interface StyleInput {
  seed: number;
  /** Top of the volume above ground, metres. */
  height: number;
  /** Bottom above ground (0 for whole buildings), metres. */
  base: number;
  /** Footprint area, m². */
  area: number;
  cls: string | null;
  subtype: string | null;
  roofShape: string | null;
  roofHeight: number | null;
  facadeColor: string | null;
  facadeMaterial: string | null;
  roofColor: string | null;
  isPart: boolean;
}

export interface Style {
  wall: number;
  roof: number;
  glass: number;
  pattern: Pattern;
  roofShape: Roof;
  /** Height of the roof form above the top of the walls, metres. */
  roofH: number;
}

/**
 * A city's building stock: which materials each kind of building may be made of, and how its
 * towers split between masonry, banded slabs and glass. The rules that sort a footprint into a
 * kind are shared; what the kinds look like is local.
 */
export interface StyleProfile {
  /** Narrow low-rises up to eight storeys. */
  rowWalls: number[];
  /** Wider low- and mid-rises. */
  midWalls: number[];
  /** Postwar slabs with banded windows. */
  slabWalls: number[];
  houseWalls: number[];
  houseRoofs: number[];
  /** A footprint this small and low (m²) is a house with a pitched roof. */
  houseMaxArea: number;
  flatRoofs: number[];
  /** Low shops and workshops: their roofs, and how many of them are pitched rather than flat. */
  lowRoofs: number[];
  lowPitched: number;
  towerRoofs: number[];
  glass: number[];
  stoneTowers: number[];
  industrialWalls: number[];
  industrialRoofs: number[];
  civicWalls: number[];
  sacredWalls: number[];
  sacredRoofs: number[];
  outbuildingWalls: number[];
  outbuildingRoofs: number[];
  windows: number[];
  /** 26–62 m: share that is masonry with punched windows, then share that is a banded slab; the rest is glass. */
  mid: [number, number];
  /** 62–125 m: share that is glass, then masonry; the rest is a banded slab. */
  high: [number, number];
  /** Above 125 m: share that is glass; the rest is masonry. */
  superTall: number;
}

/** New York: brick and brownstone rows, limestone and white-brick slabs, a lot of glass up high. */
export const NEW_YORK: StyleProfile = {
  rowWalls: [
    R.brickRed,
    R.brickRed,
    R.brownstone,
    R.brownstone,
    R.brickDark,
    R.tan,
    R.cream,
    R.rose,
    R.whiteBrick,
  ],
  midWalls: [
    R.brickRed,
    R.brickDark,
    R.tan,
    R.tan,
    R.cream,
    R.yellowBrick,
    R.whiteBrick,
    R.limestone,
    R.brownstone,
  ],
  slabWalls: [R.whiteBrick, R.whiteBrick, R.cream, R.greyStone, R.tan, R.rose, R.limestone],
  houseWalls: [
    R.whiteBrick,
    R.cream,
    R.sidingBlue,
    R.sidingYellow,
    R.sidingSage,
    R.greyStone,
    R.brickRed,
    R.tan,
    R.whiteBrick,
    R.rose,
  ],
  houseRoofs: [R.roofSlate, R.roofSlate, R.roofBrown, R.roofBrown, R.roofTar, R.roofRed, R.roofGravel],
  houseMaxArea: 260,
  flatRoofs: [R.roofTar, R.roofTar, R.roofGravel, R.roofGravel, R.roofSilver, R.roofSilver, R.roofWhite],
  lowRoofs: [R.roofTar, R.roofTar, R.roofGravel, R.roofGravel, R.roofSilver, R.roofSilver, R.roofWhite],
  lowPitched: 0,
  towerRoofs: [R.roofGravel, R.roofSilver, R.roofTar, R.roofWhite],
  glass: [
    R.glassBlue,
    R.glassBlue,
    R.glassTeal,
    R.glassDark,
    R.glassDark,
    R.glassGreen,
    R.glassSilver,
    R.glassBronze,
    R.glassBlack,
  ],
  stoneTowers: [R.limestone, R.limestone, R.cream, R.tan, R.brickRed, R.greyStone, R.whiteBrick],
  industrialWalls: [R.greyStone, R.steel, R.tan, R.brickDark, R.concrete, R.whiteBrick, R.brickRed],
  industrialRoofs: [R.roofWhite, R.roofSilver, R.roofGravel, R.roofGravel, R.roofTar],
  civicWalls: [R.limestone, R.limestone, R.cream, R.tan, R.brickRed, R.greyStone],
  sacredWalls: [R.greyStone, R.limestone, R.tan, R.brownstone, R.brickRed],
  sacredRoofs: [R.roofSlate, R.roofSlate, R.roofCopper, R.roofBrown],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.cream, R.tan],
  outbuildingRoofs: [R.roofTar, R.roofGravel, R.roofSlate, R.roofBrown],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.52, 0.34],
  high: [0.44, 0.34],
  superTall: 0.7,
};

/**
 * Central Florida: stucco houses in cream, tan and pastels under asphalt shingles or barrel
 * tile; strip malls and big boxes under white flat roofs; a small downtown of glass and precast.
 */
export const FLORIDA: StyleProfile = {
  rowWalls: [R.cream, R.tan, R.whiteBrick, R.limestone, R.sidingYellow, R.salmon, R.greyStone],
  midWalls: [R.cream, R.tan, R.tan, R.whiteBrick, R.limestone, R.salmon, R.greyStone, R.sidingYellow],
  slabWalls: [R.whiteBrick, R.cream, R.limestone, R.greyStone, R.tan],
  houseWalls: [
    R.cream,
    R.cream,
    R.tan,
    R.tan,
    R.whiteBrick,
    R.limestone,
    R.sidingYellow,
    R.salmon,
    R.mint,
    R.sidingBlue,
    R.greyStone,
    R.sidingSage,
  ],
  houseRoofs: [
    R.roofBrown,
    R.roofBrown,
    R.roofSlate,
    R.roofSlate,
    R.roofGravel,
    R.roofGravel,
    R.roofTar,
    R.roofTerracotta,
    R.roofClay,
    R.roofClay,
  ],
  houseMaxArea: 460,
  flatRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofSilver, R.roofGravel, R.roofTar],
  lowRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofSilver, R.roofClay, R.roofBrown],
  lowPitched: 0.15,
  towerRoofs: [R.roofGravel, R.roofWhite, R.roofSilver],
  glass: [R.glassBlue, R.glassBlue, R.glassTeal, R.glassGreen, R.glassSilver, R.glassDark, R.glassBronze],
  stoneTowers: [R.cream, R.limestone, R.tan, R.whiteBrick, R.greyStone, R.salmon],
  industrialWalls: [R.whiteBrick, R.greyStone, R.cream, R.concrete, R.tan, R.steel],
  industrialRoofs: [R.roofWhite, R.roofWhite, R.roofSilver, R.roofGravel],
  civicWalls: [R.cream, R.limestone, R.tan, R.whiteBrick, R.salmon, R.greyStone],
  sacredWalls: [R.whiteBrick, R.cream, R.tan, R.limestone, R.brickRed],
  sacredRoofs: [R.roofBrown, R.roofSlate, R.roofTerracotta, R.roofGravel],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.cream, R.tan],
  outbuildingRoofs: [R.roofGravel, R.roofBrown, R.roofSlate, R.roofSilver],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.42, 0.3],
  high: [0.55, 0.25],
  superTall: 0.75,
};

/**
 * The Mojave: stucco houses in tan and cream under concrete tile, flat white roofs on everything
 * commercial, and resort towers in gold, bronze and blue glass.
 */
export const MOJAVE: StyleProfile = {
  rowWalls: [R.tan, R.cream, R.cream, R.salmon, R.limestone, R.whiteBrick, R.ochre],
  midWalls: [R.tan, R.tan, R.cream, R.limestone, R.salmon, R.whiteBrick, R.greyStone, R.ochre],
  slabWalls: [R.cream, R.whiteBrick, R.limestone, R.tan, R.greyStone],
  houseWalls: [R.tan, R.tan, R.cream, R.cream, R.salmon, R.limestone, R.ochre, R.whiteBrick, R.greyStone],
  houseRoofs: [
    R.roofTerracotta,
    R.roofTerracotta,
    R.roofClay,
    R.roofClay,
    R.roofBrown,
    R.roofBrown,
    R.roofGravel,
    R.roofSlate,
  ],
  houseMaxArea: 420,
  flatRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofSilver, R.roofGravel],
  lowRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofSilver, R.roofClay],
  lowPitched: 0.1,
  towerRoofs: [R.roofGravel, R.roofWhite, R.roofSilver],
  glass: [
    R.glassBronze,
    R.glassBronze,
    R.gold,
    R.glassBlue,
    R.glassBlue,
    R.glassDark,
    R.glassTeal,
    R.glassSilver,
  ],
  stoneTowers: [R.cream, R.tan, R.limestone, R.whiteBrick, R.salmon],
  industrialWalls: [R.whiteBrick, R.greyStone, R.cream, R.concrete, R.tan],
  industrialRoofs: [R.roofWhite, R.roofWhite, R.roofSilver, R.roofGravel],
  civicWalls: [R.cream, R.tan, R.limestone, R.whiteBrick, R.greyStone],
  sacredWalls: [R.whiteBrick, R.cream, R.tan, R.limestone],
  sacredRoofs: [R.roofTerracotta, R.roofBrown, R.roofGravel],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.cream, R.tan],
  outbuildingRoofs: [R.roofGravel, R.roofWhite, R.roofBrown, R.roofSilver],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.4, 0.28],
  high: [0.6, 0.25],
  superTall: 0.85,
};

/**
 * Southern California: stucco bungalows and Spanish revival houses in white, cream and pastels
 * under grey shingle and red clay tile; two-storey apartments and strip malls under flat white
 * and gravel roofs; downtown and Century City in blue and silver glass and polished granite.
 */
export const SOCAL: StyleProfile = {
  rowWalls: [
    R.whiteBrick,
    R.cream,
    R.cream,
    R.tan,
    R.salmon,
    R.sidingYellow,
    R.limestone,
    R.rose,
    R.greyStone,
  ],
  midWalls: [R.whiteBrick, R.cream, R.tan, R.tan, R.limestone, R.salmon, R.greyStone, R.rose, R.brickRed],
  slabWalls: [R.whiteBrick, R.whiteBrick, R.cream, R.limestone, R.greyStone, R.tan],
  houseWalls: [
    R.whiteBrick,
    R.whiteBrick,
    R.cream,
    R.cream,
    R.tan,
    R.salmon,
    R.sidingYellow,
    R.sidingBlue,
    R.sidingSage,
    R.mint,
    R.rose,
    R.greyStone,
  ],
  houseRoofs: [
    R.roofSlate,
    R.roofSlate,
    R.roofSlate,
    R.roofGravel,
    R.roofGravel,
    R.roofGravel,
    R.roofBrown,
    R.roofTar,
    R.roofWhite,
    R.roofTerracotta,
    R.roofClay,
  ],
  houseMaxArea: 380,
  flatRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofGravel, R.roofSilver, R.roofTar],
  lowRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofSilver, R.roofTar, R.roofClay],
  lowPitched: 0.12,
  towerRoofs: [R.roofGravel, R.roofWhite, R.roofSilver, R.roofTar],
  glass: [
    R.glassBlue,
    R.glassBlue,
    R.glassSilver,
    R.glassSilver,
    R.glassDark,
    R.glassTeal,
    R.glassBlack,
    R.glassBronze,
  ],
  stoneTowers: [R.limestone, R.cream, R.greyStone, R.rose, R.darkStone, R.whiteBrick, R.tan],
  industrialWalls: [R.whiteBrick, R.greyStone, R.cream, R.concrete, R.tan, R.steel, R.brickRed],
  industrialRoofs: [R.roofWhite, R.roofWhite, R.roofSilver, R.roofGravel, R.roofTar],
  civicWalls: [R.limestone, R.cream, R.whiteBrick, R.tan, R.greyStone, R.brickRed],
  sacredWalls: [R.whiteBrick, R.cream, R.tan, R.limestone, R.brickRed],
  sacredRoofs: [R.roofTerracotta, R.roofClay, R.roofSlate, R.roofCopper],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.cream, R.tan],
  outbuildingRoofs: [R.roofGravel, R.roofSlate, R.roofWhite, R.roofClay],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.4, 0.32],
  high: [0.55, 0.3],
  superTall: 0.7,
};

/**
 * The Spanish Mediterranean: apartment blocks of five to eight floors in render, ochre and bare
 * brick with tiled terraces on top, low houses under clay tile, church domes in glazed blue.
 */
export const MEDITERRANEAN: StyleProfile = {
  rowWalls: [
    R.cream,
    R.cream,
    R.ochre,
    R.tan,
    R.salmon,
    R.yellowBrick,
    R.whiteBrick,
    R.brickRed,
    R.limestone,
    R.sidingYellow,
  ],
  midWalls: [
    R.cream,
    R.tan,
    R.ochre,
    R.brickRed,
    R.brickRed,
    R.yellowBrick,
    R.whiteBrick,
    R.limestone,
    R.salmon,
    R.greyStone,
  ],
  slabWalls: [R.whiteBrick, R.cream, R.limestone, R.tan, R.brickRed],
  houseWalls: [R.whiteBrick, R.whiteBrick, R.cream, R.ochre, R.sidingYellow, R.salmon, R.tan],
  houseRoofs: [
    R.roofTerracotta,
    R.roofTerracotta,
    R.roofTerracotta,
    R.roofClay,
    R.roofClay,
    R.roofClay,
    R.roofRed,
    R.roofBrown,
  ],
  houseMaxArea: 300,
  flatRoofs: [R.roofClay, R.roofClay, R.roofTerracotta, R.roofGravel, R.roofGravel, R.roofWhite],
  lowRoofs: [R.roofClay, R.roofTerracotta, R.roofGravel, R.roofSilver, R.roofWhite],
  lowPitched: 0.35,
  towerRoofs: [R.roofGravel, R.roofWhite, R.roofClay],
  glass: [R.glassBlue, R.glassGreen, R.glassDark, R.glassSilver, R.glassBronze, R.glassTeal],
  stoneTowers: [R.cream, R.limestone, R.tan, R.whiteBrick, R.brickRed, R.ochre],
  industrialWalls: [R.greyStone, R.whiteBrick, R.cream, R.concrete, R.steel, R.tan],
  industrialRoofs: [R.roofSilver, R.roofSilver, R.roofWhite, R.roofGravel],
  civicWalls: [R.limestone, R.cream, R.tan, R.ochre, R.brickRed],
  sacredWalls: [R.tan, R.limestone, R.cream, R.ochre],
  sacredRoofs: [R.roofTerracotta, R.roofClay, R.glassBlue, R.roofTerracotta],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.cream, R.tan],
  outbuildingRoofs: [R.roofGravel, R.roofSilver, R.roofTerracotta, R.roofClay],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.55, 0.38],
  high: [0.2, 0.45],
  superTall: 0.5,
};

/**
 * A Patagonian town: low houses of block, timber and stone under painted sheet-metal roofs
 * (red, green, bare zinc), almost all of them pitched against the wind and the snow.
 */
export const PATAGONIA: StyleProfile = {
  rowWalls: [R.whiteBrick, R.cream, R.tan, R.brownstone, R.greyStone, R.salmon, R.sidingSage],
  midWalls: [R.cream, R.tan, R.whiteBrick, R.brownstone, R.greyStone, R.limestone],
  slabWalls: [R.whiteBrick, R.cream, R.greyStone, R.tan],
  houseWalls: [
    R.whiteBrick,
    R.cream,
    R.tan,
    R.tan,
    R.brownstone,
    R.greyStone,
    R.sidingSage,
    R.sidingBlue,
    R.salmon,
    R.brickRed,
  ],
  houseRoofs: [
    R.roofRed,
    R.roofRed,
    R.roofGreen,
    R.roofGreen,
    R.roofSilver,
    R.roofSilver,
    R.roofTar,
    R.roofBrown,
    R.roofSlate,
  ],
  houseMaxArea: 420,
  flatRoofs: [R.roofSilver, R.roofGravel, R.roofTar, R.roofRed],
  lowRoofs: [R.roofSilver, R.roofRed, R.roofGreen, R.roofGravel, R.roofBrown],
  lowPitched: 0.75,
  towerRoofs: [R.roofGravel, R.roofSilver],
  glass: [R.glassBlue, R.glassDark, R.glassSilver],
  stoneTowers: [R.cream, R.tan, R.greyStone, R.whiteBrick],
  industrialWalls: [R.greyStone, R.whiteBrick, R.steel, R.cream, R.tan],
  industrialRoofs: [R.roofSilver, R.roofSilver, R.roofGravel, R.roofRed],
  civicWalls: [R.cream, R.tan, R.greyStone, R.whiteBrick, R.brownstone],
  sacredWalls: [R.whiteBrick, R.cream, R.greyStone, R.tan],
  sacredRoofs: [R.roofRed, R.roofGreen, R.roofSlate],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.tan, R.brownstone],
  outbuildingRoofs: [R.roofSilver, R.roofRed, R.roofGravel, R.roofGreen],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.7, 0.25],
  high: [0.2, 0.6],
  superTall: 0.3,
};

/**
 * The interior of São Paulo state: rendered walls in white, cream and pastels under clay-tile
 * roofs; sheds roofed in metal and fibre cement; residential towers in pale render with banded
 * balconies, and only the odd glass office block.
 */
export const PAULISTA: StyleProfile = {
  rowWalls: [R.whiteBrick, R.whiteBrick, R.cream, R.salmon, R.sidingYellow, R.tan, R.mint, R.limestone],
  midWalls: [R.whiteBrick, R.cream, R.cream, R.tan, R.limestone, R.salmon, R.greyStone, R.sidingYellow],
  slabWalls: [R.whiteBrick, R.whiteBrick, R.cream, R.limestone, R.greyStone, R.tan, R.salmon],
  houseWalls: [
    R.whiteBrick,
    R.whiteBrick,
    R.cream,
    R.cream,
    R.sidingYellow,
    R.salmon,
    R.salmon,
    R.rose,
    R.mint,
    R.sidingBlue,
    R.tan,
    R.ochre,
    R.limestone,
  ],
  houseRoofs: [
    R.roofTerracotta,
    R.roofTerracotta,
    R.roofTerracotta,
    R.roofClay,
    R.roofClay,
    R.roofClay,
    R.roofRed,
    R.roofBrown,
    R.roofGravel,
    R.roofSilver,
  ],
  houseMaxArea: 520,
  flatRoofs: [R.roofGravel, R.roofGravel, R.roofWhite, R.roofSilver, R.roofClay, R.roofTar],
  lowRoofs: [R.roofGravel, R.roofSilver, R.roofSilver, R.roofTerracotta, R.roofClay, R.roofWhite],
  lowPitched: 0.5,
  towerRoofs: [R.roofGravel, R.roofWhite, R.roofSilver],
  glass: [R.glassBlue, R.glassGreen, R.glassDark, R.glassSilver, R.glassBronze, R.glassTeal],
  stoneTowers: [R.whiteBrick, R.cream, R.limestone, R.tan, R.greyStone, R.salmon],
  industrialWalls: [R.greyStone, R.whiteBrick, R.cream, R.concrete, R.steel, R.tan],
  industrialRoofs: [R.roofSilver, R.roofSilver, R.roofWhite, R.roofGravel],
  civicWalls: [R.cream, R.whiteBrick, R.limestone, R.tan, R.salmon, R.greyStone],
  sacredWalls: [R.whiteBrick, R.cream, R.tan, R.limestone, R.sidingYellow],
  sacredRoofs: [R.roofTerracotta, R.roofClay, R.roofSlate, R.roofBrown],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.cream, R.tan],
  outbuildingRoofs: [R.roofGravel, R.roofSilver, R.roofTerracotta, R.roofClay],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.5, 0.44],
  high: [0.12, 0.4],
  superTall: 0.3,
};

/**
 * North Texas: brick ranch houses in red, brown and buff under grey and brown shingle; stucco and
 * brick apartment blocks; warehouses and big boxes under white roofs; a downtown of green, blue
 * and silver glass with granite and limestone between.
 */
export const TEXAS: StyleProfile = {
  rowWalls: [R.brickRed, R.tan, R.cream, R.yellowBrick, R.whiteBrick, R.brickDark, R.limestone, R.greyStone],
  midWalls: [
    R.tan,
    R.tan,
    R.cream,
    R.brickRed,
    R.limestone,
    R.whiteBrick,
    R.greyStone,
    R.yellowBrick,
    R.brickDark,
    R.salmon,
  ],
  slabWalls: [R.whiteBrick, R.cream, R.limestone, R.tan, R.greyStone],
  houseWalls: [
    R.brickRed,
    R.brickRed,
    R.brickDark,
    R.tan,
    R.tan,
    R.cream,
    R.whiteBrick,
    R.yellowBrick,
    R.limestone,
    R.sidingBlue,
    R.greyStone,
    R.sidingSage,
  ],
  houseRoofs: [
    R.roofSlate,
    R.roofSlate,
    R.roofBrown,
    R.roofBrown,
    R.roofGravel,
    R.roofGravel,
    R.roofTar,
    R.roofRed,
  ],
  houseMaxArea: 420,
  flatRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofSilver, R.roofGravel, R.roofTar],
  lowRoofs: [R.roofWhite, R.roofWhite, R.roofGravel, R.roofSilver, R.roofTar, R.roofBrown],
  lowPitched: 0.15,
  towerRoofs: [R.roofGravel, R.roofWhite, R.roofSilver, R.roofTar],
  glass: [
    R.glassBlue,
    R.glassBlue,
    R.glassGreen,
    R.glassGreen,
    R.glassTeal,
    R.glassSilver,
    R.glassDark,
    R.glassBronze,
    R.glassBlack,
  ],
  stoneTowers: [R.limestone, R.cream, R.tan, R.rose, R.greyStone, R.darkStone, R.brickRed],
  industrialWalls: [R.tan, R.whiteBrick, R.greyStone, R.concrete, R.cream, R.steel, R.brickRed],
  industrialRoofs: [R.roofWhite, R.roofWhite, R.roofSilver, R.roofGravel, R.roofTar],
  civicWalls: [R.limestone, R.cream, R.tan, R.brickRed, R.whiteBrick, R.greyStone],
  sacredWalls: [R.limestone, R.tan, R.brickRed, R.cream, R.whiteBrick],
  sacredRoofs: [R.roofSlate, R.roofBrown, R.roofCopper, R.roofTerracotta],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.cream, R.tan],
  outbuildingRoofs: [R.roofGravel, R.roofBrown, R.roofSlate, R.roofSilver],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.42, 0.3],
  high: [0.6, 0.22],
  superTall: 0.8,
};

/**
 * An Ohio River town: rows of red-brick Italianate walk-ups, some painted cream, yellow or sage;
 * brick and clapboard houses up the hills under slate and shingle; downtown in limestone and
 * brick from the twenties and in glass since.
 */
export const OHIO_RIVER: StyleProfile = {
  rowWalls: [
    R.brickRed,
    R.brickRed,
    R.brickRed,
    R.brickDark,
    R.brownstone,
    R.cream,
    R.sidingYellow,
    R.sidingSage,
    R.greyStone,
    R.whiteBrick,
    R.tan,
  ],
  midWalls: [
    R.brickRed,
    R.brickRed,
    R.brickDark,
    R.tan,
    R.cream,
    R.yellowBrick,
    R.limestone,
    R.whiteBrick,
    R.greyStone,
  ],
  slabWalls: [R.whiteBrick, R.cream, R.limestone, R.tan, R.greyStone, R.brickRed],
  houseWalls: [
    R.brickRed,
    R.brickRed,
    R.brickDark,
    R.whiteBrick,
    R.cream,
    R.sidingYellow,
    R.sidingBlue,
    R.sidingSage,
    R.greyStone,
    R.tan,
    R.whiteBrick,
  ],
  houseRoofs: [
    R.roofSlate,
    R.roofSlate,
    R.roofSlate,
    R.roofBrown,
    R.roofBrown,
    R.roofTar,
    R.roofGravel,
    R.roofRed,
  ],
  houseMaxArea: 300,
  flatRoofs: [R.roofTar, R.roofTar, R.roofGravel, R.roofGravel, R.roofSilver, R.roofWhite],
  lowRoofs: [R.roofTar, R.roofGravel, R.roofGravel, R.roofSilver, R.roofWhite, R.roofSlate],
  lowPitched: 0.2,
  towerRoofs: [R.roofGravel, R.roofSilver, R.roofTar, R.roofWhite],
  glass: [
    R.glassBlue,
    R.glassBlue,
    R.glassDark,
    R.glassSilver,
    R.glassTeal,
    R.glassBronze,
    R.glassBlack,
    R.glassGreen,
  ],
  stoneTowers: [R.limestone, R.limestone, R.tan, R.cream, R.brickRed, R.greyStone, R.brownstone],
  industrialWalls: [R.brickRed, R.brickDark, R.greyStone, R.concrete, R.tan, R.steel, R.whiteBrick],
  industrialRoofs: [R.roofWhite, R.roofSilver, R.roofGravel, R.roofTar, R.roofGravel],
  civicWalls: [R.limestone, R.brickRed, R.cream, R.tan, R.greyStone, R.brickDark],
  sacredWalls: [R.brickRed, R.limestone, R.greyStone, R.tan, R.brownstone],
  sacredRoofs: [R.roofSlate, R.roofSlate, R.roofCopper, R.roofBrown],
  outbuildingWalls: [R.whiteBrick, R.greyStone, R.brickRed, R.tan],
  outbuildingRoofs: [R.roofTar, R.roofGravel, R.roofSlate, R.roofBrown],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.55, 0.3],
  high: [0.4, 0.4],
  superTall: 0.6,
};

/**
 * A Sierra Nevada mountain town: houses and cabins in stained and painted wood (browns, greys,
 * cream, barn red, a sage or a blue) under steep metal roofs in dark green, brown, charcoal and
 * red, pitched for the snow; an old main street of brick and clapboard; low wooden lodges and
 * shops, most of them pitched too. Nothing tall.
 */
export const SIERRA: StyleProfile = {
  rowWalls: [
    R.brickRed,
    R.brickDark,
    R.timber,
    R.brownstone,
    R.cream,
    R.tan,
    R.greyStone,
    R.sidingYellow,
    R.whiteBrick,
  ],
  midWalls: [R.timber, R.brownstone, R.tan, R.cream, R.greyStone, R.brickRed, R.sidingSage, R.whiteBrick],
  slabWalls: [R.cream, R.tan, R.greyStone, R.whiteBrick, R.brownstone],
  houseWalls: [
    R.timber,
    R.timber,
    R.brownstone,
    R.brownstone,
    R.tan,
    R.tan,
    R.greyStone,
    R.greyStone,
    R.cream,
    R.darkStone,
    R.brickRed,
    R.sidingSage,
    R.sidingBlue,
    R.whiteBrick,
  ],
  houseRoofs: [
    R.roofGreen,
    R.roofGreen,
    R.roofBrown,
    R.roofBrown,
    R.roofSlate,
    R.roofSlate,
    R.roofTar,
    R.roofTar,
    R.roofRed,
    R.roofSilver,
  ],
  houseMaxArea: 450,
  flatRoofs: [R.roofTar, R.roofGravel, R.roofSilver, R.roofSlate, R.roofBrown],
  lowRoofs: [R.roofGreen, R.roofBrown, R.roofSlate, R.roofTar, R.roofSilver, R.roofRed],
  lowPitched: 0.7,
  towerRoofs: [R.roofGravel, R.roofSlate, R.roofTar],
  glass: [R.glassDark, R.glassBlue, R.glassSilver, R.glassBronze],
  stoneTowers: [R.cream, R.tan, R.greyStone, R.brownstone],
  industrialWalls: [R.steel, R.greyStone, R.tan, R.brownstone, R.concrete, R.cream],
  industrialRoofs: [R.roofSilver, R.roofSilver, R.roofGravel, R.roofGreen, R.roofBrown],
  civicWalls: [R.cream, R.tan, R.greyStone, R.brownstone, R.timber, R.brickRed],
  sacredWalls: [R.whiteBrick, R.cream, R.timber, R.greyStone, R.tan],
  sacredRoofs: [R.roofGreen, R.roofBrown, R.roofSlate, R.roofRed],
  outbuildingWalls: [R.timber, R.brownstone, R.greyStone, R.tan, R.brickRed],
  outbuildingRoofs: [R.roofSilver, R.roofGreen, R.roofBrown, R.roofTar, R.roofRed],
  windows: [R.glassDark, R.glassDark, R.glassBlack, R.glassBlue],
  mid: [0.8, 0.15],
  high: [0.2, 0.6],
  superTall: 0.3,
};

const ALL_WALLS = [
  R.brickRed,
  R.brickDark,
  R.brownstone,
  R.tan,
  R.cream,
  R.limestone,
  R.whiteBrick,
  R.greyStone,
  R.darkStone,
  R.yellowBrick,
  R.rose,
  R.sidingBlue,
  R.sidingYellow,
  R.sidingSage,
  R.steel,
  R.concrete,
];
const ALL_GLASS = [
  R.glassBlue,
  R.glassTeal,
  R.glassDark,
  R.glassGreen,
  R.glassBronze,
  R.glassBlack,
  R.glassSilver,
];
const ALL_ROOFS = [
  R.roofTar,
  R.roofGravel,
  R.roofSilver,
  R.roofWhite,
  R.roofCopper,
  R.roofTerracotta,
  R.roofSlate,
  R.roofBrown,
  R.roofRed,
  R.gold,
  R.limestone,
  R.glassBlue,
  R.glassDark,
  R.park,
];

const OUTBUILDINGS = new Set([
  "garage",
  "garages",
  "shed",
  "outbuilding",
  "carport",
  "static_caravan",
  "shelter",
  "hut",
  "cabin",
  "kiosk",
  "toilets",
  "guardhouse",
  "bunker",
  "boathouse",
]);
const HOUSES = new Set(["house", "detached", "semidetached_house", "bungalow", "farm", "residential"]);
const INDUSTRIAL = new Set([
  "industrial",
  "warehouse",
  "factory",
  "manufacture",
  "hangar",
  "depot",
  "service",
  "storage_tank",
  "silo",
  "transformer_tower",
]);
const CIVIC = new Set([
  "school",
  "university",
  "college",
  "hospital",
  "library",
  "government",
  "civic",
  "public",
  "courthouse",
  "museum",
  "train_station",
  "post_office",
  "fire_station",
  "kindergarten",
  "dormitory",
  "transportation",
]);
const SACRED = new Set([
  "church",
  "cathedral",
  "chapel",
  "synagogue",
  "mosque",
  "temple",
  "religious",
  "monastery",
  "shrine",
]);
const PITCHED = new Set([
  "gabled",
  "hipped",
  "half_hipped",
  "saltbox",
  "gambrel",
  "mansard",
  "side_hipped",
  "gabled_height_moved",
]);

const isHex = (c: string | null): c is string => !!c && /^#[0-9a-fA-F]{6}$/.test(c);

function roofFromShape(input: StyleInput, wallHeight: number): { roofShape: Roof; roofH: number } | null {
  const shape = input.roofShape;
  if (!shape || shape === "flat" || shape === "skillion" || shape === "round") return null;
  const side = Math.sqrt(Math.max(input.area, 1));
  if (shape === "pyramidal" || shape === "cone") {
    const h = input.roofHeight ?? Math.min(wallHeight, side * 0.75);
    return { roofShape: Roof.Pyramid, roofH: Math.max(1, Math.min(h, wallHeight)) };
  }
  if (shape === "dome" || shape === "onion") {
    const h = input.roofHeight ?? Math.min(wallHeight, side * 0.45);
    return { roofShape: Roof.Dome, roofH: Math.max(1, Math.min(h, wallHeight)) };
  }
  if (PITCHED.has(shape)) {
    const h = input.roofHeight ?? Math.min(3, side * 0.25);
    return { roofShape: Roof.Pitched, roofH: Math.max(0.8, Math.min(h, wallHeight * 0.6)) };
  }
  return null;
}

export function chooseStyle(input: StyleInput, p: StyleProfile = NEW_YORK): Style {
  const { seed, area, cls, subtype } = input;
  const tall = input.height - input.base;
  const h = input.height;
  let style: Style;

  if (cls === "bridge_support") {
    // the Brooklyn Bridge's towers are granite; the rest are steel
    const wall = Math.abs(h - 82.9) < 0.2 ? R.tan : h > 60 ? R.steel : R.greyStone;
    style = { wall, roof: wall, glass: R.glassDark, pattern: Pattern.None, roofShape: Roof.Flat, roofH: 0 };
  } else if (
    cls === "statue" ||
    cls === "statue_gold" ||
    cls === "statue_white" ||
    cls === "pier_column" ||
    cls === "truss_post"
  ) {
    // a cantilever bridge's posts are painted like its trusses (the renderer's truss colour)
    const wall =
      cls === "statue"
        ? R.libertyGreen
        : cls === "statue_gold"
          ? R.gold
          : cls === "statue_white"
            ? R.whiteBrick
            : cls === "truss_post"
              ? R.tan
              : R.concrete;
    style = { wall, roof: wall, glass: R.glassDark, pattern: Pattern.None, roofShape: Roof.Flat, roofH: 0 };
  } else if (cls !== null && cls.startsWith("deck")) {
    // a bridge deck: steel underneath, the roadway on top
    const roof =
      cls === "deck_rail"
        ? R.gravel
        : cls === "deck_path"
          ? R.plaza
          : cls === "deck_highway"
            ? R.asphaltDark
            : R.asphalt;
    style = {
      wall: R.steel,
      roof,
      glass: R.glassDark,
      pattern: Pattern.None,
      roofShape: Roof.Deck,
      roofH: 0,
    };
  } else if (cls === "storage_tank" || cls === "silo" || cls === "water_tower") {
    style = {
      wall: pick([R.whiteBrick, R.steel, R.roofSilver, R.cream], seed, 1),
      roof: R.roofWhite,
      glass: R.glassDark,
      pattern: Pattern.None,
      roofShape: Roof.Flat,
      roofH: 0,
    };
  } else if (cls === "roof" || cls === "canopy") {
    style = {
      wall: R.steel,
      roof: pick([R.roofSilver, R.roofWhite, R.roofGravel], seed, 1),
      glass: R.glassDark,
      pattern: Pattern.None,
      roofShape: Roof.Flat,
      roofH: 0,
    };
  } else if (
    (cls && OUTBUILDINGS.has(cls)) ||
    subtype === "outbuilding" ||
    (area < 34 && h < 6 && !input.isPart)
  ) {
    style = {
      wall: pick(p.outbuildingWalls, seed, 1),
      roof: pick(p.outbuildingRoofs, seed, 2),
      glass: R.glassDark,
      pattern: Pattern.None,
      roofShape: Roof.Flat,
      roofH: 0,
    };
  } else if ((cls && SACRED.has(cls)) || subtype === "religious") {
    style = {
      wall: pick(p.sacredWalls, seed, 1),
      roof: pick(p.sacredRoofs, seed, 2),
      glass: R.glassDark,
      pattern: Pattern.Tall,
      roofShape: area < 2500 ? Roof.Pitched : Roof.Flat,
      roofH: area < 2500 ? 3.5 : 0,
    };
  } else if ((cls && INDUSTRIAL.has(cls)) || subtype === "industrial") {
    style = {
      wall: pick(p.industrialWalls, seed, 1),
      roof: pick(p.industrialRoofs, seed, 2),
      glass: R.glassDark,
      pattern: h > 9 ? Pattern.Sparse : Pattern.None,
      roofShape: Roof.Flat,
      roofH: 0,
    };
  } else if (
    h < 10.5 &&
    area < p.houseMaxArea &&
    (cls === null || HOUSES.has(cls) || cls === "terrace" || cls === "apartments")
  ) {
    // the default away from the centre: a one- or two-family house
    style = {
      wall: pick(p.houseWalls, seed, 1),
      roof: pick(p.houseRoofs, seed, 2),
      glass: R.glassDark,
      pattern: Pattern.House,
      roofShape: Roof.Pitched,
      roofH: Math.min(2.2, h * 0.3),
    };
  } else if (h < 11) {
    // low and wide: shops, taxpayers, garages, big-box stores
    const big = area > 900;
    const pitched = !big && rand(seed, 5) < p.lowPitched;
    style = {
      wall: pick(big ? p.industrialWalls : p.midWalls, seed, 1),
      roof: pick(big ? p.industrialRoofs : p.lowRoofs, seed, 2),
      glass: pick(p.windows, seed, 3),
      pattern: big ? Pattern.Sparse : Pattern.Punched,
      roofShape: pitched ? Roof.Pitched : Roof.Flat,
      roofH: pitched ? Math.min(1.8, h * 0.25) : 0,
    };
  } else if (
    (cls && CIVIC.has(cls)) ||
    subtype === "education" ||
    subtype === "civic" ||
    subtype === "medical"
  ) {
    style = {
      wall: pick(p.civicWalls, seed, 1),
      roof: pick(p.flatRoofs, seed, 2),
      glass: pick(p.windows, seed, 3),
      pattern: h > 70 ? Pattern.Ribbon : Pattern.Punched,
      roofShape: Roof.Flat,
      roofH: 0,
    };
  } else if (h < 26) {
    // walk-ups, tenements, brownstones
    style = {
      wall: pick(area < 320 ? p.rowWalls : p.midWalls, seed, 1),
      roof: pick(p.flatRoofs, seed, 2),
      glass: pick(p.windows, seed, 3),
      pattern: Pattern.Punched,
      roofShape: Roof.Flat,
      roofH: 0,
    };
  } else if (h < 62) {
    const r = rand(seed, 4);
    if (r < p.mid[0])
      style = {
        wall: pick(p.midWalls, seed, 1),
        roof: pick(p.flatRoofs, seed, 2),
        glass: pick(p.windows, seed, 3),
        pattern: Pattern.Punched,
        roofShape: Roof.Flat,
        roofH: 0,
      };
    else if (r < p.mid[0] + p.mid[1])
      style = {
        wall: pick(p.slabWalls, seed, 1),
        roof: pick(p.flatRoofs, seed, 2),
        glass: pick(p.windows, seed, 3),
        pattern: Pattern.Ribbon,
        roofShape: Roof.Flat,
        roofH: 0,
      };
    else
      style = {
        wall: pick(p.glass, seed, 1),
        roof: pick(p.towerRoofs, seed, 2),
        glass: R.glassDark,
        pattern: Pattern.Curtain,
        roofShape: Roof.Flat,
        roofH: 0,
      };
  } else if (h < 125) {
    const r = rand(seed, 4);
    if (r < p.high[0])
      style = {
        wall: pick(p.glass, seed, 1),
        roof: pick(p.towerRoofs, seed, 2),
        glass: R.glassDark,
        pattern: Pattern.Curtain,
        roofShape: Roof.Flat,
        roofH: 0,
      };
    else if (r < p.high[0] + p.high[1])
      style = {
        wall: pick(p.stoneTowers, seed, 1),
        roof: pick(p.towerRoofs, seed, 2),
        glass: pick(p.windows, seed, 3),
        pattern: Pattern.Punched,
        roofShape: Roof.Flat,
        roofH: 0,
      };
    else
      style = {
        wall: pick(p.slabWalls, seed, 1),
        roof: pick(p.towerRoofs, seed, 2),
        glass: pick(p.windows, seed, 3),
        pattern: Pattern.Ribbon,
        roofShape: Roof.Flat,
        roofH: 0,
      };
  } else {
    const r = rand(seed, 4);
    if (r < p.superTall)
      style = {
        wall: pick(p.glass, seed, 1),
        roof: pick(p.towerRoofs, seed, 2),
        glass: R.glassDark,
        pattern: Pattern.Curtain,
        roofShape: Roof.Flat,
        roofH: 0,
      };
    else
      style = {
        wall: pick(p.stoneTowers, seed, 1),
        roof: pick(p.towerRoofs, seed, 2),
        glass: pick(p.windows, seed, 3),
        pattern: Pattern.Punched,
        roofShape: Roof.Flat,
        roofH: 0,
      };
  }

  // what the mappers recorded beats what we guessed
  if (isHex(input.facadeColor)) {
    const glassy = input.facadeMaterial === "glass" || input.facadeMaterial === "mirror";
    if (glassy) {
      style.wall = nearestRamp(input.facadeColor, ALL_GLASS);
      style.pattern = Pattern.Curtain;
    } else if (style.pattern === Pattern.Curtain) {
      style.wall = nearestRamp(input.facadeColor, ALL_GLASS.concat(ALL_WALLS));
      if (!ALL_GLASS.includes(style.wall)) style.pattern = tall > 12 ? Pattern.Punched : Pattern.None;
    } else {
      style.wall = nearestRamp(input.facadeColor, ALL_WALLS);
    }
  } else if (input.facadeMaterial === "glass" && style.pattern !== Pattern.Curtain) {
    style.wall = pick(p.glass, seed, 1);
    style.pattern = Pattern.Curtain;
  }
  if (isHex(input.roofColor)) style.roof = nearestRamp(input.roofColor, ALL_ROOFS);

  const shaped = roofFromShape(input, tall);
  if (shaped) {
    style.roofShape = shaped.roofShape;
    style.roofH = shaped.roofH;
    if (!isHex(input.roofColor) && shaped.roofShape !== Roof.Pitched) style.roof = style.wall;
  } else if (input.roofShape === "flat") {
    style.roofShape = Roof.Flat;
    style.roofH = 0;
  }
  // a thin slab or cap has no room for windows
  if (tall < 2.6 && style.pattern !== Pattern.None) style.pattern = Pattern.None;
  return style;
}
