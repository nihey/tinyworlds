import type { Locale } from "@/i18n/locale";
import { DEFAULT_WORLD, HOME, IS_HOME, WORLD, WORLDS } from "@/worlds";

/**
 * What this build is, whichever it is: one world's map, or the front page that lists the worlds.
 * Anything that is not about the map itself (settings, language, analytics, donations) asks here
 * rather than asking the world, so it works on the front page too.
 */

/** "tinynyc", or "home": the settings namespace, and who a donation or an event is credited to. */
export const SITE_ID = IS_HOME ? HOME : WORLD.id;

/** The name on the sign. */
export const SITE_NAME = IS_HOME ? "tinyworlds" : `tiny${WORLD.wordmark}`;

/** The half of the wordmark after "tiny". */
export const SITE_WORDMARK = IS_HOME ? "worlds" : WORLD.wordmark;

/** The language baked into the HTML, shown until the visitor's own is known. */
export const SITE_HOME_LOCALE: Locale = IS_HOME ? "en-US" : WORLD.homeLocale;

/** The brand colour (--taxi) and the ink that reads on it. The front page keeps the stylesheet's taxi yellow. */
export const SITE_ACCENT = IS_HOME ? { color: "#f7c21b", ink: "#1a1503" } : WORLD.accent;

/**
 * The places that are already worlds of this site, under every name they go by in the languages
 * the interface speaks (the English one first): nothing left to fund there.
 */
export const BUILT_CITIES: string[] = Object.values(WORLDS).flatMap((world) => [
  ...new Set([world.copy["en-US"].city, ...Object.values(world.copy).map((copy) => copy.city)]),
]);

/** The project's source. */
export const GITHUB_URL = "https://github.com/nihey/tinyworlds";

/** Where to write about the project: questions, ideas, a city someone wants to see. */
export const CONTACT_EMAIL = "me@nihey.org";
export const CONTACT_URL = `mailto:${CONTACT_EMAIL}`;

const trimmed = (value: string | undefined) => (value ?? "").trim().replace(/\/+$/, "");

/** Where the front page is, from inside a world. */
export const HOME_URL = (process.env.NEXT_PUBLIC_HOME_URL ?? "").trim() || "/";

/** What the worlds' folders hang from: "" when they sit at the root, as "/tinynyc/". */
export const WORLDS_BASE = trimmed(process.env.NEXT_PUBLIC_WORLDS_BASE);

/**
 * For local development only: where the share cards are when no world is deployed beside the
 * front page ("/og", which is public/og/). Unset in production.
 */
export const CARDS_BASE = trimmed(process.env.NEXT_PUBLIC_CARDS_BASE);

/** A world's own address. */
export const worldUrl = (id: string, base = WORLDS_BASE): string => `${base}/${id}/`;

/** A world's share card, which doubles as its picture on the front page: it is served from the world's own folder. */
export const worldCardUrl = (id: string, base = WORLDS_BASE, cards = CARDS_BASE): string =>
  cards ? `${cards}/${id}.jpg` : `${base}/${id}/og/${id}.jpg`;

/** The sub-path this build is served under: empty for the front page at the site's root. */
const BASE_PATH = trimmed(process.env.NEXT_PUBLIC_BASE_PATH);

/**
 * The front page's moving pictures (public/loops/, made by tinyworlds-videos). Unlike the share
 * cards they are the front page's own files: only its build needs deploying for them to show.
 */
export const LOOPS_BASE = `${BASE_PATH}/loops`;

/** A world's card loop: its share card's picture, drifting. Silent, a few hundred kB. */
export const worldLoopUrl = (id: string, base = LOOPS_BASE): string => `${base}/${id}.mp4`;

/** The admin pages: part of the front page's build, linked only for an admin who is signed in. */
export const ADMIN_PATH = `${BASE_PATH}/admin/`;

/** The front page's own share card (public/og/tinyworlds.jpg, made by the pipeline's `home-card`). */
export const HOME_CARD_PATH = `${BASE_PATH}/og/tinyworlds.jpg`;

/** The picture at the top of the front page: a slow lap over one world, and that lap's first frame. */
export const HERO = {
  world: DEFAULT_WORLD,
  loop: `${LOOPS_BASE}/hero.mp4`,
  still: `${LOOPS_BASE}/hero.jpg`,
} as const;
