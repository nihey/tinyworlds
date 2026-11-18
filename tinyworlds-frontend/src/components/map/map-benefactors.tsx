"use client";

import { ChevronRight, Heart } from "lucide-react";
import { Fragment, useEffect, useState } from "react";
import { BenefactorsSign } from "@/components/benefactors/benefactors-sign";
import { useI18n } from "@/hooks/use-i18n";
import type { CityBenefactors } from "@/lib/benefactors";
import { cityHallPeople } from "@/lib/hall";
import { cn } from "@/lib/utils";

interface MapBenefactorsProps {
  world: string;
  hidden: boolean;
  onSupport: (city: string) => void;
}

export function MapBenefactors({ world, hidden, onSupport }: MapBenefactorsProps) {
  const { t } = useI18n();
  const [city, setCity] = useState<CityBenefactors | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    import("@/lib/benefactors-api")
      .then((api) => api.fetchCityBenefactors({ world }))
      .then((result) => {
        if (active) setCity(result);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [world]);

  if (city?.status !== "BUILT" || city.worldId !== world) return null;

  const names = Array.from(
    new Set(cityHallPeople(city).flatMap(({ name }) => (name ? [name] : []))),
  ).slice(0, 2);

  return (
    <BenefactorsSign
      open={open}
      onOpenChange={setOpen}
      by={{ world }}
      onBecome={(cityName) => {
        setOpen(false);
        onSupport(cityName);
      }}
      trigger={
        <button
          type="button"
          title={names.length ? names.join(" · ") : undefined}
          className={cn(
            "sign pointer-events-auto mr-(--tool-clearance) min-h-11 max-w-[min(13rem,calc(100dvw-var(--edge-l)-var(--edge-r)-9.5rem-var(--tool-clearance)))] items-center gap-2 px-2.5 py-1.5 text-left outline-none [--tool-clearance:0px] hover:bg-sign-raised focus-visible:ring-2 focus-visible:ring-taxi sm:max-w-xs [@media(max-height:34rem)]:[--tool-clearance:3.5rem]",
            hidden ? "hidden" : "flex",
          )}
        >
          <Heart aria-hidden className="size-3 shrink-0 fill-taxi text-taxi" />
          <span className="min-w-0">
            {names.length ? (
              <>
                <span className="block text-[10px] leading-tight font-semibold text-paper-dim">
                  {t.benefactors.benefactors}
                </span>
                <span className="flex flex-col text-xs leading-tight font-medium sm:flex-row sm:items-center sm:gap-1">
                  {names.map((name, index) => (
                    <Fragment key={name}>
                      {index > 0 && (
                        <span aria-hidden className="hidden shrink-0 sm:block">
                          ·
                        </span>
                      )}
                      <span className="truncate" dir="auto">
                        {name}
                      </span>
                    </Fragment>
                  ))}
                </span>
              </>
            ) : (
              <span className="block text-xs leading-tight font-medium">
                {t.benefactors.supportCity}
              </span>
            )}
          </span>
          <ChevronRight aria-hidden className="size-3 shrink-0 text-paper-dim" />
        </button>
      }
    />
  );
}
