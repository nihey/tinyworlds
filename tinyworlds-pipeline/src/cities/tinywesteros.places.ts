/**
 * The places of tinywesteros: what stands where, as which kind of model. Positions are in the
 * steps of the sketch (east, north; King's Landing at 0, 0), placed by the commonly known
 * arrangement of the world and nothing finer: a castle is "on the coast north of the bay", not at
 * a surveyed spot. The generator moves a model off the water if its sketch position is wet.
 *
 * Only the names are borrowed (from A Song of Ice and Fire, © George R. R. Martin).
 */

import { EAST, NORTH } from "./tinywesteros.land.js";

/** Which model a place gets. `special` ones are built by name in `tinywesteros.ts`. */
export type Kit =
  | "castle"
  | "greatcastle"
  | "holdfast"
  | "tower"
  | "ruin"
  | "village"
  | "town"
  | "port"
  | "city"
  | "portcity"
  | "pyramid"
  | "camp"
  | "weirwood"
  | "special";

export type StyleName =
  | "north"
  | "watch"
  | "wildling"
  | "iron"
  | "river"
  | "vale"
  | "west"
  | "crown"
  | "storm"
  | "reach"
  | "dorne"
  | "free"
  | "braavos"
  | "tyrosh"
  | "lys"
  | "volantis"
  | "norvos"
  | "qohor"
  | "sarnor"
  | "valyria"
  | "ghis"
  | "astapor"
  | "yunkai"
  | "lhazar"
  | "qarth"
  | "bones"
  | "yiti"
  | "shadow"
  | "ibben"
  | "summer"
  | "sothoryos";

export interface Site {
  name: string;
  kit: Kit;
  /** Units. */
  e: number;
  n: number;
  /** Context line: the region. */
  of: string;
  rank: number;
  style: StyleName;
  /** Overrides the kit's size (units). */
  size?: number;
}

type Row = [name: string, kit: Kit, e: number, n: number, rank: number, size?: number, style?: StyleName];

const region = (of: string, style: StyleName, rows: Row[]): Site[] =>
  rows.map(([name, kit, e, n, rank, size, own]) => ({
    name,
    kit,
    e: e * EAST,
    n: n * NORTH,
    of,
    rank,
    style: own ?? style,
    ...(size !== undefined ? { size } : {}),
  }));

