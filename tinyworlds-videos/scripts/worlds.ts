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
  tinywesteros: { dir: 1 },
};

/**
 * The front page's hero: one world's flyover with no sign on it, on a smaller, calmer lap. The
 * page hangs its own sign over the picture's lower left, so the framing is moved (`dx`, `dy`,
 * in px of the 1920 × 1080 picture) to keep what is worth seeing clear of it.
 */
export const HERO = { world: "tinynyc", dx: -400, dy: 30, a: 170, b: 85 } as const;
