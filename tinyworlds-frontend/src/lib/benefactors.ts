import type { CityStatus } from "./donate";
import { parseLinks, type BenefactorLink, type MyLinks } from "./links";

/**
 * Stones and benefactors, without the sign: parsing the API's answer, what a gift would lay, how
 * the founders are listed and how a name is cleaned. Pure.
 */

/** One stone is a dollar. */
export const STONE_CENTS = 100;
/** The longest display name, in code points. */
export const NAME_MAX = 40;

export interface FounderRow {
  number: number;
  name: string | null;
  amountCents: number;
  stones: number;
  firstStone: boolean;
  keystone: boolean;
  /** a named founder's links; none on an unnamed row */
  links: BenefactorLink[];
}

export interface BenefactorRow {
  rank: number;
  name: string | null;
  amountCents: number;
  /** as on a founder's row */
  links: BenefactorLink[];
}

export interface CityBenefactors {
  slug: string;
  name: string;
  status: CityStatus;
  worldId: string | null;
  goalCents: number;
  raisedCents: number;
  /** How many people gave to it (a donor once, however many gifts); absent from an older API. */
  benefactorCount?: number;
  /** One per stone: the number of the founder row that laid it, null while unlaid. */
  stones: (number | null)[];
  founders: FounderRow[];
  benefactors: BenefactorRow[];
}

const STATUSES: readonly string[] = ["PROPOSED", "FUNDED", "BUILDING", "BUILT"];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const isName = (v: unknown): v is string | null => v === null || typeof v === "string";

function parseFounder(v: unknown, origin: string | null): FounderRow | null {
  if (!isRec(v)) return null;
  if (!isInt(v.number) || !isName(v.name) || !isInt(v.amountCents) || !isInt(v.stones)) return null;
  if (typeof v.firstStone !== "boolean" || typeof v.keystone !== "boolean") return null;
  return {
    number: v.number,
    name: v.name,
    amountCents: v.amountCents,
    stones: v.stones,
    firstStone: v.firstStone,
    keystone: v.keystone,
    // links go with a name: an unnamed row shows none, whatever the answer says
    links: v.name === null ? [] : parseLinks(v.links, origin),
  };
}

function parseBenefactor(v: unknown, origin: string | null): BenefactorRow | null {
  if (!isRec(v)) return null;
  if (!isInt(v.rank) || !isName(v.name) || !isInt(v.amountCents)) return null;
  return {
    rank: v.rank,
    name: v.name,
    amountCents: v.amountCents,
    links: v.name === null ? [] : parseLinks(v.links, origin),
  };
}

