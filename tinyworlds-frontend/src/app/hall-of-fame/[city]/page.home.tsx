import type { Metadata } from "next";
import { CityHall } from "@/components/hall/city-hall";
import { DICTIONARIES } from "@/i18n";
import { cityAtBuild, slugsAtBuild } from "@/lib/hall-build";
import { SITE_HOME_LOCALE } from "@/site";

// A city's hall of fame, at /hall-of-fame/<slug>/ of the front-page build only: one page for
// each city the API lists when the build runs, with its benefactors and their links baked
// into the HTML. A city named after the build has no page yet; the web server sends it to
// /hall-of-fame/?city=<slug>, which shows it all the same (deploy/nginx.conf).
const words = DICTIONARIES[SITE_HOME_LOCALE].hall;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/+$/, "");

/**
 * With no API to ask (a build on a machine without one), one page is still made, so the route
 * exists: the first city of the site, which fills itself in once it is open.
 */
const WITHOUT_AN_API = "new-york";

export const dynamicParams = false;

export async function generateStaticParams(): Promise<{ city: string }[]> {
  const slugs = await slugsAtBuild();
  return (slugs.length > 0 ? slugs : [WITHOUT_AN_API]).map((city) => ({ city }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: slug } = await params;
  const city = await cityAtBuild(slug);
  const title = city ? words.cityTitle.replace("{city}", city.name) : words.title;
  const description = city
    ? (city.status === "BUILT" ? words.cityBuilt : words.cityFunding).replace("{city}", city.name)
    : words.description;
  const url = site ? `${site}/hall-of-fame/${slug}/` : undefined;
  return {
    title,
    description,
    alternates: { canonical: url ?? null },
    openGraph: { title, description, url },
    twitter: { title, description },
  };
}

export default async function Page({ params }: { params: Promise<{ city: string }> }) {
  const { city } = await params;
  return <CityHall slug={city} initial={await cityAtBuild(city)} />;
}
