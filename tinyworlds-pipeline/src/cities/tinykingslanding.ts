import { R } from "../render/palette.js";
import { mix, pick, rand } from "../scene/hash.js";
import { G, Pattern, Roof } from "../scene/kinds.js";
import {
  blob,
  chaikin,
  curtain,
  disc,
  growLanes,
  insideRing,
  inset,
  lineWithHouses,
  Occupancy,
  pathLength,
  pave,
  plant,
  pointAlong,
  rect,
  ribbon,
  standingTree,
  steps,
  STONE,
  tower,
  wander,
  type HousePalette,
  type PlacedGate,
  type Street,
  type Wealth,
} from "../scene/medieval.js";
import type { Look, SyntheticBuilder } from "../scene/synthetic.js";
import { generatedCity } from "./generated.js";

/**
 * King's Landing: a walled capital of half a million on a bay at the mouth of a river, with a
 * red castle on the headland, a white sept on one hill and a ruined dragon pit on another. No
 * map of it is followed: only the names are borrowed, and the plan, from the walls to the last
 * alley, is made up here. Metres; `p` runs north (up and to the right on screen), `q` east (down
 * and to the right): the bay lies east, the river south, and the viewer looks in from the
 * south-east, over the castle.
 */

// ---- where things are

/** The city wall, corner by corner, from the south-west round by the north to the castle and back along the river. */
const WALL = [
  -1300, -1250, -700, -1560, -100, -1650, 500, -1560, 1000, -1280, 1340, -780, 1500, -120, 1470, 520, 1220,
  1040, 740, 1420, 160, 1570, -420, 1575, -870, 1480, -1280, 1250, -1390, 880, -1410, 300, -1400, -350, -1370,
  -850,
];
/** The edge of the wall's ring that the castle stands in for. */
const CASTLE_EDGE = 12;

const CITY_GATES = [
  { name: "Lion Gate", p: -400, q: -1610 },
  { name: "Gate of the Gods", p: 780, q: -1420 },
  { name: "Old Gate", p: 1440, q: -420 },
  { name: "Dragon Gate", p: 1360, q: 800 },
  { name: "Iron Gate", p: 450, q: 1500 },
  { name: "Mud Gate", p: -1405, q: 520 },
  { name: "King's Gate", p: -1385, q: -600 },
];

/** The Red Keep's own walls, on the headland where the river meets the bay. */
const KEEP = [
  -870, 1480, -880, 1300, -980, 1200, -1140, 1170, -1280, 1250, -1320, 1420, -1260, 1580, -1100, 1630, -950,
  1590,
];
const KEEP_CENTRE: [number, number] = [-1090, 1400];
/** How high the castle's rock stands over the city, and the lesser hills' terraces. */
const CRAG = 24;
const SEPT_TERRACE = 7;
const PIT_TERRACE = 8;
const SEPT: [number, number] = [-250, -850];
const PIT: [number, number] = [760, 620];
const COBBLERS: [number, number] = [150, -250];
const FISHMONGERS: [number, number] = [-1230, 400];
const FLEA_BOTTOM = [-200, 520, 300, 380, 500, 860, 420, 1300, 60, 1440, -300, 1320, -400, 900];

const RED: Look = { ...STONE.red };
const redHall = (roofH: number, pattern = Pattern.Tall): Look => ({
  ...RED,
  roof: R.roofSlate,
  roofShape: Roof.Pitched,
  roofH,
  pattern,
});

/** Local materials: plaster and tile in a warm country, thatch and timber where there is no money. */
const PALETTES: Record<Wealth, HousePalette> = {
  0: {
    walls: [R.tan, R.tan, R.timber, R.brownstone, R.cream, R.yellowBrick],
    roofs: [R.thatch, R.thatch, R.roofBrown, R.timber, R.roofClay],
  },
  1: {
    walls: [R.cream, R.cream, R.tan, R.limestone, R.yellowBrick, R.whiteBrick, R.salmon],
    roofs: [R.roofTerracotta, R.roofTerracotta, R.roofClay, R.roofClay, R.roofRed, R.roofBrown],
  },
  2: {
    walls: [R.limestone, R.whiteBrick, R.cream, R.redStone, R.yellowBrick],
    roofs: [R.roofTerracotta, R.roofClay, R.roofSlate, R.roofRed],
  },
};

const dist = (a: [number, number], p: number, q: number): number => Math.hypot(a[0] - p, a[1] - q);

