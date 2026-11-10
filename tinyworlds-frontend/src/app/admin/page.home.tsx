import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/admin-app";
import { DICTIONARIES } from "@/i18n";
import { SITE_HOME_LOCALE } from "@/site";

// The admin pages, at /admin/ of the front-page build only (a world's build has no such page:
// see next.config.ts). Nothing here is secret: the page is a sign-in form to anyone, and the
// numbers come from the API, which gives them to signed-in admins alone. Kept out of search
// engines and of link previews all the same.
export const metadata: Metadata = {
  title: DICTIONARIES[SITE_HOME_LOCALE].admin.title,
  description: null,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function Page() {
  return <AdminApp />;
}
