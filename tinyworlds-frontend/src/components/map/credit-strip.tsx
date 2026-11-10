"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { viewReadout } from "@/lib/readout";
import { cn } from "@/lib/utils";
import type { MapEngine } from "@/map/engine";
import { WORLD } from "@/worlds";

interface CreditStripProps {
  engine: MapEngine;
  onAbout: () => void;
  className?: string;
  style?: React.CSSProperties;
}

/** Bottom corner: where the centre of the view is (for a real place), and whose data this is. */
export function CreditStrip({ engine, onAbout, className, style }: CreditStripProps) {
  const readout = useRef<HTMLSpanElement>(null);
  const { t } = useI18n();

  useEffect(() => {
    // written straight into the DOM: the view changes every frame, React need not hear about it
    const write = () => {
      const c = engine.getCentre();
      if (readout.current)
        readout.current.textContent = viewReadout(
          c.lat,
          c.lon,
          engine.getView().scale,
          t.credit,
          WORLD.fictional,
        );
    };
    write();
    return engine.on("view", write);
  }, [engine, t]);

  return (
    <div
      className={cn(
        "sign z-10 flex h-7 items-center gap-2.5 rounded-full px-3 text-[11px] leading-none text-paper-dim",
        className,
      )}
      style={style}
    >
      <span ref={readout} className="whitespace-pre tabular-nums max-md:hidden" aria-hidden />
      <span aria-hidden className="h-3 w-px bg-sign-line max-md:hidden" />
      <button
        type="button"
        onClick={onAbout}
        className="rounded-sm whitespace-nowrap outline-none hover:text-paper focus-visible:text-taxi"
      >
        {WORLD.fictional ? (
          // no open data behind a made-up place: say what the map is instead, at every width
          t.credit.fictional
        ) : (
          <>
            <span className="max-sm:hidden">{WORLD.credit}</span>
            <span className="sm:hidden">{t.credit.short}</span>
          </>
        )}
      </button>
    </div>
  );
}