function generate(b: SyntheticBuilder): void {
  const occ = new Occupancy(-3400, -3400, 3400, 3400, 1.5);

  // ---- land and water: the bay to the east, the river along the south
  const coast = chaikin(
    [
      3500, 1750, 2500, 1520, 1800, 1330, 1300, 1210, 1000, 1330, 740, 1560, 400, 1650, 160, 1690, -400, 1705,
      -880, 1700, -1100, 1745, -1300, 1700, -1410, 1570, -1450, 1300, -1500, 900, -1505, 300, -1500, -400,
      -1480, -1000, -1500, -1800, -1560, -2600, -1600, -3500,
    ],
    2,
  );
  const north = [...coast, 3500, -3500];
  const southBank = chaikin(
    [
      -1790, -3500, -1780, -2400, -1770, -1500, -1790, -600, -1800, 300, -1790, 1000, -1840, 1500, -2050,
      1850, -2600, 2050, -3500, 2150,
    ],
    2,
  );
  const south = [...southBank, -3500, -3500];
  for (const land of [north, south]) {
    b.ground(G.Land, land);
    b.ground(G.Meadow, land);
  }
  // water is where the land is not: houses and lanes keep off it
  const onLand = (p: number, q: number): boolean => insideRing(north, p, q);
  b.limits(blob(0, 60, 2350, 0.04, 3, 40));

  // beaches up the bay
  b.ground(G.Sand, ribbon(coast.slice(0, 34), 46));

  // ---- the countryside: a quilt of fields, pasture and copses; the kingswood across the river
  const cityRing = WALL;
  const outside = inset(cityRing, -110);
  for (let i = 0; i < 170; i++) {
    const a = rand(41, i) * Math.PI * 2;
    const d = 1650 + rand(42, i) * 1150;
    const cp = Math.cos(a) * d + 50;
    const cq = Math.sin(a) * d - 100;
    if (!onLand(cp, cq) || insideRing(outside, cp, cq) || dist(KEEP_CENTRE, cp, cq) < 700) continue;
    const roll = rand(44, i);
    const kind =
      roll < 0.46 ? G.Crop : roll < 0.66 ? G.Forest : roll < 0.8 ? G.Park : roll < 0.92 ? G.Lawn : G.Scrub;
    b.ground(kind, blob(cp, cq, 110 + rand(43, i) * 170, 0.3, 50 + i, 14));
  }
  b.ground(G.Forest, inset(south, 70));
  for (let i = 0; i < 14; i++) {
    // clearings
    const cp = -1950 - rand(45, i) * 500;
    const cq = -2300 + rand(46, i) * 4000;
    b.ground(i % 3 === 0 ? G.Scrub : G.Lawn, blob(cp, cq, 50 + rand(47, i) * 80, 0.3, 80 + i, 12));
  }
  b.place({ n: "Kingswood", t: "park", p: -2040, q: -300, b: "Crownlands", r: 70, s: 0.5 });
  b.place({ n: "Blackwater Rush", t: "place", p: -1645, q: -200, b: "King's Landing", r: 80, s: 0.5 });
  b.place({ n: "Blackwater Bay", t: "place", p: 200, q: 2050, b: "King's Landing", r: 82, s: 0.35 });

  // ---- the three hills and what stands on them
  const reserved: number[][] = [];
  /** Keep the streets and houses off a piece of ground. */
  const reserve = (ring: number[]): void => {
    reserved.push(ring);
    occ.blockRing(ring);
  };

  // the city's floor: packed earth, paved where it matters
  b.ground(G.Construction, cityRing);

  const keepFoot = redKeep(b, reserve);
  greatSept(b, reserve);
  dragonpit(b, reserve);

  // ---- the walls and their seven gates
  occ.blockPath([...cityRing, cityRing[0], cityRing[1]], 26);
  const gates = curtain(b, cityRing, {
    height: 11,
    thickness: 5,
    stone: STONE.pale,
    merlons: true,
    towerRadius: 6.5,
    towerHeight: 15,
    towerEvery: 105,
    gates: CITY_GATES.map((g) => ({ ...g, width: 9 })),
    openEdges: [CASTLE_EDGE],
    bareCorners: [CASTLE_EDGE, CASTLE_EDGE + 1],
  });
  const gate = (name: string): PlacedGate => gates.find((g) => g.name === name)!;
  for (const g of gates) {
    b.place({ n: g.name ?? "Gate", t: "landmark", p: g.p, q: g.q, b: "King's Landing", r: 84, s: 2 });
  }
  const inFrom = (g: PlacedGate, d: number): [number, number] => [g.p - g.outP * d, g.q - g.outQ * d];
  const outFrom = (g: PlacedGate, d: number): [number, number] => [g.p + g.outP * d, g.q + g.outQ * d];

  // ---- squares
  const square = (name: string, at: [number, number], radius: number, rank: number): void => {
    const ring = blob(at[0], at[1], radius, 0.1, mix(at[0], at[1]), 14);
    b.ground(G.Cobble, ring);
    reserve(ring);
    b.place({ n: name, t: "place", p: at[0], q: at[1], b: "King's Landing", r: rank, s: 2 });
    b.hood(name, "King's Landing", ring);
  };
  square("Cobbler's Square", COBBLERS, 46, 80);
  square("Fishmonger's Square", FISHMONGERS, 52, 82);
  // a fountain in the middle of each, and stalls round the fish market
  for (const at of [COBBLERS, FISHMONGERS]) {
    b.prism(at[0], at[1], 3, 10, 1.3, 0, STONE.pale);
    b.prism(at[0], at[1], 0.9, 6, 4.5, 1.3, STONE.pale);
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    b.volume(
      rect(FISHMONGERS[0] + Math.cos(a) * 30, FISHMONGERS[1] + Math.sin(a) * 30, 2.6, 1.7, a + Math.PI / 2),
      3,
      2.4,
      { wall: R.timber, roof: [R.cream, R.roofRed, R.sidingBlue, R.sidingYellow][i % 4] },
    );
  }

  // ---- the main streets
  const street = (
    name: string | undefined,
    points: number[],
    width: number,
    wobble: number,
    seed: number,
  ): Street => ({
    name,
    path: wobble > 0 ? chaikin(wander(points, wobble, seed, 55), 2) : points,
    width,
    kind: G.Cobble,
    level: 0,
  });
  const lion = gate("Lion Gate");
  const gods = gate("Gate of the Gods");
  const old = gate("Old Gate");
  const dragon = gate("Dragon Gate");
  const iron = gate("Iron Gate");
  const mud = gate("Mud Gate");
  const kings = gate("King's Gate");
  // where a street bound for a hill stops: at the foot of it, `d` metres from the top
  const towards = (from: [number, number], to: [number, number], d: number): [number, number] => {
    const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
    return [from[0] + ((to[0] - from[0]) / len) * d, from[1] + ((to[1] - from[1]) / len) * d];
  };
  const mains: Street[] = [
    street("Street of the Sisters", [...towards(SEPT, PIT, 170), ...towards(PIT, SEPT, 190)], 15, 0, 0),
    street("Muddy Way", [...inFrom(mud, 4), ...FISHMONGERS, -700, 150, -250, -80, ...COBBLERS], 11, 24, 101),
    street(
      "Street of Steel",
      [...FISHMONGERS, -900, -150, -560, -520, ...towards(SEPT, FISHMONGERS, 170)],
      10,
      22,
      102,
    ),
    street("The Hook", [...FISHMONGERS, -1170, 700, -990, 980, ...keepFoot], 9, 18, 103),
    street("River Row", [...inFrom(kings, 30), -1290, -150, ...FISHMONGERS], 9, 16, 104),
    street("Street of Flour", [...COBBLERS, 620, -330, 1080, -400, ...inFrom(old, 4)], 10, 22, 105),
    street(
      "Street of Seeds",
      [...inFrom(gods, 4), 560, -1080, 180, -900, ...towards(SEPT, [400, -900], 170)],
      10,
      20,
      106,
    ),
    street(
      "Street of Looms",
      [...inFrom(lion, 4), -360, -1300, ...towards(SEPT, [-400, -1500], 170)],
      10,
      14,
      107,
    ),
    street("Street of Silk", [...towards(PIT, [1300, 300], 190), 1140, 240, ...inFrom(old, 60)], 9, 18, 108),
    street(
      "Dragon Gate Road",
      [...inFrom(dragon, 4), 1080, 760, ...towards(PIT, [1300, 800], 190)],
      10,
      10,
      109,
    ),
    street("Pisswater Bend", [...inFrom(iron, 4), 320, 1180, 120, 800, -40, 380, ...COBBLERS], 8, 30, 110),
    street("Shadowblack Lane", [...keepFoot, -640, 1020, -330, 640, -120, 300, ...COBBLERS], 10, 26, 111),
    street(
      "King's Way",
      [...inFrom(kings, 4), -1000, -620, -640, -700, ...towards(SEPT, [-1000, -620], 170)],
      10,
      16,
      112,
    ),
    // the way round inside the walls, from the Lion Gate by the north to the bay
    street(
      undefined,
      [
        -670, -1490, -100, -1580, 470, -1495, 950, -1225, 1275, -750, 1430, -110, 1400, 500, 1165, 990, 710,
        1350, 160, 1500, -420, 1505, -700, 1440,
      ],
      7,
      8,
      113,
    ),
    street(
      undefined,
      [...inFrom(lion, 60), -80, -1180, 420, -1000, 900, -900, ...inFrom(gods, 90)],
      8,
      20,
      114,
    ),
    street(undefined, [...inFrom(iron, 80), 700, 1150, ...towards(PIT, [900, 1100], 190)], 8, 14, 115),
    street(undefined, [-1150, -700, -900, -150, -700, 150], 8, 18, 116),
    street(undefined, [...COBBLERS, 500, 100, ...towards(PIT, [500, 300], 195)], 9, 18, 117),
    street(undefined, [1080, -400, 980, 60, ...towards(PIT, [1000, 100], 195)], 8, 16, 118),
    street(undefined, [320, 1180, -200, 1340, -620, 1290, ...keepFoot], 8, 16, 119),
    street(undefined, [-640, -700, -820, -1100, -1040, -1290], 8, 16, 120),
    street(undefined, [620, -330, 720, -820, 560, -1080], 8, 16, 121),
    street(undefined, [-250, -80, -420, 420, -640, 1020], 8, 18, 122),
    street(undefined, [120, 800, 620, 980, 1080, 760], 8, 18, 123),
  ];
  for (const main of mains) {
    if (!main.name) continue;
    const mid = pointAlong(main.path, pathLength(main.path) / 2);
    b.place({ n: main.name, t: "street", p: mid.p, q: mid.q, b: "King's Landing", r: 66, s: 1.5 });
    b.hood(main.name, "King's Landing", ribbon(main.path, 70));
  }

  // ---- lanes: grown off the streets until the walls are full
  const inner = inset(cityRing, 24);
  const free = (p: number, q: number): boolean => {
    if (!insideRing(inner, p, q)) return false;
    for (const ring of reserved) if (insideRing(ring, p, q)) return false;
    return true;
  };
  const lanes = growLanes(mains, {
    seed: 4242,
    allowed: free,
    spacing: [42, 74],
    reach: [80, 280],
    depth: 5,
    join: 17,
    width: [4.4, 5.8],
    kind: G.DirtRoad,
  });
  for (const way of [...mains, ...lanes]) pave(b, occ, way);

  // ---- named corners of the city
  alchemists(b, towards(SEPT, PIT, 330), occ);
  b.hood("Flea Bottom", "King's Landing", FLEA_BOTTOM);
  b.place({ n: "Flea Bottom", t: "hood", p: 120, q: 900, b: "King's Landing", r: 90, s: 1 });
  for (const [name, p, q, rank] of [
    ["Visenya's Hill", SEPT[0], SEPT[1], 78],
    ["Rhaenys's Hill", PIT[0], PIT[1], 78],
    ["Aegon's High Hill", KEEP_CENTRE[0], KEEP_CENTRE[1], 78],
    ["Pigrun Alley", 180, 1060, 52],
    ["Eel Alley", -1150, 120, 52],
    ["Sowbelly Row", -180, 760, 52],
    ["Coppersmith's Wynd", -620, -260, 52],
  ] as [string, number, number, number][]) {
    b.place({
      n: name,
      t: name.includes("Hill") ? "place" : "street",
      p,
      q,
      b: "King's Landing",
      r: rank,
      s: 1.5,
    });
  }

  // ---- houses: thousands of them, meaner in Flea Bottom, finer near the sept and the castle
  const wealthAt = (p: number, q: number): Wealth | null => {
    if (!free(p, q)) return null;
    if (insideRing(FLEA_BOTTOM, p, q)) return 0;
    const noise = rand(mix(Math.round(p / 7), Math.round(q / 7)), 21);
    if (dist(SEPT, p, q) < 430 || dist(KEEP_CENTRE, p, q) < 620) return noise < 0.6 ? 2 : 1;
    if (p < -1180) return noise < 0.7 ? 0 : 1; // the riverside
    return noise < 0.14 ? 0 : noise < 0.9 ? 1 : 2;
  };
  let houses = 0;
  [...mains, ...lanes].forEach((way, i) => {
    const mid = pointAlong(way.path, pathLength(way.path) / 2);
    const poor = insideRing(FLEA_BOTTOM, mid.p, mid.q);
    houses += lineWithHouses(b, occ, way, {
      seed: mix(7000, i),
      wealthAt,
      rows: poor ? 3 : 2,
      gaps: poor ? 0.02 : 0.08,
      palette: (wealth) => PALETTES[wealth],
    });
  });
  if (houses < 5000) throw new Error(`King's Landing came out with only ${houses} houses`);

  // a small sept here and there among them
  for (let i = 0; i < 90; i++) {
    const p = -1300 + rand(81, i) * 2700;
    const q = -1500 + rand(82, i) * 3000;
    if (!free(p, q) || !occ.isFree(disc(p, q, 12, 8))) continue;
    b.prism(p, q, 8, 7, 9, 0, { ...STONE.pale, pattern: Pattern.Tall });
    b.prism(p, q, 7, 7, 14.5, 9, { ...STONE.pale, roof: R.roofCopper, roofShape: Roof.Dome, roofH: 5.5 });
    occ.blockRing(disc(p, q, 10, 8));
  }
  // and what ground is left over is somebody's garden, orchard or yard
  for (let i = 0; i < 5200; i++) {
    const p = -1420 + rand(85, i) * 2950;
    const q = -1660 + rand(86, i) * 3250;
    const radius = 5 + rand(87, i) * 10;
    if (!free(p, q) || !occ.isFree(disc(p, q, radius + 2, 8))) continue;
    const ring = blob(p, q, radius, 0.22, 900 + i, 8);
    b.ground(i % 3 === 0 ? G.Garden : G.Lawn, ring);
    for (let t = 0; t < 1 + (i % 3); t++) {
      b.tree(p + (rand(88, i * 4 + t) - 0.5) * radius, q + (rand(89, i * 4 + t) - 0.5) * radius);
    }
    occ.blockRing(ring);
  }

  // ---- the harbour: quays outside the Mud Gate, warehouses, ships
  const quay = [-1500, -260, -1505, 300, -1500, 900, -1480, 1080];
  b.ground(G.Pier, ribbon(chaikin(quay, 2), 34));
  for (let i = 0; i < 9; i++) {
    const q = -180 + i * 150 + rand(91, i) * 30;
    b.line(G.Pier, 7, [-1500, q, -1575 - rand(92, i) * 40, q + 6], true);
    if (i % 3 !== 1) ship(b, -1560 - rand(93, i) * 20, q + 17, Math.PI + 0.08, 24 + rand(94, i) * 10, i);
  }
  for (let i = 0; i < 14; i++) {
    const q = -330 + i * 100 + rand(95, i) * 20;
    if (Math.abs(q - mud.q) < 60) continue;
    const corners = rect(-1453, q, 9 + rand(96, i) * 3, 22 + rand(97, i) * 10, 0);
    b.volume(corners, 7 + rand(98, i) * 3, 0, {
      wall: pick([R.timber, R.tan, R.brownstone], i, 1),
      roof: pick([R.roofBrown, R.roofClay, R.thatch], i, 2),
      glass: R.glassBlack,
      pattern: Pattern.Sparse,
      roofShape: Roof.Pitched,
      roofH: 2.6,
    });
  }
  b.line(G.Cobble, 9, [...outFrom(mud, 0), ...outFrom(mud, 95)]);
  b.place({ n: "The Docks", t: "place", p: -1490, q: 520, b: "Mud Gate", r: 80, s: 1.5 });
  b.hood("The Docks", "King's Landing", ribbon(quay, 120));
  // ships at anchor, and those under way
  for (const [p, q, a, len] of [
    [-1660, 1250, 0.3, 34],
    [-1640, 760, -0.1, 30],
    [-900, 1900, 1.2, 38],
    [-300, 1950, 1.5, 30],
    [500, 1880, 1.7, 36],
    [-1330, 1900, 0.7, 42],
    [-1560, 1790, 0.2, 30],
  ]) {
    ship(b, p, q, a, len, Math.round(p));
  }
  b.route("Blackwater ferry", [-1512, -700, -1640, -720, -1775, -700]);
  b.route(
    "Bay crossing",
    chaikin([-1600, 1100, -1650, 1650, -1300, 2050, -500, 2200, 600, 2100, 1500, 1700], 2),
  );
  b.route("River barge", chaikin([-1600, 900, -1640, 100, -1630, -900, -1640, -2000], 2));
  b.route("Fishing fleet", chaikin([-1560, 1000, -1700, 1500, -1500, 2000, -700, 2350, 100, 2300], 2));

  // ---- beyond the walls: the roads, a few roofs at each gate, the tourney grounds
  const road = (name: string | undefined, points: number[], seed: number, width = 9): Street => {
    const way: Street = {
      name,
      path: chaikin(wander(points, 30, seed, 80), 2),
      width,
      kind: G.DirtRoad,
      level: 0,
    };
    b.line(way.kind, way.width, way.path);
    occ.blockPath(way.path, way.width + 1);
    if (name) {
      const at = pointAlong(way.path, 450);
      b.place({ n: name, t: "street", p: at.p, q: at.q, b: "Crownlands", r: 74, s: 1 });
    }
    return way;
  };
  const roads = [
    road("Kingsroad", [...outFrom(gods, 2), 1250, -1900, 2000, -2300, 3300, -2700], 201, 11),
    road("Goldroad", [...outFrom(lion, 2), -500, -2200, -700, -3300], 202, 10),
    road("Roseroad", [...outFrom(kings, 2), -1470, -690, -1500, -700], 203),
    road(undefined, [-1790, -700, -2200, -800, -3300, -1100], 204),
    road("Rosby Road", [...outFrom(iron, 2), 900, 1500, 1700, 1500], 205),
    road(undefined, [...outFrom(dragon, 2), 1900, 1100, 2600, 1250, 3300, 1500], 206),
    road(undefined, [...outFrom(old, 2), 2100, -500, 3300, -700], 207),
  ];
  const beyond = inset(cityRing, -30);
  roads.forEach((way, i) => {
    lineWithHouses(b, occ, way, {
      seed: mix(8000, i),
      wealthAt: (p, q) =>
        onLand(p, q) &&
        !insideRing(beyond, p, q) &&
        Math.hypot(p, q) < 2150 &&
        rand(mix(Math.round(p / 9), Math.round(q / 9)), 4) < 0.6
          ? 0
          : null,
      rows: 1,
      gaps: 0.35,
      palette: (wealth) => PALETTES[wealth],
    });
  });

  tourney(b, [-1100, -1820]);

  b.place({ n: "King's Landing", t: "landmark", p: 0, q: 0, b: "Crownlands", r: 100, s: 0.18 });
  b.hood("King's Landing", "Crownlands", cityRing);
}

