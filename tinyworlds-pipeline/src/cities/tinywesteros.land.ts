import { R } from "../render/palette.js";
import { G } from "../scene/kinds.js";

/**
 * The lie of the land for tinywesteros, as data: coasts, islands, lakes, rivers, mountains, the
 * colours of the ground, regions, roads and sea lanes.
 *
 * Everything is sketched by hand (east, north; King's Landing at 0, 0) with a few dozen corners
 * per continent, from nothing but the commonly known arrangement of the world: which bay is
 * north of which cape, what lies east of what. No map was traced, and the detail of every coast
 * is made up by the roughening in `scene/worldkit.ts`. Expect the shapes to be only roughly
 * familiar.
 *
 * One step of the sketch is `EAST` units eastward and `NORTH` units northward. They differ
 * because the view halves everything north–south: drawn square, the continents would look squat.
 * Stretched this much they come out a little flattened, as on a table seen from the side.
 */
export const EAST = 80;
export const NORTH = 125;

/** The whole rectangle of the map, in units. */
export const WORLD = { west: -60 * EAST, east: 300 * EAST, south: -70 * NORTH, north: 110 * NORTH };

/** A corner of a coast: east, north and, on some, a name that regions use to refer to it. */
export type Corner = [e: number, n: number, tag?: string];

/** Westeros, clockwise from the top of the east coast. It runs off the top of the map. */
export const WESTEROS: Corner[] = [
  [4, 115, "top-e"],
  // beyond the Wall: Storrold's Point
  [2, 108],
  [0, 100],
  [-4, 94],
  [-3, 89.5],
  [2, 89.5],
  [5.5, 87.5],
  [4, 85.5],
  [-1, 85],
  [-6, 83.5],
  [-10, 80],
  [-12, 76, "wall-e"],
  // the North: Bay of Seals, Karhold, Widow's Watch, the Bite
  [-10, 73],
  [-6, 71],
  [-3, 68],
  [2, 66.5],
  [6, 65.5],
  [7.5, 62.5],
  [4, 60],
  [0, 57.5],
  [-2, 54],
  [2, 51],
  [7, 49.5],
  [9.5, 47.5],
  [5, 45.5],
  [1, 44],
  [-1.5, 42],
  [-3.5, 39.5],
  [-4.6, 37.8],
  [-6.5, 36],
  [-8.5, 33.5],
  [-8, 30.5, "vale-n"],
  // the Vale: the Fingers, Gulltown's bay, the Bay of Crabs
  [-4, 28.5],
  [2, 28.5],
  [6, 30],
  [10, 33],
  [11, 30.5],
  [14, 32],
  [14, 28.5],
  [17, 28.5],
  [16.5, 25],
  [18.5, 22],
  [19, 17],
  [21, 15],
  [22, 13],
  [20.5, 11.2],
  [19, 11.8],
  [19.5, 9.8],
  [15, 9.6],
  [10, 10.6],
  [5, 11.2, "crab-n"],
  [3, 10.9],
  [2.6, 10.3],
  [3.2, 9.6],
  [5, 9, "crab-s"],
  // the crownlands: Crackclaw Point, Blackwater Bay, Massey's Hook
  [8, 8.2],
  [11.5, 7.8],
  [15, 6.5],
  [13, 4.5],
  [9, 3.6],
  [6.5, 3.2],
  [4.5, 1.9],
  [3, 1.3],
  [2.3, 0.3],
  [2.3, -1.2],
  [1.9, -2.1],
  [2.6, -2.7],
  [3.5, -3.2],
  [6, -3],
  [10, -2.4],
  [12.5, -1.4],
  [11.5, -3.8],
  [8.5, -5.5, "storm-n"],
  // the stormlands: Shipbreaker Bay, Cape Wrath
  [7.2, -8.5],
  [7.9, -11],
  [8.3, -12.4],
  [9.5, -14],
  [12.5, -15.2],
  [16, -17],
  [14.5, -19.5],
  [9.5, -19.6],
  [4, -19.4],
  [-1, -20, "dorne-ne"],
  // Dorne: the Sea of Dorne, the Broken Arm, the south coast
  [0, -22.6],
  [6, -23.6],
  [12, -24.8],
  [17, -26.6],
  [20.5, -28.4],
  [17.8, -30.3],
  [16.8, -31.5],
  [17.6, -33],
  [15.5, -34.3],
  [13.3, -34.6],
  [6, -36],
  [-2, -35.2],
  [-10, -36],
  [-17, -35],
  [-22, -33.2],
  [-24.6, -33],
  [-27, -33.2, "dorne-w"],
  // the Reach: Whispering Sound, the mouth of the Mander
  [-29, -33.6],
  [-29.8, -32.2],
  [-30.2, -30.4],
  [-31.3, -28.9],
  [-32.8, -30.4],
  [-33.6, -32.2],
  [-34.8, -32.8],
  [-36.3, -30.6],
  [-36, -25],
  [-35.2, -20],
  [-36.2, -16],
  [-36, -15],
  [-37, -12],
  [-36.6, -7.5, "reach-nw"],
  // the westerlands
  [-36, -4],
  [-35, -1],
  [-34.6, 2.2],
  [-35.2, 4.8],
  [-36.6, 7.5],
  [-36.2, 11],
  [-34.5, 12.6],
  [-33, 15],
  [-30.5, 17, "west-n"],
  // Ironman's Bay, the Cape of Eagles
  [-26.5, 17.6],
  [-23.5, 18.6],
  [-22, 19.4],
  [-21.6, 22],
  [-24, 24],
  [-21, 26, "neck-sw"],
  // the North again: Cape Kraken, Blazewater Bay, the Stony Shore, Sea Dragon Point, the Bay of Ice
  [-19.5, 29],
  [-23, 30],
  [-30, 29],
  [-29.5, 31.5],
  [-23, 32.5],
  [-19.6, 33.6],
  [-22, 36],
  [-27, 36.5],
  [-29, 39.5],
  [-25, 41],
  [-30, 43],
  [-36, 44],
  [-40, 47.5],
  [-38, 52],
  [-40.5, 56],
  [-44, 59],
  [-43, 62.5],
  [-38.5, 62],
  [-36, 64],
  [-33, 66.5],
  [-30, 69],
  [-29, 73],
  [-27, 76, "wall-w"],
  // the Frozen Shore
  [-28, 79],
  [-31, 83],
  [-35, 88],
  [-37, 95],
  [-36, 104],
  [-38, 115, "top-w"],
];

