/**
 * The street walk's little person, one character per pixel like the badges' maps: drawn in the
 * tool column (an SVG) and dangling while it is carried over the map. Not anyone's figure but
 * ours: a walker in the map's own pixel style, its shirt in the world's accent.
 */
export const PERSON = [
  "..kkk..",
  ".kHHHk.",
  ".kSSSk.",
  ".kSSSk.",
  "kkCCCkk",
  "kCCCCCk",
  "kSCCCSk",
  "kkPPPkk",
  ".kPkPk.",
  ".kPkPk.",
  ".kBkBk.",
  ".kkkkk.",
] as const;

export const PERSON_W = PERSON[0].length;
export const PERSON_H = PERSON.length;

/** The colours of its pixels; "C" is the world's accent. */
export function personColours(accent: string): Record<string, string> {
  return { k: "#15171a", H: "#3d3134", S: "#e2b48e", C: accent, P: "#33405f", B: "#15171a" };
}
