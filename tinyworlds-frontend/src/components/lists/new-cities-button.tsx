"use client";

import { Bell, Check } from "lucide-react";
import { ACTION_QUIET } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/** The tile's "Tell me when new cities are built": on, it says so and pressing it leaves. */
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
      // the label is long: it may wrap, so it never runs out of a narrow tile
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