/**
 * The Red Keep, on a rock above the bay: pale red curtain walls with great drum towers, an inner
 * ward round the holdfast and the hall of the throne, and a stair down to the city. Returns the
 * foot of that stair, where the streets end.
 */
function redKeep(b: SyntheticBuilder, reserve: (ring: number[]) => void): [number, number] {
  const [cp, cq] = KEEP_CENTRE;
  const H = CRAG;
  // the rock: scree at the foot, then two shelves that follow the walls
  const scree = blob(cp, cq, 318, 0.09, 311, 36);
  reserve(scree);
  b.ground(G.Rock, scree);
  const cliff: Look = { wall: R.darkStone, roof: R.rock };
  b.volume(blob(cp, cq, 300, 0.09, 311, 36), H / 3, 0, cliff);
  b.volume(chaikin(inset(KEEP, -44), 1, true), (H * 2) / 3, 0, cliff);
  b.volume(inset(KEEP, -17), H, 0, { wall: R.darkStone, roof: R.pavement });

  const at = (dp: number, dq: number): [number, number] => [cp + dp, cq + dq];
  const box = (
    dp: number,
    dq: number,
    hu: number,
    hv: number,
    angle: number,
    height: number,
    look: Look,
    base = H,
  ): void => b.volume(rect(cp + dp, cq + dq, hu, hv, angle), base + height, base, look);
  /** A patch of the castle's floor: paving, grass. */
  const floor = (ring: number[], colour: number): void =>
    b.volume(ring, H + 0.3, H, { wall: colour, roof: colour });
  const named = (name: string, spot: [number, number], rank: number): void =>
    b.place({ n: name, t: "landmark", p: spot[0], q: spot[1], b: "Red Keep", r: rank, s: 2 });

  // the outer walls; the white tower of the Kingsguard stands at the seaward corner
  const [gate] = curtain(b, KEEP, {
    height: 15,
    thickness: 6,
    stone: RED,
    merlons: true,
    towerRadius: 9.5,
    towerHeight: 24,
    towerEvery: 110,
    base: H,
    gates: [{ name: "Red Keep gate", p: cp + 185, q: cq - 138, width: 9 }],
    bareCorners: [6],
  });
  const sword: [number, number] = [KEEP[12], KEEP[13]];
  tower(b, sword[0], sword[1], 9, 36, STONE.white, {
    base: H,
    crown: true,
    cone: { height: 11, roof: R.roofWhite },
  });
  named("White Sword Tower", sword, 84);
  for (const corner of [5, 7]) {
    tower(b, KEEP[corner * 2], KEEP[corner * 2 + 1], 12.5, 30, RED, { base: H, crown: true });
  }

  // the stair down to the city
  steps(b, gate.p + gate.outP * 16, gate.q + gate.outQ * 16, gate.outP, gate.outQ, 92, 16, H, {
    wall: R.rock,
    roof: R.cobble,
  });
  const foot: [number, number] = [gate.p + gate.outP * 114, gate.q + gate.outQ * 114];
  b.ground(G.Cobble, disc(foot[0], foot[1], 24, 12));

  // the inner ward
  const ward = [20, -70, 110, 10, 60, 140, -60, 170, -160, 80, -150, -50, -70, -110].map(
    (v, i) => v + (i % 2 === 0 ? cp : cq),
  );
  curtain(b, ward, {
    height: 11,
    thickness: 4,
    stone: RED,
    merlons: true,
    towerRadius: 6,
    towerHeight: 17,
    towerEvery: 90,
    base: H,
    gates: [{ p: cp + 65, q: cq - 30, width: 7 }],
  });

  // the yards
  floor(blob(...at(140, -95), 48, 0.12, 301, 16), R.cobble);
  floor(blob(...at(-5, -5), 40, 0.12, 302, 14), R.cobble);

  // the hall of the throne: the longest roof in the castle, a turret at each corner
  const hall = at(25, 50);
  const hallRing = rect(hall[0], hall[1], 42, 15, 0.5);
  b.volume(hallRing, H + 28, H, redHall(8));
  for (let i = 0; i < 8; i += 2) {
    tower(b, hallRing[i], hallRing[i + 1], 4.6, 31, RED, { base: H, cone: { height: 8, roof: R.roofSlate } });
  }
  named("Great Hall of the Red Keep", hall, 92);
  b.place({ n: "Iron Throne", t: "landmark", p: hall[0], q: hall[1], b: "Red Keep", r: 90, s: 2.5 });

  // Maegor's Holdfast: a square fortress inside the fortress, in a dry moat of its own
  const holdfast = at(-75, 40);
  floor(rect(holdfast[0], holdfast[1], 41, 41, 0.2), R.darkStone);
  box(-75, 40, 29, 29, 0.2, 34, { ...RED, pattern: Pattern.Sparse });
  box(-75, 40, 30, 30, 0.2, 2.6, RED, H + 33);
  box(-75, 40, 16, 16, 0.2, 11, redHall(6, Pattern.Sparse), H + 34);
  const keepCorners = rect(holdfast[0], holdfast[1], 29, 29, 0.2);
  for (let i = 0; i < 8; i += 2) {
    tower(b, keepCorners[i], keepCorners[i + 1], 7.5, 41, RED, { base: H, crown: true });
  }
  box(-33, 46, 9, 2.6, 0.2, 1.4, { wall: R.timber, roof: R.pier }); // the drawbridge
  named("Maegor's Holdfast", holdfast, 90);

  // the Tower of the Hand, by the gate
  const hand = at(160, -30);
  box(160, -30, 11, 11, 0.1, 46, { ...RED, pattern: Pattern.Sparse });
  box(160, -30, 12.2, 12.2, 0.1, 3.4, RED, H + 44);
  box(160, -30, 9, 9, 0.1, 9, { ...RED, roof: R.roofSlate, roofShape: Roof.Pyramid, roofH: 9 }, H + 47.4);
  box(150, -68, 16, 8, 0.78, 12, redHall(4, Pattern.House));
  named("Tower of the Hand", hand, 90);

  box(-40, -55, 26, 9, 0.42, 15, redHall(4.5, Pattern.House));
  named("Maidenvault", at(-40, -55), 72);
  box(80, -130, 15, 9, 0.78, 12, redHall(3.5));
  named("Small Council Chamber", at(80, -130), 70);
  box(-115, -20, 16, 10, 0.2, 14, redHall(4, Pattern.House));
  named("Kitchen Keep", at(-115, -20), 66);
  box(30, 110, 13, 8, 0.5, 11, redHall(3.5));
  named("Queen's Ballroom", at(30, 110), 64);
  const sept = at(-10, 125);
  b.prism(sept[0], sept[1], 12, 7, H + 12, H, { ...RED, pattern: Pattern.Tall });
  b.prism(sept[0], sept[1], 10.5, 7, H + 21, H + 12, {
    ...RED,
    roof: R.gold,
    roofShape: Roof.Dome,
    roofH: 9,
  });
  named("Royal Sept", sept, 68);
  // barracks, stables, the armoury and the rest of the outer ward
  for (const [dp, dq, hu, hv, angle, height] of [
    [175, 40, 22, 7, 1.52, 9],
    [130, 120, 18, 7, 2.2, 8],
    [-10, -170, 22, 7, 0.19, 8],
    [55, -168, 14, 7, 0.19, 9],
    [95, -85, 12, 7, 0.73, 8],
    [-200, -40, 15, 6, 1.35, 8],
    [-110, 160, 14, 5.5, 0.3, 7],
    [-90, -168, 13, 6, -0.52, 8],
    [100, 168, 15, 6, -0.26, 8],
    [20, 196, 14, 5.5, -0.26, 7],
  ]) {
    box(dp, dq, hu, hv, angle, height, redHall(2.6, Pattern.House));
  }

  // the godswood: a small one, elm and alder and black cottonwood, and a great oak for a heart tree
  const wood = at(-150, -112);
  floor(blob(wood[0], wood[1], 40, 0.16, 303, 16), R.park);
  for (let i = 0; i < 16; i++) {
    const a = rand(304, i) * Math.PI * 2;
    const d = 12 + rand(305, i) * 22;
    standingTree(
      b,
      wood[0] + Math.cos(a) * d,
      wood[1] + Math.sin(a) * d,
      H,
      7 + rand(306, i) * 4,
      i % 3 ? R.leafDark : R.leafLight,
    );
  }
  standingTree(b, wood[0], wood[1], H, 15, R.leafDark);
  b.place({ n: "Red Keep godswood", t: "park", p: wood[0], q: wood[1], b: "Red Keep", r: 66, s: 2 });

  b.place({ n: "Red Keep", t: "landmark", p: cp, q: cq, b: "Aegon's High Hill", r: 99, s: 0.75 });
  b.hood("Red Keep", "King's Landing", KEEP);
  return foot;
}

