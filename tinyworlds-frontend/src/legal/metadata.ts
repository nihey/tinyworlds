import type { Metadata } from "next";
import { SITE_HOME_LOCALE } from "@/site";
import { LEGAL } from ".";
import type { LegalKind } from "./types";

/**
 * A legal page's title, description and address, in the home language (crawlers and link
 * previews do not run the page). A page for everyone, search engines included.
 */
export function legalMetadata(kind: LegalKind): Metadata {
  const doc = LEGAL[kind][SITE_HOME_LOCALE];
  const title = `${doc.title} · tinyworlds`;
  const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
  const url = site ? `${site}/${kind}/` : undefined;
  return {
    title,
    description: doc.description,
    alternates: { canonical: url ?? null },
    openGraph: { title, description: doc.description, url },
    twitter: { title, description: doc.description },
  };
}
