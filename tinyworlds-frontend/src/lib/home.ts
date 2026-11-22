import { fold } from "@/lib/city-picker";
import { byVisits, type WorldCounts } from "@/lib/visits";
import { HERO_FILMS, heroSlides } from "@/site";
import { WORLDS, type World } from "@/worlds";

/**
 * The front page's carousel and catalogue rules.
 */

/** How long the hero stays on a world before it moves on. */
export const SLIDE_MS = 8000;
/** How long one world's picture takes to give way to the next. */
export const FADE_MS = 600;

export type WorldFilter = "all" | "real" | "imagined";

/**
 * The worlds the hero goes round, in the page's order: those with a film, most visited first
 * by `ranked` (the registry's order without it). The page and its build ask the same, so the
 * picture the build gives a preview is the one the page opens on.
 */
export function heroOrder(
  ranked: WorldCounts | null,
  worlds: World[] = Object.values(WORLDS),
  films: string[] = HERO_FILMS,
): string[] {
  return heroSlides(
    byVisits(worlds, ranked).map((world) => world.id),
    films,
  );
}

/** Search the localized city names and world ID without changing the supplied visit order. */
export function filterWorlds(worlds: World[], filter: WorldFilter, query: string): World[] {
  const needle = fold(query);
  return worlds.filter((world) => {
    if (filter !== "all" && Boolean(world.fictional) !== (filter === "imagined")) return false;
    return (
      !needle ||
      fold(world.id).includes(needle) ||
      Object.values(world.copy).some(({ city }) => fold(city).includes(needle))
    );
  });
}

/** The slide `by` steps from `current`, going round at either end. */
export function stepSlide(current: number, by: number, count: number): number {
  if (!(count > 0)) return 0;
  return (((current + by) % count) + count) % count;
}

/** What the hero knows of the moment. */
export interface AdvanceState {
  /** how many worlds it shows */
  slides: number;
  /** the visitor asked for less motion */
  calm: boolean;
  /** or for less data */
  saveData: boolean;
  /** the page is behind another tab or window */
  hidden: boolean;
  /** the hero is on screen */
  inView: boolean;
  /** the pointer is on it */
  hovered: boolean;
  /** the focus is inside it */
  focused: boolean;
  /** the visitor has chosen a slide: the hero is theirs from then on */
  chosen: boolean;
}

/**
 * Whether the hero may move on by itself: only for someone who is watching it and has not
 * chosen a slide (nor is in the middle of choosing), and never for a visitor who asked for
 * less motion or less data. A choice by hand stops it for good: that is how a finger, which
 * has no hover, or a screen reader holds it, and what moves by itself can always be stopped.
 */
export function mayAdvance(state: AdvanceState): boolean {
  return (
    state.slides > 1 &&
    !state.calm &&
    !state.saveData &&
    !state.hidden &&
    state.inView &&
    !state.hovered &&
    !state.focused &&
    !state.chosen
  );
}

/**
 * Whether something is on screen, by what an `IntersectionObserver` just said. One delivery
 * can carry several entries (out of view and back in before the page got to listen): the last
 * is how things stand. Told nothing, it is as it `was`.
 */
export function lastSeen(entries: readonly { isIntersecting: boolean }[], was: boolean): boolean {
  return entries.at(-1)?.isIntersecting ?? was;
}
