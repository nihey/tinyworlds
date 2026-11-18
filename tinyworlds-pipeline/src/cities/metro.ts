import { R } from "../render/palette.js";
import { hashString, mix, pick, rand } from "../scene/hash.js";
import { F_FLOATING, G, Pattern, Roof } from "../scene/kinds.js";
import { disc, insideRing, Occupancy, plant, pointAlong, pathLength, rect } from "../scene/medieval.js";
import type { Look, SyntheticBuilder, SyntheticPlace } from "../scene/synthetic.js";
import { roughen } from "../scene/worldkit.js";
import { generatedCity, type GeneratedCity } from "./generated.js";

type Point = [p: number, q: number];
type BuildingStyle = "brick" | "highrise" | "warehouse" | "deco" | "bungalow" | "resort";

interface Buildings {
  walls: number[];
  roofs: number[];
  glass?: number;
  height: [min: number, max: number];
  pattern: Pattern;
  lots: [columns: number, rows: number];
}

const BUILDINGS: Record<BuildingStyle, Buildings> = {
  brick: {
    walls: [R.brickRed, R.brownstone, R.brickDark, R.yellowBrick, R.cream],
    roofs: [R.roofTar, R.roofGravel, R.roofBrown],
    height: [9, 39],
    pattern: Pattern.Punched,
    lots: [2, 3],
  },
  highrise: {
    walls: [R.steel, R.glassDark, R.glassBlue, R.glassTeal, R.limestone, R.glassSilver],
    roofs: [R.roofSilver, R.roofTar, R.roofWhite],
    height: [24, 115],
    pattern: Pattern.Curtain,
    lots: [2, 2],
  },
  warehouse: {
    walls: [R.steel, R.greyStone, R.brickDark, R.darkStone],
    roofs: [R.roofTar, R.roofSilver, R.roofGravel],
    height: [7, 17],
    pattern: Pattern.Sparse,
    lots: [1, 2],
  },
  deco: {
    walls: [R.rose, R.whiteBrick, R.libertyGreen, R.sidingBlue, R.salmon, R.ipePink],
    roofs: [R.roofWhite, R.roofCopper, R.ipePink],
    glass: R.glassTeal,
    height: [9, 26],
    pattern: Pattern.Ribbon,
    lots: [2, 2],
  },
  bungalow: {
    walls: [R.cream, R.sidingSage, R.sidingBlue, R.rose, R.tan, R.whiteBrick],
    roofs: [R.roofClay, R.roofTerracotta, R.roofSlate, R.roofBrown],
    height: [4, 10],
    pattern: Pattern.House,
    lots: [3, 3],
  },
  resort: {
    walls: [R.ochre, R.cream, R.glassBronze, R.rose, R.whiteBrick, R.glassTeal],
    roofs: [R.roofWhite, R.roofTerracotta, R.roofSilver],
    height: [14, 65],
    pattern: Pattern.Ribbon,
    lots: [1, 2],
  },
};

interface District {
  name: string;
  center: Point;
  blocks: [columns: number, rows: number];
  block: [length: number, width: number];
  style: BuildingStyle;
  angle?: number;
  greens?: number;
}

interface Way {
  path: number[];
  width: number;
  kind: G;
}

interface Site {
  name: string;
  at: Point;
  district: string;
  type: SyntheticPlace["t"];
  clear?: number;
  draw?: (builder: SyntheticBuilder, point: Point) => void;
}

interface MetroLayout {
  frame: Point;
  land: number[][];
  districts: District[];
  roads: Way[];
  sites: Site[];
  decorate?: (builder: SyntheticBuilder) => void;
}

/** A road grid with its lots inset from the carriageway, in the district's local coordinates. */
function districtGrid(district: District) {
  const {
    center: [p, q],
    blocks: [columns, rows],
    block: [length, width],
    angle = 0,
  } = district;
  const halfU = (columns * length) / 2;
  const halfV = (rows * width) / 2;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const at = (u: number, v: number): Point => [p + u * cos - v * sin, q + u * sin + v * cos];
  return { halfU, halfV, at };
}