/** Essos, clockwise from Braavos along the north coast. It runs off the east side of the map. */
export const ESSOS: Corner[] = [
  [31, 34, "braavos"],
  [36, 33.5],
  [42, 31.5],
  [47, 30.5],
  [50, 27.5],
  [54, 29.5, "axe-w"],
  // the Axe
  [57, 31],
  [59.5, 37],
  [63, 36.5],
  [62.5, 30.5],
  [70, 29.5, "norvos-e"],
  [80, 31.5],
  [88, 33.5, "sarnor-w"],
  [96, 32.5],
  [104, 33.5],
  [112, 35, "ifeq-w"],
  [120, 37],
  [128, 40.5],
  [136, 42.5],
  [146, 44.5],
  [156, 43.5],
  [170, 46],
  [180, 48],
  [190, 50.5],
  [205, 50],
  [220, 52],
  [240, 51],
  [260, 52.5],
  [280, 50.5],
  [305, 48, "ne"],
  [305, -41, "se"],
  // the Shadow Lands and Asshai at the mouth of the Ash
  [292, -42],
  [286.5, -40.5],
  [284.5, -39.2],
  [281, -39],
  [278.5, -36],
  [276, -33],
  [270, -27, "shadow-w"],
  // the Jade Sea
  [262, -22, "yiti-e"],
  [255, -17.5],
  [247, -13.5],
  [241, -10],
  [236.5, -9.8],
  [232, -9],
  [225, -12],
  [217, -11],
  [211, -10],
  [206, -13, "yiti-w"],
  [200, -16.5],
  [195, -20.5],
  [190, -24.5],
  // Qarth on its cape
  [188, -26.5],
  [187.5, -30.5],
  [184, -32],
  [180, -31],
  [177, -28.5],
  [172, -27],
  [164, -25.5],
  [155, -24.5],
  [148, -22.5],
  [140, -20, "waste-w"],
  // Ghiscar
  [135, -23],
  [130, -30],
  [127, -35.5],
  [124.5, -36],
  [123, -32.5],
  [121.5, -28.5],
  [120.2, -25.5],
  [119.5, -21, "yunkai-s"],
  // Slaver's Bay
  [119.8, -17.5],
  [119, -13.5],
  [119.6, -10.5],
  [119.9, -8.4],
  [118, -7.2],
  [114, -8],
  [110, -9.2],
  [105, -10.2, "tolos"],
  // what is left of the Valyrian peninsula
  [103.5, -12],
  [104.5, -16],
  [102, -18.5],
  [99.5, -17.5],
  [96, -18.8],
  [94.5, -15.5],
  [95, -12.5],
  [91, -11.5],
  [86, -12.5, "orange-e"],
  [80, -13.5],
  [76, -14.2],
  // the mouth of the Rhoyne
  [74.2, -15.6],
  [73.2, -14.8],
  [72.2, -15.6],
  [69, -14.4],
  [64, -13.6, "volantis-w"],
  // the Disputed Lands, the Sea of Myrth
  [58, -15],
  [52, -17],
  [46, -18.6],
  [41, -17.6],
  [38, -14.5],
  [36.5, -11],
  [37.5, -8.6],
  [40.5, -9],
  [43.2, -8.2],
  [44.8, -6.4],
  [43.5, -4.6],
  [39, -4],
  [35.6, -3, "myr-n"],
  // the Bay of Pentos, Andalos
  [35, 0],
  [36.8, 2],
  [36.4, 4.6],
  [34.5, 8, "andalos-s"],
  [33.2, 14],
  [32, 21],
  [30.3, 27],
  [29.5, 31],
];

/** The two southern continents: only their north coasts are on the map. */
export const SOTHORYOS: Corner[] = [
  [95, -80],
  [96, -66],
  [102, -61.5],
  [110, -60],
  [118, -61],
  [126, -59.5],
  [134, -61],
  [142, -63],
  [150, -62],
  [160, -64],
  [168, -68],
  [172, -80],
];
export const ULTHOS: Corner[] = [
  [262, -80],
  [266, -62],
  [275, -56],
  [286, -55],
  [298, -57],
  [305, -60],
  [305, -80],
];

export interface Isle {
  name: string;
  e: number;
  n: number;
  r: number;
  /** East–west stretch (1: round). */
  stretch?: number;
  turn?: number;
  /** What covers it, over the grass: a ground kind, drawn a little smaller than the island. */
  cover?: number;
  /** Peaks to raise on it, and of what. */
  peaks?: number;
  rock?: number;
  /** Listed for the search under this context line. */
  of?: string;
}

const isles = (of: string | undefined, rows: (Omit<Isle, "of" | "name"> & { name: string })[]): Isle[] =>
  rows.map((row) => ({ ...row, of }));

/** The city of Braavos stands on these (offsets and sizes in units), in its lagoon off the north-western tip of Essos. */
export const BRAAVOS = { e: 27.7 * EAST, n: 33.7 * NORTH };
export const BRAAVOS_ISLES: [de: number, dn: number, r: number][] = [
  [0, 0, 62],
  [108, 28, 50],
  [-98, 46, 46],
  [-34, -104, 52],
  [78, -84, 46],
  [18, 112, 46],
  [-128, -52, 40],
  [118, 112, 36],
];
/** The rocks that shelter the lagoon, and the two the Titan stands on. */
export const BRAAVOS_SHIELD: [de: number, dn: number, r: number, stretch: number, turn: number][] = [
  [-272, 60, 44, 2.1, 1.75],
  [-250, -110, 42, 2.2, 1.2],
  [-150, -246, 40, 2.2, 0.55],
  [-60, 270, 40, 2.3, 0.2],
  [130, 262, 36, 2, -0.35],
];
export const TITAN = { de: -196, dn: 196 };

