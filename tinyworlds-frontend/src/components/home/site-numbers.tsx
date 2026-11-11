"use client";

import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { LIVE_SHOWN_ABOVE } from "@/lib/visits";

type Plural = { one: string; other: string };

/**
 * The site in a few figures, under the hero: how many worlds there are, every visit they have
 * had, how many are exploring now, and how many cities are being funded. The worlds are known
 * at once; each other figure takes its place when its number arrives and is left out if it
 * never does, or is nothing to tell (no visit yet, a handful exploring, no city to fund). The
 * strip is as tall from the first paint as it will be with all of them, so nothing below moves.
 */
export function SiteNumbers({
  worlds,
  totals,
  funding,
}: {
  worlds: number;
  /** every world's visits and those exploring now; null until the counts are there */
  totals: { visits: number; live: number } | null;
  /** the cities that can still be given to; null until the list is there */
  funding: number | null;
}) {
  const { t, locale } = useI18n();
  const number = new Intl.NumberFormat(locale);
  const rules = new Intl.PluralRules(locale);
  const word = (n: number, form: Plural) => (rules.select(n) === "one" ? form.one : form.other);
  const words = t.home.numbers;
  const figures: { key: string; figure: string; label: string; live?: boolean }[] = [
    { key: "worlds", figure: number.format(worlds), label: word(worlds, words.worlds) },
  ];
  if (totals && totals.visits > 0)
    figures.push({
      key: "visits",
      figure: number.format(totals.visits),
      label: word(totals.visits, words.visits),
    });
  if (totals && totals.live > LIVE_SHOWN_ABOVE)
    figures.push({
      key: "live",
      figure: number.format(totals.live),
      label: words.live,
      live: true,
    });
  if (funding !== null && funding > 0)
    figures.push({
      key: "funding",
      figure: number.format(funding),
      label: word(funding, words.funding),
    });
  return (
    <dl className="sign grid min-h-[148px] grid-cols-2 content-start overflow-hidden sm:min-h-[74px] sm:auto-cols-fr sm:grid-flow-col sm:grid-cols-none">
      {figures.map((item, i) => (
        <div
          key={item.key}
          className={cn(
            "flex h-[74px] flex-col-reverse justify-center border-sign-line px-5",
            // a line between neighbours: two to a row on a phone, all in a row from there
            i % 2 === 1 && "max-sm:border-l",
            i >= 2 && "max-sm:border-t",
            i > 0 && "sm:border-l",
          )}
        >
          <dt className="pt-1.5 text-xs leading-tight font-semibold text-paper-dim">
            {item.label}
          </dt>
          <dd className="flex items-center gap-2 text-[26px] leading-none font-semibold tracking-[-0.01em] text-paper tabular-nums">
            {item.live && (
              <span aria-hidden className="size-2 rounded-full bg-taxi motion-safe:animate-pulse" />
            )}
            {item.figure}
          </dd>
        </div>
      ))}
    </dl>
  );
}