function drawDistrictRoads(b: SyntheticBuilder, district: District, pave: (way: Way) => void): void {
  const {
    center: [p, q],
    blocks: [columns, rows],
    block: [length, width],
    style,
    angle,
  } = district;
  const { halfU, halfV, at } = districtGrid(district);
  const ring = rect(p, q, halfU, halfV, angle);
  b.ground(style === "warehouse" ? G.Industrial : G.Residential, ring);
  for (let i = 0; i <= columns; i++) {
    const u = i * length - halfU;
    pave({ path: [...at(u, -halfV), ...at(u, halfV)], width: 8, kind: G.Road });
  }
  for (let j = 0; j <= rows; j++) {
    const v = j * width - halfV;
    const avenue = j === Math.floor(rows / 2);
    pave({
      path: [...at(-halfU, v), ...at(halfU, v)],
      width: avenue ? 13 : 8,
      kind: avenue ? G.RoadMajor : G.Road,
    });
  }
}

function drawLots(b: SyntheticBuilder, district: District, occ: Occupancy, land: number[][]): void {
  const {
    blocks: [columns, rows],
    block: [length, width],
    angle,
    style,
    greens = 0.1,
  } = district;
  const { halfU, halfV, at } = districtGrid(district);
  const palette = BUILDINGS[style];
  const [lotsU, lotsV] = palette.lots;
  const lotU = (length - 18) / lotsU;
  const lotV = (width - 18) / lotsV;
  const districtSeed = hashString(district.name);
  const onLand = (p: number, q: number): boolean => land.some((ring) => insideRing(ring, p, q));
  const fits = (ring: number[]): boolean => {
    for (let i = 0; i < ring.length; i += 2) if (!onLand(ring[i], ring[i + 1])) return false;
    return occ.isFree(ring);
  };

  for (let i = 0; i < columns; i++) {
    for (let j = 0; j < rows; j++) {
      const seed = mix(districtSeed, i * rows + j);
      const u = i * length - halfU + 9;
      const v = j * width - halfV + 9;
      const green = rect(
        ...at(u + (lotU * lotsU) / 2, v + (lotV * lotsV) / 2),
        length / 2 - 10,
        width / 2 - 10,
        angle,
      );
      if (rand(seed, 1) < greens && fits(green)) {
        b.ground(style === "warehouse" ? G.Parking : G.Lawn, green);
        if (style !== "warehouse") {
          b.line(G.Path, 2, [...at(u, v + width / 2 - 9), ...at(u + length - 18, v + width / 2 - 9)]);
          for (const offset of [0.2, 0.5, 0.8]) {
            b.tree(...at(u + offset * (length - 18), v + (width - 18) * 0.22));
            b.tree(...at(u + offset * (length - 18), v + (width - 18) * 0.78));
          }
        }
        continue;
      }

      for (let a = 0; a < lotsU; a++) {
        for (let c = 0; c < lotsV; c++) {
          const lot = mix(seed, 10 + a * lotsV + c);
          const [p, q] = at(u + (a + 0.5) * lotU, v + (c + 0.5) * lotV);
          const footprint = rect(
            p,
            q,
            lotU * (0.31 + rand(lot, 2) * 0.16),
            lotV * (0.31 + rand(lot, 3) * 0.16),
            angle,
          );
          if (!fits(footprint)) continue;
          if (rand(lot, 4) < 0.07) {
            if (style !== "warehouse") b.tree(p, q);
            continue;
          }
          const [low, high] = palette.height;
          const height = low + (high - low) * rand(lot, 5) ** 1.7;
          const look: Look = {
            wall: pick(palette.walls, lot, 6),
            roof: pick(palette.roofs, lot, 7),
            glass: palette.glass,
            pattern: palette.pattern,
          };
          if (style === "bungalow") {
            look.roofShape = Roof.Pitched;
            look.roofH = 2;
          }
          b.volume(footprint, height, 0, look);
          occ.blockRing(footprint);
          if (height > 40 && rand(lot, 8) < 0.7)
            b.volume(
              rect(p, q, lotU * 0.24, lotV * 0.23, angle),
              height + 5 + rand(lot, 9) * 15,
              height,
              look,
            );
        }
      }
    }
  }
}