export const ISLANDS: Isle[] = [
  ...isles("The North", [
    { name: "Skagos", e: 5, n: 73.5, r: 2.6, stretch: 0.8, cover: G.Rock, peaks: 4, rock: R.greyStone },
    { name: "Skane", e: 2.6, n: 78, r: 0.8, cover: G.Rock },
    { name: "Bear Island", e: -38.5, n: 68.5, r: 2.3, cover: G.Forest },
  ]),
  ...isles("Iron Islands", [
    { name: "Pyke", e: -39.5, n: 17.6, r: 1.9, cover: G.Rock },
    { name: "Great Wyk", e: -43.6, n: 22.6, r: 2.6, cover: G.Rock, peaks: 3, rock: R.darkStone },
    { name: "Old Wyk", e: -40, n: 25.6, r: 1.3, cover: G.Rock },
    { name: "Harlaw", e: -34, n: 22, r: 2, cover: G.Rock },
    { name: "Orkmont", e: -38.8, n: 21.4, r: 1.5, cover: G.Rock, peaks: 2, rock: R.darkStone },
    { name: "Saltcliffe", e: -43.6, n: 17.8, r: 1.1, cover: G.Rock },
    { name: "Blacktyde", e: -36.4, n: 26.2, r: 1.1, cover: G.Rock },
  ]),
  ...isles("Westerlands", [{ name: "Fair Isle", e: -40.6, n: 9.4, r: 1.6 }]),
  ...isles("The Reach", [
    { name: "The Arbor", e: -35, n: -38, r: 1.9, stretch: 1.8, cover: G.Garden },
    { name: "Greenshield", e: -39, n: -13.8, r: 0.6 },
    { name: "Greyshield", e: -40.3, n: -15.3, r: 0.6 },
    { name: "Southshield", e: -38.9, n: -16.8, r: 0.6 },
    { name: "Oakenshield", e: -40.5, n: -17.9, r: 0.6 },
  ]),
  ...isles("Stormlands", [
    { name: "Tarth", e: 13.2, n: -10.2, r: 1.7, stretch: 0.6 },
    { name: "Estermont", e: 17.2, n: -22.2, r: 1.4 },
  ]),
  ...isles("Crownlands", [
    { name: "Dragonstone", e: 18.6, n: 0.2, r: 1.9, cover: G.Rock },
    { name: "Driftmark", e: 15, n: 1, r: 1.3 },
  ]),
  ...isles("The Vale", [
    { name: "Sweetsister", e: 1.4, n: 35.6, r: 1.1 },
    { name: "Longsister", e: 4.4, n: 34, r: 0.9, stretch: 1.5 },
    { name: "Littlesister", e: 5.6, n: 37.2, r: 0.7 },
  ]),
  ...isles("Stepstones", [
    { name: "Stepstone", e: 23.5, n: -27.2, r: 0.9, cover: G.Scrub },
    { name: "Bloodstone", e: 26.5, n: -25.6, r: 1.2, cover: G.Scrub },
    { name: "Stepstone", e: 29, n: -23.4, r: 0.8, cover: G.Scrub },
    { name: "Grey Gallows", e: 31.3, n: -21.8, r: 1.1, cover: G.Scrub },
    { name: "Stepstone", e: 33.8, n: -19.8, r: 0.8, cover: G.Scrub },
    { name: "Stepstone", e: 36.2, n: -18.7, r: 0.6, cover: G.Scrub },
  ]),
  ...isles("Free Cities", [
    { name: "Tyrosh", e: 33.4, n: -14.6, r: 2 },
    { name: "Lys", e: 42, n: -24, r: 1.9 },
    { name: "Lorath", e: 46.5, n: 36.3, r: 1.7 },
    { name: "Lorassyon", e: 49.4, n: 35, r: 0.8, cover: G.Scrub },
    { name: "Lorath Bay isle", e: 44.6, n: 34.4, r: 0.7, cover: G.Scrub },
  ]),
  ...isles("Shivering Sea", [
    { name: "Ib", e: 132, n: 56, r: 5.4, stretch: 1.5, cover: G.Forest },
    { name: "Far Ib", e: 143.5, n: 60.5, r: 1.1, cover: G.Rock },
  ]),
  ...isles("Slaver's Bay", [
    { name: "Isle of Cedars", e: 112.5, n: -17, r: 1.6, cover: G.Forest },
    { name: "Elyria", e: 107.4, n: -12.8, r: 1 },
    { name: "New Ghis", e: 122, n: -40, r: 1.5 },
    { name: "Ghaen", e: 132, n: -39.5, r: 1.5, cover: G.Scrub },
  ]),
  // what the Doom left of the peninsula, around the Smoking Sea
  ...isles("Valyria", [
    { name: "Valyria", e: 99, n: -20.8, r: 1.4, cover: G.Rock },
    { name: "Valyrian isle", e: 93.2, n: -21.4, r: 1.6, cover: G.Rock, peaks: 2, rock: R.roofTar },
    { name: "Valyrian isle", e: 96.8, n: -25, r: 1.3, cover: G.Rock, peaks: 2, rock: R.roofTar },
    { name: "Valyrian isle", e: 101.6, n: -24.2, r: 1.5, cover: G.Rock, peaks: 2, rock: R.roofTar },
    { name: "Valyrian isle", e: 104.8, n: -20.8, r: 1, cover: G.Rock, peaks: 1, rock: R.roofTar },
  ]),
  ...isles("Summer Sea", [
    { name: "Naath", e: 87, n: -58, r: 2.4, stretch: 0.8, cover: G.Forest },
    { name: "Talon", e: 100, n: -53, r: 1.2, cover: G.Forest },
    { name: "Ax Isle", e: 104, n: -55.6, r: 1.5, cover: G.Forest },
    { name: "Isle of Tears", e: 108.6, n: -53.4, r: 1.1, cover: G.Forest },
    { name: "Isle of Toads", e: 112.2, n: -56.2, r: 1.2, cover: G.Wetland },
  ]),
  ...isles("Summer Isles", [
    { name: "Walano", e: 44, n: -50.5, r: 2.2, stretch: 1.3, cover: G.Forest },
    { name: "Omboru", e: 47.6, n: -55.2, r: 1.8, cover: G.Forest },
    { name: "Jhala", e: 51.5, n: -61, r: 3.6, stretch: 1.4, cover: G.Forest },
    { name: "Koj", e: 40, n: -45.6, r: 1, cover: G.Forest },
  ]),
  ...isles("Jade Sea", [
    { name: "Great Moraq", e: 190, n: -40.5, r: 4.4, stretch: 1.5, cover: G.Forest },
    { name: "Lesser Moraq", e: 199.8, n: -36.4, r: 1.4, cover: G.Forest },
    { name: "Isle of Elephants", e: 176.4, n: -39.6, r: 1.7, cover: G.Forest },
    { name: "Leng", e: 233, n: -36, r: 6, stretch: 0.5, cover: G.Forest },
    { name: "Marahai", e: 256, n: -41, r: 1.8, cover: G.Forest },
  ]),
];

/** The Thousand Islands, north of the Bones: a scatter of rocks, named as one. */
export const THOUSAND_ISLANDS = { e: 203, n: 57.5, spread: 5.5, count: 16 };

export interface Lake {
  name: string;
  e: number;
  n: number;
  r: number;
  stretch?: number;
  /** An island in the middle, of this radius. */
  eye?: number;
  of: string;
}

export const LAKES: Lake[] = [
  { name: "Gods Eye", e: -6.5, n: 4.3, r: 2.2, eye: 0.55, of: "Riverlands" },
  { name: "Long Lake", e: -13, n: 63, r: 1.9, stretch: 0.42, of: "The North" },
  { name: "Torrhen's lake", e: -29.4, n: 48.6, r: 1, of: "The North" },
  { name: "Red Lake", e: -30.4, n: -12.2, r: 0.8, of: "The Reach" },
  { name: "Dagger Lake", e: 66, n: 6.2, r: 1.5, of: "Essos" },
  { name: "Womb of the World", e: 169.6, n: 27.6, r: 1.4, of: "Dothraki Sea" },
  { name: "Silver Sea", e: 105, n: 25.6, r: 1.3, stretch: 1.6, of: "Kingdom of Sarnor" },
  { name: "Hidden Sea", e: 292.6, n: 6, r: 2.4, of: "The Further East" },
];

export interface River {
  name: string;
  /** Flat east, north pairs in hundreds, source first. */
  path: number[];
  width: number;
  of?: string;
  /** Listed for the search (the main rivers). */
  rank?: number;
  /** Runs through dry country: gets green banks. */
  banks?: boolean;
}

