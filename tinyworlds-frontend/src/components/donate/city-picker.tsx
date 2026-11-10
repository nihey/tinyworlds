"use client";

import { Check, ChevronsUpDown, List, MapPin, PencilLine, Sparkles } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Locale, Strings } from "@/i18n";
import { CITY_CATALOGUE } from "@/lib/city-catalogue";
import { fold, pickerOptions, regionNames, tidyCity } from "@/lib/city-picker";
import { CITY_MAX, formatUsd, type Choice, type CityMilestone } from "@/lib/donate";
import { cn } from "@/lib/utils";
import { statusLabel } from "./milestone-bar";

interface CityPickerProps {
  /** names the field for screen readers (the visible label's id) */
  labelledBy: string;
  milestones: CityMilestone[];
  loading: boolean;
  /** cities that are already worlds of this site, whatever the API says */
  builtNames: string[];
  choice: Choice;
  onChoice: (choice: Choice) => void;
  disabled?: boolean;
  locale: Locale;
  t: Strings;
}

const FIELD =
  "flex h-11 w-full min-w-0 items-center gap-2.5 rounded-lg border border-sign-line bg-white/[0.04] px-3 text-left text-[15px] text-paper outline-none transition-colors hover:border-paper-dim/60 focus-visible:border-taxi focus-visible:shadow-[0_0_0_1px_var(--taxi)] disabled:pointer-events-none disabled:opacity-70";

/**
 * Which city the donation is for: a searchable list of the cities already being funded and of
 * well-known ones nobody has given to yet, "no city in particular", and a way to type any other.
 */
