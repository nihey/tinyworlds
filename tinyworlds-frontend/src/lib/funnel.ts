import type { Locale } from "@/i18n/locale";
import { hasAdminSession } from "./admin";
import { API_URL } from "./donate";

/**
 * The donation funnel, as the site reports it to the API: which steps towards a donation a
 * visit reached. A visit is one tab's stay on the site, named by an id made up here and kept
 * in the tab's session storage: it says nothing about who is visiting, is never written to a
 * cookie or kept between visits, and is gone when the tab closes.
 *
 * The site reports three steps (a page opened, the donate sign opened, a checkout given up);
 * the API notes a checkout's start itself, and knows a paid donation from Stripe.
 */

export type FunnelStep = "VISIT" | "DONATE_OPENED" | "CHECKOUT_STARTED" | "CHECKOUT_CANCELLED";

export const VISIT_KEY = "tinyworlds.visit";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * This tab's visit: the id it was given when it first asked, or a new one. Null when the tab
 * has nowhere to keep one (storage blocked): such a visit is not counted, rather than counted
 * once per page.
 */
export function visitId(store: Store, make: () => string): string | null {
  try {
    const known = store.getItem(VISIT_KEY);
    if (known && UUID.test(known)) return known;
    const fresh = make();
    store.setItem(VISIT_KEY, fresh);
    return fresh;
  } catch {
    return null;
  }
}

const TRACK = `mutation TrackFunnelStep($input: TrackFunnelStepInput!) { trackFunnelStep(input: $input) }`;

/** The GraphQL request that reports a step. */
export function stepRequest(
  visit: string,
  step: FunnelStep,
  world: string,
  locale: Locale,
): { query: string; variables: { input: Record<string, string> } } {
  return { query: TRACK, variables: { input: { visitId: visit, step, world, locale } } };
}

/** This tab's visit id, for a checkout to carry; null when visits are not being counted here. */
export function currentVisit(): string | null {
  if (!API_URL || typeof window === "undefined") return null;
  // not a visitor: an admin looking at their own site, or a browser driven by a program
  if (hasAdminSession() || navigator.webdriver) return null;
  try {
    return visitId(window.sessionStorage, () => crypto.randomUUID());
  } catch {
    return null;
  }
}

/** The steps this page has already reported. */
const reported = new Set<string>();

/**
 * Reports that this visit reached a step. Never waits and never fails: the funnel is not worth
 * a visitor's time. Plain `fetch`, so the map does not carry Apollo for it, and `keepalive`,
 * so a step taken on the way out of the page (to a checkout) still arrives.
 */
export function trackStep(step: FunnelStep, world: string, locale: Locale): void {
  const visit = currentVisit();
  if (!visit) return;
  // once per page: the API keeps a step once per visit and world, so saying it again is noise
  const said = `${visit}|${step}|${world}`;
  if (reported.has(said)) return;
  reported.add(said);
  try {
    void fetch(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(stepRequest(visit, step, world, locale)),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // no fetch, or an address it cannot use: nothing to report to
  }
}