export const RIVERS: River[] = [
  // beyond the Wall and the North
  {
    name: "Milkwater",
    path: [-30.5, 97, -29.2, 88, -27.4, 82, -27.2, 78.2, -28.3, 78.6],
    width: 16,
    of: "Beyond the Wall",
    rank: 66,
  },
  {
    name: "Antler River",
    path: [-13, 93, -7, 89, -3, 86.4, -3.4, 84.4],
    width: 14,
    of: "Beyond the Wall",
    rank: 50,
  },
  {
    name: "Last River",
    path: [-14, 70, -9, 66, -2.5, 62.5, 2.2, 58.9],
    width: 14,
    of: "The North",
    rank: 50,
  },
  { name: "Weeping Water", path: [-12, 58.4, -7, 55.4, -2.2, 54.2], width: 14, of: "The North", rank: 52 },
  {
    name: "White Knife",
    path: [-13, 61.2, -14.2, 54, -11, 47, -8, 42, -6.8, 39, -5.6, 36.9],
    width: 22,
    of: "The North",
    rank: 70,
  },
  {
    name: "Fever River",
    path: [-16.5, 38.5, -18.4, 35.6, -19.6, 33.7],
    width: 13,
    of: "The North",
    rank: 46,
  },
  // the Trident and its forks
  {
    name: "Green Fork",
    path: [-12.6, 31.5, -13.2, 26, -13.4, 22.4, -11.5, 17, -8, 13.5, -5.6, 11.6],
    width: 20,
    of: "Riverlands",
    rank: 70,
  },
  {
    name: "Blue Fork",
    path: [-18.5, 21.6, -15, 17.5, -11, 14.5, -7.6, 12.3, -5.6, 11.6],
    width: 16,
    of: "Riverlands",
    rank: 64,
  },
  {
    name: "Red Fork",
    path: [-29, 15, -25.2, 12.6, -21.5, 9.8, -17, 8.6, -12.5, 9.8, -8.5, 11, -5.6, 11.6],
    width: 20,
    of: "Riverlands",
    rank: 70,
  },
  { name: "Tumblestone", path: [-28, 5.4, -24.6, 7.2, -21.5, 9.8], width: 16, of: "Riverlands", rank: 60 },
  { name: "The Trident", path: [-5.6, 11.6, -1.5, 11.1, 2.7, 10.4], width: 30, of: "Riverlands", rank: 84 },
  {
    name: "Blackwater Rush",
    path: [-22, 4, -16, 1, -10, -1.4, -5, -2.2, -1, -2.5, 2, -2.1],
    width: 24,
    of: "Crownlands",
    rank: 80,
  },
  { name: "Gods Eye river", path: [-5.9, 2.1, -4.8, -0.2, -4.4, -2.2], width: 14, of: "Riverlands" },
  // the south
  {
    name: "The Mander",
    path: [-8.4, -5, -9, -8, -13.5, -11.5, -18, -14, -22.2, -16.4, -29, -16.5, -36, -15.2],
    width: 28,
    of: "The Reach",
    rank: 80,
  },
  {
    name: "Honeywine",
    path: [-29.5, -23.5, -31.6, -26.5, -31.3, -28.9],
    width: 18,
    of: "The Reach",
    rank: 66,
  },
  {
    name: "Greenblood",
    path: [-2, -30.4, 5.5, -31.6, 10, -33, 13.3, -34.5],
    width: 20,
    of: "Dorne",
    rank: 70,
  },
  { name: "Torrentine", path: [-21, -25.5, -23.5, -29, -24.6, -32.9], width: 16, of: "Dorne", rank: 58 },
  { name: "Brimstone", path: [-6.5, -29, -4.4, -32, -2.6, -35.1], width: 13, of: "Dorne", rank: 50 },
  // Essos
  {
    name: "The Rhoyne",
    path: [45, 21, 48, 16, 55, 12, 61, 8.5, 65, 6.8, 67.5, 3, 68.5, -1.5, 70, -7, 72, -11.5, 73.2, -14.8],
    width: 36,
    of: "Essos",
    rank: 88,
  },
  { name: "Noyne", path: [58.4, 26.4, 57.5, 20, 56, 15, 55, 12], width: 18, of: "Essos", rank: 56 },
  { name: "Qhoyne", path: [80.4, 21.5, 76, 15.5, 71, 10, 67, 6.8], width: 18, of: "Essos", rank: 56 },
  {
    name: "Sarne",
    path: [140, 27, 128, 29.5, 118, 30, 108, 31.5, 100.5, 32.9],
    width: 22,
    of: "Kingdom of Sarnor",
    rank: 60,
    banks: true,
  },
  {
    name: "Skahazadhan",
    path: [150, -3, 140, -5.5, 130, -6.5, 124.5, -7.6, 119.9, -8.3],
    width: 22,
    of: "Slaver's Bay",
    rank: 66,
    banks: true,
  },
  {
    name: "The Ash",
    path: [298, -24, 292, -30, 287, -36, 284.5, -39.2],
    width: 20,
    of: "The Shadow Lands",
    rank: 60,
  },
  { name: "Yi Ti river", path: [236, 14, 237.4, 2, 236.4, -9.7], width: 18, of: "Yi Ti" },
];

export interface Range {
  name: string;
  /** Flat east, north pairs in hundreds. */
  path: number[];
  /** Units. */
  width: number;
  height: number;
  rock: number;
  /** Peaks taller than this are capped; omit for none. */
  capAbove?: number;
  cap?: number;
  /** Ground under the range (rock unless given; negative for none). */
  floor?: number;
  spacing?: number;
  of?: string;
  rank?: number;
}

export const RANGES: Range[] = [
  {
    name: "Frostfangs",
    path: [-33.5, 109, -32, 98, -31, 90, -29.6, 82.5],
    width: 520,
    height: 235,
    rock: R.greyStone,
    capAbove: 0,
    floor: -1,
    of: "Beyond the Wall",
    rank: 78,
  },
  {
    name: "Lands of Always Winter",
    path: [-27, 108.5, -14, 107.5, -1, 108.5],
    width: 330,
    height: 150,
    rock: R.sidingBlue,
    capAbove: 0,
    floor: -1,
    of: "Beyond the Wall",
    rank: 74,
  },
  {
    name: "Northern mountains",
    path: [-31.6, 66.4, -27, 70, -22.6, 73.4],
    width: 380,
    height: 175,
    rock: R.greyStone,
    capAbove: 70,
    of: "The North",
    rank: 56,
  },
  {
    name: "Mountains of the Moon",
    path: [-5.6, 25.6, 0, 22, 5, 19, 10.5, 16.5, 15.6, 13.8],
    width: 600,
    height: 215,
    rock: R.greyStone,
    capAbove: 135,
    of: "The Vale",
    rank: 80,
  },
  {
    name: "Mountains of the Moon, north",
    path: [3, 26.4, 9, 27, 14.4, 26.4],
    width: 300,
    height: 150,
    rock: R.greyStone,
    capAbove: 120,
    of: "The Vale",
  },
  {
    name: "Mountains of the Moon, south",
    path: [-3, 18, 2, 14.6, 8, 12.3],
    width: 280,
    height: 160,
    rock: R.greyStone,
    capAbove: 125,
    of: "The Vale",
  },
  {
    name: "Western hills",
    path: [-31, 14, -29.6, 8, -29, 2, -30.4, -3],
    width: 430,
    height: 118,
    rock: R.tan,
    of: "Westerlands",
    rank: 50,
  },
  {
    name: "Red Mountains",
    path: [-24.4, -27.2, -20, -25.6, -13, -23.8, -6, -22, -1.6, -21.2],
    width: 420,
    height: 185,
    rock: R.redStone,
    floor: G.Earth,
    of: "Dorne",
    rank: 78,
  },
  {
    name: "Hills of Norvos",
    path: [51.5, 27.6, 57, 27.2, 63.4, 27.6],
    width: 330,
    height: 112,
    rock: R.greyStone,
    of: "Essos",
    rank: 56,
  },
  {
    name: "Velvet Hills",
    path: [37, 15.4, 41.4, 13.4],
    width: 280,
    height: 80,
    rock: R.scrub,
    floor: -1,
    of: "Andalos",
    rank: 48,
  },
  {
    name: "Painted Mountains",
    path: [94, 4.4, 100, 0.4, 104, -4.4],
    width: 390,
    height: 150,
    rock: R.salmon,
    floor: G.Earth,
    of: "Essos",
    rank: 56,
  },
  {
    name: "Khyzai Pass",
    path: [127, -1.4, 136, -0.6, 146, -3],
    width: 290,
    height: 140,
    rock: R.ochre,
    of: "Slaver's Bay",
    rank: 50,
  },
  {
    name: "Ghiscari hills",
    path: [125, -13.4, 126.4, -20, 129, -26],
    width: 280,
    height: 105,
    rock: R.ochre,
    floor: G.Sand,
    of: "Slaver's Bay",
  },
  {
    name: "Mother of Mountains",
    path: [168.4, 33.6, 174.4, 30.4],
    width: 300,
    height: 150,
    rock: R.greyStone,
    capAbove: 120,
    of: "Dothraki Sea",
  },
  {
    name: "Krazaaj Zasqa",
    path: [175.6, 44, 182.4, 41.4],
    width: 300,
    height: 150,
    rock: R.whiteBrick,
    capAbove: 110,
    of: "Essos",
    rank: 46,
  },
  {
    name: "Bone Mountains",
    path: [188.4, 49, 190, 38, 189, 26, 191, 14, 190, 2, 192, -9, 190.6, -17],
    width: 740,
    height: 275,
    rock: R.limestone,
    capAbove: 185,
    of: "Essos",
    rank: 82,
  },
  {
    name: "Mountains of the Morn",
    path: [276, 36, 281, 24, 285, 12, 292, -2, 298, -12],
    width: 600,
    height: 245,
    rock: R.greyStone,
    capAbove: 170,
    of: "The Further East",
    rank: 60,
  },
  {
    name: "Shadow mountains",
    path: [275.6, -30, 284, -27, 292, -22.6, 301, -20],
    width: 500,
    height: 225,
    rock: R.roofTar,
    floor: -1,
    of: "The Shadow Lands",
    rank: 58,
  },
  {
    name: "Vale of Shadows",
    path: [290.4, -36.4, 300, -33.4],
    width: 340,
    height: 175,
    rock: R.roofTar,
    floor: -1,
    of: "The Shadow Lands",
  },
  {
    name: "Mountains of Ib",
    path: [127.6, 57.4, 136.4, 56.6],
    width: 250,
    height: 130,
    rock: R.greyStone,
    capAbove: 100,
    of: "Shivering Sea",
  },
  {
    name: "Shrinking hills",
    path: [222, 16.4, 230.4, 19],
    width: 280,
    height: 105,
    rock: R.tan,
    of: "Yi Ti",
  },
];