export function CityPicker({
  labelledBy,
  milestones,
  loading,
  builtNames,
  choice,
  onChoice,
  disabled,
  locale,
  t,
}: CityPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const otherRef = useRef<HTMLInputElement>(null);
  const region = regionNames(locale);
  const options = useMemo(
    () => pickerOptions(milestones, CITY_CATALOGUE, query, builtNames),
    [milestones, query, builtNames],
  );

  const choose = (next: Choice) => {
    onChoice(next);
    setOpen(false);
    setQuery("");
    // the field for a city of one's own takes the cursor as soon as it appears
    if (next.kind === "other") requestAnimationFrame(() => otherRef.current?.focus());
  };

  if (choice.kind === "other") {
    return (
      <div className="flex items-center gap-2">
        <label className={cn(FIELD, "cursor-text focus-within:border-taxi")}>
          <PencilLine aria-hidden className="size-4 shrink-0 text-paper-dim" strokeWidth={2.25} />
          <input
            ref={otherRef}
            type="text"
            name="city"
            value={choice.text}
            maxLength={CITY_MAX}
            aria-labelledby={labelledBy}
            placeholder={t.donate.otherPlaceholder}
            autoComplete="off"
            enterKeyHint="done"
            disabled={disabled}
            onChange={(e) => onChoice({ kind: "other", text: e.target.value })}
            // 16px keeps iOS from zooming the page when the box is focused
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-paper-dim/80 sm:text-[15px]"
          />
        </label>
        <button
          type="button"
          disabled={disabled}
          title={t.donate.backToList}
          aria-label={t.donate.backToList}
          onClick={() => {
            onChoice({ kind: "none" });
            setOpen(true);
          }}
          className="bullet size-11 border border-sign-line text-paper-dim hover:text-paper"
        >
          <List className="size-[18px]" strokeWidth={2.25} />
        </button>
      </div>
    );
  }

  const chosen = choice.kind === "city" ? choice.name : null;
  const isChosen = (name: string) => chosen !== null && fold(chosen) === fold(name);
  const nothing =
    options.funding.length === 0 && options.more.length === 0 && options.typed === null;

  return (
    // modal, so its list scrolls and takes the keys while it sits over the donate sign
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-labelledby={labelledBy}
          disabled={disabled}
          className={FIELD}
        >
          <MapPin
            aria-hidden
            className={cn("size-4 shrink-0", chosen ? "text-taxi" : "text-paper-dim")}
            strokeWidth={2.25}
          />
          <span className={cn("min-w-0 flex-1 truncate", chosen ? "font-semibold" : "font-medium")}>
            {chosen ?? t.donate.none}
          </span>
          <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-paper-dim" strokeWidth={2} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        // on a touch screen the list comes first: focusing the search box would raise the
        // keyboard over it before anyone asked to type
        onOpenAutoFocus={(event) => {
          if (window.matchMedia("(pointer: coarse)").matches) event.preventDefault();
        }}
        className="sign w-(--radix-popover-trigger-width) min-w-64 gap-0 overflow-hidden p-0 ring-0"
      >
        <Command shouldFilter={false} label={t.donate.cities} className="bg-transparent">
          <CommandInput
            value={query}
            onValueChange={setQuery}
            maxLength={CITY_MAX}
            placeholder={t.donate.pickerPlaceholder}
          />
          <CommandList
            id={listId}
            className="max-h-[min(19rem,calc(var(--radix-popover-content-available-height)-3.25rem))]"
          >
            {query.trim() === "" && (
              <>
                <CommandGroup>
                  <CommandItem value="choice:none" onSelect={() => choose({ kind: "none" })}>
                    <span className="min-w-0 flex-1 truncate font-medium">{t.donate.none}</span>
                    {choice.kind === "none" && (
                      <Check aria-hidden className="size-4 text-taxi" strokeWidth={2.5} />
                    )}
                  </CommandItem>
                  <CommandItem
                    value="choice:other"
                    onSelect={() => choose({ kind: "other", text: "" })}
                  >
                    <PencilLine aria-hidden className="size-4 text-paper-dim" strokeWidth={2.25} />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {t.donate.otherOption}
                    </span>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}

            {loading && (
              <p role="status" className="px-3.5 py-3 text-sm text-paper-dim">
                {t.donate.loading}
              </p>
            )}

            {options.funding.length > 0 && (
              <CommandGroup heading={t.donate.groupFunding}>
                {options.funding.map((city) => (
                  <CommandItem
                    key={city.id}
                    value={`funding:${city.id}`}
                    onSelect={() => choose({ kind: "city", name: city.name })}
                  >
                    <span className="min-w-0 flex-1 truncate font-semibold">{city.name}</span>
                    <span className="shrink-0 text-xs text-paper-dim tabular-nums">
                      {statusLabel(city, t) ??
                        t.donate.progress
                          .replace("{raised}", formatUsd(city.raisedCents, locale))
                          .replace("{goal}", formatUsd(city.goalCents, locale))}
                    </span>
                    {isChosen(city.name) && (
                      <Check aria-hidden className="size-4 text-taxi" strokeWidth={2.5} />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {options.more.length > 0 && (
              <CommandGroup heading={t.donate.groupMore}>
                {options.more.map((city) => (
                  <CommandItem
                    key={`${city.name}:${city.cc}`}
                    value={`more:${city.name}:${city.cc}`}
                    onSelect={() => choose({ kind: "city", name: city.name })}
                  >
                    <span className="min-w-0 flex-1 truncate font-medium">{city.name}</span>
                    <span className="max-w-[45%] shrink-0 truncate text-xs text-paper-dim">
                      {region(city.cc)}
                    </span>
                    {isChosen(city.name) && (
                      <Check aria-hidden className="size-4 text-taxi" strokeWidth={2.5} />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {options.typed !== null && (
              <CommandGroup>
                <CommandItem
                  value={`typed:${options.typed}`}
                  onSelect={() => choose({ kind: "city", name: options.typed ?? "" })}
                >
                  <Sparkles aria-hidden className="size-4 text-taxi" strokeWidth={2.25} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {t.donate.useTyped.replace("{name}", options.typed)}
                  </span>
                </CommandItem>
              </CommandGroup>
            )}

            {/* something matched, but it may not be the city they mean: the way to their own stays open */}
            {query.trim() !== "" &&
              options.typed === null &&
              options.built === null &&
              !nothing && (
                <CommandGroup>
                  <CommandItem
                    value="choice:other-typed"
                    onSelect={() => choose({ kind: "other", text: tidyCity(query) })}
                  >
                    <PencilLine aria-hidden className="size-4 text-paper-dim" strokeWidth={2.25} />
                    <span className="min-w-0 flex-1 truncate font-medium text-paper-dim">
                      {t.donate.otherOption}
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}

            {options.built !== null && (
              <p className="px-3.5 py-3 text-sm text-paper-dim">
                {t.donate.alreadyBuilt.replace("{name}", options.built.name)}
              </p>
            )}
            {nothing && options.built === null && !loading && (
              <p className="px-3.5 py-3 text-sm text-paper-dim">{t.donate.noMatch}</p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
