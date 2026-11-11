/**
 * Consent for Google's tags (Tag Manager, and the Google Analytics it runs), which set cookies;
 * nothing else on the site does. The rule:
 *
 * - A visitor who said no, anywhere, is never sent Google's tags again; one who said yes is.
 * - A visitor who has not said is asked first when they are probably in Europe (by the browser's
 *   time zone: the site is static and knows nothing else about where a visitor is), and until
 *   they answer nothing from Google loads. Anyone else gets Google's tags at once.
 * - Behind that, Google's own consent defaults deny cookies to visitors its tags place in the
 *   EU, the EEA, the UK or Switzerland, for anyone the time zone missed.
 *
 * The answer is kept in local storage (`tinyworlds.consent`), which every world shares, and can
 * be changed from "Cookie settings" (About in a map, the front page's footer). Rybbit and the
 * site's own funnel set no cookies and are not affected.
 */

export type Consent = "granted" | "denied";

export const CONSENT_KEY = "tinyworlds.consent";

/** The container, from the build environment; empty: no Google tags, nothing to consent to. */
export const GTM_ID = (process.env.NEXT_PUBLIC_GTM_ID ?? "").trim();

/** Where Google's tags deny cookies until told otherwise: the EU, the rest of the EEA, the UK, Switzerland. */
export const CONSENT_REGIONS = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
  "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
  "IS", "LI", "NO", "GB", "CH",
]; // prettier-ignore

/** European time zones outside `Europe/`: the Canaries, Madeira, the Azores, Iceland, Cyprus, Ceuta, Svalbard. */
const ALSO_EUROPE = new Set([
  "Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Azores", "Atlantic/Reykjavik",
  "Atlantic/Faroe", "Atlantic/Jan_Mayen", "Arctic/Longyearbyen", "Asia/Nicosia",
  "Asia/Famagusta", "Africa/Ceuta", "WET", "CET", "MET", "EET", "GB", "GB-Eire", "Eire",
  "Iceland", "Portugal", "Poland",
]); // prettier-ignore

/**
 * Whether a visitor in this time zone is asked before Google's tags load: anywhere in Europe,
 * and also when the browser hides its zone (no answer, or UTC, as privacy-minded browsers say).
 * Asking someone outside Europe costs a click; not asking someone inside it is the wrong way round.
 */
export function asksFirst(timeZone: string | undefined | null): boolean {
  if (!timeZone) return true;
  if (timeZone === "UTC" || timeZone.startsWith("Etc/")) return true;
  return timeZone.startsWith("Europe/") || ALSO_EUROPE.has(timeZone);
}

/** Whether Google's tags may load, given the answer so far and whether the visitor is asked first. */
export function mayLoad(choice: Consent | null, asks: boolean): boolean {
  return choice === "granted" || (choice === null && !asks);
}

/** Whether the question is up: never before the browser knows, then until it is answered. */
export function bannerShown(state: {
  ready: boolean;
  choice: Consent | null;
  asks: boolean;
  reopened: boolean;
}): boolean {
  return state.ready && (state.reopened || (state.choice === null && state.asks));
}

type Store = Pick<Storage, "getItem" | "setItem">;

/** The answer kept in this browser, or null. */
export function readConsent(store: Store): Consent | null {
  try {
    const value = store.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(store: Store, choice: Consent): void {
  try {
    store.setItem(CONSENT_KEY, choice);
  } catch {
    // nowhere to keep it: the answer holds for this page only
  }
}

/**
 * The first commands of the data layer, before anything else in it: Google's consent defaults
 * (cookies denied in `CONSENT_REGIONS`, allowed elsewhere; never anything for ads, which the
 * site has none of), the visitor's own yes when they gave one, and the container's start.
 */
export function startCommands(granted: boolean, now: Date): unknown[][] {
  const noAds = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  return [
    ["consent", "default", { ...noAds, analytics_storage: "denied", region: CONSENT_REGIONS }],
    ["consent", "default", { ...noAds, analytics_storage: "granted" }],
    ...(granted ? [["consent", "update", { analytics_storage: "granted" }]] : []),
    ["js", now],
  ];
}

/**
 * The cookie names and domains to clear when a visitor takes their yes back: Google Analytics'
 * `_ga` and `_ga_<stream>`, on the page's host and every domain above it (Analytics writes them
 * on the highest one it may).
 */
export function cookiesToClear(
  cookie: string,
  hostname: string,
): { name: string; domain: string }[] {
  const names = cookie
    .split(";")
    .map((part) => part.split("=")[0].trim())
    .filter((name) => name === "_ga" || name.startsWith("_ga_"));
  const parts = hostname.split(".");
  const domains = parts.slice(0, -1).map((_, i) => parts.slice(i).join("."));
  return names.flatMap((name) => [
    { name, domain: "" },
    ...domains.map((domain) => ({ name, domain: `.${domain}` })),
  ]);
}

// ---- the browser side --------------------------------------------------------------------------

export interface ConsentState {
  /** known in the browser; false while the page is prerendered or hydrating, when nothing loads */
  ready: boolean;
  /** what this visitor said, if anything */
  choice: Consent | null;
  /** asked before Google's tags load */
  asks: boolean;
  /** the banner is up because the visitor asked to change their answer */
  reopened: boolean;
}

const SERVER_STATE: ConsentState = { ready: false, choice: null, asks: true, reopened: false };

let state: ConsentState | null = null;
const listeners = new Set<() => void>();

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function zone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

function current(): ConsentState {
  if (!state) {
    const store = storage();
    state = {
      ready: true,
      choice: store ? readConsent(store) : null,
      asks: asksFirst(zone()),
      reopened: false,
    };
  }
  return state;
}

function set(next: ConsentState): void {
  state = next;
  for (const listener of listeners) listener();
}

/** The visitor's consent, as an external store for React (nothing is asked on the server). */
export const consentStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot: current,
  getServerSnapshot: (): ConsentState => SERVER_STATE,
  /** The visitor answered. A no takes back an earlier yes on this page too. */
  answer(choice: Consent): void {
    const store = storage();
    if (store) writeConsent(store, choice);
    if (choice === "denied") withdraw();
    set({ ...current(), choice, reopened: false });
  },
  /** "Cookie settings": put the question up again. */
  reopen(): void {
    set({ ...current(), reopened: true });
  },
};

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

let loaded = false;

/** A command as Google's queue wants it: an `arguments` object, which it tells from an event. */
function argumentsOf(...command: unknown[]): IArguments {
  void command;
  // eslint-disable-next-line prefer-rest-params
  return arguments;
}

/**
 * Loads the Tag Manager container, once. The consent commands go to the front of the data layer,
 * ahead of any event the page has already pushed, so the container reads them first.
 */
export function loadTagManager(id: string, granted: boolean): void {
  if (loaded || !id || typeof window === "undefined") return;
  loaded = true;
  const layer = (window.dataLayer = window.dataLayer || []);
  layer.unshift(...startCommands(granted, new Date()).map((command) => argumentsOf(...command)));
  window.gtag = function () {
    // eslint-disable-next-line prefer-rest-params
    layer.push(arguments);
  };
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

/** A yes taken back: tell the tags already running, and remove the cookies they set. */
function withdraw(): void {
  try {
    window.gtag?.("consent", "update", { analytics_storage: "denied" });
    for (const { name, domain } of cookiesToClear(document.cookie, location.hostname)) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain ? `; domain=${domain}` : ""}`;
    }
  } catch {
    // nothing running, or no cookies to reach: nothing to take back
  }
}
