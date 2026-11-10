/**
 * The invitation, on a map, to the site's other places. Pure: when it is shown.
 *
 * It is for someone who landed on one map and may not know there are others. Putting it away
 * is remembered in this browser, for every map at once (they share an origin), along with how
 * many places there were at the time: it comes back only when there are more.
 */

export const EXPLORE_KEY = "tinyworlds.explore";

/** How many other places there were when the invitation was last put away; 0 if it never was. */
export function putAwayAt(raw: string | null): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

/** Whether the page the visitor came from is the site's own front page: they have just seen the list. */
export function cameFromHome(referrer: string, origin: string, homeUrl: string): boolean {
  try {
    const from = new URL(referrer);
    const home = new URL(homeUrl, origin);
    return from.origin === home.origin && from.pathname === home.pathname;
  } catch {
    return false; // no referrer, or not an address
  }
}

/**
 * Whether to invite: there are other places, the visitor has not just come from the list of
 * them, and there are more than when they last put the invitation away.
 */
export function invites(others: number, putAway: number, fromHome: boolean): boolean {
  return others > 0 && !fromHome && others > putAway;
}

/** The front page, at its list of places. */
export const placesUrl = (homeUrl: string): string => `${homeUrl.replace(/#.*$/, "")}#cities`;
