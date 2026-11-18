import { R } from "../render/palette.js";
import { G, Pattern } from "../scene/kinds.js";
import { blob, disc, plant, rect } from "../scene/medieval.js";
import { bridge, metroCity } from "./metro.js";

const BEACH = [
  740, 674, 721, 814, 472, 913, 57, 925, -322, 861, -547, 707, -632, 492, -592, 409, -495, 626, -268, 759, 67,
  824, 454, 820, 670, 758,
];
const PARK = blob(554, -659, 151, 0.24, 10);

export const tinyvicecity = metroCity(
  {
    id: "tinyvicecity",
    title: "GTA: Vice City",
    inspiration: "Grand Theft Auto: Vice City",
    accent: "#f59bc8",
    flora: "subtropical",
    start: { p: 0, q: 275, scale: 0.32 },
    card: { p: 40, q: 408, shrink: 4 },
  },
  {
    frame: [1000, 1080],
    land: [
      [
        878, -963, 908, -486, 724, -332, 475, -336, 287, -210, 204, -85, -26, -57, -189, -173, -413, -152,
        -675, -310, -837, -559, -906, -901,
      ],
      [
        740, 674, 721, 814, 472, 913, 57, 925, -322, 861, -547, 707, -632, 492, -667, 291, -500, 206, -222,
        289, -25, 432, 251, 374, 519, 438, 704, 525,
      ],
      blob(99, 166, 144, 0.19, 72),
      blob(-373, 63, 104, 0.22, 18),
    ],
    districts: [
      {
        name: "Sunflash Beach",
        center: [180, 661],
        blocks: [10, 5],
        block: [86, 66],
        style: "deco",
        angle: -0.09,
        greens: 0.07,
      },
      {
        name: "Hibiscus Isles",
        center: [97, 159],
        blocks: [3, 3],
        block: [67, 51],
        style: "bungalow",
        angle: 0.2,
      },
      {
        name: "Mango Commons",
        center: [-259, -486],
        blocks: [6, 7],
        block: [82, 78],
        style: "bungalow",
        angle: 0.08,
      },
      {
        name: "Mirage Quay",
        center: [183, -406],
        blocks: [4, 5],
        block: [86, 76],
        style: "resort",
        angle: 0.08,
      },
      {
        name: "Lemon Marina",
        center: [-443, 447],
        blocks: [4, 5],
        block: [76, 65],
        style: "deco",
        angle: 0.43,
      },
    ],
    roads: [
      { kind: G.RoadMajor, width: 14, path: [390, -660, 247, -469, 77, -238, 77, 521, 107, 762] },
      { kind: G.RoadMajor, width: 12, path: [-555, 416, -362, 653, -194, 763, 110, 799, 438, 771, 615, 704] },
      { kind: G.RoadMajor, width: 14, path: [-605, -557, -476, -471, -270, -420, -35, -455, 257, -497] },
    ],
    decorate(b) {
      b.ground(G.Sand, BEACH);
      b.ground(G.Wetland, PARK);
      plant(b, PARK, 285, 23);
      const key = blob(-373, 63, 70, 0.2, 18);
      b.ground(G.Wetland, key);
      plant(b, key, 240, 6);
      bridge(b, [77, -66, 77, 29], 14);
      bridge(b, [77, 288, 77, 458], 14);
      for (const offset of [0, 35, 70]) {
        b.line(G.Pier, 7, [-483 + offset, 218 + offset * 0.2, -458 + offset, 131 + offset * 0.12], true);
      }
      b.route("Hibiscus Water Taxi", [-509, 199, -490, 126, -270, 167, -118, 166, -45, 177]);
      for (let p = -265; p < 512; p += 31) b.tree(p, p < 0 ? 786 + p * 0.08 : 813 - p * 0.11);
    },
    sites: [
      { name: "Hibiscus Causeway", at: [77, 367], district: "Hibiscus Isles", type: "bridge" },
      {
        name: "Sunflash Boardwalk",
        at: [57, 836],
        district: "Sunflash Beach",
        type: "street",
        draw(b, [p, q]) {
          b.line(G.Cobble, 9, [p - 350, q - 47, p - 85, q, p + 166, q + 5, p + 427, q - 32]);
        },
      },
      {
        name: "The Coral Hour",
        at: [128, 737],
        district: "Sunflash Beach",
        type: "landmark",
        clear: 44,
        draw(b, [p, q]) {
          const walls = { wall: R.rose, roof: R.roofWhite, glass: R.glassTeal, pattern: Pattern.Ribbon };
          b.ground(G.Plaza, rect(p, q, 33, 29, -0.09));
          b.volume(rect(p, q, 31, 14, -0.09), 21, 0, walls);
          b.volume(rect(p, q + 3, 25, 12, -0.09), 26, 21, { ...walls, wall: R.libertyGreen });
          b.volume(rect(p + 8, q + 8, 14, 9, -0.09), 34, 26, { ...walls, wall: R.ipePink });
          b.ground(G.Pool, disc(p, q - 22, 8, 12));
        },
      },
      {
        name: "Needle Key Airfield",
        at: [643, -580],
        district: "Mirage Quay",
        type: "place",
        clear: 110,
        draw(b, [p, q]) {
          b.ground(G.Apron, rect(p + 13, q + 26, 163, 56, 0.54));
          b.line(G.Runway, 26, [p - 158, q - 95, p + 163, q + 98]);
          b.line(G.Taxiway, 9, [p - 95, q - 19, p + 66, q + 78, p + 98, q + 58]);
          b.volume(rect(p + 18, q + 68, 29, 13, 0.54), 11, 0, {
            wall: R.cream,
            roof: R.roofWhite,
            pattern: Pattern.Ribbon,
          });
        },
      },
      { name: "Lemon Marina Slips", at: [-463, 236], district: "Lemon Marina", type: "place" },
      { name: "Spindrift Key", at: [-373, 63], district: "Lemon Marina", type: "park" },
    ],
  },
);