/** The Great Sept of Baelor: white marble under a great dome, seven towers round it, on a terrace of its own. */
function greatSept(b: SyntheticBuilder, reserve: (ring: number[]) => void): void {
  const [p, q] = SEPT;
  const T = SEPT_TERRACE;
  const gardens = disc(p, q, 168, 32);
  reserve(gardens);
  b.ground(G.Garden, gardens);
  plant(b, gardens, 140, 401, (tp, tq) => Math.hypot(tp - p, tq - q) > 138);
  b.volume(disc(p, q, 132, 32), T, 0, { wall: R.whiteBrick, roof: R.plaza });
  // steps up from each street that climbs the hill
  for (const from of [PIT, FISHMONGERS, [400, -900], [-400, -1500], [-1000, -620]]) {
    const len = Math.hypot(from[0] - p, from[1] - q);
    const dp = (from[0] - p) / len;
    const dq = (from[1] - q) / len;
    steps(b, p + dp * 131, q + dq * 131, dp, dq, 16, 18, T, STONE.white);
    b.line(G.Plaza, 14, [p + dp * 140, q + dq * 140, p + dp * 172, q + dq * 172]);
  }

  const marble: Look = { ...STONE.white, pattern: Pattern.Tall };
  // more steps, the body of the sept, and its dome with a lantern of gold
  b.prism(p, q, 62, 7, T + 2, T, STONE.white);
  b.prism(p, q, 50, 7, T + 26, T + 2, marble);
  b.prism(p, q, 44, 14, T + 56, T + 26, {
    wall: R.whiteBrick,
    roof: R.glassSilver,
    roofShape: Roof.Dome,
    roofH: 30,
  });
  b.prism(p, q, 5.5, 8, T + 66, T + 55, { wall: R.gold, roof: R.gold, roofShape: Roof.Pyramid, roofH: 7 });
  for (let i = 0; i < 7; i++) {
    const a = ((i + 0.5) / 7) * Math.PI * 2;
    tower(b, p + Math.cos(a) * 84, q + Math.sin(a) * 84, 7, 58, STONE.white, {
      base: T,
      cone: { height: 14, roof: R.gold },
    });
  }
  // the statue of the septon-king on his plinth, facing the city
  const [sp, sq] = [p + 60, q + 92];
  b.prism(sp, sq, 3.4, 8, T + 5, T, STONE.white);
  b.prism(sp, sq, 1.3, 6, T + 12, T + 5, STONE.pale);
  b.place({ n: "Great Sept of Baelor", t: "landmark", p, q, b: "Visenya's Hill", r: 98, s: 1 });
  b.place({ n: "Statue of Baelor", t: "landmark", p: sp, q: sq, b: "Great Sept of Baelor", r: 60, s: 3 });
  b.hood("Great Sept of Baelor", "King's Landing", gardens);
}

