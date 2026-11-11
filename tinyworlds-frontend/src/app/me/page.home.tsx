import type { Metadata } from "next";
import { MeApp } from "@/components/me/me-app";
import { DICTIONARIES } from "@/i18n";
import { SITE_HOME_LOCALE } from "@/site";

// "Your cities", at /me/ of the front-page build only (see next.config.ts). Nothing here is
// secret: the page is a sign-in form to anyone, and the giving comes from the API, which shows
// it to the signed-in donor alone. Kept out of search engines and link previews all the same.
export const metadata: Metadata = {
  title: DICTIONARIES[SITE_HOME_LOCALE].me.title,
  description: null,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function Page() {
  return <MeApp />;
}
