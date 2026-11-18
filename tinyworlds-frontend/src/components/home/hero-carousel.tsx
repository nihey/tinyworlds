"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MovingPicture } from "@/components/home/moving-picture";
import { Wordmark } from "@/components/map/wordmark";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { FADE_MS, lastSeen, mayAdvance, SLIDE_MS, stepSlide } from "@/lib/home";
import { cn } from "@/lib/utils";
import { documentPage, watchHidden } from "@/lib/visits";
import { worldHero, worldUrl } from "@/site";
import { WORLDS } from "@/worlds";

const ARROW =
  "grid size-9 shrink-0 place-items-center rounded-sm text-paper outline-none transition-colors hover:bg-white/15 focus-visible:shadow-[inset_0_0_0_2px_var(--taxi)]";

interface Slides {
  current: string;
  leaving: string | null;
  pending: { id: string; reason: "timer" | "manual" | "ranking" } | null;
}

/** A fixed introduction beside a rotating, linked city panorama. */
export function HeroCarousel({ order }: { order: string[] }) {
  const { t, locale } = useI18n();
  const [first] = useState(order[0]);
  const [lead, setLead] = useState(first);
  const [slides, setSlides] = useState<Slides>({ current: first, leaving: null, pending: null });
  const { current, leaving, pending } = slides;
  // the visitor has chosen a slide: the hero stops moving by itself, and says each choice
  const [chosen, setChosen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [inView, setInView] = useState(true);
  const [hidden, setHidden] = useState(false);
  // a data-saving connection is asked about once: it does not change under the page
  const [saveData] = useState(
    () =>
      typeof navigator !== "undefined" &&
      (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData ===
        true,
  );
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const picture = useRef<HTMLDivElement>(null);

  // The first successful visit counts can change the lead. Keep a visitor's choice and keep
  // the visible panorama in place while a newly ranked lead decodes.
  if (lead !== order[0]) {
    setLead(order[0]);
    if (current === lead && !pending && !chosen) {
      setSlides({ ...slides, pending: { id: order[0], reason: "ranking" } });
    }
  }

  const world = WORLDS[current];
  const copy = world.copy[locale];
  const moving = mayAdvance({
    slides: order.length,
    calm,
    saveData,
    hidden,
    inView,
    hovered,
    focused,
    chosen,
  });

  /** The visitor's choice of a slide: from here on the hero waits for them. */
  const step = (by: number) => {
    setChosen(true);
    setSlides((was) => {
      const from = was.pending?.reason === "manual" ? was.pending.id : was.current;
      const id = order[stepSlide(order.indexOf(from), by, order.length)];
      return { ...was, pending: id === was.current ? null : { id, reason: "manual" } };
    });
  };

  const showPending = useCallback(() => {
    setSlides((was) => {
      if (pending === null || was.pending !== pending) return was;
      if (pending.reason === "timer" && !moving) return { ...was, pending: null };
      if (pending.reason === "ranking" && (focused || hovered || chosen)) return was;
      return { current: pending.id, leaving: calm ? null : was.current, pending: null };
    });
  }, [pending, calm, moving, focused, hovered, chosen]);

  // what the moment is: a tab behind another (it may have been opened there), the hero off screen
  useEffect(() => {
    const unwatch = watchHidden(documentPage(), setHidden);
    const box = picture.current;
    if (!box || typeof IntersectionObserver === "undefined") return unwatch;
    const watcher = new IntersectionObserver(
      (entries) => setInView((was) => lastSeen(entries, was)),
      { threshold: 0.4 },
    );
    watcher.observe(box);
    return () => {
      unwatch();
      watcher.disconnect();
    };
  }, []);

  // At the next world's turn, start its still. The current slide stays until the still is ready.
  useEffect(() => {
    if (!moving || pending !== null) return;
    const id = order[stepSlide(order.indexOf(current), 1, order.length)];
    const turn = window.setTimeout(() => {
      setSlides((was) =>
        was.current === current && was.pending === null
          ? { ...was, pending: { id, reason: "timer" } }
          : was,
      );
    }, SLIDE_MS);
    return () => window.clearTimeout(turn);
  }, [moving, current, pending, order]);

  // the slide left behind stays under the new one until that has faded in
  useEffect(() => {
    if (leaving === null) return;
    const done = window.setTimeout(() => {
      setSlides((was) =>
        was.current === current && was.leaving === leaving ? { ...was, leaving: null } : was,
      );
    }, FADE_MS);
    return () => window.clearTimeout(done);
  }, [leaving, current]);

  const onKeys = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") step(-1);
    else if (event.key === "ArrowRight") step(1);
    else return;
    event.preventDefault();
  };

  const explore = t.home.explore.replace("{city}", copy.city);
  // Keep the same image node as a slide moves from prepared to current to leaving.
  const layers = [...new Set([leaving, current, pending?.id])].filter((id) => id != null);

  return (
    <header
      className="grid overflow-hidden rounded-sm bg-[#20342d] text-[#f8f3e7] md:min-h-[clamp(20rem,35vw,28.5rem)] md:grid-cols-[39%_61%]"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={(event) => setFocused(event.target.matches(":focus-visible"))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="flex min-w-0 flex-col items-start justify-center px-5 py-6 md:p-[clamp(1.5rem,3.4vw,3rem)]">
        <h1 className="text-[clamp(2rem,9.5vw,3.4rem)] leading-[0.96] font-extrabold tracking-[-0.06em] md:text-[clamp(2rem,4.45vw,4.1rem)]">
          {t.home.tagline.lead}{" "}
          <span className="block text-[#f7d65c]">{t.home.tagline.accent}</span>
        </h1>
        <p className="mt-3.5 max-w-[30ch] text-base leading-snug text-[#e7e9dc] md:mt-5 md:text-[clamp(1rem,1.45vw,1.25rem)]">
          {t.home.pitch}
        </p>
        <a
          href={worldUrl(world.id)}
          className="mt-5 inline-flex min-h-11 items-center gap-4 rounded-sm bg-taxi px-4 py-2.5 text-sm leading-tight font-bold text-taxi-ink outline-none hover:bg-[#ffdb57] focus-visible:ring-2 focus-visible:ring-taxi focus-visible:ring-offset-4 focus-visible:ring-offset-[#20342d] md:mt-6 md:text-base"
        >
          {explore}
          <ArrowUpRight aria-hidden className="size-4 shrink-0" strokeWidth={2.5} />
        </a>
      </div>
      <div
        ref={picture}
        className="relative row-start-1 aspect-[1.68] min-w-0 overflow-hidden bg-sign-raised md:col-start-2 md:aspect-auto"
      >
        {layers.map((id) => {
          const city = WORLDS[id];
          const film = worldHero(id);
          const shown = id === current;
          const prepared = id === pending?.id;
          return (
            <MovingPicture
              key={id}
              still={film.still}
              loop={film.loop}
              alt=""
              focus="right"
              fallback={
                <Wordmark suffix={city.wordmark} accent={city.accent.color} className="text-4xl" />
              }
              eager={shown && id === first}
              active={shown && !chosen}
              onStillReady={prepared ? showPending : undefined}
              className={cn(
                "absolute inset-0 size-full",
                prepared && id !== leaving && "invisible",
                shown && leaving !== null && "hero-in",
              )}
              style={shown && leaving !== null ? { animationDuration: FADE_MS + "ms" } : undefined}
            />
          );
        })}
        <a
          href={worldUrl(world.id)}
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0 outline-none"
        />
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2 text-xs md:inset-x-3.5 md:bottom-3.5">
          {order.length > 1 && (
            <div
              role="group"
              aria-label={t.home.carousel.label}
              onKeyDown={onKeys}
              className="pointer-events-auto flex shrink-0 items-center rounded-sm bg-[#18211e] px-0.5"
            >
              <button
                type="button"
                onClick={() => step(-1)}
                aria-label={t.home.carousel.previous}
                className={ARROW}
              >
                <ChevronLeft aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
              <span aria-hidden className="px-0.5 font-semibold text-paper tabular-nums">
                {order.indexOf(current) + 1} / {order.length}
              </span>
              <button
                type="button"
                onClick={() => step(1)}
                aria-label={t.home.carousel.next}
                className={ARROW}
              >
                <ChevronRight aria-hidden className="size-4" strokeWidth={2.5} />
              </button>
              {!calm && !saveData && (
                <button
                  type="button"
                  onClick={() => setChosen(!chosen)}
                  aria-label={chosen ? t.home.carousel.play : t.home.carousel.pause}
                  className={ARROW}
                >
                  {chosen ? (
                    <Play aria-hidden className="size-3.5" />
                  ) : (
                    <Pause aria-hidden className="size-3.5" />
                  )}
                </button>
              )}
            </div>
          )}
          <p className="ml-auto flex min-w-0 items-center gap-2 rounded-sm bg-[#18211e] px-2 py-1.5 font-semibold text-paper">
            <span aria-hidden className="size-1.5 shrink-0 bg-taxi" />
            <span className="truncate">{copy.city}</span>
          </p>
        </div>
        <span aria-live="polite" aria-atomic className="sr-only">
          {chosen ? copy.city : ""}
        </span>
      </div>
    </header>
  );
}
