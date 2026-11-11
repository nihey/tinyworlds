"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { activeLocale, activeStrings, type Locale } from "@/i18n";
import { API_URL, readDonated } from "@/lib/donate";
import { trackStep } from "@/lib/funnel";
import { sessionStore, siteEvent, takeCheckout } from "@/lib/site-events";
import { documentPage, everyWhileShown, PRESENCE_EVERY_MS, trackPresence } from "@/lib/visits";
import { replaceUrl } from "@/map/hash";
import { ME_URL, SITE_ID } from "@/site";

/**
 * The HTML is baked in the site's home language; once the visitor's own is known the document
 * says so too: `<html lang>` for screen readers and hyphenation, the title for the tab.
 *
 * The title has to be defended: the framework owns the <title> element and writes the baked-in
 * one back when its metadata settles, after this has run. So the head is watched, and the title
 * put right whenever it changes to something else.
 */
export function useDocumentLanguage(locale: Locale, title: string): void {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    const apply = () => {
      if (document.title !== title) document.title = title;
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);
}

/** Runs `fn` once the page has finished loading (at once if it has). */
function afterLoad(fn: () => void): void {
  if (document.readyState === "complete") fn();
  else window.addEventListener("load", fn, { once: true });
}

/**
 * Coming back from the checkout: thank the donor if they gave, and take the `donated` marker
 * out of the address (keeping the hash, so a shared view stays shared).
 */
export function useDonationReturn(): void {
  useEffect(() => {
    const { donated, search } = readDonated(window.location.search);
    if (donated === null) return;
    replaceUrl(window.location.pathname + search + window.location.hash);
    // what was chosen on the way out, for the page analytics: once the page has loaded, so the
    // trackers are there to hear it
    const store = sessionStore();
    const chosen = { ...(store ? takeCheckout(store) : null), world: SITE_ID };
    afterLoad(() =>
      siteEvent(donated ? "donate_complete" : "donate_cancelled", chosen, { rybbit: true }),
    );
    if (!donated) {
      // gave the checkout up: a step of the donation funnel (the API knows the paid ones itself)
      trackStep("CHECKOUT_CANCELLED", SITE_ID, activeLocale());
      return;
    }
    // A moment later: the toaster has to be listening, and the page should have appeared. The
    // timer is deliberately not cancelled on cleanup: the marker is already gone from the
    // address, so a second run of this effect (React's strict mode) would thank nobody.
    window.setTimeout(() => {
      const t = activeStrings();
      toast.success(t.donate.thanks, {
        // to the donor's own page; with no API there is nobody to sign in to
        action:
          API_URL === ""
            ? undefined
            : { label: t.donate.seeYourPlace, onClick: () => location.assign(ME_URL) },
      });
    }, 700);
  }, []);
}

/**
 * A page of the site was opened: the first step of the donation funnel, and what the count of
 * each city's visits is made of. Once per page; the API keeps one per visit and world.
 */
export function useFunnelVisit(): void {
  useEffect(() => {
    trackStep("VISIT", SITE_ID, activeLocale());
  }, []);
}

/**
 * A map is open: every half minute while it is in view, it tells the API its visit is still
 * there, which is what "exploring now" on the front page's cards counts. The VISIT step has
 * already said so as the page opened.
 */
export function usePresence(): void {
  useEffect(() => {
    if (!API_URL) return;
    return everyWhileShown(
      () => trackPresence(SITE_ID, activeLocale()),
      PRESENCE_EVERY_MS,
      documentPage(),
    );
  }, []);
}
