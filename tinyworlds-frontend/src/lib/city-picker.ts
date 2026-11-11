import type { CatalogueCity } from "./city-catalogue";
import type { Locale } from "@/i18n/locale";
import { chosenCity, formatUsd, selectable, type CityMilestone } from "./donate";

/**
 * The city picker's rules, without the picker: what a donor may choose from, what a search
 * finds, and how the cities are ranked on the front page.
 */

/** A name as it is compared: no accents, no case, punctuation as spaces ("São Paulo" = "sao paulo"). */
export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** What a donor typed, as it is sent: single spaces, at most 60 characters; "" when there is no name in it. */
export const tidyCity = (text: string): string => chosenCity({ kind: "other", text }) ?? "";

/** Every word of the query starts a word of the name (or of one of its other spellings). */
function matches(query: string[], names: string[]): boolean {
  if (query.length === 0) return true;
  return names.some((name) => {
    const words = name.split(" ");
    return query.every((q) => words.some((w) => w.startsWith(q)));
  });
}

const namesOf = (city: CatalogueCity): string[] => [city.name, ...(city.alt ?? [])].map(fold);

export interface PickerOptions {
  /** The cities already being funded that the search keeps, most funded first (the API's order). */
  funding: CityMilestone[];
  /** Well-known cities nobody has given to yet, by name. */
  more: CatalogueCity[];
  /** What was typed, offered as a city of its own when the search finds nothing else. */
  typed: string | null;
  /** The search names a city that is already built: nothing to fund there. */
  built: CityMilestone | null;
}

/**
 * What the picker lists for a search. A city is offered once: a catalogue city that people are
 * already funding appears with its bar, and one that is built (by the API's word, or because it
 * is one of this site's worlds, `builtNames`) is not offered at all.
 */
export function pickerOptions(
  milestones: CityMilestone[],
  catalogue: CatalogueCity[],
  query: string,
  builtNames: string[] = [],
): PickerOptions {
  const words = fold(query).split(" ").filter(Boolean);
  const whole = words.join(" ");
  const known = new Set([...milestones.map((city) => fold(city.name)), ...builtNames.map(fold)]);
  // a city being funded is also found by the catalogue's other spellings of it ("Londres")
  const spellings = new Map(catalogue.map((city) => [fold(city.name), namesOf(city)]));
  const namesFor = (name: string): string[] => spellings.get(fold(name)) ?? [fold(name)];

  const funding = milestones
    .filter(selectable)
    .filter((city) => matches(words, namesFor(city.name)));
  const more = catalogue
    .filter((city) => !namesOf(city).some((name) => known.has(name)))
    .filter((city) => matches(words, namesOf(city)))
    .sort((a, b) => {
      // a name that starts with the search comes before one that merely contains the word
      const rank = (c: CatalogueCity) =>
        whole && namesOf(c).some((n) => n.startsWith(whole)) ? 0 : 1;
      return rank(a) - rank(b) || a.name.localeCompare(b.name, "en");
    });

  // "kings landing" is King's Landing, "newyork" is New York: for this the spaces do not count
  const tight = (name: string): string => name.replaceAll(" ", "");
  const isNamed = (name: string): boolean =>
    namesFor(name).some((spelling) => tight(spelling) === tight(whole));
  const built =
    whole === ""
      ? null
      : (milestones.find((city) => !selectable(city) && isNamed(city.name)) ?? null);
  const builtHere = whole !== "" && builtNames.some(isNamed);
  const typed = tidyCity(query);
  // what was typed becomes a city of its own only when the list has nothing to offer for it
  const nothing = funding.length === 0 && more.length === 0 && built === null && !builtHere;
  return { funding, more, typed: typed !== "" && nothing ? typed : null, built };
}

const REGION_NAMES = new Map<string, (cc: string) => string>();

/** Country names in a language ("GB" → "United Kingdom", "Reino Unido"); the code itself if the browser cannot say. */
export function regionNames(locale: string): (cc: string) => string {
  let name = REGION_NAMES.get(locale);
  if (!name) {
    try {
      const names = new Intl.DisplayNames([locale], { type: "region" });
      name = (cc) => names.of(cc) ?? cc;
    } catch {
      name = (cc) => cc;
    }
    REGION_NAMES.set(locale, name);
  }
  return name;
}

