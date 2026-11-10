/**
 * What a ground pixel is. The ground pass paints kinds, not colours; colour, texture, shorelines
 * and scattered trees are all decided from the kind afterwards.
 *
 * The numeric order is also the paint order: a higher kind is painted over a lower one.
 */
export const enum G {
  Water = 0,
  Land = 1,
  // large washes
  Residential = 2,
  Industrial = 3,
  Railyard = 4,
  Construction = 5,
  Apron = 6,
  // the countryside: cropland in rows, bare red earth
  Crop = 7,
  Earth = 8,
  // vegetation and natural ground
  Scrub = 9,
  Wetland = 10,
  Park = 11,
  Cemetery = 12,
  Forest = 13,
  Lawn = 14,
  Garden = 15,
  Sand = 16,
  Rock = 17,
  // small, specific surfaces
  Fairway = 18,
  GolfGreen = 19,
  Bunker = 20,
  Pitch = 21,
  Diamond = 22,
  Court = 23,
  CourtGreen = 24,
  Track = 25,
  Playground = 26,
  Plaza = 27,
  Parking = 28,
  // water that sits on land
  Lake = 29,
  Pool = 30,
  // built over water
  Pier = 31,
  // paved ways, narrow to wide
  Path = 32,
  Rail = 33,
  Service = 34,
  Road = 35,
  RoadMajor = 36,
  Highway = 37,
  Runway = 38,
  Taxiway = 39,
}
export const G_COUNT = 40;

export const isWater = (kind: number): boolean => kind === G.Water || kind === G.Lake;

/** How a wall is drawn. */
export const enum Pattern {
  None = 0,
  /** Masonry with individual windows. */
  Punched = 1,
  /** Continuous window bands between spandrels. */
  Ribbon = 2,
  /** Glass curtain wall: mullion grid and reflections. */
  Curtain = 3,
  /** Mostly blank, a few large openings. */
  Sparse = 4,
  /** One or two small windows and a door. */
  House = 5,
  /** Stone piers with tall windows: churches, halls. */
  Tall = 6,
}

export const enum Roof {
  Flat = 0,
  /** Two slopes meeting at a ridge along the long axis. */
  Pitched = 1,
  /** Footprint shrinking to a point: spires and pyramids. */
  Pyramid = 2,
  /** Half an ellipsoid. */
  Dome = 3,
  /** Flat, but painted as a road (bridge decks). */
  Deck = 4,
}

/** Volume flags. */
export const F_NO_OUTLINE = 1;
/** Stands on nothing (a bridge deck): its shadow falls where the sun puts it, not underneath. */
export const F_FLOATING = 4;
