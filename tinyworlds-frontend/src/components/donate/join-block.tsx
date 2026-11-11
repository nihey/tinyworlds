"use client";

import { useId } from "react";
import { Switch } from "@/components/ui/switch";
import type { Strings } from "@/i18n";
import { NAME_MAX } from "@/lib/benefactors";

interface JoinBlockProps {
  city: string;
  /** the switch: whether the donor asks to be listed */
  on: boolean;
  name: string;
  onOn: (on: boolean) => void;
  onName: (name: string) => void;
  disabled?: boolean;
  /** the name is empty or unusable: say why Donate waits, under the field with this id */
  hint?: { id: string };
  t: Strings;
}

/** "Put my name on {city}": off by default, and a name to show once it is on. */
export function JoinBlock({ city, on, name, onOn, onName, disabled, hint, t }: JoinBlockProps) {
  const labelId = useId();
  const count = Array.from(name).length;
  return (
    <div className="mt-4 rounded-xl bg-white/[0.045] px-3.5 py-3">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold text-paper">
        <span id={labelId} className="min-w-0">
          {t.donate.join.label.replace("{city}", city)}
        </span>
        <Switch
          checked={on}
          onCheckedChange={onOn}
          disabled={disabled}
          aria-labelledby={labelId}
          className="data-checked:bg-taxi data-unchecked:bg-white/20"
        />
      </div>
      {on && (
        <label className="mt-2.5 flex h-10 cursor-text items-center gap-2 rounded-lg border border-sign-line px-3 focus-within:border-taxi">
          <input
            type="text"
            name="benefactor-name"
            autoComplete="off"
            enterKeyHint="done"
            value={name}
            maxLength={NAME_MAX}
            aria-label={t.donate.join.name}
            aria-describedby={hint?.id}
            placeholder={t.donate.join.namePlaceholder}
            disabled={disabled}
            onChange={(e) => onName(e.target.value)}
            // 16px keeps iOS from zooming the page when the box is focused
            className="h-full w-full min-w-0 bg-transparent text-base font-medium text-paper outline-none placeholder:text-paper-dim/80 sm:text-sm"
          />
          <span aria-hidden className="shrink-0 text-xs text-paper-dim tabular-nums">
            {t.donate.join.counter.replace("{n}", String(count)).replace("{max}", String(NAME_MAX))}
          </span>
        </label>
      )}
      {on && hint && (
        <p id={hint.id} className="pt-1.5 text-xs leading-relaxed text-taxi">
          {t.donate.join.needsName}
        </p>
      )}
      <p className="pt-2 text-xs leading-relaxed text-paper-dim">{t.donate.join.note}</p>
    </div>
  );
}
