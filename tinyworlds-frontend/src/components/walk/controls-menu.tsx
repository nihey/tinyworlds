"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import {
  ACTIONS,
  defaultBindings,
  keyLabel,
  rebind,
  type ActionId,
  type Bindings,
  type Group,
} from "@/walk/controls";
import { PIXEL_MAX, PIXEL_MIN } from "@/walk/render/view";

/**
 * The walk's controls: every action by group with its two keys (press one, then the key it
 * should be: `rebind`, which takes that key from whatever it would clash with), "Reset to
 * defaults", and the walk's two settings, the pixel size and the sound. While it waits for a
 * key it takes the next one, Esc included (which then only stops waiting).
 */

const GROUPS: Group[] = ["foot", "drive", "any"];

interface ControlsMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bindings: Bindings;
  /** a new set of keys, to be kept and used */
  onBindings: (b: Bindings) => void;
  pixel: number;
  onPixel: (n: number) => void;
  sound: boolean;
  onSound: (on: boolean) => void;
}

export function ControlsMenu({
  open,
  onOpenChange,
  bindings,
  onBindings,
  pixel,
  onPixel,
  sound,
  onSound,
}: ControlsMenuProps) {
  const { t } = useI18n();
  const w = t.walk;
  const ids = useId();
  // the slot waiting for its key
  const [waiting, setWaiting] = useState<{ id: ActionId; slot: 0 | 1 } | null>(null);

  // the next key goes to the waiting slot; before the dialog (or anything else) hears it
  useEffect(() => {
    if (!waiting) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code !== "Escape" && e.code)
        onBindings(rebind(bindings, waiting.id, waiting.slot, e.code));
      setWaiting(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [waiting, bindings, onBindings]);

  // the menu's own key closes it again
  useEffect(() => {
    if (!open || waiting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code && bindings.menu.includes(e.code)) {
        e.preventDefault();
        setWaiting(null);
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, waiting, bindings, onOpenChange]);

  const close = (next: boolean) => {
    if (!next) setWaiting(null);
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        className="sign max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 ring-0 sm:max-w-3xl"
        onEscapeKeyDown={(e) => {
          if (waiting) e.preventDefault();
        }}
      >
        <div aria-hidden className="h-[3px] bg-taxi" />
        <DialogHeader className="gap-1.5 px-5 pt-4 pb-3 text-left">
          <DialogTitle className="text-base font-semibold">{w.controls}</DialogTitle>
          <DialogDescription className="text-xs leading-relaxed text-paper-dim">
            {w.controlsHelp}
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 gap-x-6 gap-y-3 overflow-y-auto px-5 pb-3 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group} aria-labelledby={`${ids}-${group}`} className="min-w-0">
              <h3
                id={`${ids}-${group}`}
                className="pb-1 text-[10.5px] font-semibold tracking-[0.14em] text-taxi uppercase"
              >
                {w.groups[group]}
              </h3>
              <ul className="flex flex-col gap-1">
                {ACTIONS.filter((a) => a.group === group).map(({ id }) => (
                  <li
                    key={id}
                    className="grid grid-cols-[1fr_5.25rem_5.25rem] items-center gap-1.5"
                  >
                    <span className="truncate text-sm">{w.actions[id]}</span>
                    {([0, 1] as const).map((slot) => {
                      const code = bindings[id][slot];
                      const wait = waiting?.id === id && waiting.slot === slot;
                      const shown = wait ? w.pressKey : code ? keyLabel(code, w.keys) : w.unbound;
                      return (
                        <button
                          key={slot}
                          type="button"
                          aria-label={w.keySlot
                            .replace("{action}", w.actions[id])
                            .replace("{key}", shown)}
                          aria-pressed={wait}
                          onClick={() => setWaiting(wait ? null : { id, slot })}
                          className={cn(
                            "h-7 truncate rounded-md border border-sign-line bg-sign-raised px-1.5 text-xs font-semibold outline-none hover:border-paper-dim focus-visible:ring-2 focus-visible:ring-taxi",
                            !code && !wait && "text-paper-dim/70",
                            wait && "border-taxi text-taxi",
                          )}
                        >
                          {shown}
                        </button>
                      );
                    })}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <section className="flex min-w-0 flex-col gap-3 pt-1 sm:pt-5">
            <div className="flex items-center gap-3">
              <label htmlFor={`${ids}-pixel`} className="text-sm font-medium whitespace-nowrap">
                {w.pixel}
              </label>
              <Slider
                id={`${ids}-pixel`}
                aria-label={w.pixel}
                min={PIXEL_MIN}
                max={PIXEL_MAX}
                step={1}
                value={[pixel]}
                onValueChange={([n]) => onPixel(n)}
                className="flex-1"
              />
              <span aria-hidden className="w-4 text-right text-sm tabular-nums">
                {pixel}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <label htmlFor={`${ids}-sound`} className="flex-1 text-sm font-medium">
                {w.sound}
              </label>
              <Switch id={`${ids}-sound`} checked={sound} onCheckedChange={onSound} />
            </div>
          </section>
        </div>
        <div className="flex justify-end gap-2 border-t border-sign-line px-5 py-3">
          <Button
            variant="secondary"
            onClick={() => {
              setWaiting(null);
              onBindings(defaultBindings());
            }}
            className="h-9 gap-2 rounded-full px-4 font-semibold"
          >
            <RotateCcw className="size-4" strokeWidth={2.5} />
            {w.resetControls}
          </Button>
          <Button onClick={() => close(false)} className="h-9 rounded-full px-4 font-semibold">
            {w.closeMenu}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
