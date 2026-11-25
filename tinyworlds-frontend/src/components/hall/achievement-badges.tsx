"use client";

import { useState } from "react";
import { PixelBadge, type PixelArtName } from "@/components/benefactors/pixel-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import type { WallFoundation } from "@/lib/wall";

function AchievementBadge({
  art,
  label,
  name,
  description,
}: {
  art: PixelArtName;
  label: string;
  name?: string;
  description: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        type="button"
        aria-label={name}
        className="inline-flex min-h-6 min-w-6 cursor-help items-center rounded-xs px-0.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-taxi"
        onKeyDown={(event) => {
          if (open && event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onClick={(event) => {
          // Radix also opens on hover and focus. Explicit activation covers touch.
          event.preventDefault();
          setOpen(true);
        }}
      >
        <PixelBadge art={art} label={label} />
      </TooltipTrigger>
      <TooltipContent
        side="top"
        sideOffset={6}
        collisionPadding={12}
        className="max-w-60 leading-relaxed data-closed:animate-none motion-reduce:animate-none"
      >
        {description}
      </TooltipContent>
    </Tooltip>
  );
}

export function AchievementBadges({ foundation }: { foundation: WallFoundation }) {
  const { t } = useI18n();
  const { number, firstStone, keystone } = foundation;
  const foundingNumber = String(number);

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
      <AchievementBadge
        art="founding"
        label={t.benefactors.founderNo.replace("{n}", foundingNumber)}
        name={t.benefactors.foundingTitle.replace("{n}", foundingNumber)}
        description={t.hall.achievements.founding}
      />
      {firstStone && (
        <AchievementBadge
          art="firstStone"
          label={t.benefactors.firstStone}
          description={t.hall.achievements.firstStone}
        />
      )}
      {keystone && (
        <AchievementBadge
          art="keystone"
          label={t.benefactors.keystone}
          description={t.hall.achievements.keystone}
        />
      )}
    </div>
  );
}
