"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { activeStrings, type Locale } from "@/i18n";
import { readDonated } from "@/lib/donate";
import { replaceUrl } from "@/map/hash";

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

/**
 * Coming back from the checkout: thank the donor if they gave, and take the `donated` marker
 * out of the address (keeping the hash, so a shared view stays shared).
 */
export function useDonationReturn(): void {
  useEffect(() => {
    const { donated, search } = readDonated(window.location.search);
    if (donated === null) return;
    replaceUrl(window.location.pathname + search + window.location.hash);
    if (!donated) return;
    // A moment later: the toaster has to be listening, and the page should have appeared. The
    // timer is deliberately not cancelled on cleanup: the marker is already gone from the
    // address, so a second run of this effect (React's strict mode) would thank nobody.
    window.setTimeout(() => toast.success(activeStrings().donate.thanks), 700);
  }, []);
}
