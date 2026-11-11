import { STONE_CENTS } from "./benefactors";

/**
 * A city's foundation as a list of cities shows it: how many stones it has and how many are
 * laid, from what it raised and what it needs. Who laid which is the benefactors' sign's to
 * say (`lib/benefactors.ts`); this needs only the two sums. Pure.
 */

/** How many stones stand in a row of the wall. */
export const STONES_PER_ROW = 15;
/** A foundation larger than this is drawn as one plain bar: the stones would be too many to read. */
export const WALL_MAX_STONES = 60;

export interface CityStones {
  /** one per dollar of the goal, a last partial dollar counting as one */
  total: number;
  laid: number;
}

/**
 * The stones of a city. The API's rule (see `stonePreview`): a stone per whole dollar raised,
 * and the last, possibly partial, stone belongs to the gift that reaches the goal.
 */
export function cityStones(raisedCents: number, goalCents: number): CityStones {
  if (!(goalCents > 0)) return { total: 0, laid: 0 };
  const total = Math.ceil(goalCents / STONE_CENTS);
  if (raisedCents >= goalCents) return { total, laid: total };
  return { total, laid: Math.min(Math.max(Math.floor(raisedCents / STONE_CENTS), 0), total) };
}

/** How a stone is drawn: the donor's own, someone's, or not laid yet. */
export type WallLook = "mine" | "laid" | "empty";

/**
 * Each stone's look, first to last. `mine` are the donor's stone numbers (1-based, as the API
 * gives them); a number that is not a laid stone is ignored.
 */
export function wallLooks(stones: CityStones, mine: number[] = []): WallLook[] {
  const own = new Set(mine);
  return Array.from({ length: stones.total }, (_, i) =>
    i >= stones.laid ? "empty" : own.has(i + 1) ? "mine" : "laid",
  );
}
