import type { Locale, Strings } from "@/i18n";
import { formatUsd, progress, type CityMilestone } from "@/lib/donate";
import { cn } from "@/lib/utils";

/** What a city's status is called; nothing for one that is simply collecting. */
export function statusLabel(city: CityMilestone, t: Strings): string | null {
  if (city.status === "FUNDED") return t.donate.status.funded;
  if (city.status === "BUILDING") return t.donate.status.building;
  if (city.status === "BUILT") return t.donate.status.built;
  return null;
}

interface MilestoneBarProps {
  city: CityMilestone;
  locale: Locale;
  t: Strings;
  /** what stands in for the plain name (a link, for a city that is already built) */
  name?: React.ReactNode;
  /** a quiet remark under the bar, after the status: how many donations, say */
  note?: string;
  className?: string;
}

/** One city on its way to being built: its name, how much is in, and the bar that fills. */
export function MilestoneBar({ city, locale, t, name, note, className }: MilestoneBarProps) {
  // a city that is already built is not collecting: its bar is simply full, with no sum beside it
  const built = city.status === "BUILT";
  const filled = built ? 1 : progress(city);
  const status = statusLabel(city, t);
  const amount = t.donate.progress
    .replace("{raised}", formatUsd(city.raisedCents, locale))
    .replace("{goal}", formatUsd(city.goalCents, locale));
  return (
    <div className={cn("min-w-0 flex-1", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 truncate text-sm font-semibold text-paper">
          {name ?? city.name}
        </span>
        {!built && <span className="shrink-0 text-xs text-paper-dim tabular-nums">{amount}</span>}
      </div>
      <div
        role="progressbar"
        aria-label={city.name}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(filled * 100)}
        aria-valuetext={built ? (status ?? amount) : amount}
        className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/12"
      >
        <div className="h-full rounded-full bg-taxi" style={{ width: `${filled * 100}%` }} />
      </div>
      {(status || note) && (
        <p className="flex flex-wrap gap-x-2 pt-1 text-[11px] leading-tight">
          {status && <span className="font-medium text-taxi">{status}</span>}
          {note && <span className="text-paper-dim">{note}</span>}
        </p>
      )}
    </div>
  );
}
