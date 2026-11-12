"use client";

import { LegalLinks } from "@/components/legal/legal-links";
import { LegalText } from "@/components/legal/legal-text";
import { Wordmark } from "@/components/map/wordmark";
import { FOG_LINK } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import type { Locale } from "@/i18n/locale";
import type { LegalBlock, LegalDocs, LegalItem, LegalKind } from "@/legal/types";
import { LEGAL_UPDATED, updatedOn } from "@/legal/updated";
import { CONTACT_EMAIL, CONTACT_URL, HOME_URL } from "@/site";

/** A list's square bullet, in the accent: a pixel, like the rest of the site. */
const BULLET =
  "relative pl-5 before:absolute before:top-[0.7em] before:left-0.5 before:size-1.5 before:bg-taxi";

/** the page's own sections, down the side: on the fog */
const CONTENTS_LINK =
  "block rounded-sm py-0.5 text-[#15171a]/70 outline-none hover:text-[#15171a] focus-visible:underline focus-visible:underline-offset-4 dusk:text-paper-dim dusk:hover:text-paper";

function Item({ item, locale }: { item: LegalItem; locale: Locale }) {
  if (typeof item === "string") return <LegalText text={item} locale={locale} />;
  return (
    <>
      <strong className="font-semibold text-paper">{item.term}</strong>{" "}
      <LegalText text={item.text} locale={locale} />
    </>
  );
}

function Block({ block, locale }: { block: LegalBlock; locale: Locale }) {
  if (typeof block === "string")
    return (
      <p>
        <LegalText text={block} locale={locale} />
      </p>
    );
  return (
    <ul className="space-y-2">
      {block.items.map((item, i) => (
        <li key={i} className={BULLET}>
          <Item item={item} locale={locale} />
        </li>
      ))}
    </ul>
  );
}

/**
 * The terms of service or the privacy policy, in the visitor's language: its title and date on
 * the fog, the list of its sections beside it (from `lg`), and the text on one long sign, with
 * the few lines that sum it up first. Baked in the home language, like every page, and asks
 * nothing of the API.
 */
export function LegalPage({ kind, docs }: { kind: LegalKind; docs: LegalDocs }) {
  const { t, locale } = useI18n();
  const [prefs] = usePrefs();
  useTheme(prefs.theme);
  const doc = docs[locale];
  useDocumentLanguage(locale, `${doc.title} · tinyworlds`);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-8 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8">
      <div>
        <a
          href={HOME_URL}
          aria-label={t.admin.frontPage}
          className="inline-block rounded-sm text-[#15171a] outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)] dusk:text-paper"
        >
          <Wordmark plain className="text-4xl" />
        </a>
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_13rem] lg:items-start">
        <article aria-labelledby="legal-title" className="min-w-0">
          <header className="pb-5">
            <h1
              id="legal-title"
              className="text-[32px] leading-tight font-semibold tracking-[-0.01em] text-[#15171a] dusk:text-paper"
            >
              {doc.title}
            </h1>
            <p className="pt-1.5 text-sm text-[#15171a]/70 dusk:text-paper-dim">
              {t.legal.updated.replace("{date}", updatedOn(LEGAL_UPDATED, locale))}
            </p>
          </header>

          <div className="sign px-5 py-6 text-[15px] leading-7 text-paper/80 sm:px-8 sm:py-8">
            <section
              aria-labelledby="legal-summary"
              className="rounded-lg border border-sign-line bg-sign-raised px-4 py-4 sm:px-5"
            >
              <h2
                id="legal-summary"
                className="pb-2 text-xs font-semibold tracking-[0.08em] text-taxi uppercase"
              >
                {t.legal.summary}
              </h2>
              <ul className="space-y-2 leading-6 text-paper">
                {doc.summary.map((line, i) => (
                  <li key={i} className={BULLET}>
                    <LegalText text={line} locale={locale} />
                  </li>
                ))}
              </ul>
            </section>

            {doc.sections.map((section, i) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-title`}
                className="scroll-mt-6 space-y-4 pt-9"
              >
                <h2
                  id={`${section.id}-title`}
                  className="flex items-baseline gap-3 text-[19px] leading-snug font-semibold text-paper"
                >
                  <span
                    aria-hidden
                    className="w-6 shrink-0 font-pixel text-[22px] leading-none text-taxi tabular-nums"
                  >
                    {i + 1}
                  </span>
                  {section.title}
                </h2>
                {section.blocks.map((block, j) => (
                  <Block key={j} block={block} locale={locale} />
                ))}
              </section>
            ))}
          </div>
        </article>

        {/* beside the text from lg, where it stays in view; below it, a phone has the text alone */}
        <nav
          aria-label={t.legal.contents}
          className="hidden lg:sticky lg:top-8 lg:block lg:pt-[5.25rem]"
        >
          <p className="pb-2 text-xs font-semibold tracking-[0.08em] text-[#15171a]/60 uppercase dusk:text-paper-dim">
            {t.legal.contents}
          </p>
          <ol className="text-sm leading-snug">
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={CONTENTS_LINK}>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      <footer className="mt-auto flex flex-wrap gap-x-4 gap-y-1.5 text-xs leading-relaxed text-[#15171a]/65 dusk:text-paper-dim">
        <LegalLinks className={FOG_LINK} current={kind} cookies />
        <a href={CONTACT_URL} className={FOG_LINK}>
          {CONTACT_EMAIL}
        </a>
      </footer>
    </main>
  );
}