export function metroCity(
  spec: Omit<GeneratedCity, "generate" | "fog" | "attribution" | "framed"> & { inspiration: string },
  layout: MetroLayout,
) {
  const { inspiration, ...city } = spec;
  return generatedCity({
    ...city,
    framed: true,
    fog: { start: 50, end: 240 },
    attribution: [
      "Unofficial fan-made map with an original layout",
      `Inspired by ${inspiration} by Rockstar Games`,
    ],
    generate(b) {
      const [halfP, halfQ] = layout.frame;
      const occ = new Occupancy(-halfP, -halfQ, halfP, halfQ, 2);
      const halfFrame = (halfP + halfQ) * 0.69;
      b.limits(rect(0, 0, halfFrame, halfFrame, Math.PI / 4));
      const seed = hashString(city.id);
      const land = layout.land.map((ring, i) => roughen(ring, mix(seed, i), { amount: 0.065, minLen: 47 }));
      for (const ring of land) {
        b.ground(G.Land, ring);
        b.ground(G.Meadow, ring);
      }
      for (const site of layout.sites) {
        if (site.clear) occ.blockRing(disc(...site.at, site.clear, 12));
      }
      const pave = ({ kind, width, path }: Way): void => {
        b.line(kind, width, path);
        occ.blockPath(path, width + 3);
      };
      for (const road of layout.roads) pave(road);
      for (const district of layout.districts) drawDistrictRoads(b, district, pave);
      for (const district of layout.districts) {
        drawLots(b, district, occ, land);
        const { halfU, halfV } = districtGrid(district);
        b.hood(district.name, city.title, rect(...district.center, halfU, halfV, district.angle));
      }
      layout.decorate?.(b);
      for (const site of layout.sites) {
        site.draw?.(b, site.at);
        b.place({
          n: site.name,
          t: site.type,
          p: site.at[0],
          q: site.at[1],
          b: site.district,
          r: 80,
          s: 1.15,
        });
      }
    },
  });
}

/** Draw an irregular patch of woodland or scrub in the open ground. */
export function greenbelt(b: SyntheticBuilder, ring: number[], seed: number, kind = G.Forest): void {
  b.ground(kind, ring);
  plant(b, ring, kind === G.Forest ? 280 : 1100, seed);
}

export function bridge(b: SyntheticBuilder, path: [number, number, number, number], width: number): void {
  const length = pathLength(path);
  const middle = pointAlong(path, length / 2);
  const angle = Math.atan2(middle.dq, middle.dp);
  const deck = rect(middle.p, middle.q, length / 2, width / 2, angle);
  b.volume(deck, 8, 6, { wall: R.steel, roof: R.asphalt, roofShape: Roof.Deck, flags: F_FLOATING });
  for (let distance = 28; distance < length - 12; distance += 42) {
    const { p, q } = pointAlong(path, distance);
    b.volume(rect(p, q, 2.1, width * 0.4, angle), 6, 0, { wall: R.concrete, roof: R.concrete });
  }
  for (const fraction of [0.29, 0.71]) {
    const { p, q, dp, dq } = pointAlong(path, length * fraction);
    for (const side of [-1, 1]) {
      b.volume(rect(p - dq * side * width * 0.44, q + dp * side * width * 0.44, 2, 2), 23, 0, {
        wall: R.steel,
        roof: R.steel,
      });
    }
    b.volume(rect(p, q, 2, width * 0.5, angle), 22, 20, { wall: R.steel, roof: R.steel, flags: F_FLOATING });
  }
}
