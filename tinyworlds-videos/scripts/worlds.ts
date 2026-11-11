/**
 * What a loop or a flyover needs to know about a world beyond its card framing.
 */
export interface Shot {
  /** The way a card loop sets off: -1 to the left (the default), 1 to the right, for a world
   *  whose card sits near the left edge of its map. */
  dir?: -1 | 1;
  /** A flyover's framing, the centre of its lap: where, and how many map px one pixel of the
   *  1920 × 1080 picture stands for. Worlds without one get no flyover: the places that only
   *  exist in stories stay out of what is made to promote the project. */
  flyover?: { lon?: number; lat?: number; shrink: number };
}

export const SHOTS: Record<string, Shot> = {
  // the tip of Manhattan, the harbour on three sides
  tinynyc: { flyover: { lon: -74.011, lat: 40.7075, shrink: 2.5 } },
  // the rest fly over their card's own spot, closer
  tinyrao: { flyover: { shrink: 1.25 } },
  tinyorl: { flyover: { shrink: 1.25 } },
  tinyfte: { flyover: { shrink: 2 } },
  tinyvlc: { flyover: { shrink: 1.25 } },
  tinylas: { flyover: { shrink: 2 } },
  tinylax: { flyover: { shrink: 2 } },
  tinydal: { flyover: { shrink: 2 } },
  tinycvg: { flyover: { shrink: 2 } },
  tinypit: { flyover: { shrink: 2 } },
  tinyphl: { flyover: { shrink: 2 } },
  tinywesteros: { dir: 1 },
};

/**
 * The front page's hero goes round every world: for each, a flyover of its own with no sign on
 * it, on a smaller, calmer lap than the ones made to share. The page hangs its own sign over
 * the picture's lower left, so the framing is moved (`dx`, `dy`, in px of the 1920 × 1080
 * picture) to keep what is worth seeing clear of it.
 *
 * The places that only exist in stories have one too. They still get no flyover: these films
 * are the front page's own pictures, on a page that already lists those worlds, and they are
 * shared nowhere.
 */
export interface HeroShot {
  /** the middle of the lap before it is moved: the card's own spot when not given */
  lon?: number;
  lat?: number;
  /** how many map px one pixel of the 1920 × 1080 picture stands for */
  shrink: number;
  dx: number;
  dy: number;
  /** the lap's half-axes, px of the picture */
  a: number;
  b: number;
}

/** The lap every hero makes, and how far its framing is moved, unless a world needs its own. */
const LAP = { dx: -400, dy: 30, a: 170, b: 85 };

export const HEROES: Record<string, HeroShot> = {
  // the tip of Manhattan, the harbour on three sides
  tinynyc: { lon: -74.011, lat: 40.7075, shrink: 2.5, ...LAP },
  tinyrao: { shrink: 1.25, ...LAP },
  tinyorl: { shrink: 1.25, ...LAP },
  tinyfte: { shrink: 2, ...LAP },
  tinyvlc: { shrink: 1.25, ...LAP },
  // a little further out than its flyover: more of the Strip
  tinylas: { shrink: 2.6, ...LAP },
  tinylax: { shrink: 2, ...LAP },
  // downtown stands north-east of the card's spot: the view goes that way
  tinydal: { shrink: 2.2, ...LAP, dx: 250, dy: -30 },
  tinycvg: { shrink: 2, ...LAP },
  tinypit: { shrink: 2, ...LAP },
  tinyphl: { shrink: 2, ...LAP },
  tinywinterfell: { shrink: 2, ...LAP },
  tinykingslanding: { shrink: 2, ...LAP },
  // the whole known world, from as far as its card; moved less, to keep the frame's edge out
  tinywesteros: { shrink: 12, ...LAP, dx: -70 },
};

/** The world whose hero film keeps the plain name: the hero showed that one city alone at first. */
export const HERO_WORLD = "tinynyc";

/**
 * What a world's hero film is called (its render, its plate, its file on the front page):
 * "hero" for the first world, which the showcase film's take still copies by that name, and
 * "hero-<world>" for every other.
 */
export const heroName = (world: string): string => (world === HERO_WORLD ? "hero" : `hero-${world}`);
