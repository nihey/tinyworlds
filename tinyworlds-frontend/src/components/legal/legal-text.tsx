"use client";

import type { Locale } from "@/i18n/locale";
import { consentStore, GTM_ID } from "@/lib/consent";
import { legalParts, type LinkTarget } from "@/legal/parts";
import { CONTACT_EMAIL, CONTACT_URL, LICENSE_URL, ME_PATH, PRIVACY_URL, TERMS_URL } from "@/site";

/** A link in the legal texts' running text, on a sign. */
export const TEXT_LINK =
  "cursor-pointer rounded-sm font-medium text-paper underline decoration-taxi/60 underline-offset-[3px] outline-none hover:decoration-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]";

/** Where each target leads; the cookie settings are a button instead (below). */
const HREF: Record<Exclude<LinkTarget, "cookies">, (locale: Locale) => string> = {
  terms: () => TERMS_URL,
  privacy: () => PRIVACY_URL,
  me: () => ME_PATH,
  license: () => LICENSE_URL,
  odbl: () => "https://opendatacommons.org/licenses/odbl/",
  ccbysa: () => "https://creativecommons.org/licenses/by-sa/4.0/",
  stripe: () => "https://stripe.com/privacy",
  google: (locale) => `https://policies.google.com/privacy?hl=${locale}`,
};

const OWN: ReadonlySet<LinkTarget> = new Set(["terms", "privacy", "me"]);

/** One of the legal texts, with its links and the project's address made links. */
export function LegalText({ text, locale }: { text: string; locale: Locale }) {
  return legalParts(text).map((part, i) => {
    if (part.kind === "text") return part.text;
    if (part.kind === "email")
      return (
        <a key={i} href={CONTACT_URL} className={TEXT_LINK}>
          {CONTACT_EMAIL}
        </a>
      );
    if (part.to === "cookies")
      // the question is asked by Google's tags alone: with no container there is nothing to set
      return GTM_ID ? (
        <button key={i} type="button" onClick={() => consentStore.reopen()} className={TEXT_LINK}>
          {part.text}
        </button>
      ) : (
        part.text
      );
    const own = OWN.has(part.to);
    return (
      <a
        key={i}
        href={HREF[part.to](locale)}
        className={TEXT_LINK}
        {...(own ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      >
        {part.text}
      </a>
    );
  });
}
