"use client";

import { UserRound } from "lucide-react";
import { useState, type ReactNode } from "react";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { LegalLinks } from "@/components/legal/legal-links";
import { Wordmark } from "@/components/map/wordmark";
import { FOG_LINK } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage, useDonationReturn, useFunnelVisit } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import { API_URL, paymentLinkFor } from "@/lib/donate";
import { HOME_URL, ME_PATH, SITE_ID } from "@/site";

/**
 * What every page of the hall of fame stands in: the site's name (the way back to the front
 * page), the way to "Your cities", the page's language, title and theme, a footer with the
 * terms and the privacy policy, and the donate sign,
 * which the page opens for a city or for none. `children` is given the means to open it, or
 * nothing where donations are not taken.
 */
export function HallFrame({
  title,
  children,
}: {
  /** the document's title, in the visitor's language */
  title: string;
  children: (donate: ((city: string | null) => void) | undefined) => ReactNode;
}) {
  const { t, locale } = useI18n();
  const [prefs] = usePrefs();
  useTheme(prefs.theme);
  useDocumentLanguage(locale, title);
  // a checkout started here comes back here
  useDonationReturn();
  useFunnelVisit();
  // null: closed; otherwise open, with the city it was opened for (or none)
  const [donate, setDonate] = useState<{ city: string | null } | null>(null);
  const takesDonations = API_URL !== "" || paymentLinkFor(locale, SITE_ID) !== null;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <a
          href={HOME_URL}
          aria-label={t.admin.frontPage}
          className="rounded-sm text-[#15171a] outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)] dusk:text-paper"
        >
          <Wordmark plain className="text-4xl" />
        </a>
        {API_URL !== "" && (
          <a
            href={ME_PATH}
            className="sign inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold text-paper transition-colors outline-none hover:text-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
          >
            <UserRound aria-hidden className="size-4" strokeWidth={2.25} />
            {t.home.yourCities}
          </a>
        )}
      </div>

      {children(takesDonations ? (city) => setDonate({ city }) : undefined)}

      <footer className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 text-xs leading-relaxed">
        <LegalLinks className={FOG_LINK} cookies />
      </footer>

      {takesDonations && (
        <DonateDialog
          open={donate !== null}
          onOpenChange={(open) => !open && setDonate(null)}
          city={donate?.city ?? null}
        />
      )}
    </main>
  );
}
