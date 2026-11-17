"use client";

import type { Locale, Strings } from "@/i18n";
import { AMOUNT_PRESETS, formatUsd, usdSymbol } from "@/lib/donate";
import { cn } from "@/lib/utils";

interface AmountPickerProps {
  /** names the group for screen readers (the visible label's id) */
  labelledBy: string;
  /** the chip chosen last, in whole dollars: lit while nothing is typed */
  preset: number;
  /** what is typed in the field for another amount; "" while a chip is the choice */
  custom: string;
  /** what is typed cannot be given (outside the limits): the field says so, and names the line that explains */
  invalid?: { describedBy: string };
  onPreset: (dollars: number) => void;
  onCustom: (text: string) => void;
  disabled?: boolean;
  locale: Locale;
  t: Strings;
}

const CHIP =
  "h-10 min-w-0 rounded-full border px-1 text-[13px] font-semibold tabular-nums outline-none transition-colors focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] disabled:pointer-events-none disabled:opacity-70";

/** How much to give: a few round sums to tap, and a field for any other amount, cents and all. */
export function AmountPicker({
  labelledBy,
  preset: chosen,
  custom,
  invalid,
  onPreset,
  onCustom,
  disabled,
  locale,
  t,
}: AmountPickerProps) {
  const typing = custom !== "";
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className="grid grid-cols-3 gap-2 min-[26rem]:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,1.7fr)]"
    >
      {AMOUNT_PRESETS.map((preset) => {
        const on = !typing && chosen === preset;
        return (
          <button
            key={preset}
            type="button"
            aria-pressed={on}
            disabled={disabled}
            onClick={() => onPreset(preset)}
            className={cn(
              CHIP,
              on
                ? "border-taxi bg-taxi text-taxi-ink"
                : "border-sign-line text-paper hover:border-paper-dim/60",
            )}
          >
            {formatUsd(preset * 100, locale)}
          </button>
        );
      })}
      <label
        className={cn(
          CHIP,
          "flex cursor-text items-center gap-1 px-2.5 font-medium focus-within:border-taxi",
          typing ? "border-taxi text-paper" : "border-sign-line text-paper",
          invalid && "border-dashed",
        )}
      >
        <span aria-hidden className="shrink-0 text-xs text-paper-dim">
          {usdSymbol(locale)}
        </span>
        <input
          type="text"
          name="amount"
          // with a decimal point on phone keyboards: "7.50" is seven dollars fifty, not 750
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          value={custom}
          maxLength={12}
          aria-label={t.donate.customAmount}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={invalid?.describedBy}
          placeholder={t.donate.customPlaceholder}
          disabled={disabled}
          onChange={(e) => onCustom(e.target.value.replace(/[^\d.,]+/g, ""))}
          // 16px keeps iOS from zooming the page when the box is focused
          className="h-full w-full min-w-0 bg-transparent text-base font-semibold tabular-nums outline-none placeholder:font-medium placeholder:text-paper-dim/80 sm:text-sm"
        />
      </label>
    </div>
  );
}