export interface Biome {
  kind: number;
  /** Corners in hundreds. */
  ring: number[][];
  /** Listed for the search, and outlined as a region of this continent or sea. */
  name?: string;
  of?: string;
  /** "park" for a forest, "hood" for a land. */
  as?: "park" | "hood";
  rank?: number;
}

export const BIOMES: Biome[] = [
  // ---- Westeros
  {
    kind: G.Forest,
    name: "Wolfswood",
    of: "The North",
    as: "park",
    rank: 78,
    ring: [
      [-37, 61.5],
      [-30, 65],
      [-23.5, 63],
      [-22, 57.5],
      [-25.5, 51.5],
      [-33, 50],
      [-38, 54],
    ],
  },
  {
    kind: G.Forest,
    ring: [
      [-13, 72],
      [-6.5, 70.4],
      [-5.4, 66.6],
      [-12, 66],
    ],
  },
  {
    kind: G.Forest,
    name: "Hornwood forest",
    of: "The North",
    as: "park",
    rank: 44,
    ring: [
      [-8, 50],
      [-1, 50.5],
      [0, 45.5],
      [-6, 44.5],
    ],
  },
  {
    kind: G.Wetland,
    name: "The Neck",
    of: "The North",
    as: "park",
    rank: 78,
    ring: [
      [-19.6, 34.2],
      [-9.4, 34.2],
      [-8.4, 30],
      [-10.4, 25.6],
      [-18.6, 26],
      [-20.6, 29],
    ],
  },
  {
    kind: G.Forest,
    name: "Whispering Wood",
    of: "Riverlands",
    as: "park",
    rank: 60,
    ring: [
      [-20, 14.6],
      [-16.2, 15.6],
      [-15.6, 12.6],
      [-19.6, 11.6],
    ],
  },
  {
    kind: G.Forest,
    ring: [
      [8, 23.6],
      [13.6, 24],
      [15.4, 20.2],
      [10, 19.6],
    ],
  },
  {
    kind: G.Wetland,
    ring: [
      [8, 7],
      [13, 6.8],
      [12, 5],
      [8.6, 4.3],
    ],
  },
  {
    kind: G.Forest,
    name: "Kingswood",
    of: "Crownlands",
    as: "park",
    rank: 80,
    ring: [
      [-6, -3.4],
      [1.2, -3.6],
      [5.8, -4],
      [6.4, -8.4],
      [2, -10.4],
      [-5, -9],
    ],
  },
  {
    kind: G.Park,
    ring: [
      [2, -10.6],
      [7, -9],
      [8.6, -13.6],
      [3, -19],
      [-4, -19],
      [-6, -12],
    ],
  },
  {
    kind: G.Forest,
    name: "Rainwood",
    of: "Stormlands",
    as: "park",
    rank: 72,
    ring: [
      [7, -14.6],
      [11.6, -15.6],
      [14.8, -17.3],
      [13.6, -19.2],
      [6.6, -19],
    ],
  },
  {
    kind: G.Forest,
    ring: [
      [-34.6, -1.6],
      [-31.4, -0.8],
      [-31.6, -5.6],
      [-35.4, -6.4],
    ],
  },
  {
    kind: G.Lawn,
    ring: [
      [-36.4, -7.4],
      [-24, -5.6],
      [-10, -4.4],
      [-6.4, -10],
      [-10, -17],
      [-18, -21.6],
      [-25, -25.6],
      [-30, -28],
      [-36.2, -24.6],
      [-37, -15],
    ],
  },
  {
    kind: G.Scrub,
    ring: [
      [-25.4, -27],
      [-13, -22.6],
      [-1.6, -20.6],
      [12, -24.4],
      [21, -28.4],
      [18, -34.6],
      [0, -36.6],
      [-18, -36],
      [-26.4, -33.8],
    ],
  },
  {
    kind: G.Sand,
    name: "Sands of Dorne",
    of: "Dorne",
    as: "park",
    rank: 64,
    ring: [
      [-17, -26.6],
      [-8, -25],
      [2, -25.6],
      [9, -27],
      [12, -30.4],
      [9, -33.2],
      [-2, -33.6],
      [-12, -34.2],
      [-19, -32],
    ],
  },
  // ---- Essos, west
  {
    kind: G.Forest,
    ring: [
      [40, 22],
      [46, 24],
      [47, 19.6],
      [41, 18],
    ],
  },
  {
    kind: G.Park,
    ring: [
      [49.6, 29],
      [64, 29],
      [66, 22],
      [56, 20],
    ],
  },
  {
    kind: G.Forest,
    name: "Forest of Qohor",
    of: "Essos",
    as: "park",
    rank: 76,
    ring: [
      [66, 27.6],
      [78, 29],
      [90, 29.6],
      [93, 22],
      [88, 14],
      [78, 12.6],
      [70, 15],
      [65, 20],
    ],
  },
  {
    kind: G.Scrub,
    name: "Disputed Lands",
    of: "Essos",
    as: "hood",
    ring: [
      [40, -5.6],
      [48, -4.6],
      [56, -8],
      [57.4, -14.4],
      [50, -17],
      [42, -17.2],
      [38, -12],
    ],
  },
  {
    kind: G.Wetland,
    name: "The Sorrows",
    of: "Essos",
    as: "park",
    rank: 60,
    ring: [
      [66.4, 3],
      [70, 2],
      [71.4, -4],
      [68.4, -5],
    ],
  },
  {
    kind: G.Scrub,
    ring: [
      [86, -2],
      [100, -3],
      [104, -9.4],
      [95, -11.6],
      [86, -11.2],
    ],
  },
  {
    kind: G.Earth,
    ring: [
      [95.4, -12.9],
      [103, -12.4],
      [103.8, -16],
      [101.6, -17.9],
      [96.4, -18.1],
      [95.1, -15.5],
    ],
  },
  // ---- the grass sea and what borders it
  {
    kind: G.Steppe,
    name: "Dothraki Sea",
    of: "Essos",
    as: "hood",
    ring: [
      [87, 28],
      [100, 29.6],
      [112, 31.6],
      [128, 31],
      [142, 35.4],
      [158, 40.4],
      [172, 42.6],
      [183, 38],
      [184, 20],
      [184, 4],
      [176, -3],
      [160, -5],
      [148, -2],
      [130, 1],
      [112, 3],
      [100, 8],
      [90, 12],
      [87, 20],
    ],
  },
  {
    kind: G.Scrub,
    ring: [
      [165.6, 26],
      [171, 24.4],
      [174, 28],
      [171, 31],
      [166, 30],
    ],
  },
  {
    kind: G.Scrub,
    ring: [
      [101.6, 24],
      [108.6, 23.6],
      [109.6, 27.4],
      [102, 27.8],
    ],
  },
  {
    kind: G.Forest,
    name: "Kingdom of the Ifequevron",
    of: "Essos",
    as: "hood",
    ring: [
      [113, 34.4],
      [128, 39.8],
      [140, 42.4],
      [141, 38],
      [128, 34],
      [116, 31.6],
    ],
  },
  {
    kind: G.Scrub,
    name: "Lhazar",
    of: "Essos",
    as: "hood",
    ring: [
      [132, -4.6],
      [146, -3.4],
      [152, -8.6],
      [146, -13],
      [136, -12.4],
      [130.6, -9],
    ],
  },
  {
    kind: G.Scrub,
    ring: [
      [121, -27],
      [133.4, -23.4],
      [130, -29.6],
      [127, -34.6],
      [124.6, -35.4],
    ],
  },
  {
    kind: G.Earth,
    name: "Red Waste",
    of: "Essos",
    as: "hood",
    ring: [
      [150, -6],
      [176, -5],
      [184, -8],
      [187, -20],
      [183, -24],
      [172, -24.4],
      [158, -22],
      [147, -19.6],
      [142.6, -16.4],
      [144, -10],
    ],
  },
  {
    kind: G.Sand,
    ring: [
      [138, -18],
      [148, -20.4],
      [158, -22.6],
      [172, -25],
      [184, -24.6],
      [189.6, -21],
      [196, -22],
      [188.6, -33],
      [176, -29.4],
      [160, -26.4],
      [146, -23.6],
      [136, -22.6],
    ],
  },
  // ---- beyond the Bones
  {
    kind: G.Sand,
    name: "Great Sand Sea",
    of: "Essos",
    as: "hood",
    ring: [
      [197, 22],
      [212, 21],
      [216, 10],
      [213, -2],
      [203, -5],
      [196.4, 2],
      [195.6, 12],
    ],
  },
  {
    kind: G.Sand,
    name: "Cannibal Sands",
    of: "Essos",
    as: "park",
    rank: 50,
    ring: [
      [196, 46],
      [210, 47.4],
      [212, 42.6],
      [198, 41.6],
    ],
  },
  {
    kind: G.Steppe,
    name: "Plains of the Jogos Nhai",
    of: "Essos",
    as: "hood",
    ring: [
      [198, 40],
      [220, 42],
      [250, 40.4],
      [270, 40],
      [272, 28],
      [258, 22],
      [236, 20],
      [214, 22],
      [199, 26],
    ],
  },
  {
    kind: G.Lawn,
    ring: [
      [205, -11],
      [214, -8],
      [232, -6.6],
      [247, -11.4],
      [261, -19],
      [262, -8],
      [254, 8],
      [240, 14],
      [220, 14],
      [207, 6],
    ],
  },
  {
    kind: G.Forest,
    ring: [
      [214, 6],
      [226, 9],
      [243, 8],
      [254, 0],
      [258, -10],
      [251, -12],
      [243, -4],
      [228, -2],
      [216, -3],
    ],
  },
  {
    kind: G.Forest,
    ring: [
      [246, -4],
      [262, -6],
      [268, -18],
      [262, -21],
      [252, -15],
    ],
  },
  {
    kind: G.Scrub,
    ring: [
      [264, -4],
      [274, -18],
      [278, 0],
      [273, 16],
      [264, 12],
    ],
  },
  {
    kind: G.Forest,
    name: "Mossovy",
    of: "Essos",
    as: "hood",
    ring: [
      [206, 48.6],
      [230, 50],
      [262, 50.6],
      [290, 48.6],
      [296, 43],
      [270, 41.6],
      [240, 43],
      [212, 43],
    ],
  },
  {
    kind: G.Rock,
    name: "Grey Waste",
    of: "Essos",
    as: "hood",
    ring: [
      [272, 40],
      [299.5, 41.6],
      [299.5, 21],
      [286, 18],
      [273, 28],
    ],
  },
  {
    kind: G.Rock,
    ring: [
      [270, -24],
      [284, -18],
      [306, -13],
      [306, -43],
      [290, -43],
      [279, -41],
      [274, -33],
    ],
  },
];

