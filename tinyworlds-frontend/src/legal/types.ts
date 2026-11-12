import type { Locale } from "@/i18n/locale";

/**
 * The terms of service and the privacy policy: long texts of the front page's build only, kept
 * here rather than in the interface's dictionaries so that no map downloads them.
 *
 * A text may hold links: `[words](target)` makes the words a link to one of `LINK_TARGETS`, and
 * `{email}` is the project's address, written out as a link (`parts.ts` reads them).
 */
export type LegalKind = "terms" | "privacy";

/** One point of a list: plain, or with a few words set apart in front ("Stripe,"). */
export type LegalItem = string | { term: string; text: string };

/** A paragraph, or a list. */
export type LegalBlock = string | { items: LegalItem[] };

export interface LegalSection {
  /** the section's anchor, the same in every language: "/privacy/#donate" */
  id: string;
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  /** the page's heading, and its title before " · tinyworlds" */
  title: string;
  /** what search engines and link previews show */
  description: string;
  /** the whole document in a few lines, above it */
  summary: string[];
  sections: LegalSection[];
}

export type LegalDocs = Record<Locale, LegalDoc>;