/** The Dragonpit: a vast round ruin on its hill, the walls scorched and broken and most of the dome fallen in. */
function dragonpit(b: SyntheticBuilder, reserve: (ring: number[]) => void): void {
  const [p, q] = PIT;
  const T = PIT_TERRACE;
  const hill = blob(p, q, 186, 0.06, 501, 24);
  reserve(hill);
  b.ground(G.Scrub, hill);
  b.volume(blob(p, q, 142, 0.05, 502, 30), T, 0, { wall: R.rock, roof: R.rock });
  b.volume(disc(p, q, 90, 28), T + 0.3, T, { wall: R.sand, roof: R.sand });
  const scorched: Look = { wall: R.brickDark, roof: R.darkStone, glass: R.glassBlack, pattern: Pattern.Tall };
  const tiers: [number, number, number, number][] = [
    // radius, thickness, lowest and highest wall
    [112, 16, 5, 24],
    [96, 9, 3, 13],
  ];
  for (const [radius, thick, low, high] of tiers) {
    const segments = 30;
    for (let i = 0; i < segments; i++) {
      const a = ((i + 0.5) / segments) * Math.PI * 2;
      // the side towards the bay still stands; the far side came down
      const standing = 0.5 + 0.5 * Math.cos(a - 0.9);
      const height = low + (high - low) * standing * (0.55 + 0.45 * rand(511, i + radius));
      if (rand(512, i + radius) < 0.1) continue; // a breach
      b.volume(
        rect(
          p + Math.cos(a) * radius,
          q + Math.sin(a) * radius,
          (Math.PI * radius) / segments + 0.4,
          thick / 2,
          a + Math.PI / 2,
        ),
        T + height,
        T,
        scorched,
      );
    }
  }
  // what is left of the dome: ribs leaning in over the standing side
  for (let i = 0; i < 7; i++) {
    const a = 0.9 + (i - 3) * 0.2;
    for (let step = 0; step < 4; step++) {
      const radius = 104 - step * 13;
      b.volume(
        rect(p + Math.cos(a) * radius, q + Math.sin(a) * radius, 7, 3, a),
        T + 30 + step * 7,
        T + 24 + step * 7,
        {
          wall: R.darkStone,
          roof: R.darkStone,
        },
      );
    }
  }
  // the bronze doors, and the steps up to them from the Street of the Sisters
  const door = Math.atan2(SEPT[1] - q, SEPT[0] - p);
  b.volume(rect(p + Math.cos(door) * 114, q + Math.sin(door) * 114, 3, 9, door), T + 15, T, {
    wall: R.glassBronze,
    roof: R.darkStone,
  });
  steps(b, p + Math.cos(door) * 136, q + Math.sin(door) * 136, Math.cos(door), Math.sin(door), 26, 18, T, {
    wall: R.rock,
    roof: R.cobble,
  });
  b.line(G.Cobble, 15, [
    p + Math.cos(door) * 158,
    q + Math.sin(door) * 158,
    p + Math.cos(door) * 192,
    q + Math.sin(door) * 192,
  ]);
  b.place({ n: "Dragonpit", t: "landmark", p, q, b: "Rhaenys's Hill", r: 97, s: 1 });
  b.hood("Dragonpit", "King's Landing", hill);
}

