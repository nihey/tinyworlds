"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight, Heart } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { MovingPicture } from "@/components/home/moving-picture";
import { Wordmark } from "@/components/map/wordmark";
import { ACTION, ACTION_QUIET } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { FADE_MS, lastSeen, mayAdvance, SLIDE_MS, stepSlide } from "@/lib/home";
import { cn } from "@/lib/utils";
import { documentPage, watchHidden } from "@/lib/visits";
import { HERO_FILMS, heroSlides, worldHero, worldUrl } from "@/site";
import { WORLDS } from "@/worlds";

/** The worlds the hero goes round: every one of the registry that has a film, in its order. */
const SLIDES = heroSlides(Object.keys(WORLDS), HERO_FILMS);

/** How long before a slide's turn its still is asked for, so it is there when the turn comes. */
const AHEAD_MS = 1000;

const ARROW =
  "grid size-10 shrink-0 place-items-center rounded-full text-paper outline-none transition-colors hover:bg-sign-raised focus-visible:shadow-[0_0_0_2px_var(--taxi)]";

/**
 * The top of the front page: every world in turn, alive, with the page's sign over its lower
 * left corner. The sign keeps the site's name and what it is; under them it names the world
 * being shown, and its button leads there. The hero moves on by itself every few seconds, for
 * someone who is watching (`mayAdvance`), and never for a visitor who asked for less motion or
 * less data; arrows and a dot per world choose one, and a choice stops it: from then on the
 * hero is the visitor's, and each world they choose is said to a screen reader. With one world to show
 * it is a picture and a sign, as it was. On a narrow screen the sign hangs from the picture's
 * edge instead of covering it.
 */
