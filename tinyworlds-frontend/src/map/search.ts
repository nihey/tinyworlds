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

/**
 * The rank the pipeline gives a point of interest (`index/build.ts`): a pin from crowd-sourced
 * places, the least sure kind of entry. One that bears the name of a better-ranked entry is a
 * copy of it, often dropped kilometres away ("Magic Kingdom" at a hotel, "Epcot" downtown).
 */
export const PIN_RANK = 34;

/** The kinds of entry that are one thing in one spot, so two of one name are likely one thing. */
const FOLDED: ReadonlySet<Place["t"]> = new Set(["landmark", "place", "museum"]);

/** Two entries of one name closer than this are one place listed twice. */
const SAME_PLACE_KM = 1;

/** Ground distance in km, near enough for a city. */
function km(a: Place, b: Place): number {
  const x = (a.lon - b.lon) * Math.cos(((a.lat + b.lat) / 360) * Math.PI) * 111.32;
  const y = (a.lat - b.lat) * 110.57;
  return Math.hypot(x, y);
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
  /** the name without the city's own words at its end ("magic kingdom" of "Magic Kingdom Orlando Fl") */
  core: string;
  words: string[];
  context: string[];
  /** first letters of the words, with and without the small ones: "moma" and "mma" */
  initials: string[];
}

export function createSearchIndex(places: Place[], rules: SearchRules = WORLD.search): SearchIndex {
  const initialsSkip = new Set(rules.initialsSkip);
  // longest first, so "orlando fl" goes before "fl" would leave "orlando"
  const home = (rules.home ?? [])
    .map((words) => normalize(words, rules))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  /** A normalized name without the city's own words at its end; never nothing. */
  const withoutHome = (text: string): string => {
    let rest = text;
    for (let cut = true; cut;) {
      cut = false;
      for (const words of home)
        if (rest.endsWith(` ${words}`)) {
          rest = rest.slice(0, -words.length - 1);
          cut = true;
        }
    }
    return rest;
  };

  const entries: Entry[] = places.map((place) => {
    const name = normalize(place.n, rules);
    const words = name.split(" ").filter(Boolean);
    return {
      place,
      name,
      core: withoutHome(name),
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
  // the copies: an entry of the same name as a better-ranked one (once the city's own words at
  // the end are dropped) that is a pin, or stands within a kilometre of it, is that one again
  const leads = new Map<string, Place>();
  const copyOf = new Map<Place, Place>();
  for (const entry of [...entries].sort((a, b) => b.place.r - a.place.r)) {
    if (!FOLDED.has(entry.place.t)) continue;
    const lead = leads.get(entry.core);
    if (!lead) leads.set(entry.core, entry.place);
    else if (
      (entry.place.r <= PIN_RANK && entry.place.r < lead.r) ||
      km(entry.place, lead) < SAME_PLACE_KM
    )
      copyOf.set(entry.place, lead);
  }

  /**
   * One row per place: a copy that matched gives way to the entry it copies, which then stands
   * where the copy matched best ("Magic Kingdom Orlando Fl" becomes the Magic Kingdom); a copy
   * of something the query did not find is left out.
   */
  function fold(hits: SearchHit[]): SearchHit[] {
    const found = new Set(hits.map((hit) => hit.place));
    const shown = new Set<Place>();
    const out: SearchHit[] = [];
    for (const hit of hits) {
      const lead = copyOf.get(hit.place);
      if (lead && !found.has(lead)) continue;
      const place = lead ?? hit.place;
      if (shown.has(place)) continue;
      shown.add(place);
      out.push(lead ? { place, tier: hit.tier } : hit);
    }
    return out;
  }

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
      const tokensOf = (text: string) =>
        text.split(" ").map((t) => [t, ...(rules.abbreviations[t] ?? [])]);
      const tokens = tokensOf(query);
      // "magic kingdom orlando fl" is also read as "magic kingdom", a tier below what was typed
      const bare = withoutHome(query);
      const bareTokens = bare !== query ? tokensOf(bare) : null;
      const hits: SearchHit[] = [];
      for (const entry of entries) {
        let tier = tierOf(entry, query, tokens);
        if (bareTokens) {
          const loose = tierOf(entry, bare, bareTokens);
          if (loose >= 3 && loose - 1 > tier) tier = (loose - 1) as MatchTier;
        }
        if (tier) hits.push({ place: entry.place, tier });
      }
      hits.sort(
        (a, b) =>
          b.tier - a.tier ||
          b.place.r - a.place.r ||
          a.place.n.length - b.place.n.length ||
          a.place.n.localeCompare(b.place.n),
      );
      return fold(hits).slice(0, limit);
    },
    suggest(limit = 6) {
      return byRank.slice(0, limit);
    },
  };
}
