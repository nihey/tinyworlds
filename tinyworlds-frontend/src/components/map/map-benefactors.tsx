"use client";

import { ChevronRight, Heart, Pause, Play } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { BenefactorLinks } from "@/components/benefactors/benefactor-link";
import { BenefactorsSign } from "@/components/benefactors/benefactors-sign";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { CityBenefactors } from "@/lib/benefactors";
import { cityHallPeople } from "@/lib/hall";
import { stepSlide } from "@/lib/home";
import { cn } from "@/lib/utils";

interface MapBenefactorsProps {
  world: string;
  hidden: boolean;
  onSupport: (city: string) => void;
}

const SLIDE_MS = 6500;
const PLAQUE = "map-benefactor-plaque sign pointer-events-auto";
const CONTROL =
  "grid size-6 shrink-0 place-items-center rounded-md text-paper-dim outline-none hover:bg-white/10 hover:text-paper focus-visible:ring-2 focus-visible:ring-taxi";

export function MapBenefactors({ world, hidden, onSupport }: MapBenefactorsProps) {
  const [city, setCity] = useState<CityBenefactors | null>(null);

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

  return <BenefactorPlaque key={world} city={city} hidden={hidden} onSupport={onSupport} />;
}

function BenefactorPlaque({
  city,
  hidden,
  onSupport,
}: Omit<MapBenefactorsProps, "world"> & { city: CityBenefactors }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [{ index: current, manual }, setSlide] = useState({ index: 0, manual: false });
  const [paused, setPaused] = useState(false);
  const plaque = useRef<HTMLElement>(null);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const supportsHover = useMediaQuery("(any-hover: hover)");
  const people = cityHallPeople(city).filter((person) => person.name);
  const person = people[current];
  const count = people.length;
  const hasLinks = people.some((person) => person.links.length > 0);
  const rotating = count > 1 && !reducedMotion && !paused;

  useEffect(() => {
    const element = plaque.current;
    if (!element || !rotating || hidden || open) return;
    const interacting = supportsHover ? ":hover, :focus-within" : ":focus-within";
    const timer = window.setInterval(() => {
      // Read the actual pointer and focus. Changing a control's icon can remove the event target.
      if (document.hidden || element.matches(interacting)) return;
      setSlide({ index: stepSlide(current, 1, count), manual: false });
    }, SLIDE_MS);
    return () => window.clearInterval(timer);
  }, [count, current, hidden, open, rotating, supportsHover]);

  const next = () => {
    setSlide(({ index }) => ({ index: stepSlide(index, 1, count), manual: true }));
  };

  const become = (cityName: string) => {
    setOpen(false);
    onSupport(cityName);
  };

  if (!person) {
    return (
      <button
        type="button"
        hidden={hidden}
        onClick={() => onSupport(city.name)}
        className={cn(
          PLAQUE,
          "items-center gap-2 px-2.5 py-2 text-left text-xs font-medium text-taxi outline-none hover:bg-sign-raised focus-visible:ring-2 focus-visible:ring-taxi",
          !hidden && "flex min-h-11",
        )}
      >
        <Heart aria-hidden className="size-3 shrink-0 fill-current" />
        {t.benefactors.map.join}
      </button>
    );
  }

  const rotationLabel = paused ? t.benefactors.map.resume : t.benefactors.map.pause;

  return (
    <section
      ref={plaque}
      aria-label={t.benefactors.benefactors}
      hidden={hidden}
      className={cn(PLAQUE, "map-benefactor-carousel w-64 px-2.5 py-1.5")}
    >
      <p className="flex items-start gap-1.5 text-[11px] leading-[1.25] font-medium text-paper-dim">
        <Heart aria-hidden className="mt-px size-3 shrink-0 fill-taxi text-taxi" />
        {t.benefactors.map.heading}
      </p>
      <div className="flex min-h-8 items-center gap-1">
        <BenefactorsSign
          open={open}
          onOpenChange={setOpen}
          by={{ slug: city.slug }}
          onBecome={become}
          trigger={
            <button
              type="button"
              title={person.name ?? undefined}
              className="min-w-0 flex-1 rounded-sm py-0.5 text-left text-[13px] leading-4 font-semibold outline-none hover:text-taxi focus-visible:ring-2 focus-visible:ring-taxi"
            >
              <span key={current} dir="auto" className="benefactor-flip line-clamp-2 wrap-anywhere">
                {person.name}
              </span>
            </button>
          }
        />
        {count > 1 && (
          <>
            {!reducedMotion && (
              <button
                type="button"
                aria-label={rotationLabel}
                title={rotationLabel}
                onClick={() => setPaused((value) => !value)}
                className={CONTROL}
              >
                {paused ? (
                  <Play aria-hidden className="size-3" />
                ) : (
                  <Pause aria-hidden className="size-3" />
                )}
              </button>
            )}
            <button
              type="button"
              aria-label={t.benefactors.map.next}
              title={t.benefactors.map.next}
              onClick={next}
              className={CONTROL}
            >
              <ChevronRight aria-hidden className="size-3.5" />
            </button>
          </>
        )}
      </div>
      {hasLinks && (
        <div className="h-9">
          <BenefactorLinks key={current} links={person.links} look="compact" />
        </div>
      )}
      <button
        type="button"
        onClick={() => onSupport(city.name)}
        className="flex min-h-7 w-full items-center justify-between gap-1 rounded-sm border-t border-sign-line py-1 text-left text-[11px] leading-tight font-semibold text-taxi outline-none hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-taxi"
      >
        {t.benefactors.map.join}
        <ChevronRight aria-hidden className="size-3 shrink-0" />
      </button>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {manual ? person.name : ""}
      </p>
    </section>
  );
}