function parseAll<T>(list: unknown, one: (v: unknown) => T | null): T[] | null {
  if (!Array.isArray(list)) return null;
  const out: T[] = [];
  for (const item of list) {
    const parsed = one(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function parseStones(list: unknown): (number | null)[] | null {
  if (!Array.isArray(list)) return null;
  const out: (number | null)[] = [];
  for (const item of list) {
    if (item !== null && !isInt(item)) return null;
    out.push(item);
  }
  return out;
}

/**
 * The API's `cityBenefactors` answer, or null when it is not what the contract says. `origin`
 * is where the API serves the links' pictures from (`apiOrigin`); without it they show none.
 */
export function parseCityBenefactors(
  value: unknown,
  origin: string | null = null,
): CityBenefactors | null {
  if (!isRec(value)) return null;
  const { slug, name, status, worldId, goalCents, raisedCents } = value;
  if (typeof slug !== "string" || typeof name !== "string") return null;
  if (typeof status !== "string" || !STATUSES.includes(status)) return null;
  if (worldId !== null && typeof worldId !== "string") return null;
  if (!isInt(goalCents) || !isInt(raisedCents)) return null;
  const stones = parseStones(value.stones);
  const founders = parseAll(value.founders, (v) => parseFounder(v, origin));
  const benefactors = parseAll(value.benefactors, (v) => parseBenefactor(v, origin));
  if (!stones || !founders || !benefactors) return null;
  return {
    slug,
    name,
    status: status as CityStatus,
    worldId,
    goalCents,
    raisedCents,
    ...(isInt(value.benefactorCount) && value.benefactorCount >= 0
      ? { benefactorCount: value.benefactorCount }
      : {}),
    stones,
    founders,
    benefactors,
  };
}

/**
 * The stones a gift would lay on top of what is raised: numbers `from` to `to` (1-based), and
 * whether they include the First Stone or the Keystone. Null when it lays none.
 */
export function stonePreview(
  raisedCents: number,
  goalCents: number,
  amountCents: number,
): { from: number; to: number; firstStone: boolean; keystone: boolean } | null {
  if (raisedCents >= goalCents) return null;
  const from = Math.floor(raisedCents / STONE_CENTS) + 1;
  // The API's rule: the last, possibly partial, stone belongs to the gift that reaches the goal.
  const total = raisedCents + amountCents;
  const last = Math.ceil(goalCents / STONE_CENTS);
  const to = total >= goalCents ? last : Math.floor(total / STONE_CENTS);
  if (from > to) return null;
  return { from, to, firstStone: from === 1, keystone: to === last };
}

export type StoneLook = "gold" | "gold-alt" | "anon" | "empty";

/** How each stone is drawn: named founders' runs alternate gold and gold-alt, anonymous ones are plain. */
export function stoneLooks(stones: (number | null)[], founders: FounderRow[]): StoneLook[] {
  const byNumber = new Map(founders.map((f) => [f.number, f]));
  let namedRuns = 0;
  let previous: number | null = null;
  return stones.map((n) => {
    const founder = n === null ? undefined : byNumber.get(n);
    const look: StoneLook = n === null ? "empty" : founder?.name ? "gold" : "anon";
    if (look === "gold") {
      if (n !== previous) namedRuns += 1;
      previous = n;
      return namedRuns % 2 === 1 ? "gold" : "gold-alt";
    }
    previous = n;
    return look;
  });
}

/**
 * The founders as listed: at most `limit` lines, the summary of the hidden middle counting as
 * one. The First Stone and Keystone rows always stay. `after` is the number of the shown row the
 * summary follows.
 */
export function collapseFounders(
  founders: FounderRow[],
  limit = 6,
): {
  shown: FounderRow[];
  hidden: { count: number; anonymous: number; amountCents: number; after: number } | null;
} {
  if (founders.length <= limit) return { shown: founders, hidden: null };
  const mandatory = (f: FounderRow) => f.firstStone || f.keystone;
  let room = Math.max(limit - 1, 0) - founders.filter(mandatory).length;
  const keep = founders.map((f) => {
    if (mandatory(f)) return true;
    if (room > 0) {
      room -= 1;
      return true;
    }
    return false;
  });
  const shown = founders.filter((_, i) => keep[i]);
  const hiddenRows = founders.filter((_, i) => !keep[i]);
  if (hiddenRows.length === 0) return { shown, hidden: null };
  const firstHidden = keep.indexOf(false);
  return {
    shown,
    hidden: {
      count: hiddenRows.length,
      anonymous: hiddenRows.filter((f) => f.name === null).length,
      amountCents: hiddenRows.reduce((sum, f) => sum + f.amountCents, 0),
      after: firstHidden > 0 ? founders[firstHidden - 1].number : 0,
    },
  };
}

/** Stone numbers as runs: [1, 2, 3, 7] gives ["1–3", "7"]. */
export function stoneRanges(stones: number[]): string[] {
  const sorted = [...new Set(stones)].sort((a, b) => a - b);
  const out: string[] = [];
  for (let i = 0; i < sorted.length;) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j += 1;
    out.push(j > i ? `${sorted[i]}–${sorted[j]}` : `${sorted[i]}`);
    i = j + 1;
  }
  return out;
}

/** A display name as the API keeps it (`cleanDisplayName`): same rules, same order. Null when nothing is left. */
export function cleanName(text: string): string | null {
  const cleaned = text
    .normalize("NFC")
    .replace(/\s+/gu, " ") // tabs and newlines are control characters: make them spaces first
    .replace(/[\p{Cc}\p{Cf}]+/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  const cut = Array.from(cleaned).slice(0, NAME_MAX).join("").trim();
  return /[\p{L}\p{N}]/u.test(cut) ? cut : null;
}

// ---------------------------------------------------------------------------------------------
// the donor's own page
// ---------------------------------------------------------------------------------------------

/** One city a donor has given to, as the donor's page shows it. */
export interface MyCity {
  slug: string;
  name: string;
  status: CityStatus;
  worldId: string | null;
  goalCents: number;
  raisedCents: number;
  /** what this donor gave to the city */
  givenCents: number;
  /** the founder number, for a donor among the founders */
  founderNumber: number | null;
  /** the stone numbers this donor laid, ascending */
  stones: number[];
  firstStone: boolean;
  keystone: boolean;
  /** whether the donor is named in the city's benefactors */
  listed: boolean;
}

export interface MyGiving {
  /** the one name shown in every city the donor is listed in */
  displayName: string | null;
  /** newest gift first */
  cities: MyCity[];
  /** gifts that named no city */
  projectCents: number;
  /** the links shown beside the name; null when the API said nothing of them */
  links: MyLinks | null;
}

function parseMyCity(v: unknown): MyCity | null {
  if (!isRec(v)) return null;
  const { slug, name, status, worldId, founderNumber } = v;
  if (typeof slug !== "string" || typeof name !== "string") return null;
  if (typeof status !== "string" || !STATUSES.includes(status)) return null;
  if (worldId !== null && typeof worldId !== "string") return null;
  if (founderNumber !== null && !isInt(founderNumber)) return null;
  if (!isInt(v.goalCents) || !isInt(v.raisedCents) || !isInt(v.givenCents)) return null;
  if (!Array.isArray(v.stones) || !v.stones.every(isInt)) return null;
  if (typeof v.firstStone !== "boolean" || typeof v.keystone !== "boolean") return null;
  if (typeof v.listed !== "boolean") return null;
  return {
    slug,
    name,
    status: status as CityStatus,
    worldId,
    goalCents: v.goalCents,
    raisedCents: v.raisedCents,
    givenCents: v.givenCents,
    founderNumber,
    stones: v.stones as number[],
    firstStone: v.firstStone,
    keystone: v.keystone,
    listed: v.listed,
  };
}

/**
 * The API's `myGiving` answer, or null when it is not what the contract says. `links` is what
 * `parseMyLinks` made of the `myLinks` asked with it.
 */
export function parseGiving(value: unknown, links: MyLinks | null = null): MyGiving | null {
  if (!isRec(value)) return null;
  if (!isName(value.displayName) || !isInt(value.projectCents)) return null;
  const cities = parseAll(value.cities, parseMyCity);
  if (!cities) return null;
  return { displayName: value.displayName, cities, projectCents: value.projectCents, links };
}

/** Whether the donor is named anywhere: their links show where their name does. */
export function namedSomewhere(giving: MyGiving): boolean {
  return giving.displayName !== null && giving.cities.some((city) => city.listed);
}

/** The figures at the top of the page: how many cities, how many stones, how much given to them. */
export function givingSummary(giving: MyGiving): {
  cities: number;
  stones: number;
  givenCents: number;
} {
  return {
    cities: giving.cities.length,
    stones: giving.cities.reduce((sum, c) => sum + c.stones.length, 0),
    givenCents: giving.cities.reduce((sum, c) => sum + c.givenCents, 0),
  };
}

/** The cities each badge was earned in, by name, in the giving's own order. */
export interface EarnedBadges {
  founding: string[];
  firstStone: string[];
  keystone: string[];
}

/** Which badges a donor has, and where they earned them. */
export function earnedBadges(cities: MyCity[]): EarnedBadges {
  const named = (has: (city: MyCity) => boolean) => cities.filter(has).map((city) => city.name);
  return {
    founding: named((city) => city.founderNumber !== null),
    firstStone: named((city) => city.firstStone),
    keystone: named((city) => city.keystone),
  };
}

/**
 * Where a badge was earned, for the line beside it: the city, or two of them, and beyond that
 * how many ("3 cities"; "{n}" in the words). Null for a badge not earned.
 */
export function earnedWhere(
  names: string[],
  cities: { one: string; other: string },
): string | null {
  if (names.length === 0) return null;
  if (names.length <= 2) return names.join(", ");
  return cities.other.replace("{n}", String(names.length));
}

/** The words of the collapsed-founders line: "{n}" in both. */
export interface MoreWords {
  more: { one: string; other: string };
  anonymous: { one: string; other: string };
}

/** "4 more, 1 anonymous"; the anonymous part is left out when none of them are. */
export function moreLine(count: number, anonymous: number, words: MoreWords): string {
  const part = (n: number, form: { one: string; other: string }) =>
    (n === 1 ? form.one : form.other).replace("{n}", String(n));
  return anonymous > 0
    ? `${part(count, words.more)}, ${part(anonymous, words.anonymous)}`
    : part(count, words.more);
}
