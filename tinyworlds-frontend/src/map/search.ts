import { WORLD } from "@/worlds";
import type { Place } from "./manifest";
import type { SearchRules } from "./search-rules";

/**
 * Match quality, best first. Results are ordered by tier, then by the place's own rank `r`.
 *   6  the name is the query
 *   5  the name starts with the query
 *   4  every query word starts a word of the name
 *   3  every query word is found (inside a word, in the context line, or as initials)
 *   2  every query word is found allowing a typo
 */
export type MatchTier = 2 | 3 | 4 | 5 | 6;

export interface SearchHit {
  place: Place;
  tier: MatchTier;
}

export interface SearchIndex {
  readonly size: number;
  search(query: string, limit?: number): SearchHit[];
  /** The best-known places, for an empty search box. */
  suggest(limit?: number): Place[];
}

/** Matches nothing: for languages that do not write "d'" or "l'" onto the next word. */
const NO_ELISION = /(?!)/g;

/** Lowercase, unaccented, punctuation-free; ordinals and number words become digits. */
export function normalize(text: string, rules: SearchRules = WORLD.search): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, ` ${rules.and} `)
    .replace(rules.elision ?? NO_ELISION, "$1 ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((w) => rules.numberWords[w] ?? (rules.ordinal ? w.replace(rules.ordinal, "$1") : w))
    .join(" ");
}

/** Edit distance (insert, delete, substitute, swap neighbours), abandoned once it passes `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d = Math.min(d, prev2[j - 2] + 1);
      row.push(d);
      if (d < best) best = d;
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

const typosAllowed = (len: number): number => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

/** How well one query word matches one word: 3 starts it, 2 is inside it, 1 with a typo, 0 not. */
function wordMatch(token: string, word: string): 0 | 1 | 2 | 3 {
  if (word.startsWith(token)) return 3;
  if (token.length >= 2 && word.includes(token)) return 2;
  const max = typosAllowed(token.length);
  if (max > 0) {
    // compare with the start of the word, so "brodway" finds "broadway" and "willamsb" finds "williamsburg"
    for (let len = token.length - 1; len <= token.length + 1; len++) {
      if (len < 1 || len > word.length) continue;
      if (editDistance(token, word.slice(0, len), max) <= max) return 1;
    }
  }
  return 0;
}

interface Entry {
  place: Place;
  name: string;
  words: string[];
  context: string[];
  /** first letters of the words, with and without the small ones: "moma" and "mma" */
  initials: string[];
}

export function createSearchIndex(places: Place[], rules: SearchRules = WORLD.search): SearchIndex {
  const initialsSkip = new Set(rules.initialsSkip);
  const entries: Entry[] = places.map((place) => {
    const name = normalize(place.n, rules);
    const words = name.split(" ").filter(Boolean);
    return {
      place,
      name,
      words,
      context: place.b ? normalize(place.b, rules).split(" ").filter(Boolean) : [],
      initials: [
        words.map((w) => w[0]).join(""),
        words
          .filter((w) => !initialsSkip.has(w))
          .map((w) => w[0])
          .join(""),
      ],
    };
  });

  const byRank = [...places].sort((a, b) => b.r - a.r || a.n.localeCompare(b.n));

  function tierOf(entry: Entry, query: string, tokens: string[][]): MatchTier | 0 {
    if (entry.name === query) return 6;
    if (entry.name.startsWith(query)) return 5;

    let worst = 3; // the weakest word match decides the tier
    let inName = false;
    for (const alternates of tokens) {
      let best = 0;
      let bestInName = false;
      for (const alternate of alternates) {
        // "=xv" is an alternate that only counts as a whole word
        const whole = alternate.startsWith("=");
        const token = whole ? alternate.slice(1) : alternate;
        for (const word of entry.words) {
          const m = whole ? (word === token ? 3 : 0) : wordMatch(token, word);
          if (m > best || (m === best && m > 0 && !bestInName)) {
            best = m;
            bestInName = true;
          }
        }
        if (best < 3 && !whole) {
          // the context line (borough) can settle a word, but never as well as the name does
          for (const word of entry.context) {
            const m = Math.min(wordMatch(token, word), 2);
            if (m > best) {
              best = m;
              bestInName = false;
            }
          }
        }
      }
      if (best === 0) {
        worst = 0;
        break;
      }
      if (bestInName) inName = true;
      if (best < worst) worst = best;
    }

    if (worst > 0 && inName) return worst === 3 ? 4 : worst === 2 ? 3 : 2;

    // initials: "esb" finds Empire State Building
    if (tokens.length === 1 && query.length >= 2 && query.length <= 6 && entry.words.length > 1) {
      if (entry.initials.some((i) => i.startsWith(query))) return 3;
    }
    return 0;
  }

  return {
    size: places.length,
    search(rawQuery, limit = 8) {
      const query = normalize(rawQuery, rules);
      if (!query) return [];
      const tokens = query.split(" ").map((t) => [t, ...(rules.abbreviations[t] ?? [])]);
      const hits: SearchHit[] = [];
      for (const entry of entries) {
        const tier = tierOf(entry, query, tokens);
        if (tier) hits.push({ place: entry.place, tier });
      }
      hits.sort(
        (a, b) =>
          b.tier - a.tier ||
          b.place.r - a.place.r ||
          a.place.n.length - b.place.n.length ||
          a.place.n.localeCompare(b.place.n),
      );
      return hits.slice(0, limit);
    },
    suggest(limit = 6) {
      return byRank.slice(0, limit);
    },
  };
}
