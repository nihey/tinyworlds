"use client";

import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { useI18n } from "@/hooks/use-i18n";
import type { BroughtBy } from "@/lib/brought-by";
import { formatUsd } from "@/lib/donate";
import { cn } from "@/lib/utils";
import { PixelIcon } from "./pixel-badge";

/**
 * The plaque's metal: the pixel badges' own, a dark gold field inside a one-pixel stepped gold
 * edge; the edge turns taxi yellow under the pointer when the plaque is a link.
 */
const PLAQUE =
  "bg-[#2a2311] text-paper shadow-[0_-1px_0_0_#7a5d0c,0_1px_0_0_#7a5d0c,-1px_0_0_0_#7a5d0c,1px_0_0_0_#7a5d0c]";
const PLAQUE_LINK =
  "transition-shadow outline-none hover:shadow-[0_-1px_0_0_var(--taxi),0_1px_0_0_var(--taxi),-1px_0_0_0_var(--taxi),1px_0_0_0_var(--taxi)] focus-visible:shadow-[0_0_0_2px_var(--taxi)]";

const SIZES = {
  card: { box: "gap-2.5 px-2.5 py-2 text-[13px] leading-snug", icon: 2 },
  large: { box: "gap-3 px-3.5 py-3 text-[15px] leading-snug", icon: 2 },
} as const;

/**
 * "Brought to you by 2 benefactors, who donated $35": how many people brought a city to the
 * map and what they gave, both in gold. The sentence agrees with how many they are, in every
 * language.
 */
export function BroughtByWords({ by }: { by: BroughtBy }) {
  const { t, locale } = useI18n();
  const form = new Intl.PluralRules(locale).select(by.people) === "one" ? "one" : "other";
  const people = t.hall.people[form].replace(
    "{n}",
    new Intl.NumberFormat(locale).format(by.people),
  );
  const amount = formatUsd(by.cents, locale);
  return (
    <>
      {t.hall.broughtBy[form].split(/(\{people\}|\{amount\})/).map((part, i) =>
        part === "{people}" ? (
          <strong key={i} className="font-semibold text-taxi">
            {people}
          </strong>
        ) : part === "{amount}" ? (
          <strong key={i} className="font-semibold whitespace-nowrap text-taxi tabular-nums">
            {amount}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

/**
 * The plaque of a city its benefactors brought to the map: the founders' flag and who they
 * were. With `href` it is a link (to the city's hall of fame), and `where` says where it leads
 * to those who cannot see it; without, it is a plaque in something that is a link already.
 */
export function BroughtByPlaque({
  by,
  href,
  where,
  size = "card",
  className,
}: {
  by: BroughtBy;
  href?: string;
  where?: string;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const look = SIZES[size];
  const inside = (
    <>
      <span className="flex shrink-0 self-start pt-px">
        <PixelIcon art="founding" scale={look.icon} />
      </span>
      <span className="min-w-0 flex-1">
        <BroughtByWords by={by} />
        {href && where && <span className="sr-only">: {where}</span>}
      </span>
      {href && (
        <ChevronRight
          aria-hidden
          className="size-4 shrink-0 self-center text-taxi transition-transform group-hover/plaque:translate-x-0.5"
          strokeWidth={2.5}
        />
      )}
    </>
  );
  const box = cn("flex items-start", PLAQUE, look.box, className);
  return href ? (
    <a href={href} className={cn(box, PLAQUE_LINK, "group/plaque")}>
      {inside}
    </a>
  ) : (
    <p className={box}>{inside}</p>
  );
}
