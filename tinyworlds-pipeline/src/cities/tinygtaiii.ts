import { R } from "../render/palette.js";
import { G, Pattern, Roof } from "../scene/kinds.js";
import { blob, disc, rect } from "../scene/medieval.js";
import { bridge, greenbelt, metroCity } from "./metro.js";

export const tinygtaiii = metroCity(
  {
    id: "tinygtaiii",
    title: "GTA III",
    inspiration: "Grand Theft Auto III",
    accent: "#abd681",
    flora: "temperate",
    colors: {
      water: "#405768",
      waterShallow: "#596e70",
      foam: "#b1bdba",
      pavement: "#b2aba1",
      asphalt: "#6d7176",
      asphaltDark: "#55595e",
      park: "#768360",
      lawn: "#899570",
      forest: "#58674f",
      brickRed: "#9e6152",
      roofTar: "#4d5157",
      steel: "#838a90",
      glassBlue: "#7894a0",
    },
    start: { p: -35, q: 20, scale: 0.32 },
    card: { p: -130, q: 25, shrink: 6 },
  },
  {
    frame: [970, 1000],
    land: [
      [
        -830, -925, -360, -930, -155, -800, -62, -595, -135, -360, -300, -185, -530, -180, -630, -310, -865,
        -340, -930, -570,
      ],
      [-285, 45, -85, -84, 270, -155, 600, -100, 805, 110, 776, 390, 590, 635, 180, 746, -82, 660, -250, 395],
      [-760, 304, -510, 285, -420, 450, -375, 709, -495, 860, -780, 780, -845, 575],
    ],
    districts: [
      {
        name: "Cinder Docks",
        center: [-565, -532],
        blocks: [4, 5],
        block: [96, 86],
        style: "warehouse",
        greens: 0.14,
      },
      {
        name: "Foundry Row",
        center: [-310, -576],
        blocks: [3, 5],
        block: [58, 70],
        style: "rowhouse",
        angle: -0.12,
      },
      {
        name: "Exchange Hill",
        center: [286, 235],
        blocks: [7, 6],
        block: [94, 80],
        style: "masonry",
        angle: 0.13,
        heightScale: 0.72,
      },
      {
        name: "Harrow Point",
        center: [-95, 337],
        blocks: [3, 5],
        block: [62, 70],
        style: "brick",
        angle: 0.13,
      },
      { name: "Mercury Works", center: [-610, 568], blocks: [3, 4], block: [85, 83], style: "warehouse" },
    ],
    roads: [
      {
        kind: G.RoadMajor,
        width: 14,
        path: [-565, -780, -405, -450, -340, -290, -218, 51, -135, 130, 66, 171],
      },
      {
        kind: G.RoadMajor,
        width: 13,
        path: [-608, 725, -513, 570, -409, 514, -229, 451, -120, 423, 195, 376, 500, 385],
      },
      { kind: G.Rail, width: 6, path: [-811, -719, -689, -610, -655, -246, -520, -231, -415, -260] },
    ],
    decorate(b) {
      bridge(b, [-340, -290, -218, 51], 14);
      bridge(b, [-409, 514, -229, 451], 13);
      for (const q of [-481, -408, -335]) b.line(G.Pier, 13, [-818, q, -910, q - 12], true);
      greenbelt(b, blob(522, 519, 97, 0.22, 33), 61);
      b.ground(G.Industrial, rect(-787, -571, 52, 200));
      for (const q of [-700, -627, -545]) {
        const crane = { wall: R.ochre, roof: R.gold };
        for (const side of [-9, 9]) b.volume(rect(-810, q + side, 2.5, 2.5), 31, 0, crane);
        b.volume(rect(-825, q, 32, 3), 32, 28, crane);
      }
      for (const [i, q] of [-691, -673, -625, -609, -587, -547, -523, -501].entries()) {
        const color = [R.brickRed, R.glassTeal, R.ochre, R.steel][i % 4];
        b.volume(rect(-774, q, 12, 3.5), 7, 0, { wall: color, roof: color });
      }
      b.route("Cinder Harbor Ferry", [-725, -185, -625, -75, -441, 9, -268, 91]);
    },
    sites: [
      { name: "Cinder Viaduct", at: [-280, -120], district: "Cinder Docks", type: "bridge" },
      { name: "Mercury Crossing", at: [-317, 482], district: "Mercury Works", type: "bridge" },
      {
        name: "Cinder Container Terminal",
        at: [-790, -632],
        district: "Cinder Docks",
        type: "place",
        clear: 82,
      },
      {
        name: "Crown Exchange",
        at: [245, 185],
        district: "Exchange Hill",
        type: "landmark",
        clear: 46,
        draw(b, [p, q]) {
          b.ground(G.Plaza, rect(p, q, 36, 30, 0.13));
          const tower = {
            wall: R.limestone,
            roof: R.roofSlate,
            glass: R.glassDark,
            pattern: Pattern.Punched,
          };
          b.volume(rect(p, q, 28, 22, 0.13), 35, 0, tower);
          b.volume(rect(p, q, 19, 15, 0.13), 130, 35, tower);
          b.volume(rect(p, q, 12, 10, 0.13), 157, 130, { ...tower, roofShape: Roof.Pyramid, roofH: 18 });
          b.prism(p, q, 1.5, 6, 174, 154, { wall: R.steel, roof: R.steel });
        },
      },
      {
        name: "Ashwater Power Station",
        at: [-651, 651],
        district: "Mercury Works",
        type: "landmark",
        clear: 65,
        draw(b, [p, q]) {
          b.ground(G.Parking, rect(p, q, 49, 43));
          b.volume(rect(p, q, 42, 24), 23, 0, { wall: R.brickDark, roof: R.roofTar, pattern: Pattern.Tall });
          for (const offset of [-37, -10, 17]) {
            b.prism(p + offset, q - 20, 6, 10, 85, 16, { wall: R.brickRed, roof: R.roofTar });
            b.prism(p + offset, q - 20, 7, 10, 85, 80, { wall: R.cream, roof: R.roofTar });
          }
          for (const offset of [-24, 3, 29])
            b.prism(p + offset, q + 36, 8, 12, 12, 0, {
              wall: R.steel,
              roof: R.roofSilver,
              roofShape: Roof.Dome,
              roofH: 2,
            });
        },
      },
      {
        name: "Harrow Reservoir",
        at: [605, 360],
        district: "Exchange Hill",
        type: "park",
        clear: 80,
        draw(b, [p, q]) {
          b.ground(G.Park, disc(p, q, 76, 20));
          b.ground(G.Lake, disc(p, q, 52, 16));
          for (const [dp, dq] of [
            [-62, 0],
            [58, 12],
            [4, 60],
            [-3, -58],
          ])
            b.tree(p + dp, q + dq);
        },
      },
    ],
  },
);
