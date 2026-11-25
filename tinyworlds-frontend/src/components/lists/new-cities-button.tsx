"use client";

import { Bell, Check } from "lucide-react";
import { ACTION_QUIET } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/** Subscribe to new-city announcements, or leave the list when already subscribed. */
export function NewCitiesButton({
  on,
  onJoin,
  onLeave,
}: {
  on: boolean;
  onJoin: () => void;
  onLeave: () => void;
}) {
  const { t } = useI18n();
  const Icon = on ? Check : Bell;
  return (
    <button
      type="button"
      onClick={on ? onLeave : onJoin}
      aria-pressed={on}
      className={cn(
        ACTION_QUIET,
        "h-auto min-h-11 py-2 text-left whitespace-normal",
        on && "border-taxi text-taxi",
      )}
    >
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
      {on ? t.lists.newCitiesOn : t.lists.newCities}
    </button>
  );
}
