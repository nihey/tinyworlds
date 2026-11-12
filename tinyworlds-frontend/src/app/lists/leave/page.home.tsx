import type { Metadata } from "next";
import { LeavePage } from "@/components/lists/leave-page";
import { DICTIONARIES } from "@/i18n";
import { SITE_HOME_LOCALE } from "@/site";

// The page a mail's leave link opens, at /lists/leave/ of the front-page build only (see
// next.config.ts). The link's token is in the hash, which never reaches the server. Kept out of
// search engines and link previews, like "Your cities".
export const metadata: Metadata = {
  title: DICTIONARIES[SITE_HOME_LOCALE].lists.leave.title,
  description: null,
  robots: { index: false, follow: false },
  alternates: { canonical: null },
  openGraph: null,
  twitter: null,
};

export default function Page() {
  return <LeavePage />;
}