/**
 * A region: a ring that follows the coast where it meets it and a made-up border elsewhere.
 * Each piece is either a stretch of coast ("from>to", two corner names, the way the coast runs)
 * or inland corners in hundreds.
 */
export interface Region {
  name: string;
  of: string;
  coast: "westeros" | "essos";
  ring: (string | number[][])[];
}

/** Where three regions meet, so each border is written once. */
const J = {
  neck: [-10.5, 27.5],
  crownReachRiver: [-5.5, -1.5],
  crownStormReach: [-4.5, -6.5],
  stormDorneReach: [-14, -22.5],
  reachWestRiver: [-22, -3],
  // Essos
  andalNorvos: [52, 22],
  nySar: [55, 12.5],
  dagger: [64, 8.6],
  norvosQohor: [68, 21],
  flatSouth: [57, -3],
  rhoyneEast: [86, 5],
};

export const REGIONS: Region[] = [
  { name: "Beyond the Wall", of: "Westeros", coast: "westeros", ring: ["wall-w>wall-e"] },
  {
    name: "The North",
    of: "Westeros",
    coast: "westeros",
    ring: ["wall-e>vale-n", [J.neck], "neck-sw>wall-w"],
  },
  {
    name: "The Vale",
    of: "Westeros",
    coast: "westeros",
    ring: ["vale-n>crab-n", [[1, 12.5], [-4, 15.5], [-8.5, 21], J.neck]],
  },
  {
    name: "Riverlands",
    of: "Westeros",
    coast: "westeros",
    ring: [
      "west-n>neck-sw",
      [J.neck, [-8.5, 21], [-4, 15.5], [1, 12.5]],
      "crab-n>crab-s",
      [[1, 6.5], [-3, 3], J.crownReachRiver, [-13, -1.5], J.reachWestRiver, [-25.5, 6], [-27.5, 12.5]],
    ],
  },
  {
    name: "Westerlands",
    of: "Westeros",
    coast: "westeros",
    ring: ["reach-nw>west-n", [[-27.5, 12.5], [-25.5, 6], J.reachWestRiver, [-30, -6]]],
  },
  {
    name: "Crownlands",
    of: "Westeros",
    coast: "westeros",
    ring: ["crab-s>storm-n", [[3, -7.5], J.crownStormReach, J.crownReachRiver, [-3, 3], [1, 6.5]]],
  },
  {
    name: "Stormlands",
    of: "Westeros",
    coast: "westeros",
    ring: [
      "storm-n>dorne-ne",
      [[-6, -21.5], J.stormDorneReach, [-10.5, -16], [-6, -11], J.crownStormReach, [3, -7.5]],
    ],
  },
  {
    name: "Dorne",
    of: "Westeros",
    coast: "westeros",
    ring: ["dorne-ne>dorne-w", [[-25.5, -28], [-20, -25], J.stormDorneReach, [-6, -21.5]]],
  },
  {
    name: "The Reach",
    of: "Westeros",
    coast: "westeros",
    ring: [
      "dorne-w>reach-nw",
      [
        [-30, -6],
        J.reachWestRiver,
        [-13, -1.5],
        J.crownReachRiver,
        J.crownStormReach,
        [-6, -11],
        [-10.5, -16],
        J.stormDorneReach,
        [-20, -25],
        [-25.5, -28],
      ],
    ],
  },
  // ---- Essos
  {
    name: "Andalos",
    of: "Essos",
    coast: "essos",
    ring: ["andalos-s>axe-w", [J.andalNorvos, [44, 14], [38, 9]]],
  },
  {
    name: "Hills of Norvos",
    of: "Essos",
    coast: "essos",
    ring: ["axe-w>norvos-e", [J.norvosQohor, J.dagger, J.nySar, J.andalNorvos]],
  },
  {
    name: "Qohor",
    of: "Essos",
    coast: "essos",
    ring: ["norvos-e>sarnor-w", [[91, 22], [88, 13], [76, 10], J.dagger, J.norvosQohor]],
  },
  {
    name: "The Flatlands",
    of: "Essos",
    coast: "essos",
    ring: ["myr-n>andalos-s", [[38, 9], [44, 14], J.nySar, J.flatSouth, [48, -2.5], [41, -2.8]]],
  },
  {
    name: "Lands of the Rhoyne",
    of: "Essos",
    coast: "essos",
    ring: [
      "orange-e>volantis-w",
      [[62, -8], J.flatSouth, J.nySar, J.dagger, [76, 10], J.rhoyneEast, [86, -4]],
    ],
  },
  {
    name: "Valyria",
    of: "Essos",
    coast: "essos",
    ring: [
      "tolos>orange-e",
      [
        [86, -4],
        [96, 1],
        [106, -3],
      ],
    ],
  },
  {
    name: "Slaver's Bay",
    of: "Essos",
    coast: "essos",
    ring: [
      "yunkai-s>tolos",
      [
        [106, -3],
        [118, -1.5],
        [130, -3],
        [133, -11],
        [128, -19.5],
      ],
    ],
  },
  { name: "Ghiscar", of: "Essos", coast: "essos", ring: ["waste-w>yunkai-s", [[128, -19.5]]] },
  {
    name: "Kingdom of Sarnor",
    of: "Essos",
    coast: "essos",
    ring: [
      "sarnor-w>ifeq-w",
      [
        [114, 30.5],
        [100, 28.5],
        [91, 22],
      ],
    ],
  },
  {
    name: "Yi Ti",
    of: "Essos",
    coast: "essos",
    ring: [
      "yiti-e>yiti-w",
      [
        [203, -4],
        [207, 8],
        [218, 18],
        [240, 18.5],
        [258, 16],
        [266, 2],
        [268, -12],
      ],
    ],
  },
  {
    name: "The Shadow Lands",
    of: "Essos",
    coast: "essos",
    ring: [
      "se>shadow-w",
      [
        [274, -20],
        [288, -15],
        [305, -12],
      ],
    ],
  },
];

