import type { Metadata } from "next";
import { HallOfFame } from "@/components/hall/hall-of-fame";
import { DICTIONARIES } from "@/i18n";
import { hallAtBuild } from "@/lib/hall-build";
import { SITE_HOME_LOCALE } from "@/site";

// The hall of fame, at /hall-of-fame/ of the front-page build only (see next.config.ts).
// Unlike /me/ and /admin/ it is a page for everyone, search engines included: the names and
// the links are baked into its HTML from what the API says when the page is built.
const words = DICTIONARIES[SITE_HOME_LOCALE].hall;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");
const url = site ? `${site}/hall-of-fame/` : undefined;

export const metadata: Metadata = {
  title: words.title,
  description: words.description,
  alternates: { canonical: url ?? null },
  openGraph: { title: words.title, description: words.description, url },
  twitter: { title: words.title, description: words.description },
};

export default async function Page() {
  return <HallOfFame initial={await hallAtBuild()} />;
}