export const SITES: Site[] = [
  ...region("Beyond the Wall", "wildling", [
    ["Hardhome", "ruin", 2.4, 87.4, 72, 60],
    ["Fist of the First Men", "special", -24.6, 84, 76],
    ["Craster's Keep", "holdfast", -20.6, 80, 72, 30],
    ["Whitetree", "weirwood", -17.4, 78.6, 58],
    ["Thenn", "village", -27.6, 101.4, 56, 44],
  ]),
  ...region("The Wall", "watch", [
    ["Castle Black", "special", -19, 75.1, 96],
    ["The Shadow Tower", "special", -26, 75.1, 74],
    ["Eastwatch-by-the-Sea", "special", -12.9, 75.1, 78],
    ["The Nightfort", "special", -23.2, 75.1, 72],
    ["Queensgate", "special", -21.1, 75.1, 50],
    ["Oakenshield", "special", -16.6, 75.1, 50],
    ["Long Barrow", "special", -14.7, 75.1, 50],
    ["Mole's Town", "village", -18.4, 73.2, 60, 40],
    ["Queenscrown", "tower", -21, 71.4, 56],
  ]),
  ...region("The North", "north", [
    ["Winterfell", "special", -20, 55, 100],
    ["White Harbor", "portcity", -4.9, 39.8, 92, 118],
    ["Moat Cailin", "special", -14.4, 33.4, 86],
    ["The Dreadfort", "castle", -5.6, 56.8, 84, 56, "iron"],
    ["Karhold", "castle", 4.2, 63.2, 74],
    ["Last Hearth", "castle", -9.4, 68.6, 70],
    ["Deepwood Motte", "holdfast", -33.4, 61.6, 74, 42],
    ["Mormont Keep", "holdfast", -38.5, 68.4, 68, 36],
    ["Torrhen's Square", "castle", -27, 48, 66],
    ["Barrowton", "town", -25, 42.2, 66],
    ["Greywater Watch", "holdfast", -15.4, 28.8, 72, 30],
    ["Hornwood", "castle", -4.2, 47.6, 58, 44],
    ["Widow's Watch", "castle", 7.6, 47.6, 58, 44],
    ["Ramsgate", "port", -1.8, 43.4, 50, 58],
    ["Castle Cerwyn", "castle", -18.2, 51, 56, 40],
    ["Flint's Finger", "castle", -28, 30.3, 52, 40],
    ["Ironrath", "holdfast", -29, 57.6, 52, 34],
    ["Kingshouse", "holdfast", 5, 73.4, 52, 32],
    ["Rillwater Crossing", "holdfast", -31.6, 44.6, 42, 30],
  ]),
  ...region("Iron Islands", "iron", [
    ["Pyke", "special", -39.6, 16.9, 92],
    ["Lordsport", "port", -39.2, 18.5, 62, 52],
    ["Ten Towers", "castle", -33.8, 22.2, 68, 50],
    ["Hammerhorn", "castle", -44.2, 23, 54, 40],
    ["Pebbleton", "village", -42.6, 21.4, 46, 38],
    ["Nagga's Bones", "special", -40, 25.6, 62],
    ["Orkwood", "holdfast", -38.8, 21.4, 46, 30],
    ["Blacktyde keep", "holdfast", -36.4, 26.2, 44, 28],
    ["Saltcliffe keep", "holdfast", -43.6, 17.8, 44, 28],
  ]),
  ...region("Riverlands", "river", [
    ["Riverrun", "special", -22.4, 9.9, 95],
    ["The Twins", "special", -13.4, 22.4, 94],
    ["Harrenhal", "special", -6.3, 8.5, 97],
    ["Seagard", "port", -20.6, 20.8, 68, 70],
    ["Oldstones", "ruin", -17.6, 19, 60, 44],
    ["Fairmarket", "town", -13.2, 15.4, 56, 60],
    ["Raventree Hall", "castle", -14.6, 12.6, 62, 44],
    ["Stone Hedge", "castle", -10.6, 9.2, 56, 40],
    ["Darry", "castle", -2.4, 9.1, 58, 40],
    ["Inn at the Crossroads", "holdfast", -5.2, 13.2, 66, 28],
    ["Saltpans", "port", 2.2, 12, 60, 52],
    ["Maidenpool", "port", 4.8, 7.9, 64, 62],
    ["Stoney Sept", "town", -14.6, 2.6, 60, 58],
    ["Pinkmaiden", "castle", -19.4, 5.8, 50, 38],
    ["Acorn Hall", "castle", -10.8, 5.2, 50, 36],
    ["High Heart", "weirwood", -13.6, 7.4, 58],
    ["Isle of Faces", "weirwood", -6.5, 4.3, 68],
  ]),
  ...region("The Vale", "vale", [
    ["The Eyrie", "special", 4.6, 17.6, 96],
    ["Gulltown", "portcity", 19.8, 13.4, 82, 100],
    ["Runestone", "castle", 19.3, 15.7, 62, 44],
    ["The Bloody Gate", "castle", -0.8, 14.4, 70, 40],
    ["Strongsong", "castle", 0.4, 24.8, 50, 38],
    ["Heart's Home", "castle", 7, 22.2, 50, 38],
    ["Ironoaks", "castle", 12, 21.6, 50, 38],
    ["Longbow Hall", "castle", 14, 24.6, 48, 36],
    ["Redfort", "castle", 9.6, 13.9, 56, 40],
    ["Wickenden", "town", 13.6, 10.8, 46, 52],
    ["Snakewood", "holdfast", 8.6, 28.9, 44, 30],
    ["Old Anchor", "holdfast", 17.2, 20, 44, 30],
    ["Sisterton", "port", 1.4, 35.6, 56, 46],
  ]),
  ...region("Westerlands", "west", [
    ["Casterly Rock", "special", -34, 5.3, 97],
    ["Lannisport", "portcity", -33.2, 2.2, 88, 118],
    ["Golden Tooth", "castle", -28.6, 9.4, 68, 44],
    ["Ashemark", "castle", -32.2, 10, 52, 38],
    ["The Crag", "castle", -33.6, 12.6, 54, 38],
    ["Banefort", "castle", -31.8, 15.2, 50, 38],
    ["Castamere", "ruin", -30.6, 12.6, 62, 40],
    ["Sarsfield", "castle", -31.6, 7.4, 46, 34],
    ["Hornvale", "castle", -26.6, 3.8, 46, 34],
    ["Deep Den", "castle", -25.2, 0.8, 52, 38],
    ["Silverhill", "castle", -27.4, -2.8, 50, 36],
    ["Crakehall", "castle", -34.6, -4.6, 60, 44],
    ["Clegane's Keep", "holdfast", -32, -0.4, 48, 30],
    ["Faircastle", "castle", -40.6, 9.4, 52, 38],
    ["Kayce", "port", -35.6, 8.6, 46, 46],
  ]),
  ...region("Crownlands", "crown", [
    ["King's Landing", "special", 0, 0, 100],
    ["Dragonstone", "special", 18.6, 0.2, 94],
    ["High Tide", "castle", 15, 1, 62, 42],
    ["Duskendale", "port", 6, 2.4, 66, 66],
    ["Rosby", "castle", 3.4, 3.6, 48, 34],
    ["Stokeworth", "castle", 1.2, 4.4, 48, 34],
    ["Rook's Rest", "castle", 9.4, 4.8, 52, 36],
    ["The Whispers", "ruin", 13.6, 6, 52, 36],
    ["Sharp Point", "tower", 11.8, -2, 48],
    ["Stonedance", "castle", 9.4, -3.6, 46, 34],
    ["Hayford", "castle", -2.8, 2.8, 44, 32],
  ]),
  ...region("Stormlands", "storm", [
    ["Storm's End", "special", 7.4, -12, 95],
    ["Evenfall Hall", "castle", 13.2, -10.2, 62, 40],
    ["Bronzegate", "castle", 4.6, -8.8, 52, 36],
    ["Felwood", "holdfast", 1.6, -6.2, 44, 28],
    ["Griffin's Roost", "castle", 11, -15.9, 58, 38],
    ["Rain House", "castle", 14.8, -17.6, 50, 34],
    ["Mistwood", "castle", 11.8, -18.4, 48, 34],
    ["Greenstone", "castle", 17.2, -22.2, 48, 34],
    ["Summerhall", "ruin", -3.4, -16.6, 70, 50],
    ["Blackhaven", "castle", -5.2, -19.4, 54, 38],
    ["Stonehelm", "castle", 2.4, -18.4, 46, 34],
    ["Nightsong", "castle", -12.4, -20.6, 58, 40],
    ["Harvest Hall", "castle", -6.4, -14, 44, 32],
    ["Crow's Nest", "castle", 5.6, -16, 44, 32],
    ["Fawnton", "holdfast", -1.6, -9.8, 40, 28],
  ]),
  ...region("The Reach", "reach", [
    ["Highgarden", "special", -22.6, -18.2, 96],
    ["Oldtown", "special", -29.2, -28.2, 98],
    ["Horn Hill", "castle", -21.4, -23, 64, 42],
    ["Brightwater Keep", "castle", -26.4, -21.6, 56, 38],
    ["Honeyholt", "castle", -28.4, -24.4, 48, 32],
    ["Blackcrown", "castle", -35, -31.4, 46, 32],
    ["Three Towers", "castle", -33.4, -28.4, 48, 34],
    ["Bandallon", "castle", -34.8, -26, 44, 30],
    ["Goldengrove", "castle", -27.4, -9.6, 60, 40],
    ["Old Oak", "castle", -35.2, -10.6, 56, 38],
    ["Red Lake", "castle", -29, -12.8, 46, 32],
    ["Cider Hall", "castle", -17.2, -12.8, 52, 36],
    ["Longtable", "castle", -13.4, -10.2, 50, 34],
    ["Bitterbridge", "town", -9.9, -8, 60, 54],
    ["Ashford", "town", -9.8, -14.4, 54, 52],
    ["Tumbleton", "town", -7.4, -3.6, 52, 50],
    ["Starpike", "castle", -17, -20.6, 46, 32],
    ["Dunstonbury", "castle", -31, -19.6, 44, 30],
    ["Ryamsport", "port", -35, -38.2, 58, 48],
    ["Vinetown", "village", -32.6, -37.6, 44, 36],
  ]),
  ...region("Dorne", "dorne", [
    ["Sunspear", "special", 16.2, -32.2, 96],
    ["Water Gardens", "special", 14.2, -33.2, 68],
    ["Planky Town", "port", 12.4, -34, 58, 44],
    ["Ghost Hill", "castle", 15.6, -28.6, 46, 34],
    ["The Tor", "castle", 8.4, -25.4, 46, 34],
    ["Godsgrace", "castle", 5.6, -30.6, 54, 36],
    ["Vaith", "castle", 0.4, -29.4, 48, 34],
    ["Salt Shore", "castle", -3.4, -34.4, 48, 34],
    ["Hellholt", "castle", -5.6, -31.4, 56, 38],
    ["Sandstone", "castle", -13.4, -31, 50, 36],
    ["Starfall", "castle", -24, -32.2, 72, 44, "vale"],
    ["High Hermitage", "castle", -22.4, -29, 46, 32],
    ["Blackmont", "castle", -19.6, -27, 46, 32],
    ["Skyreach", "castle", -13.6, -25.2, 56, 38],
    ["Kingsgrave", "castle", -10.4, -24.4, 48, 32],
    ["Tower of Joy", "tower", -14.9, -22.6, 80],
    ["Yronwood", "castle", -3.6, -23.6, 62, 42],
    ["Wyl", "castle", -1.9, -21, 50, 34],
    ["Vulture's Roost", "ruin", -8.4, -21.6, 44, 30],
    ["Shandystone", "ruin", 9.6, -31.2, 44, 32],
  ]),
  ...region("Stepstones", "tyrosh", [
    ["Bloodstone", "holdfast", 26.5, -25.6, 60, 34],
    ["Grey Gallows", "tower", 31.3, -21.8, 50],
  ]),
  ...region("Free Cities", "free", [
    ["Braavos", "special", 27.7, 33.7, 99, undefined, "braavos"],
    ["Pentos", "portcity", 38.8, 3.3, 92, 138],
    ["Myr", "portcity", 46.2, -5.8, 88, 118],
    ["Tyrosh", "portcity", 33.4, -14.6, 88, 104, "tyrosh"],
    ["Lys", "portcity", 42, -24, 88, 100, "lys"],
    ["Volantis", "special", 73.3, -13.4, 97, undefined, "volantis"],
    ["Norvos", "special", 60, 24.6, 88, undefined, "norvos"],
    ["Qohor", "special", 79, 18.4, 88, undefined, "qohor"],
    ["Lorath", "port", 46.5, 36.3, 80, 84, "braavos"],
    ["Ghoyan Drohe", "ruin", 45.2, 18.6, 58, 44, "sarnor"],
    ["Ny Sar", "ruin", 56.6, 13.6, 58, 44, "sarnor"],
    ["Ar Noy", "ruin", 73.4, 13.4, 52, 40, "sarnor"],
    ["Chroyane", "ruin", 69.6, -0.6, 64, 50, "sarnor"],
    ["Selhorys", "town", 71.6, -6.8, 60, 58, "volantis"],
    ["Valysar", "town", 70.4, -10, 50, 48, "volantis"],
  ]),
  ...region("Kingdom of Sarnor", "sarnor", [
    ["Saath", "port", 99.4, 32, 62, 62],
    ["Morosh", "port", 86.6, 32.6, 52, 48, "braavos"],
    ["Sarnath", "ruin", 118, 28.4, 66, 60],
    ["Mardosh", "ruin", 127, 24.6, 46, 40],
    ["Kasath", "ruin", 110.4, 22.6, 44, 38],
  ]),
  ...region("Dothraki Sea", "sarnor", [
    ["Vaes Dothrak", "special", 164, 26.4, 95],
    ["Vaes Khadokh", "ruin", 96, 16, 50, 44],
    ["Vaes Gorqoyi", "ruin", 106, 14.4, 44, 38],
    ["Vaes Khewo", "ruin", 118, 8, 46, 40],
    ["Vojjor Samvi", "ruin", 134, 18, 46, 40],
    ["Yalli Qamayi", "ruin", 142, 9.6, 44, 38],
    ["Hazdahn Mo", "ruin", 152, 2, 46, 38],
    ["Vaes Leisi", "ruin", 148, 34, 46, 38],
    ["Vaes Jini", "ruin", 163, 6, 44, 36],
    ["Vaes Orvik", "ruin", 174, 13, 42, 36],
  ]),
  ...region("Valyria", "valyria", [
    ["Valyria", "special", 99, -20.8, 94],
    ["Mantarys", "town", 97.6, -5.6, 62, 60],
    ["Oros", "ruin", 99.6, -13.9, 54, 44],
    ["Tyria", "ruin", 97.4, -16.4, 54, 42],
  ]),
  ...region("Slaver's Bay", "ghis", [
    ["Meereen", "special", 122.4, -10.8, 98],
    ["Yunkai", "special", 121.6, -16.8, 90, undefined, "yunkai"],
    ["Astapor", "special", 122, -24.4, 90, undefined, "astapor"],
    ["Old Ghis", "special", 126.6, -32.6, 74],
    ["New Ghis", "pyramid", 122, -40, 70, 78],
    ["Tolos", "port", 108, -8.4, 56, 52],
    ["Elyria", "port", 107.4, -12.8, 52, 42],
    ["Bhorash", "ruin", 113.6, -7, 50, 40],
    ["Velos", "ruin", 112.5, -17, 50, 38],
    ["Ghozai", "ruin", 132, -39.5, 46, 36],
  ]),
  ...region("Lhazar", "lhazar", [
    ["Lhazosh", "town", 139, -6.4, 62, 60],
    ["Hesh", "town", 133.6, -9.8, 52, 48],
    ["Kosrak", "town", 145.6, -9.8, 52, 48],
  ]),
  ...region("Red Waste", "qarth", [
    ["Vaes Tolorro", "ruin", 160, -14.6, 64, 54],
    ["Qarth", "special", 183.4, -28.6, 97],
    ["Port Yhos", "port", 151, -23.2, 54, 48],
    ["Qarkash", "port", 163.4, -24.6, 52, 46],
  ]),
  ...region("Bone Mountains", "bones", [
    ["Kayakayanaya", "town", 189.6, 22, 64, 62],
    ["Samyriana", "town", 190.4, 9.6, 62, 60],
    ["Bayasabhad", "town", 191, -4.4, 64, 62],
  ]),
  ...region("Yi Ti", "yiti", [
    ["Yin", "special", 239.4, -7.4, 93],
    ["Jinqi", "port", 213, -8.6, 62, 62],
    ["Asabhad", "town", 204.4, -7.6, 56, 52],
    ["Tiqui", "town", 208.4, 5.6, 54, 52],
    ["Trader Town", "town", 216, 13.4, 58, 56],
    ["Si Qo", "ruin", 246, 5, 52, 44],
    ["The Five Forts", "special", 266.5, 24, 90],
  ]),
  ...region("The Further East", "shadow", [
    ["Carcosa", "town", 289.4, 4.6, 72, 60, "yunkai"],
    ["K'Dath", "town", 284, 45, 50, 48],
    ["Nefer", "port", 219.6, 50.2, 58, 46],
  ]),
  ...region("The Shadow Lands", "shadow", [
    ["Asshai", "special", 283, -36, 98],
    ["Stygai", "ruin", 294, -28.6, 76, 56],
  ]),
  ...region("Ib", "ibben", [
    ["Port of Ibben", "port", 129.6, 53, 72, 84],
    ["Ib Nor", "port", 136.4, 59, 52, 46],
    ["Ib Sar", "town", 135.6, 53, 48, 44],
    ["New Ibbish", "port", 139.6, 42, 54, 50],
  ]),
  ...region("Jade Sea", "yiti", [
    ["Faros", "port", 186, -38, 54, 48, "qarth"],
    ["Vahar", "port", 191.6, -43, 54, 48, "qarth"],
    ["Port Moraq", "port", 199.8, -36.4, 50, 42, "qarth"],
    ["Zabhad", "port", 176.4, -39.6, 50, 44, "qarth"],
    ["Leng Yi", "port", 233, -31.8, 56, 50],
    ["Leng Ma", "town", 232.6, -36.2, 56, 50],
    ["Turrani", "port", 233.2, -40.4, 50, 44],
    ["Marahai", "village", 256, -41, 46, 36, "summer"],
  ]),
  ...region("Summer Isles", "summer", [
    ["Tall Trees Town", "port", 44.6, -50.2, 68, 56],
    ["Lotus Port", "port", 41.8, -51, 48, 40],
    ["Last Lament", "port", 47.6, -55.2, 50, 42],
    ["Ebonhead", "port", 54, -60.6, 56, 46],
    ["Lotus Point", "port", 49.6, -62.4, 50, 42],
    ["Koj", "port", 40, -45.6, 46, 38],
  ]),
  ...region("Summer Sea", "summer", [
    ["Naath", "village", 87, -58, 58, 44],
    ["Port Plunder", "port", 104, -55.6, 50, 42, "tyrosh"],
    ["Gogossos", "ruin", 108.6, -53.4, 48, 36, "valyria"],
  ]),
  ...region("Sothoryos", "sothoryos", [
    ["Zamettar", "ruin", 118.4, -63, 58, 46],
    ["Yeen", "ruin", 126, -66, 62, 50, "valyria"],
    ["Gorosh", "ruin", 137, -65.4, 44, 36],
  ]),
];