/** The city a name refers to among the ones being funded, however it was typed. */
export function findMilestone(milestones: CityMilestone[], name: string): CityMilestone | null {
  const key = fold(name);
  if (key === "") return null;
  return milestones.find((city) => fold(city.name) === key) ?? null;
}

/** What a city needs when the list cannot say: the API's default goal (`CITY_GOAL_CENTS`), US$30. */
export const GOAL_FALLBACK_CENTS = 3_000;

/** A sentence about the goal with its "{goal}" written as money in the visitor's language. */
export const withGoal = (text: string, goalCents: number, locale: Locale): string =>
  text.replaceAll("{goal}", formatUsd(goalCents, locale));

/** What a city nobody has given to yet has to reach: what the others have to, or the fallback. */
export function defaultGoal(milestones: CityMilestone[]): number {
  const counts = new Map<number, number>();
  for (const city of milestones)
    if (city.goalCents > 0) counts.set(city.goalCents, (counts.get(city.goalCents) ?? 0) + 1);
  let best = GOAL_FALLBACK_CENTS;
  let most = 0;
  for (const [goal, count] of counts)
    if (count > most) {
      best = goal;
      most = count;
    }
  return best;
}

// ---------------------------------------------------------------------------------------------
// the bar, with a donation that has not been made yet
// ---------------------------------------------------------------------------------------------

export interface BarPreview {
  /** Share of the bar already filled, and the share this donation would add; together at most 1. */
  raised: number;
  added: number;
  /** What the city would have after the donation, in cents. */
  totalCents: number;
  /** This donation is the one that takes the city to its goal. */
  fills: boolean;
  /** How much of this donation lands above the goal, in cents. */
  overCents: number;
}

/** How a city's bar would look with `amountCents` more in it. */
export function previewBar(
  city: Pick<CityMilestone, "raisedCents" | "goalCents">,
  amountCents: number,
): BarPreview {
  const goal = city.goalCents > 0 ? city.goalCents : 0;
  const before = Math.max(0, city.raisedCents);
  const amount = Math.max(0, amountCents);
  const totalCents = before + amount;
  if (goal === 0)
    return { raised: before > 0 ? 1 : 0, added: 0, totalCents, fills: false, overCents: amount };
  const raised = Math.min(1, before / goal);
  return {
    raised,
    added: Math.min(1 - raised, amount / goal),
    totalCents,
    fills: before < goal && totalCents >= goal,
    overCents: Math.max(0, totalCents - Math.max(goal, before)),
  };
}

// ---------------------------------------------------------------------------------------------
// the front page's ranking
// ---------------------------------------------------------------------------------------------

export interface Ranking {
  /**
   * Built, and funded in full by donations: they never leave the ranking. The most raised
   * first. A city built while short of its goal is not one of them.
   */
  built: CityMilestone[];
  /** Reached their goal and wait to be built, or are being built: the most funded first. */
  funded: CityMilestone[];
  /** Still collecting, the most funded first. */
  ranked: CityMilestone[];
  /** Whether anybody has given anything to a city that is not built yet. */
  anyRaised: boolean;
}

/**
 * Sorts the cities into the ones built with their goal reached, the ones that reached it and
 * wait, and the ones still collecting.
 */
export function rankCities(milestones: CityMilestone[]): Ranking {
  const byFunding = (a: CityMilestone, b: CityMilestone) =>
    b.raisedCents - a.raisedCents || a.name.localeCompare(b.name);
  const open = milestones.filter(selectable);
  return {
    built: milestones
      .filter((city) => city.status === "BUILT" && city.raisedCents >= city.goalCents)
      .sort(byFunding),
    funded: open
      .filter((city) => city.status === "FUNDED" || city.status === "BUILDING")
      .sort(byFunding),
    ranked: open.filter((city) => city.status === "PROPOSED").sort(byFunding),
    anyRaised: open.some((city) => city.raisedCents > 0),
  };
}

/** How many of the ranking's cities show before "show all": with the last card, three rows of three. */
export const RANKING_LIMIT = 8;
/** How many of the built cities show before their own "show all". */
export const BUILT_LIMIT = 6;

/** The cities nearest to being built: the funded ones, then the best funded. Never a built one. */
export function leading(ranking: Ranking, n: number): CityMilestone[] {
  return [...ranking.funded, ...ranking.ranked].slice(0, Math.max(n, 0));
}
