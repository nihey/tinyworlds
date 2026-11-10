"use client";

import { ArrowLeft, Search, X } from "lucide-react";
import { useId, useMemo, useState, type KeyboardEvent, type RefObject } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import type { Place } from "@/map/manifest";
import type { SearchIndex } from "@/map/search";
import { HOME_URL } from "@/site";
import { PlaceBullet, placeLabel } from "./place-types";
import { Wordmark } from "./wordmark";

interface SearchSignProps {
  /** null while places.json is still on its way */
  index: SearchIndex | null;
  /** places.json could not be loaded */
  unavailable: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  onChoose: (place: Place) => void;
  /** the box was emptied: drop the pin too */
  onClear: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * The sign in the corner: the way back to the front page, the wordmark, and a search box that
 * opens downwards into results.
 */
export function SearchSign({
  index,
  unavailable,
  query,
  onQueryChange,
  onChoose,
  onClear,
  inputRef,
  className,
  style,
}: SearchSignProps) {
  const listId = useId();
  const { t, copy } = useI18n();
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);

  const typed = query.trim() !== "";
  const results = useMemo<Place[]>(() => {
    if (!index) return [];
    return typed ? index.search(query, 8).map((hit) => hit.place) : index.suggest(6);
  }, [index, query, typed]);

  const open = focused && !unavailable && (results.length > 0 || typed);
  const current = Math.min(active, results.length - 1);

  const choose = (place: Place) => {
    onQueryChange(place.n);
    onChoose(place);
    inputRef.current?.blur();
  };

  const clear = () => {
    onQueryChange("");
    onClear();
    setActive(0);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && results.length > 0) {
      e.preventDefault();
      setActive((current + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length > 0) {
      e.preventDefault();
      setActive((current - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[current]) choose(results[current]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (typed) clear();
      else inputRef.current?.blur();
    }
  };

  const placeholder = unavailable
    ? t.search.unavailable
    : index
      ? copy.searchPlaceholder
      : t.search.loading;

  return (
    <div role="search" className={cn("sign z-10 overflow-hidden", className)} style={style}>
      {/* the yellow edge every sign on this map hangs from */}
      <div aria-hidden className="h-[3px] bg-taxi" />
      <div className="flex h-12 items-center">
        {/* another build of the site, so a plain link */}
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={HOME_URL}
              aria-label={t.about.allCities}
              className="bullet ml-1 size-9 text-paper-dim hover:text-paper"
            >
              <ArrowLeft className="size-[18px]" strokeWidth={2.25} />
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={8}>
            {t.about.allCities}
          </TooltipContent>
        </Tooltip>
        <Wordmark className="pr-3 pl-1 text-[26px]" />
        <span aria-hidden className="h-6 w-px bg-sign-line" />
        <label className="flex h-full min-w-0 flex-1 items-center gap-2 pr-2 pl-3">
          <Search aria-hidden className="size-4 shrink-0 text-paper-dim" strokeWidth={2.25} />
          <input
            ref={inputRef}
            type="text"
            name="q"
            inputMode="search"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={unavailable}
            value={query}
            placeholder={placeholder}
            role="combobox"
            aria-label={t.search.inputLabel}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && results[current] ? `${listId}-${current}` : undefined}
            onChange={(e) => {
              onQueryChange(e.target.value);
              setActive(0);
              if (e.target.value.trim() === "") onClear();
            }}
            onFocus={(e) => {
              setFocused(true);
              e.target.select();
            }}
            onBlur={() => setFocused(false)}
            onKeyDown={onKeyDown}
            // 16px keeps iOS from zooming the page when the box is focused
            className="h-full min-w-0 flex-1 bg-transparent text-base font-medium text-paper outline-none placeholder:font-normal placeholder:text-paper-dim/80 disabled:cursor-not-allowed sm:text-[15px]"
          />
          {typed ? (
            <button
              type="button"
              aria-label={t.search.clear}
              onClick={() => {
                clear();
                inputRef.current?.focus();
              }}
              className="bullet size-8 text-paper-dim hover:text-paper"
            >
              <X className="size-4" strokeWidth={2.25} />
            </button>
          ) : (
            !focused &&
            !unavailable && (
              <kbd aria-hidden className="kbd-key mr-1.5 max-sm:hidden">
                /
              </kbd>
            )
          )}
        </label>
      </div>

      <div
        id={listId}
        role="listbox"
        aria-label={t.search.listLabel}
        hidden={!open}
        // keep the focus in the box while a result is being pressed
        onPointerDown={(e) => e.preventDefault()}
        className="border-t border-sign-line py-1.5"
      >
        {!typed && results.length > 0 && (
          <p className="px-3.5 pt-1 pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-paper-dim uppercase">
            {t.search.startSomewhere}
          </p>
        )}
        {results.map((place, i) => {
          return (
            <div
              key={`${place.t}:${place.n}:${place.lon}:${place.lat}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === current}
              onPointerMove={() => i !== current && setActive(i)}
              onClick={() => choose(place)}
              className={cn(
                "relative flex cursor-pointer items-center gap-3 py-1.5 pr-3.5 pl-3.5",
                i === current && "bg-sign-raised",
              )}
            >
              {i === current && (
                <span aria-hidden className="absolute inset-y-1 left-0 w-[3px] rounded-r bg-taxi" />
              )}
              <PlaceBullet type={place.t} />
              <span className="min-w-0 flex-1 truncate text-[14.5px] leading-tight font-medium">
                {place.n}
              </span>
              <span className="max-w-[45%] shrink-0 truncate text-xs text-paper-dim">
                {place.b && place.b !== place.n ? place.b : placeLabel(place.t, t, copy)}
              </span>
            </div>
          );
        })}
        {typed && results.length === 0 && (
          <p className="px-3.5 py-2 text-sm text-paper-dim">
            {index ? t.search.nothing : t.search.stillLoading}
          </p>
        )}
      </div>
    </div>
  );
}
