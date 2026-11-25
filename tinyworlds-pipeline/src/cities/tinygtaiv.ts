import { R } from "../render/palette.js";
import { G, Pattern, Roof } from "../scene/kinds.js";
import { blob, disc, plant, rect } from "../scene/medieval.js";
import { bridge, greenbelt, metroCity } from "./metro.js";

const PARK = blob(463, -596, 146, 0.13, 31);

export const tinygtaiv = metroCity(
  {
    id: "tinygtaiv",
    title: "GTA IV",
    inspiration: "Grand Theft Auto IV",
    accent: "#9cc8ee",
    flora: "temperate",
    colors: {
      water: "#446776",
      waterShallow: "#637f87",
      foam: "#bac6cb",
      park: "#8b995f",
      lawn: "#a1aa71",
      forest: "#65744d",
      asphalt: "#716f70",
      pavement: "#b9b1a2",
      roofTar: "#565458",
      roofGravel: "#a39c8c",
      brickRed: "#a5604e",
      brownstone: "#846b5b",
      glassBlue: "#8799a1",
      steel: "#90999c",
    },
    start: { p: -45, q: 25, scale: 0.31 },
    card: { p: -27, q: -60, shrink: 5 },
  },
  {
    frame: [1050, 1130],
    land: [
      [
        -990, -1040, 756, -1030, 979, -815, 889, -435, 696, -318, 305, -164, -67, -85, -240, -30, -438, -55,
        -587, -170, -826, -263, -985, -462,
      ],
      [
        -823, 54, -543, 143, -275, 183, -7, 225, 271, 109, 527, 109, 740, 218, 960, 508, 959, 1031, -813,
        1059, -1009, 558, -959, 260,
      ],
      blob(263, -27, 76, 0.12, 77),
    ],
    districts: [
      {
        name: "Granite Ward",
        center: [8, -535],
        blocks: [7, 6],
        block: [93, 86],
        style: "masonry",
        angle: 0.15,
      },
      {
        name: "Chapel Row",
        center: [565, -553],
        blocks: [5, 5],
        block: [75, 82],
        style: "rowhouse",
        angle: 0.2,
      },
      {
        name: "Bramble Terminal",
        center: [-660, -458],
        blocks: [4, 5],
        block: [85, 92],
        style: "warehouse",
        angle: -0.3,
      },
      {
        name: "Alder Heights",
        center: [-190, 557],
        blocks: [9, 7],
        block: [72, 67],
        style: "rowhouse",
        angle: -0.16,
      },
      {
        name: "Saltwick",
        center: [509, 592],
        blocks: [7, 6],
        block: [80, 81],
        style: "rowhouse",
        angle: 0.2,
      },
      {
        name: "Tin Basin",
        center: [-628, 552],
        blocks: [4, 6],
        block: [83, 83],
        style: "warehouse",
        angle: -0.16,
      },
      {
        name: "Lantern Row",
        center: [28, 888],
        blocks: [7, 3],
        block: [71, 64],
        style: "rowhouse",
        angle: -0.12,
      },
      {
        name: "Copper Hill",
        center: [-362, -689],
        blocks: [3, 4],
        block: [70, 76],
        style: "brick",
        angle: 0.15,
      },
    ],
    roads: [
      {
        kind: G.RoadMajor,
        width: 18,
        path: [-731, -581, -520, -423, -305, -274, -61, -166, -61, 295, -41, 441, 280, 598, 642, 685],
      },
      { kind: G.RoadMajor, width: 15, path: [721, -678, 355, -557, 203, -309, 214, 196, 451, 428, 685, 477] },
      { kind: G.Rail, width: 5, path: [-956, 602, -675, 584, -307, 728, 75, 674, 444, 859, 793, 868] },
    ],
    decorate(b) {
      b.ground(G.Park, PARK);
      plant(b, PARK, 375, 32);
      b.ground(G.Lake, blob(496, -570, 34, 0.2, 5));
      greenbelt(b, blob(799, -807, 117, 0.26, 6), 82);
      greenbelt(b, blob(-633, 867, 104, 0.21, 32), 86);
      bridge(b, [-61, -92, -61, 242], 18);
      bridge(b, [210, -166, 214, 167], 15);
      b.route("Granite River Ferry", [-523, -122, -499, -38, -308, 61, -95, 105, 84, 70, 178, -58]);
    },
    sites: [
      { name: "Granite Avenue Bridge", at: [-61, 74], district: "Granite Ward", type: "bridge" },
      { name: "Alder Span", at: [210, 10], district: "Alder Heights", type: "bridge" },
      { name: "Chapel Park", at: [463, -596], district: "Chapel Row", type: "park", clear: 146 },
      {
        name: "The Needle Press",
        at: [72, -523],
        district: "Granite Ward",
        type: "landmark",
        clear: 57,
        draw(b, [p, q]) {
          const tower = { wall: R.steel, roof: R.roofSilver, glass: R.glassDark, pattern: Pattern.Curtain };
          b.ground(G.Plaza, rect(p, q, 41, 37, 0.15));
          b.volume(rect(p, q, 31, 28, 0.15), 30, 0, tower);
          b.volume(rect(p - 5, q - 5, 21, 15, 0.15), 154, 30, tower);
          b.volume(rect(p - 8, q - 7, 14, 11, 0.15), 181, 154, {
            ...tower,
            roofShape: Roof.Pyramid,
            roofH: 19,
          });
        },
      },
      {
        name: "Alder Battery",
        at: [263, -27],
        district: "Alder Heights",
        type: "park",
        draw(b, [p, q]) {
          b.ground(G.Lawn, disc(p, q, 43, 18));
          b.ground(G.Cobble, disc(p, q, 19, 8));
          b.prism(p, q, 12, 8, 8, 0, { wall: R.darkStone, roof: R.greyStone });
          b.prism(p, q, 3, 6, 28, 8, { wall: R.roofCopper, roof: R.roofCopper });
          for (const [dp, dq] of [
            [-24, -21],
            [-28, 19],
            [24, -20],
            [26, 19],
          ])
            b.tree(p + dp, q + dq);
        },
      },
      {
        name: "Saltwick Station",
        at: [444, 859],
        district: "Saltwick",
        type: "station",
        clear: 36,
        draw(b, [p, q]) {
          b.volume(rect(p, q - 14, 28, 11, 0.2), 13, 0, {
            wall: R.brickRed,
            roof: R.roofGreen,
            pattern: Pattern.Tall,
          });
          b.line(G.Pier, 8, [p - 31, q - 6, p + 33, q + 11]);
        },
      },
    ],
  },
);
