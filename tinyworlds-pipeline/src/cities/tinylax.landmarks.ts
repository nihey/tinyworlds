import { R } from "../render/palette.js";
import { Pattern } from "../scene/kinds.js";
import type { LandmarkStyle, Statue, StatuePiece } from "./types.js";

const glass = (wall: number, roof: number = R.roofGravel): LandmarkStyle => ({
  wall,
  roof,
  pattern: Pattern.Curtain,
});
const stone = (wall: number, roof: number = R.roofGravel): LandmarkStyle => ({
  wall,
  roof,
  pattern: Pattern.Punched,
});

/** Buildings everyone knows, in the materials everyone remembers (keyed by name, lower case). */
export const LANDMARKS: Record<string, LandmarkStyle> = {
  // downtown
  "walt disney concert hall": { wall: R.roofSilver, roof: R.roofSilver, pattern: Pattern.None },
  "los angeles city hall": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Tall },
  "wilshire grand building": glass(R.glassBlue, R.roofSilver),
  "u.s. bank tower": stone(R.greyStone),
  "aon center": glass(R.glassDark, R.whiteBrick),
  "the broad museum": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.None },
  "cathedral of our lady of the angels": { wall: R.ochre, roof: R.ochre, pattern: Pattern.None },
  "union station": { wall: R.cream, roof: R.roofTerracotta, pattern: Pattern.Tall },
  "crypto.com arena": { wall: R.glassSilver, roof: R.roofSilver, pattern: Pattern.Curtain },
  "bradbury building": stone(R.brickRed),
  "los angeles memorial coliseum": { wall: R.tan, roof: R.cream, pattern: Pattern.None },
  "dodger stadium": { wall: R.whiteBrick, roof: R.sidingBlue, pattern: Pattern.None },
  // Hollywood and the hills
  "griffith observatory": { wall: R.whiteBrick, roof: R.roofCopper, pattern: Pattern.None, dome: 0.3 },
  "capitol records building": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.Ribbon },
  "tcl chinese theatre": { wall: R.brickRed, roof: R.roofCopper, pattern: Pattern.None, pyramid: 0.4 },
  "pacific design center": glass(R.glassBlue, R.glassBlue),
  // the Westside and the south
  "the beverly hills hotel": stone(R.rose, R.roofGreen),
  "theme building": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.None, dome: 0.5 },
  "sofi stadium": { wall: R.glassSilver, roof: R.roofWhite, pattern: Pattern.None },
  "intuit dome": { wall: R.glassSilver, roof: R.roofSilver, pattern: Pattern.None, dome: 0.3 },
  "kia forum": { wall: R.whiteBrick, roof: R.roofWhite, pattern: Pattern.None, dome: 0.15 },
  "petersen automotive museum": { wall: R.carRed, roof: R.roofSilver, pattern: Pattern.None },
};

/**
 * The letters of the Hollywood Sign in a bold pixel face, top row first: two cells to a stroke,
 * so the white still shows between a letter's outlines. Each run of lit cells becomes a box. The
 * real letters are 13.7 m tall and the word about 107 m long; the W is the widest.
 */
const FACE: Record<string, string[]> = {
  H: ["XX..XX", "XX..XX", "XX..XX", "XXXXXX", "XX..XX", "XX..XX", "XX..XX"],
  O: [".XXXX.", "XX..XX", "XX..XX", "XX..XX", "XX..XX", "XX..XX", ".XXXX."],
  L: ["XX....", "XX....", "XX....", "XX....", "XX....", "XX....", "XXXXXX"],
  Y: ["XX..XX", "XX..XX", "XX..XX", ".XXXX.", "..XX..", "..XX..", "..XX.."],
  W: ["XX...XX", "XX...XX", "XX.X.XX", "XX.X.XX", "XXXXXXX", "XXX.XXX", "XX...XX"],
  D: ["XXXXX.", "XX..XX", "XX..XX", "XX..XX", "XX..XX", "XX..XX", "XXXXX."],
};

const CELL_W = 1.75;
const CELL_H = 13.7 / 7;
const GAP = 1.6;

interface Run {
  c0: number;
  c1: number;
  r0: number;
  r1: number;
}

/**
 * A word in boxes. Each column's runs of lit cells, merged with the same run in the columns
 * beside it: a stroke is one box, so no seam is drawn across it.
 */
function word(text: string, depth: number): StatuePiece[] {
  const pieces: StatuePiece[] = [];
  const widths = [...text].map((letter) => FACE[letter][0].length * CELL_W);
  const total = widths.reduce((a, b) => a + b, 0) + (text.length - 1) * GAP;
  let left = -total / 2;
  [...text].forEach((letter, n) => {
    const rows = FACE[letter];
    const box = (run: Run): void => {
      pieces.push({
        dp: 0,
        dq: left + ((run.c0 + run.c1) / 2) * CELL_W,
        hp: depth / 2,
        hq: ((run.c1 - run.c0) * CELL_W) / 2,
        from: (7 - run.r1) * CELL_H,
        to: (7 - run.r0) * CELL_H,
        ramp: "white",
      });
    };
    let open = new Map<string, Run>();
    for (let c = 0; c < rows[0].length; c++) {
      const next = new Map<string, Run>();
      for (let r = 0; r < 7; r++) {
        if (rows[r][c] !== "X" || (r > 0 && rows[r - 1][c] === "X")) continue;
        let end = r;
        while (end < 7 && rows[end][c] === "X") end++;
        const key = `${r}:${end}`;
        const run = open.get(key);
        next.set(key, run ? { ...run, c1: c + 1 } : { c0: c, c1: c + 1, r0: r, r1: end });
        open.delete(key);
      }
      for (const run of open.values()) box(run);
      open = next;
    }
    for (const run of open.values()) box(run);
    left += widths[n] + GAP;
  });
  return pieces;
}

/**
 * The Hollywood Sign is not a building, so it is not in the data. Nine white letters on the
 * south face of Mount Lee, reading west to east; the map is flat, so they stand on the ground.
 */
export const HOLLYWOOD_SIGN: Statue = {
  lon: -118.32173,
  lat: 34.13416,
  base: 0,
  pieces: word("HOLLYWOOD", 1.4),
};

export const STATUES: Statue[] = [HOLLYWOOD_SIGN];