export function HeroCarousel({ takesDonations }: { takesDonations: boolean }) {
  const { t, locale } = useI18n();
  const [current, setCurrent] = useState(0);
  // the slide the current one is coming in over; gone once the fade is
  const [leaving, setLeaving] = useState<number | null>(null);
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

  const world = WORLDS[SLIDES[current]];
  const copy = world.copy[locale];
  const moving = mayAdvance({
    slides: SLIDES.length,
    calm,
    saveData,
    hidden,
    inView,
    hovered,
    focused,
    chosen,
  });

  /** The visitor's choice of a slide: from here on the hero waits for them. */
  const choose = (to: number) => {
    setChosen(true);
    if (to === current) return;
    setLeaving(calm ? null : current);
    setCurrent(to);
  };

  // what the moment is: a tab behind another (it may have been opened there), the hero off screen
  useEffect(() => {
    const unwatch = watchHidden(documentPage(), setHidden);
    const box = picture.current;
    const watcher = new IntersectionObserver(
      (entries) => setInView((was) => lastSeen(entries, was)),
      { threshold: 0.4 },
    );
    if (box) watcher.observe(box);
    return () => {
      unwatch();
      watcher.disconnect();
    };
  }, []);

  // the turn of the next world: its still a moment before, so the picture is there to fade in
  useEffect(() => {
    if (!moving) return;
    const next = stepSlide(current, 1, SLIDES.length);
    const ahead = window.setTimeout(() => {
      new Image().src = worldHero(SLIDES[next]).still;
    }, SLIDE_MS - AHEAD_MS);
    const turn = window.setTimeout(() => {
      setLeaving(current);
      setCurrent(next);
    }, SLIDE_MS);
    return () => {
      window.clearTimeout(ahead);
      window.clearTimeout(turn);
    };
  }, [moving, current]);

  // the slide left behind stays under the new one until that has faded in
  useEffect(() => {
    if (leaving === null) return;
    const done = window.setTimeout(() => setLeaving(null), FADE_MS);
    return () => window.clearTimeout(done);
  }, [leaving, current]);

  const onKeys = (event: KeyboardEvent) => {
    if (event.key === "ArrowLeft") choose(stepSlide(current, -1, SLIDES.length));
    else if (event.key === "ArrowRight") choose(stepSlide(current, 1, SLIDES.length));
    else return;
    event.preventDefault();
  };

  const explore = t.home.explore.replace("{city}", copy.city);
  const film = worldHero(world.id);
  const before = leaving === null ? null : worldHero(SLIDES[leaving]);

  return (
    <header
      className="relative"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      // the focus a key moved in: a click on an arrow should not hold the hero still for good
      onFocus={(event) => setFocused(event.target.matches(":focus-visible"))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      {/* said to a screen reader: the world the visitor chose, never one the timer brought. The
          region is there, and polite, from the start: one made polite along with its first
          words would not be heard */}
      <p aria-live="polite" aria-atomic className="sr-only">
        {chosen ? copy.city : ""}
      </p>
      <div
        ref={picture}
        className="relative aspect-[16/11] w-full overflow-hidden rounded-[10px] bg-sign-raised shadow-[0_0_0_1px_rgb(0_0_0/0.6),0_16px_34px_-14px_rgb(0_0_0/0.65)] sm:aspect-[16/9] lg:aspect-[2/1]"
      >
        {before && leaving !== null && (
          <MovingPicture
            key={SLIDES[leaving]}
            still={before.still}
            loop={before.loop}
            alt=""
            active={false}
            className="absolute inset-0 size-full"
          />
        )}
        <MovingPicture
          key={world.id}
          still={film.still}
          loop={film.loop}
          alt=""
          eager={current === 0}
          className={cn("absolute inset-0 size-full", leaving !== null && "hero-in")}
          style={{ animationDuration: `${FADE_MS}ms` }}
        />
        {/* the picture leads where the sign's button does: for a pointer only, the button is the link */}
        <a
          href={worldUrl(world.id)}
          tabIndex={-1}
          aria-hidden
          className="absolute inset-0 outline-none"
        />
      </div>

      <div className="sign relative mx-3 -mt-14 overflow-hidden sm:mx-5 sm:-mt-24 sm:max-w-md lg:absolute lg:bottom-5 lg:left-5 lg:m-0 lg:w-full">
        <div aria-hidden className="h-[3px] bg-taxi" />
        <div className="px-5 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6">
          <h1>
            <Wordmark className="text-[clamp(2.75rem,12vw,3.75rem)]" />
          </h1>
          <p className="pt-2.5 text-xl leading-tight font-semibold text-paper">{t.home.tagline}</p>
          <p className="pt-1.5 text-[15px] leading-relaxed text-paper-dim">{t.home.pitch}</p>
          {/* the world being shown: one line each, so the sign is as tall whatever the world */}
          <div className="mt-4 border-t border-sign-line pt-3.5">
            {/* the world's wordmark at one size for every world: there is room here for the
                longest, which `Wordmark` would set smaller */}
            <span
              role="img"
              aria-label={`tiny${world.wordmark}`}
              className="block font-pixel text-xl leading-none tracking-[0.03em] select-none"
            >
              <span aria-hidden>
                tiny<span style={{ color: world.accent.color }}>{world.wordmark}</span>
              </span>
            </span>
            <p className="truncate pt-1.5 text-[22px] leading-7 font-semibold text-paper">
              {copy.city}
            </p>
          </div>
          <div className="flex flex-col gap-2.5 pt-4 sm:flex-row">
            <a href={worldUrl(world.id)} aria-label={explore} className={ACTION}>
              {t.home.exploreShort}
              <ArrowUpRight aria-hidden className="size-4" strokeWidth={2.5} />
            </a>
            {takesDonations && (
              <a href="#ranking" className={ACTION_QUIET}>
                <Heart aria-hidden className="size-4" strokeWidth={2.25} />
                {t.home.fundNext}
              </a>
            )}
          </div>
        </div>
      </div>

      {SLIDES.length > 1 && (
        <div
          role="group"
          aria-label={t.home.carousel.label}
          onKeyDown={onKeys}
          style={{ "--dot": world.accent.color } as CSSProperties}
          className="sign absolute top-3 right-3 flex h-11 items-center rounded-full px-0.5 lg:top-auto lg:right-5 lg:bottom-5"
        >
          <button
            type="button"
            onClick={() => choose(stepSlide(current, -1, SLIDES.length))}
            aria-label={t.home.carousel.previous}
            className={ARROW}
          >
            <ChevronLeft aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
          {/* a dot per world from `sm`; on a phone, where they would be too small to press, a count */}
          <span
            aria-hidden
            className="px-1 text-xs font-semibold text-paper tabular-nums sm:hidden"
          >
            {current + 1} / {SLIDES.length}
          </span>
          <span className="hidden items-center sm:flex">
            {SLIDES.map((id, i) => (
              <button
                key={id}
                type="button"
                onClick={() => choose(i)}
                aria-label={t.home.carousel.show.replace("{city}", WORLDS[id].copy[locale].city)}
                aria-current={i === current ? "true" : undefined}
                className="group grid h-8 place-items-center px-[5px] outline-none"
              >
                <span
                  className={cn(
                    "h-1.5 rounded-full transition-[width,background-color] duration-200 group-focus-visible:shadow-[0_0_0_2px_var(--taxi)]",
                    i === current
                      ? "w-[18px] bg-(--dot)"
                      : "w-1.5 bg-paper/35 group-hover:bg-paper",
                  )}
                />
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={() => choose(stepSlide(current, 1, SLIDES.length))}
            aria-label={t.home.carousel.next}
            className={ARROW}
          >
            <ChevronRight aria-hidden className="size-4" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </header>
  );
}
