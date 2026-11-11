import { PartyPopper } from "lucide-react";
import type { Locale, Strings } from "@/i18n";
import { STONE_CENTS, stonePreview } from "@/lib/benefactors";
import { previewBar, withGoal } from "@/lib/city-picker";
import { formatUsd, type CityMilestone } from "@/lib/donate";

interface FundingPreviewProps {
  /** the chosen city as it stands; a city nobody has given to yet stands at zero */
  city: Pick<CityMilestone, "name" | "raisedCents" | "goalCents">;
  /** nobody has given to it yet: it is not on the list */
  isNew: boolean;
  /** the city is already built: a gift goes to its upkeep, and may still lay its last stones */
  built?: boolean;
  amountCents: number;
  locale: Locale;
  t: Strings;
}

/**
 * The chosen city's bar with the donation about to be made already in it: what is there in the
 * solid colour, what this adds in stripes. It moves as the city or the amount changes.
 */
export function FundingPreview({
  city,
  isNew,
  built = false,
  amountCents,
  locale,
  t,
}: FundingPreviewProps) {
  const bar = previewBar(city, amountCents);
  const stones = stonePreview(city.raisedCents, city.goalCents, amountCents);
  // a built city with every stone laid has nothing left to fill: the gift keeps it running
  const upkeep = built && stones === null && city.raisedCents >= city.goalCents;
  const stonesLine = stones
    ? (stones.from === stones.to ? t.donate.stones.one : t.donate.stones.other)
        .replace("{from}", String(stones.from))
        .replace("{to}", String(stones.to))
        .replace("{city}", city.name)
        .replace("{count}", String(Math.ceil(city.goalCents / STONE_CENTS)))
    : null;
  const [before, after] = t.donate.preview
    .replace("{raised}", formatUsd(city.raisedCents, locale))
    .replace("{goal}", formatUsd(city.goalCents, locale))
    .split("{added}");
  const added = formatUsd(amountCents, locale);
  const text = `${before}${added}${after ?? ""}`;
  return (
    <div className="rounded-xl bg-white/[0.045] px-3.5 pt-3 pb-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-[15px] font-semibold text-paper">{city.name}</span>
        <span aria-hidden className="shrink-0 text-xs text-paper-dim tabular-nums">
          {before}
          <span className="font-semibold text-taxi">{added}</span>
          {after}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={city.name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round((bar.raised + bar.added) * 100)}
        aria-valuetext={text}
        className="mt-2 flex h-3 overflow-hidden rounded-full bg-white/12"
      >
        <div
          className="h-full bg-taxi transition-[width] duration-300 ease-out"
          style={{ width: `${bar.raised * 100}%` }}
        />
        <div
          className="funding-added h-full transition-[width] duration-300 ease-out"
          style={{ width: `${bar.added * 100}%` }}
        />
      </div>
      <div aria-live="polite" className="empty:hidden">
        {bar.fills && !built && (
          <p className="flex items-start gap-1.5 pt-2 text-[13px] leading-snug font-semibold text-taxi">
            <PartyPopper aria-hidden className="mt-px size-3.5 shrink-0" strokeWidth={2.25} />
            {t.donate.fills}
          </p>
        )}
        {stonesLine && <p className="pt-2 text-xs leading-relaxed text-paper">{stonesLine}</p>}
        {upkeep && (
          <p className="pt-2 text-xs leading-relaxed text-paper">
            {t.donate.builtUpkeep.replace("{city}", city.name)}
          </p>
        )}
        {bar.overCents > 0 && !upkeep && (
          <p className="pt-2 text-xs leading-relaxed text-paper">
            {withGoal(t.donate.over, city.goalCents, locale)}
          </p>
        )}
        {isNew && !bar.fills && bar.overCents === 0 && (
          <p className="pt-2 text-xs leading-relaxed text-paper-dim">{t.donate.newCity}</p>
        )}
      </div>
    </div>
  );
}
