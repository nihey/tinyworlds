/**
 * What the page analytics hear about donating, besides page views (`components/analytics.tsx`
 * loads them). Every event goes to Google Tag Manager's data layer, where the container turns
 * it into a Google Analytics event. Rybbit hears the clicks from the declarative hooks on the
 * buttons themselves (`data-rybbit-event`), so it is told from here only about what no click
 * marks: coming back from the checkout, paid or not.
 *
 *   donate_open       the donate sign opened             world, city (the one it opened with)
 *   donate_checkout   a checkout was asked for           world, city, amount (US$, if chosen here)
 *   donate_cancelled  back from the checkout, unpaid     world, city, amount
 *   donate_complete   back from the checkout, paid       world, city, amount, value, currency
 *   explore_more      the way to the other places        world
 *
 * The checkout is another site, so what was chosen is kept in the tab's session storage on the
 * way out and read back on return (`rememberCheckout`, `takeCheckout`). Only a checkout opened
 * through the API comes back here; a plain payment link has its own page after paying.
 */

export type SiteEventName =
  | "donate_open"
  | "donate_checkout"
  | "donate_cancelled"
  | "donate_complete"
  | "explore_more"
  | "quiz_start";

export interface SiteEventProps {
  world: string;
  city?: string | null;
  /** whole US dollars */
  amount?: number | null;
}

/** Donations are in US dollars, whatever the visitor's language. */
export const CURRENCY = "USD";

export const CHECKOUT_KEY = "tinyworlds.checkout";

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type RybbitProps = Record<string, string | number>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    rybbit?: { event: (name: string, properties?: RybbitProps) => void };
  }
}

/**
 * The data-layer message for an event. Every key is always there, `undefined` when the event
 * has no such value: the data layer keeps what it was last told, and an event without a city
 * must not inherit the previous one's.
 */
export function eventMessage(name: SiteEventName, props: SiteEventProps) {
  const city = props.city || undefined;
  const amount = props.amount ?? undefined;
  const paid = name === "donate_complete" && amount !== undefined;
  return {
    event: name,
    world: props.world,
    city,
    amount,
    value: paid ? amount : undefined,
    currency: paid ? CURRENCY : undefined,
  };
}

/** The same event as Rybbit takes its properties: only those it has. */
export function rybbitProps(props: SiteEventProps): RybbitProps {
  const out: RybbitProps = { world: props.world };
  if (props.city) out.city = props.city;
  if (props.amount !== null && props.amount !== undefined) out.amount = props.amount;
  return out;
}

/** On the way to the checkout: what was chosen, for the page the donor comes back to. */
export function rememberCheckout(store: Store, props: SiteEventProps): void {
  try {
    store.setItem(CHECKOUT_KEY, JSON.stringify(props));
  } catch {
    // nowhere to keep it: the return is still counted, without the amount
  }
}

/** Back from the checkout: what was chosen on the way out (once), or null. */
export function takeCheckout(store: Store): SiteEventProps | null {
  try {
    const raw = store.getItem(CHECKOUT_KEY);
    store.removeItem(CHECKOUT_KEY);
    if (!raw) return null;
    const kept: unknown = JSON.parse(raw);
    if (!kept || typeof kept !== "object") return null;
    const { world, city, amount } = kept as Record<string, unknown>;
    if (typeof world !== "string") return null;
    return {
      world,
      city: typeof city === "string" ? city : null,
      amount: typeof amount === "number" && Number.isFinite(amount) ? amount : null,
    };
  } catch {
    return null;
  }
}

/** The tab's session storage, or null where it is blocked. */
export function sessionStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Rybbit's script may still be on its way when a page opens: wait for it a little. */
function whenRybbit(send: (rybbit: NonNullable<Window["rybbit"]>) => void, tries = 40): void {
  if (window.rybbit) return send(window.rybbit);
  if (tries > 0) window.setTimeout(() => whenRybbit(send, tries - 1), 250);
}

/**
 * Tells the page analytics about an event. Never fails and never waits: like the funnel, it is
 * not worth a visitor's time. `rybbit` also tells Rybbit, for an event no declarative hook
 * marks.
 */
export function siteEvent(
  name: SiteEventName,
  props: SiteEventProps,
  { rybbit = false }: { rybbit?: boolean } = {},
): void {
  if (typeof window === "undefined") return;
  try {
    (window.dataLayer = window.dataLayer || []).push(eventMessage(name, props));
  } catch {
    // a data layer something else broke: nothing to tell
  }
  if (rybbit) {
    whenRybbit((tracker) => {
      try {
        tracker.event(name, rybbitProps(props));
      } catch {
        // the tracker failed: the event is lost, the page is not
      }
    });
  }
}
