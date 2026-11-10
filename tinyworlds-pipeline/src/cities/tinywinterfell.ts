import { R } from "../render/palette.js";
import { mix, rand } from "../scene/hash.js";
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
  pave,
  plant,
  rect,
  STONE,
  tower,
  wallPiece,
  wander,
  type Street,
} from "../scene/medieval.js";
import type { Look, SyntheticBuilder } from "../scene/synthetic.js";
import { generatedCity } from "./generated.js";

/**
 * Winterfell: a great northern castle of two walls with a moat between them, a godswood taking
 * up a third of its ground, and the winter town huddled outside its gate. No map of it is
 * followed: the layout is made up here from the general character of the place. Metres, with
 * `p` towards the back right of the picture and `q` towards the front right.
 */

const SLATE: Partial<Look> = { roofShape: Roof.Pitched, roof: R.roofSlate };
const stoneHall = (roofH: number, pattern = Pattern.Tall): Look => ({
  ...STONE.grey,
  ...SLATE,
  roofH,
  pattern,
});
const timberShed = (roof: number, roofH = 2.4): Look => ({
  ...STONE.timber,
  roof,
  roofShape: Roof.Pitched,
  roofH,
  pattern: Pattern.House,
});

/** The castle's plan was drawn large; this brings it down to size without redrawing it. */
const SCALE = 0.8;
const sized = (points: number[]): number[] => points.map((v) => v * SCALE);

/** The outer wall, corner by corner. */
const OUTER = sized([
  -215, -150, -235, 20, -170, 195, -20, 245, 150, 215, 245, 95, 255, -80, 165, -215, -40, -235,
]);
const INNER = inset(OUTER, 34);
/** The godswood: the north-west of the inner ward. */
const GODSWOOD = sized([-5, -182, 118, -170, 200, -92, 208, -22, 140, 8, 62, -12, 12, -62, -28, -122]);

const GATES = [
  { name: "East Gate", p: 62 * SCALE, q: 236 * SCALE },
  { name: "South Gate", p: -204 * SCALE, q: 104 * SCALE },
  { name: "Hunter's Gate", p: 214 * SCALE, q: -144 * SCALE },
];

const MARKET: [number, number] = [-400, 300];
const TOWN = blob(MARKET[0] - 10, MARKET[1] + 10, 225, 0.16, 7, 22);

