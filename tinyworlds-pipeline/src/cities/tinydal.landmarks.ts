import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import type { LandmarkStyle, Statue, StatuePiece } from "./types.js";

const glass = (wall: number, roof: number = R.roofGravel): LandmarkStyle => ({
  wall,
  roof,
  pattern: Pattern.Curtain,
});
const stone = (wall: number, roof: number = R.roofGravel, pattern = Pattern.Punched): LandmarkStyle => ({
  wall,
  roof,
  pattern,
});

/** Buildings everyone knows, in the materials everyone remembers (keyed by name, lower case). */
export const LANDMARKS: Record<string, LandmarkStyle> = {
  // the skyline
  "reunion tower": { wall: R.whiteBrick, roof: R.whiteBrick, pattern: Pattern.None },
  "hyatt regency dallas": glass(R.glassBronze),
  "bank of america plaza": glass(R.glassTeal),
  "fountain place": glass(R.glassGreen, R.glassGreen),
  "renaissance tower": glass(R.glassSilver),
  "magnolia hotel dallas downtown": stone(R.cream),
  "texas school book depository": stone(R.brickRed),
  "dallas county courthouse": stone(R.redStone, R.roofSlate, Pattern.Tall),
  "ebj union station": stone(R.whiteBrick, R.roofGravel, Pattern.Tall),
  "dallas city hall": stone(R.concrete, R.roofGravel, Pattern.Ribbon),
  // the Arts District
  "meyerson symphony center": stone(R.limestone, R.roofSilver, Pattern.None),
  "winspear opera house": { wall: R.carRed, roof: R.roofSilver, pattern: Pattern.None },
  "wyly theatre": { wall: R.roofSilver, roof: R.roofSilver, pattern: Pattern.None },
  "dallas museum of art": stone(R.limestone, R.roofGravel, Pattern.None),
  "nasher sculpture center": stone(R.limestone, R.glassSilver, Pattern.None),
  "perot museum of nature and science": { wall: R.tan, roof: R.roofGravel, pattern: Pattern.None },
  "majestic theatre": stone(R.cream),
  // the arena, Fair Park and the university
  "american airlines center": stone(R.brickRed, R.roofSilver),
  "hall of state": stone(R.limestone, R.roofGravel, Pattern.Tall),
  "dallas hall": stone(R.brickRed, R.roofSlate),
};

/**
 * Reunion Tower's ball: the data draws its upper half as a dome on a drum, from 137 metres up. The
 * lower half is stepped in under it, so it reads as a sphere on its shaft.
 */
export const REUNION_BALL: Statue = {
  lon: -96.808945,
  lat: 32.775358,
  base: 0,
  pieces: [
    { dp: 0, dq: 0, from: 134, to: 137, r: 15.5, ramp: "white" },
    { dp: 0, dq: 0, from: 131, to: 134, r: 13, ramp: "white" },
    { dp: 0, dq: 0, from: 128.5, to: 131, r: 9.5, ramp: "white" },
    { dp: 0, dq: 0, from: 127, to: 128.5, r: 5, ramp: "white" },
  ],
};

/** Which way the Margaret Hunt Hill Bridge runs, from the data: two points of its northern carriageway. */
const HUNT_HILL_WEST: [number, number] = [-96.8235631, 32.7795921];
const HUNT_HILL_EAST: [number, number] = [-96.8192104, 32.7810952];
/** The middle of its main span: over the Trinity's channel, in the median between the carriageways. */
const HUNT_HILL_MIDDLE: [number, number] = [-96.82243, 32.77993];

/**
 * The Margaret Hunt Hill Bridge's white arch: one steel tube standing over the middle of the deck,
 * along it, 120 metres high over a 183-metre span. Built from boxes stepped along the bridge, so
 * it needs the grid's bearing to know which way the bridge runs on it.
 */
export function huntHillArch(betaDeg: number): Statue {
  const lat0 = (HUNT_HILL_MIDDLE[1] * Math.PI) / 180;
  const east = (HUNT_HILL_EAST[0] - HUNT_HILL_WEST[0]) * Math.cos(lat0);
  const north = HUNT_HILL_EAST[1] - HUNT_HILL_WEST[1];
  const len = Math.hypot(east, north);
  const b = (betaDeg * Math.PI) / 180;
  // a metre along the bridge, in metres uptown (p) and crosstown (q)
  const up = (east * Math.sin(b) + north * Math.cos(b)) / len;
  const uq = (east * Math.cos(b) - north * Math.sin(b)) / len;
  const HALF = 91.5;
  const TOP = 120;
  // steps of about 2.5 m that divide the span exactly, so both feet stand alike
  const STEPS = Math.round((2 * HALF) / 2.5);
  const STEP = (2 * HALF) / STEPS;
  const z = (s: number): number => TOP * Math.max(0, 1 - (s / HALF) ** 2);
  const pieces: StatuePiece[] = [];
  for (let i = 0; i < STEPS; i++) {
    const s = -HALF + STEP * (i + 0.5);
    const a = z(s - STEP / 2);
    const c = z(s + STEP / 2);
    pieces.push({
      dp: up * s,
      dq: uq * s,
      from: Math.max(0, Math.min(a, c) - 1.4),
      to: Math.max(a, c) + 1.4,
      hp: 1.5,
      hq: 1.5,
      ramp: "white",
    });
  }
  return { lon: HUNT_HILL_MIDDLE[0], lat: HUNT_HILL_MIDDLE[1], base: 0, pieces };
}