/** Regions that are groups of islands: a loose ring around them. */
export const ARCHIPELAGOS: { name: string; of: string; ring: number[][] }[] = [
  {
    name: "Iron Islands",
    of: "Westeros",
    ring: [
      [-46.6, 16.2],
      [-40, 15],
      [-33.6, 18.6],
      [-31.4, 22],
      [-34, 28],
      [-40, 28],
      [-46.8, 25.6],
    ],
  },
  {
    name: "Stepstones",
    of: "The Narrow Sea",
    ring: [
      [22, -27.4],
      [25.6, -23.6],
      [31, -19.6],
      [36.4, -17.4],
      [37.4, -19.4],
      [33, -22.6],
      [27.6, -27.4],
      [23.4, -28.8],
    ],
  },
  {
    name: "Summer Isles",
    of: "The Summer Sea",
    ring: [
      [38.4, -44],
      [45.6, -47],
      [52, -55.6],
      [57.4, -60],
      [55, -65.6],
      [46, -65.6],
      [44.6, -57],
      [40.4, -53],
      [38.4, -47],
    ],
  },
  {
    name: "Basilisk Isles",
    of: "The Summer Sea",
    ring: [
      [98, -52],
      [108.6, -51.4],
      [114.4, -55.6],
      [112, -58.4],
      [103, -57.8],
      [98.4, -54.6],
    ],
  },
];

export interface Road {
  name: string;
  /** Sites by name, and waypoints in hundreds between them. */
  via: (string | number[])[];
  kind: number;
  width: number;
  of: string;
  rank?: number;
}

export const ROADS: Road[] = [
  {
    name: "Kingsroad",
    via: [
      "Castle Black",
      [-19.6, 66],
      "Winterfell",
      [-17, 45],
      "Moat Cailin",
      [-12, 26],
      [-9, 18],
      "Inn at the Crossroads",
      [-2.6, 6.4],
      "King's Landing",
    ],
    kind: G.DirtRoad,
    width: 11,
    of: "Westeros",
    rank: 84,
  },
  {
    name: "Kingsroad, south",
    via: ["King's Landing", [0.8, -3.4], [3.6, -7], "Bronzegate", "Storm's End"],
    kind: G.DirtRoad,
    width: 10,
    of: "Stormlands",
  },
  {
    name: "Goldroad",
    via: ["King's Landing", [-8, 0.6], [-17, 1.4], "Deep Den", [-30, 1.4], "Lannisport"],
    kind: G.DirtRoad,
    width: 10,
    of: "Westeros",
    rank: 70,
  },
  {
    name: "Roseroad",
    via: [
      "King's Landing",
      [-4, -4.6],
      "Bitterbridge",
      [-15.6, -12.6],
      "Highgarden",
      [-25.6, -22.6],
      "Oldtown",
    ],
    kind: G.DirtRoad,
    width: 10,
    of: "Westeros",
    rank: 70,
  },
  {
    name: "River Road",
    via: [
      "Lannisport",
      [-31.6, 5.4],
      "Golden Tooth",
      [-24.6, 9.6],
      "Riverrun",
      [-13, 11.4],
      "Inn at the Crossroads",
    ],
    kind: G.DirtRoad,
    width: 9,
    of: "Westeros",
    rank: 62,
  },
  {
    name: "High Road",
    via: ["Inn at the Crossroads", [-2.6, 13.6], "The Bloody Gate", [2, 16.4], "The Eyrie"],
    kind: G.DirtRoad,
    width: 9,
    of: "The Vale",
    rank: 62,
  },
  {
    name: "Ocean Road",
    via: ["Lannisport", [-34, -2.4], "Crakehall", [-33.6, -8], "Old Oak", [-30, -14.6], "Highgarden"],
    kind: G.DirtRoad,
    width: 9,
    of: "Westeros",
    rank: 56,
  },
  {
    name: "Boneway",
    via: ["Summerhall", [-2.6, -19.2], "Wyl", "Yronwood", [2, -26.6], [9.6, -29.4], "Sunspear"],
    kind: G.DirtRoad,
    width: 9,
    of: "Dorne",
    rank: 60,
  },
  {
    name: "Prince's Pass",
    via: ["Nightsong", "Tower of Joy", "Skyreach", [-10.6, -28.4], "Hellholt"],
    kind: G.DirtRoad,
    width: 9,
    of: "Dorne",
    rank: 62,
  },
  {
    name: "Valyrian road",
    via: ["Pentos", [42, 9.6], "Ghoyan Drohe", [52, 22.4], "Norvos", [68, 22.6], "Qohor"],
    kind: G.Cobble,
    width: 9,
    of: "Essos",
    rank: 60,
  },
  {
    name: "Demon Road",
    via: ["Volantis", [84, -9.4], "Mantarys", [106, -5.6], "Bhorash", "Meereen"],
    kind: G.Cobble,
    width: 9,
    of: "Essos",
    rank: 60,
  },
  {
    name: "Steel Road",
    via: ["Vaes Dothrak", [178, 24.6], "Kayakayanaya", [202, 21], "Trader Town"],
    kind: G.DirtRoad,
    width: 9,
    of: "Essos",
    rank: 54,
  },
  {
    name: "Stone Road",
    via: ["Vaes Dothrak", [178, 16], "Samyriana", [200, 9], "Tiqui"],
    kind: G.DirtRoad,
    width: 9,
    of: "Essos",
    rank: 54,
  },
  {
    name: "Sand Road",
    via: ["Qarth", [189.4, -15], "Bayasabhad", [198, -6.6], "Asabhad", "Jinqi", [226, -9], "Yin"],
    kind: G.DirtRoad,
    width: 9,
    of: "Essos",
    rank: 56,
  },
];