function generate(b: SyntheticBuilder): void {
  const occ = new Occupancy(-1800, -1800, 1800, 1800, 1.5);

  // ---- the land: snow over everything, the wolfswood, a stream
  const world = rect(0, 0, 2400, 2400);
  b.ground(G.Land, world);
  b.ground(G.Snow, world);
  b.limits(blob(-40, 60, 1000, 0.07, 3, 36));

  // the woods stand in the snow, tree by tree: no green floor shows under them
  const wolfswood = blob(800, -800, 790, 0.16, 11, 40);
  plant(b, wolfswood, 24, 12);
  for (const [cp, cq, r, seed] of [
    [-760, -520, 150, 21],
    [-900, 560, 190, 22],
    [520, 880, 170, 23],
    [-80, -640, 110, 24],
    [980, 420, 140, 25],
  ]) {
    plant(b, blob(cp, cq, r, 0.25, seed, 18), 30, seed);
  }
  // stands of pine out on the moor, and here and there a rock the snow has slid off
  for (let i = 0; i < 44; i++) {
    const a = rand(31, i) * Math.PI * 2;
    const d = 330 + rand(32, i) * 950;
    const cp = Math.cos(a) * d;
    const cq = Math.sin(a) * d;
    if (insideRing(wolfswood, cp, cq) || Math.hypot(cp - MARKET[0], cq - MARKET[1]) < 330) continue;
    if (i % 4 === 0) b.ground(G.Rock, blob(cp, cq, 10 + rand(33, i) * 22, 0.35, 40 + i, 12));
    else plant(b, blob(cp, cq, 30 + rand(33, i) * 60, 0.3, 40 + i, 16), 60 + rand(34, i) * 90, 300 + i);
  }

  const stream = chaikin(
    wander(
      [1150, -160, 640, 150, 360, 290, 150, 370, -120, 400, -330, 560, -640, 640, -1000, 860, -1500, 960],
      26,
      5,
      60,
    ),
    3,
  );
  b.line(G.Lake, 7, stream);
  occ.blockPath(stream, 15);

  // ---- the castle: two walls, the moat between them, the wards within
  occ.blockRing(inset(OUTER, -24));
  // trodden earth at the foot of the outer wall; inside, snow lies wherever feet do not go
  b.ground(G.Construction, [inset(OUTER, -4), inset(OUTER, 3)]);
  b.ground(G.Lake, [inset(OUTER, 8), inset(OUTER, 27)]);

  const outerGates = curtain(b, OUTER, {
    height: 12,
    thickness: 5,
    stone: STONE.grey,
    merlons: true,
    towerRadius: 6,
    towerHeight: 16,
    towerEvery: 70,
    gates: GATES.map((g) => ({ ...g, width: 7 })),
  });
  const innerGates = curtain(b, INNER, {
    height: 16,
    thickness: 5.5,
    stone: STONE.grey,
    merlons: true,
    towerRadius: 6.5,
    towerHeight: 21,
    towerEvery: 80,
    cone: R.roofSlate,
    gates: GATES.map((g) => ({ ...g, width: 7 })),
  });

  /** A spot inside the castle, from the plan's own coordinates. */
  const at = (p: number, q: number): [number, number] => [p * SCALE, q * SCALE];
  const yard: [number, number] = at(18, 66);

  // a drawbridge over the moat at each gate, and a beaten way from it to the great yard
  outerGates.forEach((gate, i) => {
    const inner = innerGates.find((g) => g.name === gate.name) ?? innerGates[i];
    b.line(G.Pier, 7, [inner.p, inner.q, gate.p, gate.q], true);
    const inside: [number, number] = [inner.p - inner.outP * 30, inner.q - inner.outQ * 30];
    // (the hunter's gate opens straight into the godswood: its path stops at the trees)
    b.line(G.DirtRoad, 5, [inner.p, inner.q, ...inside, ...(gate.name === "Hunter's Gate" ? [] : yard)]);
    b.place({ n: gate.name ?? "Gate", t: "landmark", p: gate.p, q: gate.q, b: "Winterfell", r: 72, s: 2 });
  });

  // the godswood behind its own low wall: old trees, a black pool, hot springs, and the heart tree
  b.ground(G.Forest, GODSWOOD);
  const edge = GODSWOOD.slice(6); // the side that faces the yards
  const low = { height: 4.5, thickness: 1.8, stone: STONE.dark };
  for (let i = 0; i + 3 < edge.length; i += 2) {
    const [ap, aq, bp, bq] = edge.slice(i, i + 4);
    if (i !== 4) {
      wallPiece(b, ap, aq, bp, bq, low);
      continue;
    }
    // the iron gate: a gap in this stretch
    wallPiece(b, ap, aq, ap + (bp - ap) * 0.38, aq + (bq - aq) * 0.38, low);
    wallPiece(b, ap + (bp - ap) * 0.55, aq + (bq - aq) * 0.55, bp, bq, low);
  }
  const pool = at(112, -84);
  b.ground(G.Lake, blob(pool[0], pool[1], 15, 0.2, 51, 14));
  for (const [cp, cq, r] of [
    [72, -32, 6],
    [86, -20, 4.5],
    [60, -46, 5],
  ]) {
    b.ground(G.Pool, disc(cp * SCALE, cq * SCALE, r, 10));
  }
  const heart = at(128, -110);
  b.ground(G.Lawn, disc(heart[0], heart[1], 12, 12));
  b.prism(heart[0], heart[1], 1.7, 8, 10, 0, { wall: R.weirwood, roof: R.weirwood });
  for (const [dp, dq, r, base, top] of [
    [0, 0, 8, 7, 14],
    [3, -4, 5.5, 8.5, 13],
    [-4, 3, 5, 8, 12.5],
  ]) {
    b.prism(heart[0] + dp, heart[1] + dq, r, 10, top, base, {
      wall: R.leafRed,
      roof: R.leafRed,
      roofShape: Roof.Dome,
      roofH: (top - base) * 0.7,
    });
  }
  b.place({ n: "Godswood", t: "park", p: pool[0], q: pool[1], b: "Winterfell", r: 90, s: 1.5 });
  b.place({ n: "Heart Tree", t: "landmark", p: heart[0], q: heart[1], b: "Godswood", r: 86, s: 3 });
  b.hood("Godswood", "Winterfell", GODSWOOD);

  // the yards: cobbles before the keep, trampled earth where men and horses work
  b.ground(G.Construction, blob(yard[0] + 10, yard[1] + 10, 92, 0.12, 71, 20));
  b.ground(G.Construction, blob(...at(-120, 92), 62, 0.15, 72, 16));
  b.ground(G.Construction, blob(...at(-84, -78), 58, 0.15, 73, 16));
  b.ground(G.Construction, blob(...at(150, 100), 44, 0.15, 74, 14));
  b.ground(G.Cobble, rect(yard[0], yard[1], 44, 36, 0.1));
  b.line(G.DirtRoad, 4, [...at(-84, -78), ...at(-40, 0), ...yard]);
  b.line(G.DirtRoad, 4, [...at(-120, 92), ...at(-50, 70), ...yard]);
  b.line(G.DirtRoad, 4, [...yard, ...at(110, 110), ...at(150, 100)]);

  /** A building at a spot on the plan: a box with the look given, its ground taken, and its name on the map. */
  const hall = (
    name: string | null,
    spot: [number, number],
    halfU: number,
    halfV: number,
    angle: number,
    height: number,
    style: Look,
    rank = 70,
  ): void => {
    b.volume(rect(spot[0], spot[1], halfU, halfV, angle), height, 0, style);
    occ.blockRing(rect(spot[0], spot[1], halfU + 1, halfV + 1, angle));
    if (name) b.place({ n: name, t: "landmark", p: spot[0], q: spot[1], b: "Winterfell", r: rank, s: 2.5 });
  };
  const named = (name: string, spot: [number, number], rank: number): void =>
    b.place({ n: name, t: "landmark", p: spot[0], q: spot[1], b: "Winterfell", r: rank, s: 2.5 });

  // the Great Keep, a turret at each corner, with the Great Hall beside it
  const keep = at(78, 62);
  hall("Great Keep", keep, 27, 20, 0.06, 31, stoneHall(5, Pattern.Sparse), 95);
  for (const [du, dv] of [
    [-27, -20],
    [27, -20],
    [27, 20],
    [-27, 20],
  ]) {
    const cos = Math.cos(0.06);
    const sin = Math.sin(0.06);
    tower(b, keep[0] + du * cos - dv * sin, keep[1] + du * sin + dv * cos, 5, 34, STONE.grey, {
      cone: { height: 7, roof: R.roofSlate },
    });
  }
  const greatHall = at(30, 132);
  hall("Great Hall", greatHall, 33, 12, 0.1, 15.5, stoneHall(5), 92);
  hall(null, at(-12, 160), 13, 8, 0.1, 9, stoneHall(3, Pattern.House)); // the kitchens
  hall(null, at(-34, 118), 9, 7, 0.1, 7.5, timberShed(R.roofSlate)); // the brewhouse
  const armoury = at(84, 2);
  hall("Armoury", armoury, 13, 9, 0.06, 10, stoneHall(3, Pattern.Sparse), 64);
  // the covered bridge from the keep to the armoury
  b.volume(
    rect((keep[0] + armoury[0]) / 2, (keep[1] + armoury[1]) / 2 + 4, 11, 2.2, Math.PI / 2 + 0.06),
    13,
    9,
    { ...STONE.timber, roof: R.roofSlate },
  );

  // the oldest part: the First Keep, the Broken Tower beside it, the lichyard and the crypts
  const firstKeep = at(170, 66);
  tower(b, firstKeep[0], firstKeep[1], 15, 19, STONE.dark, { crown: true });
  occ.blockRing(disc(firstKeep[0], firstKeep[1], 17, 12));
  named("First Keep", firstKeep, 88);
  const broken = at(196, 18);
  b.prism(broken[0], broken[1], 6.5, 12, 26, 0, STONE.dark);
  // what is left of its top
  b.volume(
    [
      broken[0],
      broken[1] - 6.5,
      broken[0] + 6.5,
      broken[1],
      broken[0],
      broken[1] + 6.5,
      broken[0] - 2.5,
      broken[1],
    ],
    30.5,
    26,
    STONE.dark,
  );
  b.ground(G.Rock, blob(broken[0] - 7, broken[1] + 10, 10, 0.4, 61, 9));
  occ.blockRing(disc(broken[0], broken[1], 9, 10));
  named("Broken Tower", broken, 86);
  const lich = at(160, 118);
  b.ground(G.Cemetery, blob(lich[0], lich[1], 21, 0.25, 62, 10));
  occ.blockRing(disc(lich[0], lich[1], 22, 10));
  b.place({ n: "Lichyard", t: "place", p: lich[0], q: lich[1], b: "Winterfell", r: 62, s: 2.5 });
  hall("Crypts", at(134, 98), 5.5, 4, 0.5, 4.4, { ...STONE.dark, pattern: Pattern.House }, 84);

  const library = at(-48, 168);
  tower(b, library[0], library[1], 9, 24, STONE.grey, { sides: 4, cone: { height: 8, roof: R.roofSlate } });
  occ.blockRing(disc(library[0], library[1], 11, 8));
  named("Library Tower", library, 80);
  const bell = at(12, 100);
  tower(b, bell[0], bell[1], 4.6, 36, STONE.grey, { sides: 4, cone: { height: 8, roof: R.roofSlate } });
  named("Bell Tower", bell, 78);
  const maester = at(108, 152);
  tower(b, maester[0], maester[1], 6, 25, STONE.grey, {
    crown: true,
    cone: { height: 7, roof: R.roofSlate },
  });
  occ.blockRing(disc(maester[0], maester[1], 8, 8));
  named("Maester's Turret", maester, 78);

  hall("Guest House", at(-98, 78), 22, 9, 0.38, 10.5, stoneHall(4, Pattern.House), 74);
  const sept = at(-128, 12);
  hall("Sept", sept, 9, 6.5, 0.2, 8.5, stoneHall(3), 70);
  b.prism(sept[0] - 7, sept[1] - 2, 5.2, 7, 13, 6, {
    ...STONE.pale,
    roof: R.roofSlate,
    roofShape: Roof.Dome,
    roofH: 5,
  });
  const glass = at(18, -34);
  b.volume(rect(glass[0], glass[1], 27, 10, -0.5), 5.5, 0, {
    wall: R.glassGreen,
    roof: R.glassTeal,
    pattern: Pattern.Curtain,
  });
  occ.blockRing(rect(glass[0], glass[1], 28, 11, -0.5));
  named("Glass Gardens", glass, 82);
  const smithy = at(-150, 150);
  hall("Smithy", smithy, 9, 7, 0.9, 6.5, { ...STONE.dark, ...SLATE, roofH: 2.5, pattern: Pattern.House }, 64);
  b.prism(smithy[0] - 4, smithy[1] + 5, 1.3, 6, 10.5, 0, STONE.dark);
  hall("Stables", at(-172, 62), 30, 6.5, 1.2, 6, timberShed(R.thatch, 2.6), 64);
  hall("Kennels", at(-150, -70), 16, 5.5, 1.75, 5, timberShed(R.thatch, 2.2), 62);
  hall("Guards Hall", at(-62, -128), 21, 8, 0.3, 9, stoneHall(3.5, Pattern.House), 60);
  hall(null, at(-110, -30), 14, 7, 0.25, 8, stoneHall(3, Pattern.House)); // barracks
  hall(null, at(-38, 20), 10, 7, 0.1, 7, timberShed(R.snow)); // the granary
  hall(null, at(-70, 30), 8, 6, 0.1, 6, timberShed(R.roofSlate)); // the bathhouse
  b.prism(yard[0] - 10, yard[1] - 12, 2, 8, 1.4, 0, STONE.dark); // the well in the yard

  // sheds and stores against the inside of the wall, wherever there is room
  const lean = inset(INNER, 14);
  for (let i = 0; i < lean.length / 2; i++) {
    const j = (i + 1) % (lean.length / 2);
    const len = Math.hypot(lean[j * 2] - lean[i * 2], lean[j * 2 + 1] - lean[i * 2 + 1]);
    const angle = Math.atan2(lean[j * 2 + 1] - lean[i * 2 + 1], lean[j * 2] - lean[i * 2]);
    for (let s = 20; s < len - 20; s += 23) {
      const seed = mix(i, Math.round(s));
      if (rand(seed, 1) < 0.25) continue;
      const cp = lean[i * 2] + (lean[j * 2] - lean[i * 2]) * (s / len);
      const cq = lean[i * 2 + 1] + (lean[j * 2 + 1] - lean[i * 2 + 1]) * (s / len);
      if (insideRing(GODSWOOD, cp, cq)) continue;
      const halfU = 6 + rand(seed, 2) * 4.5;
      const halfV = 3.5 + rand(seed, 3) * 2;
      if (!occ.isFree(rect(cp, cq, halfU + 1.5, halfV + 1.5, angle))) continue;
      b.volume(rect(cp, cq, halfU, halfV, angle), 4.5 + rand(seed, 4) * 3.5, 0, {
        wall: rand(seed, 5) < 0.5 ? R.greyStone : R.timber,
        roof: rand(seed, 6) < 0.4 ? R.snow : rand(seed, 6) < 0.7 ? R.roofSlate : R.thatch,
        glass: R.glassBlack,
        pattern: Pattern.House,
        roofShape: Roof.Pitched,
        roofH: 2,
      });
      occ.blockRing(rect(cp, cq, halfU + 1, halfV + 1, angle));
    }
  }
  b.place({ n: "Winterfell", t: "landmark", p: 16, q: 16, b: "The North", r: 100, s: 0.6 });
  b.hood("Winterfell", "The North", OUTER);

  // ---- roads
  const [east, south, hunters] = GATES.map((g) => outerGates.find((o) => o.name === g.name)!);
  const out = (g: { p: number; q: number; outP: number; outQ: number }, d: number): [number, number] => [
    g.p + g.outP * d,
    g.q + g.outQ * d,
  ];
  const kingsroad: Street = {
    name: "Kingsroad",
    path: chaikin(
      wander(
        [1700, 520, 900, 440, 420, 400, 110, 390, -230, 440, -440, 455, -900, 430, -1700, 520],
        22,
        9,
        70,
      ),
      2,
    ),
    width: 9,
    kind: G.DirtRoad,
    level: 0,
  };
  const eastRoad: Street = {
    path: [east.p, east.q, ...out(east, 80), 95, 390],
    width: 7,
    kind: G.DirtRoad,
    level: 0,
  };
  const marketStreet: Street = {
    name: "Market Street",
    path: chaikin(
      wander([south.p, south.q, ...out(south, 60), MARKET[0], MARKET[1], -445, 455], 7, 14, 30),
      2,
    ),
    width: 7.5,
    kind: G.Cobble,
    level: 0,
  };
  const huntersRoad: Street = {
    name: "Hunter's Road",
    path: chaikin(
      wander([hunters.p, hunters.q, ...out(hunters, 70), 440, -480, 760, -860, 1200, -1300], 20, 15, 50),
      2,
    ),
    width: 6,
    kind: G.DirtRoad,
    level: 0,
  };
  const townWays: Street[] = [
    marketStreet,
    {
      path: chaikin(
        wander(
          [MARKET[0] - 185, MARKET[1] - 45, MARKET[0], MARKET[1], MARKET[0] + 150, MARKET[1] + 110],
          10,
          16,
          28,
        ),
        2,
      ),
      width: 6,
      kind: G.DirtRoad,
      level: 0,
    },
  ];
  const inTown = (p: number, q: number): boolean => insideRing(TOWN, p, q) && !occ.isTaken(p, q);
  const lanes = growLanes(townWays, {
    seed: 77,
    allowed: inTown,
    spacing: [32, 54],
    reach: [50, 150],
    depth: 2,
    join: 15,
    width: [3.6, 4.8],
    kind: G.DirtRoad,
  });
  for (const street of [kingsroad, eastRoad, huntersRoad, ...townWays, ...lanes]) pave(b, occ, street);
  b.place({ n: "Kingsroad", t: "street", p: 110, q: 390, b: "The North", r: 70, s: 1 });
  b.place({
    n: "Market Street",
    t: "street",
    p: (south.p + MARKET[0]) / 2,
    q: (south.q + MARKET[1]) / 2,
    b: "Winter Town",
    r: 60,
    s: 2,
  });
  b.place({ n: "Hunter's Road", t: "street", p: 440, q: -480, b: "Wolfswood", r: 50, s: 1 });

  // ---- the winter town: a square with a market cross, an inn, and houses of timber, stone and thatch
  b.ground(G.Cobble, disc(MARKET[0], MARKET[1], 24, 14));
  occ.blockRing(disc(MARKET[0], MARKET[1], 25, 14));
  b.prism(MARKET[0], MARKET[1], 2.2, 8, 1.2, 0, STONE.dark);
  b.prism(MARKET[0], MARKET[1], 0.7, 6, 6.5, 1.2, STONE.pale);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    b.volume(
      rect(MARKET[0] + Math.cos(a) * 14, MARKET[1] + Math.sin(a) * 14, 2.4, 1.6, a + Math.PI / 2),
      2.9,
      2.3,
      { wall: R.timber, roof: [R.roofRed, R.cream, R.roofGreen, R.sidingBlue][i % 4] },
    );
  }
  const inn: [number, number] = [MARKET[0] - 34, MARKET[1] - 14];
  b.volume(rect(inn[0], inn[1], 11, 7, 0.5), 9.5, 0, {
    wall: R.timber,
    roof: R.roofSlate,
    glass: R.gold,
    pattern: Pattern.House,
    roofShape: Roof.Pitched,
    roofH: 3.5,
  });
  occ.blockRing(rect(inn[0], inn[1], 12, 8, 0.5));
  b.place({ n: "The Smoking Log", t: "place", p: inn[0], q: inn[1], b: "Winter Town", r: 66, s: 2.5 });
  b.place({ n: "Market Square", t: "place", p: MARKET[0], q: MARKET[1], b: "Winter Town", r: 76, s: 2 });
  b.place({ n: "Winter Town", t: "place", p: MARKET[0], q: MARKET[1], b: "Winterfell", r: 92, s: 1 });
  b.hood("Winter Town", "Winterfell", TOWN);

  const northern = {
    walls: [R.timber, R.timber, R.tan, R.cream, R.greyStone, R.brownstone],
    roofs: [R.thatch, R.thatch, R.snow, R.snow, R.roofBrown, R.roofSlate],
  };
  let houses = 0;
  [...townWays, ...lanes].forEach((street, i) => {
    houses += lineWithHouses(b, occ, street, {
      seed: mix(900, i),
      wealthAt: (p, q) =>
        insideRing(TOWN, p, q) ? (rand(mix(Math.round(p), Math.round(q)), 9) < 0.22 ? 1 : 0) : null,
      rows: street.level === 0 ? 2 : 1,
      gaps: 0.12,
      palette: () => northern,
    });
  });
  // crofts strung along the kingsroad
  lineWithHouses(b, occ, kingsroad, {
    seed: 950,
    wealthAt: (p, q) =>
      Math.hypot(p + 100, q - 420) < 620 && rand(mix(Math.round(p / 9), Math.round(q / 9)), 4) < 0.5
        ? 0
        : null,
    rows: 1,
    gaps: 0.55,
    palette: () => northern,
  });
  if (houses < 80) throw new Error(`the winter town came out with only ${houses} houses`);

  b.place({ n: "Wolfswood", t: "park", p: 600, q: -600, b: "The North", r: 80, s: 0.5 });
  b.hood("Wolfswood", "The North", wolfswood);
}

export const tinywinterfell = generatedCity({
  id: "tinywinterfell",
  title: "Winterfell",
  accent: "#a9c7e8",
  start: { p: 10, q: 20, scale: 0.75 },
  card: { p: 6, q: 22, shrink: 2 },
  fog: { start: 150, end: 520 },
  flora: "boreal",
  attribution: [
    "Unofficial fan-made map, generated by code",
    "Places from A Song of Ice and Fire © George R. R. Martin",
  ],
  generate,
});
