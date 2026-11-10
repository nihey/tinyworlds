/**
 * The invitation, on a map, to the site's other places: where it leads. (It is always shown;
 * there are no rules about when.)
 */

/** The front page, at its list of places. */
export const placesUrl = (homeUrl: string): string => `${homeUrl.replace(/#.*$/, "")}#cities`;