/** The Guildhall of the Alchemists: black marble, and a green light in its windows. */
function alchemists(b: SyntheticBuilder, at: [number, number], occ: Occupancy): void {
  const angle = Math.atan2(PIT[1] - SEPT[1], PIT[0] - SEPT[0]);
  const [p, q] = [at[0] - Math.sin(angle) * 48, at[1] + Math.cos(angle) * 48];
  const look: Look = { wall: R.darkStone, roof: R.roofTar, glass: R.glassGreen, pattern: Pattern.Tall };
  b.ground(G.Plaza, rect(p, q, 44, 30, angle));
  b.volume(rect(p, q, 34, 20, angle), 15, 0, look);
  b.prism(p, q, 13, 10, 26, 15, { ...look, roof: R.roofCopper, roofShape: Roof.Dome, roofH: 9 });
  for (const side of [-1, 1]) {
    tower(
      b,
      p + Math.cos(angle) * 34 * side,
      q + Math.sin(angle) * 34 * side,
      5,
      22,
      { ...look },
      {
        cone: { height: 7, roof: R.roofCopper },
      },
    );
  }
  occ.blockRing(rect(p, q, 46, 32, angle));
  b.place({ n: "Guildhall of the Alchemists", t: "landmark", p, q, b: "Street of the Sisters", r: 86, s: 2 });
  b.hood("Guildhall of the Alchemists", "King's Landing", rect(p, q, 46, 32, angle));
}

