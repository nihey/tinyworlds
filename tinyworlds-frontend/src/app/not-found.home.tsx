import type { Metadata } from "next";
import { NotFoundPage } from "@/components/home/not-found-page";
import { DICTIONARIES } from "@/i18n";
import { SITE_HOME_LOCALE } from "@/site";

// The front page's 404.html (front-page build only, see next.config.ts): the web server answers
// every address that leads nowhere with it (deploy/nginx.conf), keeping the 404. The page reads
// the address in the browser, so one file answers /tinyparis/ and /wp-admin/ alike.
export const metadata: Metadata = {
  title: DICTIONARIES[SITE_HOME_LOCALE].notFound.title,
  description: null,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function NotFound() {
  return <NotFoundPage />;
}
