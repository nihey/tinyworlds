import { hash2 } from "../scene/hash.js";
import { G, isWater, PAINT_RANK, WAY_RANK } from "../scene/kinds.js";
import { idx, R, S_DEEP, S_HALF, S_HIGH, S_LIT, S_SHADE } from "./palette.js";

/**
 * Ground kind → colour. Every surface gets a texture made from the pixel's own position, so it is
 * the same no matter which tile it is drawn in: diagonal joints and stripes follow the street
 * grid (x ± 2y), speckles come from a hash.
 */
export interface GroundContext {
  gk: Uint8Array;
  /** Distance from water pixels to the nearest dry one, fifths of a px. */
  wd: Uint8Array;
  GW: number;
}

const NATURAL_BANK = new Set<number>([
  G.Park,
  G.Forest,
  G.Lawn,
  G.Scrub,
  G.Wetland,
  G.Garden,
  G.Cemetery,
  G.Fairway,
  G.GolfGreen,
  G.Rock,
  G.Snow,
  G.Meadow,
  G.RedRock,
]);

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

function water(ctx: GroundContext, kind: number, x: number, y: number, gi: number): number {
  const { gk, wd, GW } = ctx;
  // what stands directly above decides the bank: sand runs into foam, a park has a muddy edge,
  // the city has a quay wall three pixels high
  const up1 = gk[gi - GW];
  if (!isWater(up1)) {
    if (up1 === G.Sand) return idx(R.foam, S_HIGH);
    if (NATURAL_BANK.has(up1)) return idx(R.dirt, S_SHADE);
    if (up1 === G.Pier) return idx(R.pier, S_DEEP);
    return idx(R.pavement, S_SHADE);
  }
  const up2 = gk[gi - GW * 2];
  if (!isWater(up2)) {
    if (up2 === G.Sand) return idx(R.foam, S_LIT);
    if (up2 === G.Pier) return idx(R.pier, S_DEEP);
    if (!NATURAL_BANK.has(up2)) return idx(R.pavement, S_SHADE);
  } else {
    const up3 = gk[gi - GW * 3];
    if (!isWater(up3) && up3 !== G.Sand && up3 !== G.Pier && !NATURAL_BANK.has(up3))
      return idx(R.pavement, S_DEEP);
  }

  const d = wd[gi];
  if (kind === G.Lake) {
    if (d < 8) return idx(R.waterShallow, S_HIGH);
    const r = hash2(x >> 2, y >> 1);
    if ((r & 31) === 0 && (x & 3) < 2) return idx(R.waterShallow, S_HIGH);
    return idx(R.waterShallow, S_LIT);
  }
  if (d < 9) return ((x + y) & 1) === 0 ? idx(R.foam, S_LIT) : idx(R.waterShallow, S_HIGH);
  if (d < 40) return idx(R.waterShallow, S_LIT);
  if (d < 75) {
    // shallows give way to deep water through a dither
    const level = ((d - 40) * 16) / 35;
    if (BAYER4[(y & 3) * 4 + (x & 3)] >= level) return idx(R.waterShallow, S_LIT);
  }
  // open water: short bright and dark dashes, staggered row to row
  const r = hash2(x >> 3, y >> 2);
  if ((y & 3) === (r & 3)) {
    const start = (r >>> 2) & 3;
    const xi = x & 7;
    if (xi >= start && xi < start + 3) {
      const roll = (r >>> 5) & 15;
      if (roll < 3) return idx(R.water, S_HIGH);
      if (roll === 3) return idx(R.water, S_HALF);
    }
  }
  return idx(R.water, S_LIT);
}

/** True when a neighbour `step` pixels away, in any of the four directions, is another kind. */
function atEdge(ctx: GroundContext, kind: number, gi: number, step: number): boolean {
  const { gk, GW } = ctx;
  return (
    gk[gi - step] !== kind ||
    gk[gi + step] !== kind ||
    gk[gi - GW * step] !== kind ||
    gk[gi + GW * step] !== kind
  );
}