/** A ship: a pointed hull, a deck, a mast and a furled sail. */
function ship(b: SyntheticBuilder, p: number, q: number, angle: number, length: number, seed: number): void {
  const beam = length * 0.26;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const hull: number[] = [];
  for (const [u, v] of [
    [-0.5, -0.32],
    [0.22, -0.5],
    [0.5, 0],
    [0.22, 0.5],
    [-0.5, 0.32],
  ]) {
    hull.push(p + cos * u * length - sin * v * beam, q + sin * u * length + cos * v * beam);
  }
  b.volume(hull, 3.2, 0, { wall: R.timber, roof: R.pier });
  b.volume(
    rect(p - cos * length * 0.33, q - sin * length * 0.33, length * 0.13, beam * 0.3, angle),
    5.6,
    3.2,
    {
      wall: R.timber,
      roof: R.brownstone,
    },
  );
  b.prism(p, q, 0.6, 6, 3.2 + length * 0.62, 3.2, { wall: R.timber, roof: R.timber });
  b.volume(rect(p, q, 0.5, beam * 0.75, angle), 3.2 + length * 0.5, 3.2 + length * 0.38, {
    wall: pick([R.cream, R.whiteBrick, R.roofRed, R.gold], seed, 1),
    roof: R.cream,
  });
}

