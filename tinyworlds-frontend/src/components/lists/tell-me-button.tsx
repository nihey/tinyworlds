"use client";

import { Bell, Check } from "lucide-react";
import { PILL_GHOST, PILL_SOLID } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import type { CityMilestone } from "@/lib/donate";
import { cn } from "@/lib/utils";

/**
 * A card's "Tell me": hear by email when the city is built. Joined, it says so in the accent and
 * pressing it leaves. A donor of the city is already covered by the donor mail, so theirs only
 * says so (it is not a button that leaves).
 */
export function TellMeButton({
  city,
  state,
  onJoin,
  onLeave,
}: {
  city: CityMilestone;
  state: "join" | "joined" | "donor";
  onJoin: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  if (state === "join") {
    return (
      <button
        type="button"
        onClick={onJoin}
        aria-label={t.lists.tellMeAria.replace("{city}", city.name)}
        className={cn(PILL_GHOST, "flex-1")}
      >
        <Bell aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} />
        <span className="truncate">{t.lists.tellMe}</span>
      </button>
    );
  }
  if (state === "joined") {
    return (
      <button
        type="button"
        onClick={onLeave}
        aria-label={t.lists.leaveAria.replace("{city}", city.name)}
        className={cn(PILL_SOLID, "flex-1")}
      >
        <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={3} />
        <span className="truncate">{t.lists.toldYou}</span>
      </button>
    );
  }
  return (
    <button
      type="button"
      aria-disabled="true"
      title={t.lists.donorCovered}
      aria-label={`${t.lists.toldYou}. ${t.lists.donorCovered}`}
      className={cn(PILL_SOLID, "flex-1 cursor-default hover:brightness-100")}
    >
      <Check aria-hidden className="size-3.5 shrink-0" strokeWidth={3} />
      <span className="truncate">{t.lists.toldYou}</span>
    </button>
  );
}
