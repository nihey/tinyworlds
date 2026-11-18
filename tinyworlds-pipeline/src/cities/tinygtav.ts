import { R } from "../render/palette.js";
import { G, Pattern, Roof } from "../scene/kinds.js";
import { blob, chaikin, disc, plant, rect } from "../scene/medieval.js";
import { nearestOnPath, peak, range } from "../scene/worldkit.js";
import { greenbelt, metroCity, palm } from "./metro.js";

const BEACH = [
  -1120, -783, -868, -1046, -480, -1168, -199, -980, -59, -752, 94, -662, -47, -609, -210, -828, -482, -1059,
  -843, -952, -1043, -734,
];
const CHAPARRAL = blob(577, 128, 580, 0.18, 122);
const SALT_FLATS = blob(520, 704, 396, 0.19, 77);
const COUNTY_HIGHWAY = chaikin(
  [
    -912, -732, -952, -313, -836, 108, -704, 478, -585, 761, -222, 904, 218, 912, 618, 831, 985, 734, 1060,
    376, 1028, -48, 931, -424, 905, -796,
  ],
  2,
);

export const tinygtav = metroCity(
  {
    id: "tinygtav",
    title: "GTA V",
    inspiration: "Grand Theft Auto V",
    accent: "#9cdc91",
    flora: "subtropical",
    colors: {
      water: "#347d9d",
      waterShallow: "#66aeb9",
      sand: "#e7cfa4",
      park: "#9eab73",
      lawn: "#afb97b",
      forest: "#686f48",
      scrub: "#a8a170",
      rock: "#ad9d83",
      greyStone: "#b0a499",
      darkStone: "#928273",
      steppe: "#c6ae78",
      terraRoxa: "#ab805d",
      roofClay: "#c98861",
      glassBlue: "#739eb7",
      roofWhite: "#e9dfd0",
    },
    start: { p: -85, q: 15, scale: 0.24 },
    card: { p: -30, q: -70, shrink: 7 },
  },
  {
    frame: [1450, 1370],
    land: [
      [
        -1247, -506, -1120, -783, -868, -1046, -480, -1168, -199, -980, -59, -752, 94, -662, 348, -692, 631,
        -993, 984, -1101, 1262, -817, 1335, -225, 1198, 402, 1260, 810, 977, 1174, 415, 1235, -151, 1189,
        -678, 1137, -996, 961, -1251, 603, -1212, 317, -1294, -93,
      ],
    ],
    districts: [
      {
        name: "Crescent Strand",
        center: [-595, -770],
        blocks: [6, 4],
        block: [82, 68],
        style: "deco",
        angle: 0.23,
      },
      {
        name: "Sunward Center",
        center: [-768, 5],
        blocks: [7, 8],
        block: [90, 79],
        style: "highrise",
        angle: -0.14,
      },
      {
        name: "Camellia Park",
        center: [-749, -399],
        blocks: [6, 5],
        block: [69, 61],
        style: "bungalow",
        angle: -0.12,
        greens: 0.04,
      },
      {
        name: "Palisade Estates",
        center: [-219, -280],
        blocks: [5, 6],
        block: [86, 79],
        style: "bungalow",
        angle: -0.31,
      },
      {
        name: "Marmalade Flats",
        center: [-694, 557],
        blocks: [6, 6],
        block: [75, 78],
        style: "bungalow",
        angle: -0.14,
      },
      {
        name: "Orchard Junction",
        center: [612, 825],
        blocks: [4, 3],
        block: [72, 80],
        style: "bungalow",
        angle: 0.13,
      },
      {
        name: "Beacon Cove",
        center: [929, -798],
        blocks: [4, 3],
        block: [73, 71],
        style: "bungalow",
        angle: 0.35,
      },
    ],
    roads: [
      {
        kind: G.Highway,
        width: 20,
        path: COUNTY_HIGHWAY,
      },
      {
        kind: G.RoadMajor,
        width: 13,
        path: chaikin(
          [-817, -760, -490, -751, -222, -610, -100, -393, -201, -223, -487, -246, -657, -102],
          2,
        ),
      },
      {
        kind: G.RoadMajor,
        width: 13,
        path: chaikin([-657, 223, -368, 293, -164, 550, 103, 560, 359, 752, 649, 833], 2),
      },
      {
        kind: G.DirtRoad,
        width: 6,
        path: chaikin([940, -804, 862, -674, 755, -702, 718, -587, 616, -541], 2),
      },
    ],
    decorate(b) {
      b.ground(G.Sand, BEACH);
      b.ground(G.Scrub, CHAPARRAL);
      b.ground(G.Steppe, SALT_FLATS);
      b.ground(G.Lake, blob(287, 420, 169, 0.19, 64));
      b.ground(G.Rock, blob(786, -419, 280, 0.14, 56));
      b.ground(G.Steppe, blob(350, -222, 239, 0.23, 3));
      b.ground(G.Scrub, blob(759, 392, 220, 0.28, 90));
      const offHighway = (p: number, q: number, radius: number) =>
        nearestOnPath(COUNTY_HIGHWAY, p, q).dist >= radius + 14;
      range(b, [910, -495, 762, -410, 575, -365, 488, -215], {
        width: 280,
        height: 178,
        spacing: 97,
        rock: R.rock,
        seed: 25,
        ok: offHighway,
      });
      peak(b, 762, -410, 125, 203, R.darkStone, 25, R.greyStone);
      // Lower, rounded ridges connect the chaparral floor to the exposed mountain rock.
      for (const [p, q, radius, height, seed] of [
        [453, -338, 112, 39, 5],
        [555, -276, 119, 54, 8],
        [660, -224, 116, 38, 24],
        [800, -246, 101, 46, 39],
      ])
        b.volume(blob(p, q, radius, 0.24, seed), height, 0, {
          wall: R.rock,
          roof: R.scrub,
          roofShape: Roof.Dome,
          roofH: height - 2,
        });
      range(b, [558, -50, 684, 113, 859, 179, 979, 126], {
        width: 190,
        height: 107,
        spacing: 77,
        rock: R.ochre,
        floor: G.Earth,
        seed: 71,
        ok: offHighway,
      });
      greenbelt(b, blob(-119, 255, 181, 0.23, 18), 180, G.Scrub);
      greenbelt(b, blob(755, -923, 103, 0.22, 5), 15, G.Scrub);
      plant(b, blob(610, -618, 139, 0.23, 11), 550, 15);
      plant(b, blob(-318, -574, 105, 0.2, 102), 390, 9);
      for (const p of [-621, -580, -539, -498, -457]) palm(b, p, -908, 8 + (Math.abs(p) % 4));
    },
    sites: [
      {
        name: "Crescent Pier",
        at: [-544, -1040],
        district: "Crescent Strand",
        type: "landmark",
        draw(b, [p, q]) {
          b.line(G.Pier, 13, [p, q + 53, p, q - 147], true);
          b.ground(G.Pier, rect(p, q - 116, 36, 33));
          b.volume(rect(p + 10, q - 117, 12, 11), 8, 0, {
            wall: R.rose,
            roof: R.roofCopper,
            roofShape: Roof.Pitched,
            roofH: 2,
          });
          for (const offset of [-20, 0, 20])
            b.prism(p + offset, q - 142, 2, 8, 7, 0, { wall: R.cream, roof: R.ipePink });
        },
      },
      {
        name: "Sunward Studios",
        at: [-440, 184],
        district: "Sunward Center",
        type: "landmark",
        clear: 74,
        draw(b, [p, q]) {
          b.ground(G.Parking, rect(p, q, 63, 39, -0.14));
          const stage = { wall: R.cream, roof: R.roofTerracotta, pattern: Pattern.Sparse };
          b.volume(rect(p + 27, q - 7, 19, 26, -0.14), 14, 0, stage);
          b.volume(rect(p - 21, q - 14, 18, 18, -0.14), 16, 0, stage);
          b.volume(rect(p - 26, q + 21, 18, 10, -0.14), 9, 0, { ...stage, wall: R.rose });
        },
      },
      {
        name: "Halo Observatory",
        at: [215, -323],
        district: "Palisade Estates",
        type: "landmark",
        draw(b, [p, q]) {
          b.ground(G.Plaza, disc(p, q, 42, 22));
          const observatory = { wall: R.limestone, roof: R.roofSilver, pattern: Pattern.Sparse };
          b.volume(rect(p, q, 24, 16, 0.23), 12, 0, observatory);
          b.prism(p + 5, q + 2, 12, 16, 25, 12, { ...observatory, roofShape: Roof.Dome, roofH: 9 });
          b.line(G.Road, 7, chaikin([p, q, p - 74, q - 27, p - 124, q - 138, p - 203, q - 219], 2));
        },
      },
      { name: "Rattlesnake Lake", at: [287, 420], district: "Orchard Junction", type: "park" },
      {
        name: "Mesa Airfield",
        at: [-95, 1058],
        district: "Orchard Junction",
        type: "place",
        draw(b, [p, q]) {
          b.ground(G.Apron, rect(p, q, 164, 52, 0.05));
          b.line(G.Runway, 25, [p - 162, q + 4, p + 163, q + 20]);
          b.line(G.Taxiway, 7, [p - 130, q - 27, p + 100, q - 15, p + 152, q + 18]);
          for (const offset of [-38, 19, 70])
            b.volume(rect(p + offset, q - 36, 14, 11, 0.05), 9, 0, {
              wall: R.steel,
              roof: R.roofSilver,
              roofShape: Roof.Pitched,
              roofH: 2,
            });
        },
      },
      { name: "Coyote Ridge", at: [762, -410], district: "Coyote Range", type: "landmark" },
      {
        name: "Beacon Cove Light",
        at: [1014, -941],
        district: "Beacon Cove",
        type: "landmark",
        draw(b, [p, q]) {
          b.prism(p, q, 7, 12, 32, 0, { wall: R.cream, roof: R.roofRed, pattern: Pattern.Sparse });
          b.prism(p, q, 6, 12, 39, 32, {
            wall: R.glassTeal,
            roof: R.roofRed,
            roofShape: Roof.Pyramid,
            roofH: 4,
          });
        },
      },
    ],
  },
);
