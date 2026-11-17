"use client";

import { Keyboard, Map as MapIcon, MousePointer2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { keyLabel, type Bindings } from "@/walk/controls";
import type { WalkGame, WalkState } from "@/walk/game";
import {
  damageText,
  hintMode,
  hintText,
  lifeText,
  lifeTone,
  speedText,
  type LifeTone,
} from "@/walk/hud-text";

/**
 * The walk's signs, in the map's sign style: the corner sign (the life bar, always; beside it
 * the car's damage, or "wrecked"; the speed and the vehicle's name while driving; the line of
 * keys), what can be got into from here, the brief messages, the buttons (the controls, back to
 * the map), and the red edges of a hit. React hears the game only when what the signs say
 * changes; the hit's fading edges are written straight into the DOM.
 */

/** Cells of the pixel bars: a cell is 5 points of life, or 5% of damage. */
const CELLS = 20;

/** The palette's own colours for life: lawn green, autumn amber, car red. */
const TONE: Record<LifeTone, string> = { ok: "#84b45e", low: "#d99a3e", critical: "#c8473c" };
const DAMAGE = "#d99a3e";

function PixelBar({
  lit,
  colour,
  label,
  value,
  flash,
}: {
  lit: number;
  colour: string;
  label: string;
  value: number;
  flash?: boolean;
}) {
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value)}
      className={cn("flex gap-px rounded-[2px] bg-black/50 p-px", flash && "walk-flash")}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <span
          key={i}
          className="h-2.5 w-[5px]"
          style={{ background: i < lit ? colour : "rgb(255 255 255 / 0.08)" }}
        />
      ))}
    </div>
  );
}

/** A round button of the walk's, with its name and its key in a tooltip, as the tool column's. */
function HudButton({
  label,
  hint,
  onClick,
  children,
}: {
  label: string;
  hint: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="bullet" aria-label={label} onClick={onClick}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        {label}
        <kbd data-slot="kbd" className="ml-1 rounded-sm bg-sign/15 px-1.5 py-0.5 font-semibold">
          {hint}
        </kbd>
      </TooltipContent>
    </Tooltip>
  );
}

/** What the signs show, as a string: React is told only when it changes. */
function signature(s: WalkState, speed: string): string {
  const v = s.vehicle;
  return [
    s.mode,
    Math.ceil(s.life / (100 / CELLS)),
    Math.round(s.life),
    v ? `${v.kind}:${speed}:${Math.round(v.damage * CELLS)}:${v.wrecked}` : "",
    s.near?.kind ?? "",
    s.message ?? "",
    s.hurt > 0,
    s.wasted !== null,
  ].join("|");
}

interface WalkHudProps {
  game: WalkGame;
  bindings: Bindings;
  units: "imperial" | "metric";
  /** a touch screen: no line of keys, no "F get in" (the touch pad has the buttons) */
  touch: boolean;
  reducedMotion: boolean;
  /** "Click to look around": the mouse is not captured yet */
  showLook: boolean;
  onMenu: () => void;
  onBack: () => void;
}

export function WalkHud({
  game,
  bindings,
  units,
  touch,
  reducedMotion,
  showLook,
  onMenu,
  onBack,
}: WalkHudProps) {
  const { t } = useI18n();
  const w = t.walk;
  const [s, setS] = useState<WalkState>(game.state);
  const edge = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let sig = "";
    return game.subscribe((next) => {
      const e = edge.current;
      if (e) e.style.opacity = reducedMotion ? (next.hurt > 0 ? "1" : "0") : String(next.hurt);
      const now = signature(next, next.vehicle ? speedText(next.vehicle.speed, units, w) : "");
      if (now !== sig) {
        sig = now;
        setS(next);
      }
    });
  }, [game, units, w, reducedMotion]);

  const v = s.vehicle;
  const tone = lifeTone(s.life);
  const keyOf = (id: keyof Bindings) => {
    const [a, b] = bindings[id];
    const code = a ?? b;
    return code ? keyLabel(code, w.keys) : w.unbound;
  };
  const nearKind = s.near?.kind;
  const enterPrompt = nearKind === "motorcycle" ? w.getOnMotorcycle : w.getIn;
  const near =
    nearKind && !touch
      ? enterPrompt.replace("{vehicle}", w.vehicles[nearKind]).split("{key}")
      : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 text-paper">
      {/* a hit: the view's edges redden for a moment (a plain frame under reduced motion) */}
      <div
        ref={edge}
        aria-hidden
        className={cn(
          "absolute inset-0 opacity-0",
          reducedMotion ? "border-4 border-[#c8473c]" : "walk-hurt",
        )}
      />

      {/* the life bar is always there, even through the wasted screen */}
      <div className="sign absolute top-3 left-3 flex max-w-[calc(100%-6.5rem)] flex-col gap-1.5 px-3 py-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="text-[10.5px] font-semibold tracking-[0.12em] text-paper-dim uppercase"
            >
              {w.life}
            </span>
            <PixelBar
              lit={Math.ceil(Math.max(0, s.life) / (100 / CELLS))}
              colour={TONE[tone]}
              label={lifeText(s.life, w)}
              value={s.life}
              flash={s.hurt > 0 && !reducedMotion}
            />
          </span>
          {v && (
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="text-[10.5px] font-semibold tracking-[0.12em] text-paper-dim uppercase"
              >
                {w.damage}
              </span>
              {v.wrecked ? (
                <span className="font-semibold text-[#c8473c]">{w.wrecked}</span>
              ) : (
                <PixelBar
                  lit={Math.round(v.damage * CELLS)}
                  colour={DAMAGE}
                  label={damageText(v.damage, w)}
                  value={v.damage * 100}
                />
              )}
            </span>
          )}
        </div>
        {v && (
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold tabular-nums">
              {speedText(v.speed, units, w)}
            </span>
            <span className="text-paper-dim">{w.vehicles[v.kind]}</span>
          </div>
        )}
        {!touch && (
          <p className="leading-snug text-paper-dim">
            {hintText(hintMode(s.mode, v?.kind), bindings, w)}
          </p>
        )}
      </div>

      {/* the buttons: the controls, and back to the map, one press away even on the wasted screen */}
      <div className="sign pointer-events-auto absolute top-3 right-3 flex items-center gap-0.5 p-1">
        <HudButton label={w.controls} hint={keyOf("menu")} onClick={onMenu}>
          <Keyboard className="size-[18px]" strokeWidth={2.25} />
        </HudButton>
        <HudButton label={w.back} hint={keyOf("map")} onClick={onBack}>
          <MapIcon className="size-[18px]" strokeWidth={2.25} />
        </HudButton>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="absolute top-16 left-1/2 flex -translate-x-1/2 justify-center"
      >
        {s.message && !s.wasted && (
          <span className="sign rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap">
            {w.messages[s.message]}
          </span>
        )}
      </div>

      {near && !s.wasted && (
        <div className="sign absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold whitespace-nowrap max-sm:bottom-[calc(var(--walk-mm)+2rem)]">
          {near[0]}
          <kbd className="kbd-key">{keyOf("enter")}</kbd>
          {near.slice(1).join("")}
        </div>
      )}

      {showLook && !s.wasted && (
        <div className="sign absolute top-[62%] left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold whitespace-nowrap">
          <MousePointer2 className="size-4 text-taxi" strokeWidth={2.5} />
          {w.clickToLook}
        </div>
      )}
    </div>
  );
}