/** The tourney grounds: the lists, the stands along them, and the knights' pavilions. */
function tourney(b: SyntheticBuilder, at: [number, number]): void {
  const [p, q] = at;
  b.ground(G.Lawn, blob(p, q, 250, 0.12, 601, 20));
  b.ground(G.Track, rect(p + 20, q, 9, 95, 0.1));
  for (const side of [-1, 1]) {
    b.volume(rect(p + 20 + side * 26, q + side * 4, 6, 70, 0.1), 5.5, 0, {
      wall: R.timber,
      roof: side < 0 ? R.roofRed : R.gold,
    });
  }
  const colours = [R.carRed, R.carBlue, R.gold, R.roofGreen, R.cream, R.flamboyant, R.ipePink, R.whiteBrick];
  for (let i = 0; i < 46; i++) {
    const a = rand(611, i) * Math.PI * 2;
    const d = 90 + rand(612, i) * 140;
    const tp = p + Math.cos(a) * d;
    const tq = q + Math.sin(a) * d;
    if (Math.abs(tp - p - 20) < 44 && Math.abs(tq - q) < 110) continue;
    const colour = colours[i % colours.length];
    const radius = 4 + rand(613, i) * 3.2;
    b.prism(tp, tq, radius, 8, 2.6, 0, { wall: colour, roof: colour });
    b.prism(tp, tq, radius + 0.4, 8, 3 + radius, 2.6, {
      wall: colour,
      roof: colour,
      roofShape: Roof.Pyramid,
      roofH: 0.4 + radius,
    });
  }
  b.place({ n: "Tourney Grounds", t: "park", p, q, b: "King's Gate", r: 76, s: 1 });
  b.hood("Tourney Grounds", "Crownlands", blob(p, q, 250, 0.12, 601, 20));
}

export const tinykingslanding = generatedCity({
  id: "tinykingslanding",
  title: "King's Landing",
  accent: "#ea5257",
  start: { p: -1090, q: 1400, scale: 0.75 },
  card: { p: -1140, q: 1120, shrink: 3 },
  fog: { start: 200, end: 650 },
  flora: "subtropical",
  attribution: [
    "Unofficial fan-made map, generated by code",
    "Places from A Song of Ice and Fire © George R. R. Martin",
  ],
  generate,
});
