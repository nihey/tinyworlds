/**
 * What a ground pixel is. The ground pass paints kinds, not colours; colour, texture, shorelines
 * and scattered trees are all decided from the kind afterwards.
 *
 * Kinds are painted in the order of `PAINT_RANK` (below): for all but the newest kinds that is
 * their numeric order, a higher kind over a lower one.
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
  // the countryside: cropland in rows, bare red earth, dry steppe
  Crop = 7,
  Earth = 8,
  Steppe = 9,
  // vegetation and natural ground
  Scrub = 10,
  Wetland = 11,
  Park = 12,
  Cemetery = 13,
  Forest = 14,
  Lawn = 15,
  Garden = 16,
  Sand = 17,
  Rock = 18,
  // small, specific surfaces
  Fairway = 19,
  GolfGreen = 20,
  Bunker = 21,
  Pitch = 22,
  Diamond = 23,
  Court = 24,
  CourtGreen = 25,
  Track = 26,
  Playground = 27,
  Plaza = 28,
  Parking = 29,
  // water that sits on land
  Lake = 30,
  Pool = 31,
  // built over water
  Pier = 32,
  // paved ways, narrow to wide
  Path = 33,
  Rail = 34,
  Service = 35,
  Road = 36,
  RoadMajor = 37,
  Highway = 38,
  Runway = 39,
  Taxiway = 40,
  // added later: they keep the numbers after the rest, and get their place in the paint order below
  Snow = 41,
  Cobble = 42,
  DirtRoad = 43,
  Meadow = 44,
  /** Red sandstone: the fins of the Garden of the Gods. */
  RedRock = 45,
}
export const G_COUNT = 46;

/**
 * Paint order by kind: a higher rank is painted over a lower one. For the original kinds it is
 * simply their number. A kind added later takes the next free number, so that scenes already on
 * disk keep their meaning, and is given a rank between the old ones here.
 */
export const PAINT_RANK = new Float32Array(G_COUNT);
for (let kind = 0; kind < G_COUNT; kind++) PAINT_RANK[kind] = kind;
PAINT_RANK[G.Snow] = G.Land + 0.5; // a wash under everything that grows or is built
PAINT_RANK[G.Meadow] = G.Land + 0.6; // open grass country, likewise
PAINT_RANK[G.DirtRoad] = G.Pier + 0.5; // the humblest of the ways
PAINT_RANK[G.Cobble] = G.Service + 0.5; // a paved street, over lanes of dirt
PAINT_RANK[G.RedRock] = G.Rock + 0.5; // rock, of another colour
/** Ways (roads, paths, rails) start at this rank. */
export const WAY_RANK = G.Pier + 0.5;

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
