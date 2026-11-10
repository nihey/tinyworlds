/**
 * The invitation, on a map, to the site's other places. Pure: when it is shown.
 *
 * It is mostly for someone who landed on one map and may not know there are others. Putting it away
 * is remembered in this browser, for every map at once (they share an origin), along with how
 * many places there were at the time: it comes back only when there are more.
 */

export const EXPLORE_KEY = "tinyworlds.explore";

/** How many other places there were when the invitation was last put away; 0 if it never was. */
export function putAwayAt(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/**
 * Whether to invite: there are other places, and more of them than when the visitor last put
 * the invitation away. Everyone else is invited, however they arrived: someone who came by way
 * of the front page has seen the list, but a way back to it costs them nothing.
 */
export function invites(others: number, putAway: number): boolean {
  return others > 0 && others > putAway;
}

/** The front page, at its list of places. */
export const placesUrl = (homeUrl: string): string => `${homeUrl.replace(/#.*$/, "")}#cities`;