/** Sea lanes a ship sails, there and back. Flat east, north pairs in hundreds. */
export const ROUTES: { name: string; path: number[] }[] = [
  {
    name: "King's Landing to Pentos",
    path: [3.6, -0.6, 8, 0.4, 12.4, 3.1, 17, 3.2, 25, 3.6, 33, 2.9, 35.8, 2.6],
  },
  {
    name: "Braavos to Eastwatch",
    path: [27.6, 36.6, 22, 45, 14, 58, 11, 70, 9.4, 77.4, 3, 81, -5, 79.4, -10.4, 76.6],
  },
  {
    name: "White Harbor to Gulltown",
    path: [
      -4.2, 36.4, -1, 38.6, 3, 39.6, 8, 38.6, 13, 35.2, 18.6, 31, 20.6, 24, 22.6, 17, 23.6, 13.4, 21.4, 10.6,
    ],
  },
  {
    name: "Lannisport to Oldtown",
    path: [-36.6, 1.6, -39.6, -5, -43, -14, -40.4, -24, -38.6, -31, -36.4, -34.4, -33.4, -34, -31.8, -32],
  },
  { name: "Oldtown to the Summer Isles", path: [-31.6, -33, -28, -39, 0, -46, 30, -50, 40.4, -50.2] },
  {
    name: "Tyrosh, Lys and Volantis",
    path: [36, -15.8, 39, -20.4, 44.4, -21.6, 55, -18.6, 66, -16.6, 73.2, -16.6],
  },
  {
    name: "Volantis to Meereen",
    path: [73.2, -16.8, 84, -17, 91, -25.6, 100, -29, 110, -27, 116, -22, 117.6, -14, 118.2, -10.8],
  },
  {
    name: "Qarth to Asshai",
    path: [186, -33.6, 195, -31, 212, -24, 228, -22, 250, -30, 268, -38, 283.4, -41.2],
  },
  { name: "Ibbenese whalers", path: [29, 36.8, 45, 40.4, 62, 41, 95, 44, 119, 50.6, 124.6, 52.4] },
  { name: "Lys to Sunspear", path: [39.6, -24.6, 30, -27.6, 24, -30.6, 18.8, -32.2] },
];

/** Seas, bays, capes and other things with a name and no model: [name, east, north, context, rank, scale]. */
export const FEATURES: [n: string, e: number, nn: number, of: string, r: number, s: number][] = [
  ["Sunset Sea", -52, 0, "Westeros", 60, 0.1],
  ["Narrow Sea", 26, 14, "Between Westeros and Essos", 84, 0.1],
  ["Shivering Sea", 70, 62, "The North of the world", 70, 0.08],
  ["Summer Sea", 70, -45, "The South of the world", 70, 0.08],
  ["Jade Sea", 236, -24, "Essos", 80, 0.1],
  ["Bay of Ice", -35.6, 72, "The North", 60, 0.2],
  ["Bay of Seals", -2, 75.6, "The North", 60, 0.2],
  ["The Bite", 0, 32.4, "The North", 64, 0.25],
  ["Bay of Crabs", 11, 9.2, "The Vale", 60, 0.3],
  ["Blackwater Bay", 8.4, 0.4, "Crownlands", 82, 0.3],
  ["Shipbreaker Bay", 11, -7.4, "Stormlands", 66, 0.3],
  ["Sea of Dorne", 7, -21.6, "Dorne", 62, 0.3],
  ["Ironman's Bay", -29, 21.6, "Iron Islands", 62, 0.25],
  ["Blazewater Bay", -27.6, 38.4, "The North", 44, 0.3],
  ["Whispering Sound", -31.4, -31, "The Reach", 60, 0.5],
  ["Sea of Myrth", 40.6, -6.4, "Essos", 58, 0.3],
  ["Slaver's Bay", 114, -14.6, "Essos", 84, 0.2],
  ["Gulf of Grief", 110, -27.6, "Essos", 56, 0.2],
  ["Smoking Sea", 98.4, -22.9, "Valyria", 70, 0.5],
  ["Jade Gates", 187, -33.9, "Qarth", 66, 0.3],
  ["Saffron Straits", 276, -46, "The Shadow Lands", 56, 0.2],
  ["Bay of Pentos", 35.2, 2.6, "Essos", 44, 0.4],
  ["The Fingers", 13.4, 29.6, "The Vale", 62, 0.3],
  ["Crackclaw Point", 12, 5.9, "Crownlands", 56, 0.35],
  ["Massey's Hook", 10.4, -2.8, "Crownlands", 50, 0.4],
  ["Cape Wrath", 13.6, -17.6, "Stormlands", 56, 0.35],
  ["Broken Arm", 17.6, -28.4, "Dorne", 54, 0.35],
  ["Cape Kraken", -27, 30.6, "The North", 50, 0.35],
  ["Sea Dragon Point", -41.6, 60.4, "The North", 52, 0.35],
  ["Stony Shore", -37.6, 49.6, "The North", 50, 0.3],
  ["The Rills", -31, 41.6, "The North", 46, 0.3],
  ["Barrowlands", -22.6, 44.6, "The North", 50, 0.3],
  ["The Gift", -19.6, 72.4, "The North", 60, 0.35],
  ["Frozen Shore", -33.4, 87.6, "Beyond the Wall", 56, 0.3],
  ["Storrold's Point", 1.4, 86.4, "Beyond the Wall", 50, 0.35],
  ["Skirling Pass", -31.6, 93.6, "Beyond the Wall", 50, 0.4],
  ["Dornish Marches", -8.6, -19.4, "Stormlands", 54, 0.3],
  ["The Axe", 60.6, 33.6, "Essos", 46, 0.3],
  ["Golden Fields", 62, 17.6, "Essos", 40, 0.3],
  ["Orange Shore", 80.4, -12.4, "Essos", 44, 0.3],
  ["Lands of the Long Summer", 94, -6.6, "Valyria", 56, 0.25],
  ["Sothoryos", 132, -66, "The South of the world", 76, 0.12],
  ["Ulthos", 285, -64, "The South of the world", 60, 0.12],
];
