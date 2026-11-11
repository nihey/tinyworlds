"use client";

import { PixelIcon, type PixelArtName } from "@/components/benefactors/pixel-badge";
import { useI18n } from "@/hooks/use-i18n";
import { earnedBadges, earnedWhere, type EarnedBadges, type MyCity } from "@/lib/benefactors";
import { cn } from "@/lib/utils";

/** The three badges, in the order a city is built: its founders, its first stone, its last. */
const BADGES: { key: keyof EarnedBadges; art: PixelArtName; scale: number }[] = [
  { key: "founding", art: "founding", scale: 3 },
  { key: "firstStone", art: "firstStone", scale: 2 },
  { key: "keystone", art: "keystone", scale: 2 },
];

/**
 * One badge: its picture, its name, and how it is earned. Not earned, it is dimmed; `note`
 * stands beside the name: where it was earned (in the accent), or that it was not yet.
 */
function BadgeRow({
  art,
  scale,
  name,
  how,
  earned,
  note,
}: {
  art: PixelArtName;
  scale: number;
  name: string;
  how: string;
  earned: boolean;
  note?: string | null;
}) {
  return (
    <li className="grid grid-cols-[44px_minmax(0,1fr)] items-center gap-3 border-t border-paper/12 py-3">
      <span
        aria-hidden
        className={cn("flex justify-center", !earned && "opacity-55 brightness-90 grayscale")}
      >
        <PixelIcon art={art} scale={scale} />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <b className={cn("text-sm font-semibold", earned ? "text-paper" : "text-paper-dim")}>
            {name}
          </b>
          {note && (
            <span
              className={cn(
                "text-xs font-semibold",
                earned ? "text-taxi" : "rounded-sm border border-paper/20 px-1.5 text-paper-dim",
              )}
            >
              {note}
            </span>
          )}
        </span>
        <span className="block pt-0.5 text-[13px] leading-snug text-paper-dim">{how}</span>
      </span>
    </li>
  );
}

const LABEL = "block pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-paper-dim uppercase";

/** For someone who has not given: the three badges as things to earn, each with how. */
export function BadgesToEarn() {
  const { t } = useI18n();
  return (
    <div className="pt-5">
      <span className={LABEL}>{t.me.badgesToEarn}</span>
      <ul>
        {BADGES.map(({ key, art, scale }) => (
          <BadgeRow
            key={key}
            art={art}
            scale={scale}
            name={t.me.badges[key].name}
            how={t.me.badges[key].how}
            earned={false}
          />
        ))}
      </ul>
    </div>
  );
}

/** A donor's badges: the ones they have lit, saying where they earned them; the others still to earn. */
export function YourBadges({ cities }: { cities: MyCity[] }) {
  const { t } = useI18n();
  const earned = earnedBadges(cities);
  return (
    <section aria-labelledby="your-badges" className="sign px-5 pt-5 pb-2 sm:px-6">
      <h2 id="your-badges" className="pb-3.5 text-lg leading-tight font-semibold text-paper">
        {t.me.yourBadges}
      </h2>
      <ul>
        {BADGES.map(({ key, art, scale }) => {
          const where = earnedWhere(earned[key], t.me.badges.inCities);
          return (
            <BadgeRow
              key={key}
              art={art}
              scale={scale}
              name={t.me.badges[key].name}
              how={t.me.badges[key].how}
              earned={where !== null}
              note={where ?? t.me.badges.notYet}
            />
          );
        })}
      </ul>
    </section>
  );
}
