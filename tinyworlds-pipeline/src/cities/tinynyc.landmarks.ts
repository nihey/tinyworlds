import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import type { LandmarkStyle, Statue } from "./types.js";

const glass = (wall: number): LandmarkStyle => ({ wall, pattern: Pattern.Curtain });
const stone = (wall: number, roof?: number): LandmarkStyle => ({ wall, roof, pattern: Pattern.Punched });

export const LANDMARKS: Record<string, LandmarkStyle> = {
  "empire state building": stone(R.limestone, R.greyStone),
  "chrysler building": stone(R.greyStone, R.roofSilver),
  "one world trade center": glass(R.glassBlue),
  "2 world trade center": glass(R.glassSilver),
  "3 world trade center": glass(R.glassSilver),
  "4 world trade center": glass(R.glassBlue),
  "7 world trade center": glass(R.glassSilver),
  "432 park avenue": { wall: R.whiteBrick, pattern: Pattern.Punched },
  "central park tower": glass(R.glassSilver),
  "steinway tower": { wall: R.tan, glass: R.glassBronze, pattern: Pattern.Ribbon },
  "one vanderbilt": glass(R.glassSilver),
  "270 park avenue": glass(R.glassBronze),
  "30 hudson yards": glass(R.glassDark),
  "35 hudson yards": stone(R.limestone),
  "50 hudson yards": glass(R.glassSilver),
  "bank of america tower": glass(R.glassSilver),
  one57: glass(R.glassBlue),
  "53 west 53": glass(R.glassBlack),
  "the spiral": glass(R.glassSilver),
  "one manhattan west": glass(R.glassSilver),
  "220 central park south": stone(R.limestone),
  "flatiron building": stone(R.limestone),
  "30 rockefeller plaza": stone(R.limestone),
  "woolworth building": stone(R.cream, R.roofCopper),
  "metlife building": { wall: R.greyStone, pattern: Pattern.Ribbon },
  "united nations secretariat building": glass(R.glassGreen),
  "citigroup center": glass(R.glassSilver),
  "the new york times building": glass(R.glassSilver),
  "hearst tower": glass(R.glassDark),
  "seagram building": glass(R.glassBronze),
  "lever house": glass(R.glassGreen),
  "trump tower": glass(R.glassBlack),
  "8 spruce street": { wall: R.steel, pattern: Pattern.Ribbon },
  "56 leonard street": glass(R.glassSilver),
  "chanin building": stone(R.tan),
  "general electric building": stone(R.brickRed),
  "new york life building": stone(R.limestone, R.gold),
  "metropolitan life insurance company tower": stone(R.limestone, R.gold),
  "grand central terminal": stone(R.limestone, R.roofCopper),
  "the metropolitan museum of art": stone(R.limestone),
  "american museum of natural history": stone(R.rose),
  "solomon r. guggenheim museum": { wall: R.whiteBrick, pattern: Pattern.None },
  "madison square garden": { wall: R.tan, pattern: Pattern.None },
  "new york public library": stone(R.limestone),
  "yankee stadium": { wall: R.limestone, pattern: Pattern.Tall },
  // the stands: a brick front like Ebbets Field's, and the green of the seats on top
  "citi field": { wall: R.brickRed, roof: R.roofGreen, pattern: Pattern.Tall },
  "barclays center": { wall: R.brownstone, pattern: Pattern.None },
  "statue of liberty": { wall: R.greyStone, roof: R.greyStone, pattern: Pattern.None },
  "the dakota": stone(R.yellowBrick, R.roofSlate),
  "the san remo": stone(R.cream),
  "the plaza": stone(R.whiteBrick, R.roofCopper),
};

/**
 * The Statue of Liberty is not a building, so it is not in the data. Stacked prisms: robe,
 * shoulders, head, crown, the raised arm and the torch. Offsets are metres uptown / crosstown
 * from the centre of the pedestal; radii and heights in metres.
 */
export const LIBERTY: Statue = {
  lon: -74.044502,
  lat: 40.689249,
  /** Top of the pedestal. */
  base: 47,
  pieces: [
    { dp: 0, dq: 0, r: 5.4, from: 0, to: 12, ramp: "body" },
    { dp: 0, dq: 0, r: 4.6, from: 12, to: 22, ramp: "body" },
    { dp: 0, dq: 0, r: 3.7, from: 22, to: 29, ramp: "body" },
    { dp: 0, dq: 0, r: 1.9, from: 29, to: 33.5, ramp: "body" },
    { dp: 0, dq: 0, r: 2.6, from: 33.5, to: 34.6, ramp: "body" },
    // the right arm, raised: on our left as she faces the harbour
    { dp: -1.6, dq: -3.4, r: 1.25, from: 25, to: 42, ramp: "body" },
    { dp: -1.6, dq: -3.4, r: 1.9, from: 42, to: 43.4, ramp: "body" },
    { dp: -1.6, dq: -3.4, r: 1.1, from: 43.4, to: 46, ramp: "gold" },
    // the tablet in the crook of the left arm
    { dp: 1.2, dq: 3.3, r: 1.5, from: 20, to: 27, ramp: "body" },
  ],
};
