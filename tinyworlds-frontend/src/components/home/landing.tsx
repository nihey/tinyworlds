"use client";

import { ArrowUpRight, Code, Heart } from "lucide-react";
import { useState } from "react";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { MilestoneBar } from "@/components/donate/milestone-bar";
import { Wordmark } from "@/components/map/wordmark";
import { useI18n } from "@/hooks/use-i18n";
import { useMilestones } from "@/hooks/use-milestones";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage, useDonationReturn } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import { API_URL, CITY_LIMIT, paymentLinkFor, selectable } from "@/lib/donate";
import { GITHUB_URL, SITE_ID, worldCardUrl, worldUrl } from "@/site";
import { WORLDS } from "@/worlds";

const HEADING =
  "pb-3 text-[11px] font-semibold tracking-[0.16em] uppercase text-[#15171a]/70 dusk:text-paper-dim";

const ACTION =
  "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-taxi px-5 text-[15px] font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98]";

/** The front page: what this is, the cities there are, the ones coming, and where the code lives. */
export function Landing() {
  const { t, locale } = useI18n();
  const [prefs] = usePrefs();
  useTheme(prefs.theme);
  useDocumentLanguage(locale, t.home.title);
  useDonationReturn();

  const [donateOpen, setDonateOpen] = useState(false);
  const milestones = useMilestones();
  const withList = API_URL !== "" && milestones.state !== "failed";
  const takesDonations = API_URL !== "" || paymentLinkFor(locale, SITE_ID) !== null;
  const next = milestones.cities.filter(selectable).slice(0, CITY_LIMIT);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-10 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:gap-12 sm:px-6 sm:pt-8">
      <header className="sign overflow-hidden">
        <div aria-hidden className="h-[3px] bg-taxi" />
        <div className="px-5 py-8 sm:px-10 sm:py-12">
          <h1>
            <Wordmark className="text-[clamp(3rem,13vw,5.5rem)]" />
          </h1>
          <p className="pt-3 text-xl font-semibold text-paper sm:text-2xl">{t.home.tagline}</p>
          <p className="max-w-2xl pt-2 text-[15px] leading-relaxed text-paper-dim sm:text-base">
            {t.home.pitch}
          </p>
        </div>
      </header>

      <section aria-labelledby="cities">
        <h2 id="cities" className={HEADING}>
          {t.home.cities}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {Object.values(WORLDS).map((world) => {
            const copy = world.copy[locale];
            return (
              <li key={world.id}>
                <a
                  href={worldUrl(world.id)}
                  className="group sign block h-full overflow-hidden transition-transform outline-none hover:-translate-y-0.5 focus-visible:shadow-[0_0_0_3px_var(--taxi)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a plain file from another build's folder */}
                  <img
                    src={worldCardUrl(world.id)}
                    alt={copy.cardAlt}
                    width={1200}
                    height={630}
                    loading="lazy"
                    decoding="async"
                    className="block aspect-[1200/630] h-auto w-full bg-sign-raised object-cover"
                  />
                  <div className="flex items-start gap-3 px-4 py-3.5">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg leading-tight font-semibold text-paper">
                        {copy.city}
                      </h3>
                      <p className="pt-1 text-sm leading-snug text-paper-dim">{copy.card}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 pt-0.5">
                      <Wordmark
                        suffix={world.wordmark}
                        accent={world.accent.color}
                        className="text-xl"
                      />
                      <ArrowUpRight
                        aria-hidden
                        className="size-4 text-paper-dim transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                        strokeWidth={2.25}
                      />
                    </span>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      </section>

      {takesDonations && (
        <section aria-labelledby="next">
          <h2 id="next" className={HEADING}>
            {t.home.next}
          </h2>
          <div className="sign px-5 py-5 sm:px-6">
            <p className="max-w-2xl text-[15px] leading-relaxed text-paper">
              {withList ? t.donate.goal : t.home.nextPitch}
            </p>
            {withList && milestones.state === "loading" && (
              <p role="status" className="pt-4 text-sm text-paper-dim">
                {t.donate.loading}
              </p>
            )}
            {withList && next.length > 0 && (
              <ul className="grid gap-x-8 gap-y-4 pt-5 sm:grid-cols-2">
                {next.map((city) => (
                  <li key={city.id} className="flex">
                    <MilestoneBar city={city} locale={locale} t={t} />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setDonateOpen(true)}
              data-rybbit-event="donate_open"
              data-rybbit-prop-world={SITE_ID}
              className={`${ACTION} mt-5`}
            >
              <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
              {t.donate.action}
            </button>
          </div>
        </section>
      )}

      <section aria-labelledby="open-source">
        <h2 id="open-source" className={HEADING}>
          {t.home.openSource}
        </h2>
        <div className="sign px-5 py-5 sm:px-6">
          <p className="max-w-2xl text-[15px] leading-relaxed text-paper">
            {t.home.openSourceBody}
          </p>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-full border border-paper/25 px-5 text-[15px] font-semibold text-paper transition-colors outline-none hover:border-taxi hover:text-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
          >
            <Code aria-hidden className="size-4" strokeWidth={2.5} />
            {t.home.github}
            <ArrowUpRight aria-hidden className="size-4 opacity-70" strokeWidth={2.25} />
          </a>
        </div>
      </section>

      <footer className="mt-auto pt-2 text-xs leading-relaxed text-[#15171a]/65 dusk:text-paper-dim">
        {t.home.credits}
      </footer>

      {takesDonations && <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} />}
    </main>
  );
}
