import { tinycos } from "./tinycos";
import { tinycvg } from "./tinycvg";
import { tinydal } from "./tinydal";
import { tinyfte } from "./tinyfte";
import { tinykingslanding } from "./tinykingslanding";
import { tinylas } from "./tinylas";
import { tinylax } from "./tinylax";
import { tinynyc } from "./tinynyc";
import { tinyphl } from "./tinyphl";
import { tinypit } from "./tinypit";
import { tinyorl } from "./tinyorl";
import { tinyrao } from "./tinyrao";
import { tinytkf } from "./tinytkf";
import { tinyvlc } from "./tinyvlc";
import { tinywesteros } from "./tinywesteros";
import { tinywinterfell } from "./tinywinterfell";
import type { World } from "./types";

export type { World, WorldCopy } from "./types";

/**
 * Every world there is, in the order the front page shows them. Adding a city to the site is
 * adding it here (and building it): the front page, the build check and the tests follow.
 */
export const WORLDS: Record<string, World> = {
  tinynyc,
  tinyrao,
  tinyorl,
  tinyfte,
  tinyvlc,
  tinylas,
  tinylax,
  tinydal,
  tinycvg,
  tinypit,
  tinyphl,
  tinycos,
  tinytkf,
  tinywinterfell,
  tinykingslanding,
  tinywesteros,
};
export const DEFAULT_WORLD = "tinynyc";

/** Not a world: the build of the front page that lists them. */
export const HOME = "home";

/** Picks a world by id; an unknown id is a configuration mistake and stops the build. */
export function resolveWorld(id: string | undefined): World {
  const key = id?.trim() || DEFAULT_WORLD;
  const world = WORLDS[key];
  if (!world) {
    throw new Error(
      `NEXT_PUBLIC_WORLD="${key}" is not a world this viewer knows. Known: ${Object.keys(WORLDS).join(", ")}, or "${HOME}" for the front page.`,
    );
  }
  return world;
}

// One build, one target: NEXT_PUBLIC_WORLD is inlined at build time (the reference must stay
// literal for that to happen).
const target = process.env.NEXT_PUBLIC_WORLD?.trim() || DEFAULT_WORLD;

/** This build is the front page, not a map. */
export const IS_HOME = target === HOME;

/**
 * The world this build is for. The front-page build has none of its own: there this is the
 * default world, which nothing on that page shows (see src/site.ts for what the page is).
 */
export const WORLD: World = resolveWorld(IS_HOME ? DEFAULT_WORLD : target);