export function groundColor(ctx: GroundContext, kind: number, x: number, y: number, gi: number): number {
  const h = hash2(x, y);
  const a = x + 2 * y; // constant along streets
  const b = x - 2 * y; // constant along avenues
  switch (kind) {
    case G.Water:
    case G.Lake:
      return water(ctx, kind, x, y, gi);

    case G.Park: {
      if ((h & 31) === 0) return idx(R.park, S_HALF);
      // drifts of lighter grass, a few px across
      const patch = hash2(x >> 4, y >> 3);
      if ((patch & 7) < 2 && ((h >>> 5) & 3) !== 0) return idx(R.lawn, S_LIT);
      return idx(R.park, S_LIT);
    }
    case G.Forest:
      if ((h & 7) === 0) return idx(R.forest, S_HALF);
      if ((h & 63) === 1) return idx(R.forest, S_SHADE);
      return idx(R.forest, S_LIT);
    case G.Lawn:
      return (h & 31) === 0 ? idx(R.lawn, S_HIGH) : idx(R.lawn, S_LIT);
    case G.Garden:
      if ((h & 15) === 0) return idx((h >>> 4) & 1 ? R.rose : R.marking, S_HIGH);
      return idx(R.lawn, S_LIT);
    case G.Scrub:
      if ((h & 7) === 0) return idx(R.scrub, S_HALF);
      if ((h & 31) === 1) return idx(R.sand, S_HALF);
      return idx(R.scrub, S_LIT);
    case G.Wetland:
      if ((hash2(x >> 1, y) & 7) === 0) return idx(R.waterShallow, S_HALF);
      if ((h & 15) === 1) return idx(R.sand, S_HALF);
      return idx(R.wetland, S_LIT);
    case G.Sand:
    case G.Bunker:
      if ((h & 15) === 0) return idx(R.sand, S_HIGH);
      if ((h & 31) === 1) return idx(R.sand, S_HALF);
      return idx(R.sand, S_LIT);
    case G.Rock:
      if ((h & 7) === 0) return idx(R.rock, S_HALF);
      if ((h & 31) === 1) return idx(R.rock, S_HIGH);
      return idx(R.rock, S_LIT);
    case G.RedRock:
      if ((h & 7) === 0) return idx(R.redStone, S_HALF);
      if ((h & 31) === 1) return idx(R.redStone, S_HIGH);
      return idx(R.redStone, S_LIT);
    case G.Cemetery:
      // headstones in rows along the street grid
      if ((a & 7) === 0 && (b & 15) === 0) return idx(R.greyStone, S_HIGH);
      return (h & 31) === 0 ? idx(R.park, S_HALF) : idx(R.park, S_LIT);

    case G.Crop: {
      // a quilt of fields along the map's two diagonals, parted by earth tracks; each field is
      // tall cane, young cane or cut stubble, in rows
      // fields come in two sizes: a block of four is one big field or four small ones
      const block = hash2((a >> 9) * 5 + 1, (b >> 9) * 11 + 7);
      const fine = (block & 3) === 0 ? 255 : 511;
      if ((a & fine) < 2 || (b & fine) < 2) return idx(R.terraRoxa, (h & 7) === 0 ? S_HALF : S_LIT);
      const field = fine === 511 ? block >>> 2 : hash2((a >> 8) * 7 + 3, (b >> 8) * 13 + 5);
      const rows = (field & 1) === 0 ? a : b;
      const stage = (field >>> 1) % 9;
      if (stage === 0) {
        // harvested: straw over red earth
        if ((rows & 3) === 0) return idx(R.terraRoxa, S_LIT);
        return (h & 15) === 0 ? idx(R.straw, S_HALF) : idx(R.straw, S_LIT);
      }
      if (stage <= 2) {
        if ((rows & 3) === 0) return idx(R.terraRoxa, S_HIGH);
        return (h & 31) === 0 ? idx(R.cane, S_LIT) : idx(R.caneYoung, S_LIT);
      }
      if ((rows & 3) === 0) return idx(R.cane, S_HALF);
      return (h & 15) === 0 ? idx(R.caneYoung, S_LIT) : idx(R.cane, S_LIT);
    }
    case G.Meadow: {
      // open grass country: a park's green without the park, in broad drifts of paler grass
      if ((h & 63) === 0) return idx(R.park, S_HALF);
      const drift = hash2(x >> 5, y >> 4);
      if ((drift & 7) < 3 && ((h >>> 5) & 3) !== 0) return idx(R.lawn, S_LIT);
      return idx(R.park, S_LIT);
    }
    case G.Snow: {
      // fresh snow: white, a glint here and there, and thin blue streaks where the wind has combed it
      if ((h & 127) === 0) return idx(R.snow, S_HIGH);
      const streak = hash2(x >> 4, y);
      if ((streak & 31) === 0 && ((x >> 4) + y) % 3 === 0) return idx(R.snow, S_HALF);
      return (h & 255) === 1 ? idx(R.snow, S_HALF) : idx(R.snow, S_LIT);
    }
    case G.Cobble:
      // setts in a small diamond bond, the odd one worn pale
      if ((a & 3) === 0 || (b & 3) === 0) return idx(R.cobble, S_HALF);
      return (h & 15) === 0 ? idx(R.cobble, S_HIGH) : idx(R.cobble, S_LIT);
    case G.DirtRoad:
      // packed earth with ruts and stones
      if ((h & 7) === 0) return idx(R.dirtRoad, S_HALF);
      return (h & 63) === 1 ? idx(R.dirtRoad, S_HIGH) : idx(R.dirtRoad, S_LIT);
    case G.Steppe: {
      // dry grassland: straw dotted with dark tussocks, paler where the wind has combed it
      if ((h & 15) === 0) return idx(R.steppeDark, S_LIT);
      if ((h & 63) === 1) return idx(R.steppeDark, S_HALF);
      const patch = hash2(x >> 5, y >> 4);
      if ((patch & 7) === 0 && ((h >>> 6) & 3) === 0) return idx(R.steppe, S_HIGH);
      return idx(R.steppe, S_LIT);
    }
    case G.Earth:
      if ((h & 7) === 0) return idx(R.terraRoxa, S_HALF);
      if ((h & 31) === 1) return idx(R.terraRoxa, S_HIGH);
      return idx(R.terraRoxa, S_LIT);

    case G.Fairway:
      return ((a >> 3) & 1) === 0 ? idx(R.lawn, S_HIGH) : idx(R.lawn, S_LIT);
    case G.GolfGreen:
      return idx(R.lawn, S_HIGH);
    case G.Pitch:
      if (atEdge(ctx, kind, gi, 1)) return idx(R.markingWhite, S_LIT);
      return ((a >> 3) & 1) === 0 ? idx(R.lawn, S_LIT) : idx(R.park, S_LIT);
    case G.Diamond:
      // a ring of infield dirt around the grass
      if (atEdge(ctx, kind, gi, 3)) return idx(R.dirt, S_LIT);
      return ((a >> 3) & 1) === 0 ? idx(R.lawn, S_LIT) : idx(R.park, S_LIT);
    case G.Court:
      return atEdge(ctx, kind, gi, 1) ? idx(R.markingWhite, S_LIT) : idx(R.court, S_LIT);
    case G.CourtGreen:
      return atEdge(ctx, kind, gi, 1) ? idx(R.markingWhite, S_LIT) : idx(R.courtGreen, S_LIT);
    case G.Track:
      return atEdge(ctx, kind, gi, 1) ? idx(R.markingWhite, S_LIT) : idx(R.track, S_LIT);
    case G.Playground:
      if ((h & 31) === 0) return idx((h >>> 5) & 1 ? R.carRed : R.carBlue, S_LIT);
      return idx(R.dirt, S_HIGH);

    case G.Plaza:
      return (a & 7) === 0 || (b & 7) === 0 ? idx(R.plaza, S_HALF) : idx(R.plaza, S_LIT);
    case G.Parking:
      // painted bays
      if ((a & 7) === 0 && ((b >> 3) & 3) !== 0) return idx(R.markingWhite, S_HALF);
      return idx(R.asphaltLight, S_LIT);
    case G.Industrial:
      return (h & 31) === 0 ? idx(R.concrete, S_HALF) : idx(R.concrete, S_LIT);
    case G.Railyard:
      return (h & 7) === 0 ? idx(R.gravel, S_HALF) : idx(R.gravel, S_LIT);
    case G.Construction:
      if ((h & 15) === 0) return idx(R.dirt, S_HALF);
      return (h & 63) === 1 ? idx(R.dirt, S_HIGH) : idx(R.dirt, S_LIT);
    case G.Apron:
      return (a & 15) === 0 || (b & 15) === 0 ? idx(R.concrete, S_LIT) : idx(R.concrete, S_HIGH);
    case G.Pier:
      return (b & 3) === 0 ? idx(R.pier, S_HALF) : idx(R.pier, S_LIT);
    case G.Pool:
      return atEdge(ctx, kind, gi, 1) ? idx(R.foam, S_HIGH) : idx(R.pool, S_LIT);

    case G.Path:
      return idx(R.plaza, S_HIGH);
    case G.Rail:
      // ballast with sleepers
      return ((x + y) & 3) === 0 ? idx(R.darkStone, S_SHADE) : idx(R.gravel, S_HALF);
    case G.Service:
      return idx(R.asphaltLight, S_LIT);
    case G.Road:
    case G.RoadMajor:
      // a shadow line under the far kerb
      return PAINT_RANK[ctx.gk[gi - ctx.GW]] < WAY_RANK ? idx(R.asphalt, S_HALF) : idx(R.asphalt, S_LIT);
    case G.Highway:
      return atEdge(ctx, kind, gi, 1) ? idx(R.markingWhite, S_HALF) : idx(R.asphaltDark, S_LIT);
    case G.Runway:
      return atEdge(ctx, kind, gi, 2) ? idx(R.markingWhite, S_LIT) : idx(R.asphaltDark, S_HALF);
    case G.Taxiway:
      return idx(R.asphalt, S_HALF);

    default:
      // pavement: the city's default floor
      return (h & 63) === 0 ? idx(R.pavement, S_HALF) : idx(R.pavement, S_LIT);
  }
}
