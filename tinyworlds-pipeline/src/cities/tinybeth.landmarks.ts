import { makeGeo, makeProjection } from "../projection.js";
import type { Statue, StatuePiece } from "./types.js";

export const STEELSTACKS = { lon: -75.3675054, lat: 40.6152381 };

/** The round belfry centered on the sanctuary's roof ridge. */
export const MORAVIAN_BELFRY: Statue = {
  lon: -75.3816363,
  lat: 40.6190393,
  base: 18,
  pieces: [
    { dp: 0, dq: 0, from: 0, to: 7, r: 3.1, ramp: "white" },
    { dp: 0, dq: 0, from: 7, to: 8.6, r: 3.3, ramp: "gold" },
    { dp: 0, dq: 0, from: 8.6, to: 10, r: 2.7, ramp: "gold" },
    { dp: 0, dq: 0, from: 10, to: 11.2, r: 1.65, ramp: "gold" },
    { dp: 0, dq: 0, from: 11.2, to: 12.5, r: 0.28, ramp: "gold" },
  ],
};

/**
 * The five preserved blast furnaces, west to east. Furnace A is anchored at the HAER coordinate.
 * Aerial imagery locates the rest. The furnaces, hot-blast stoves and charging frames are
 * simplified forms based on the visible complex. The two tallest frames rise over 230 ft.
 * https://loc.gov/pictures/item/pa3390/
 * https://www.artsquest.org/where-we-are/steelstacks/
 */
const FURNACES = [
  { lon: -75.36884, lat: 40.615124, height: 43, radius: 5.5 },
  { lon: -75.36818, lat: 40.61518, height: 55, radius: 7 },
  { lon: -75.36732, lat: 40.6152, height: 71, radius: 8 },
  { lon: -75.36646, lat: 40.61524, height: 71, radius: 8 },
  { lon: -75.36558, lat: 40.61529, height: 49, radius: 6 },
];

export function steelStacks(gridDeg: number): Statue {
  const { lon, lat } = STEELSTACKS;
  const projection = makeProjection(makeGeo(lon, lat, gridDeg, 2));
  const pieces: StatuePiece[] = [];

  for (const furnace of FURNACES) {
    const [dp, dq] = projection.toGrid(furnace.lon, furnace.lat);
    const { height, radius } = furnace;
    const shoulder = height * 0.58;
    pieces.push(
      { dp, dq, from: 0, to: 5, hp: radius + 2, hq: radius + 2, ramp: "gold" },
      { dp, dq, from: 5, to: shoulder * 0.5, r: radius * 0.82, ramp: "body" },
      { dp, dq, from: shoulder * 0.5, to: shoulder, r: radius, ramp: "body" },
      { dp, dq, from: shoulder, to: shoulder + 5, r: radius * 0.65, ramp: "body" },
      { dp, dq, from: shoulder + 5, to: height - 3, r: radius * 0.4, ramp: "gold" },
      { dp, dq, from: height - 3, to: height, hp: radius * 0.8, hq: radius + 1, ramp: "gold" },
    );

    // Charging frame and its two service levels.
    const frame = radius + 1;
    for (const north of [-frame, frame]) {
      for (const east of [-frame, frame]) {
        pieces.push({ dp: dp + north, dq: dq + east, from: 0, to: height, hp: 0.65, hq: 0.65, ramp: "gold" });
      }
    }
    for (const level of [shoulder, height - 11]) {
      pieces.push({ dp, dq, from: level, to: level + 1.25, hp: frame + 0.5, hq: frame + 0.5, ramp: "gold" });
    }

    // Hot-blast stoves on the rail side of the furnace.
    for (const east of [-radius * 1.5, 0, radius * 1.5]) {
      const stove = height * 0.46;
      pieces.push(
        { dp: dp + 20, dq: dq + east, from: 0, to: stove, r: radius * 0.67, ramp: "body" },
        { dp: dp + 20, dq: dq + east, from: stove, to: stove + 2, r: radius * 0.5, ramp: "gold" },
      );
    }
    pieces.push({
      dp: dp + 12,
      dq,
      from: shoulder - 5,
      to: shoulder - 2,
      hp: 12,
      hq: 1.4,
      ramp: "body",
    });
  }

  return { lon, lat, base: 0, pieces };
}
