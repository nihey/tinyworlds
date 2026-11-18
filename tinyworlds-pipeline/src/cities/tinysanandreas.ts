import { R } from "../render/palette.js";
import { G, Pattern, Roof } from "../scene/kinds.js";
import { blob, chaikin, disc, plant, rect } from "../scene/medieval.js";
import { nearestOnPath, peak, range } from "../scene/worldkit.js";
import { bridge, greenbelt, metroCity } from "./metro.js";

const VALLEY = blob(-221, 581, 560, 0.14, 103);
const LAKE = blob(349, 342, 239, 0.21, 212);
const TIMBER = blob(1004, -79, 315, 0.33, 55);
const STATE_HIGHWAY = chaikin(
  [683, 825, 386, 969, -116, 866, -455, 610, -845, 382, -1001, 218, -1080, -142, -1103, -499],
  2,
);
const FARMS = [
  rect(-407, 514, 68, 96, -0.19),
  rect(-314, 382, 66, 39, -0.19),
  rect(-513, 325, 61, 49, -0.19),
  rect(-180, 417, 56, 66, -0.19),
];

export const tinysanandreas = metroCity(
  {
    id: "tinysanandreas",
    title: "GTA: San Andreas",
    inspiration: "Grand Theft Auto: San Andreas",
    accent: "#f4bd77",
    flora: "temperate",
    colors: {
      water: "#477e98",
      waterShallow: "#679da4",
      park: "#94a56a",
      lawn: "#afba78",
      forest: "#638351",
      scrub: "#a2a66b",
      steppe: "#c7a76e",
      steppeDark: "#9e8055",
      terraRoxa: "#ab6d4d",
      redStone: "#ba7958",
      roofTerracotta: "#b98159",
      roofClay: "#cd9261",
    },
    start: { p: -20, q: 35, scale: 0.23 },
    card: { p: -40, q: 125, shrink: 7 },
  },
  {
    frame: [1450, 1390],
    land: [
      chaikin(
        [
          -1330, -736, -956, -1070, -490, -961, -152, -774, 165, -1110, 485, -1272, 703, -1220, 778, -733,
          1054, -619, 1341, -262, 1291, 322, 1125, 928, 790, 1181, 330, 1272, -261, 1295, -724, 1031, -1110,
          675, -1304, 140,
        ],
        2,
        true,
      ),
      blob(636, -1002, 103, 0.17, 62),
    ],
    districts: [
      {
        name: "Juniper Flats",
        center: [-874, -452],
        blocks: [6, 6],
        block: [70, 73],
        style: "bungalow",
        angle: 0.12,
      },
      {
        name: "Sundown Center",
        center: [-1061, -41],
        blocks: [4, 5],
        block: [73, 76],
        style: "highrise",
        angle: 0.12,
      },
      {
        name: "Fogline Terrace",
        center: [469, -813],
        blocks: [7, 6],
        block: [75, 77],
        style: "brick",
        angle: -0.25,
      },
      {
        name: "Copper Mile",
        center: [695, 727],
        blocks: [6, 6],
        block: [77, 86],
        style: "resort",
        angle: 0.25,
        greens: 0.25,
      },
      {
        name: "Glass Arroyo",
        center: [701, 411],
        blocks: [3, 3],
        block: [61, 68],
        style: "resort",
        angle: 0.2,
        greens: 0.18,
        heightScale: 0.62,
      },
      {
        name: "Sundown Freight Yards",
        center: [-1069, 277],
        blocks: [3, 4],
        block: [68, 64],
        style: "warehouse",
        angle: 0.12,
      },
      { name: "Dry Creek", center: [-133, 858], blocks: [3, 3], block: [75, 62], style: "bungalow" },
    ],
    roads: [
      {
        kind: G.Highway,
        width: 20,
        path: chaikin([-1120, -617, -640, -515, -415, -303, -132, -327, 136, -571, 394, -674, 535, -626], 2),
      },
      {
        kind: G.Highway,
        width: 19,
        path: chaikin([460, -807, 616, -510, 689, -164, 725, 307, 742, 553, 662, 814], 2),
      },
      {
        kind: G.Highway,
        width: 20,
        path: STATE_HIGHWAY,
      },
      { kind: G.Road, width: 8, path: [-395, 463, -276, 572, -266, 685, -113, 830] },
      { kind: G.Road, width: 9, path: [511, -828, 574, -913, 672, -1043] },
    ],
    decorate(b) {
      b.ground(G.Steppe, [VALLEY, ...FARMS]);
      b.ground(G.Lake, LAKE);
      b.ground(G.Forest, TIMBER);
      plant(b, TIMBER, 400, 12, (p) => p > 955);
      for (const field of FARMS) b.ground(G.Crop, field);
      b.ground(G.Crop, rect(-425, -246, 48, 75, -0.19));
      b.ground(G.Crop, rect(-229, -154, 46, 86, -0.19));
      greenbelt(b, blob(190, -303, 229, 0.27, 9), 38);
      greenbelt(b, blob(-414, -64, 175, 0.29, 19), 11);
      range(b, [771, -367, 907, -183, 1014, -15, 1176, 122], {
        width: 322,
        height: 171,
        spacing: 99,
        rock: R.darkStone,
        cap: { above: 127, of: R.limestone },
        seed: 14,
      });
      peak(b, 907, -183, 133, 184, R.greyStone, 7, R.cream);
      range(b, [111, 1101, 234, 991, 318, 904], {
        width: 161,
        height: 81,
        spacing: 68,
        rock: R.redStone,
        floor: G.RedRock,
        seed: 44,
        ok: (p, q, radius) => nearestOnPath(STATE_HIGHWAY, p, q).dist >= radius + 14,
      });
      bridge(b, [574, -913, 672, -1043], 9);
    },
    sites: [
      {
        name: "Juniper Bowl",
        at: [-824, -308],
        district: "Juniper Flats",
        type: "landmark",
        clear: 80,
        draw(b, [p, q]) {
          b.ground(G.Track, disc(p, q, 53, 24));
          b.ground(G.Pitch, rect(p, q, 35, 22, 0.12));
          const stands = { wall: R.cream, roof: R.roofTerracotta, pattern: Pattern.Sparse };
          for (const side of [-1, 1]) b.volume(rect(p, q + side * 32, 39, 7, 0.12), 16, 0, stands);
        },
      },
      {
        name: "Fogline Cable Depot",
        at: [444, -793],
        district: "Fogline Terrace",
        type: "station",
        clear: 36,
        draw(b, [p, q]) {
          b.volume(rect(p, q, 22, 18, -0.25), 20, 0, {
            wall: R.brickRed,
            roof: R.roofCopper,
            pattern: Pattern.Tall,
            roofShape: Roof.Pitched,
            roofH: 6,
          });
          b.line(G.Rail, 4, [p - 75, q - 31, p, q - 21, p + 73, q - 41]);
        },
      },
      {
        name: "Mirage Crown",
        at: [686, 715],
        district: "Copper Mile",
        type: "landmark",
        clear: 70,
        draw(b, [p, q]) {
          b.ground(G.Plaza, disc(p, q, 57, 24));
          const casino = { wall: R.ochre, roof: R.gold, glass: R.glassBronze, pattern: Pattern.Ribbon };
          b.volume(rect(p, q, 31, 34, 0.25), 18, 0, casino);
          b.prism(p, q, 27, 8, 71, 18, { ...casino, roofShape: Roof.Pyramid, roofH: 35 });
          for (const offset of [-37, 37]) b.ground(G.Pool, disc(p + offset, q + 30, 10, 12));
        },
      },
      { name: "Jackrabbit Reservoir", at: [349, 342], district: "Dry Creek", type: "park" },
      { name: "Slateback Peak", at: [907, -183], district: "Slateback Range", type: "landmark" },
      { name: "Lantern Island Bridge", at: [623, -978], district: "Fogline Terrace", type: "bridge" },
    ],
  },
);
