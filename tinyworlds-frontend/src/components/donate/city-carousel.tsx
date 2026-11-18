import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";

const ARROW =
  "inline-flex size-9 items-center justify-center rounded-full border border-sign-line text-paper hover:border-taxi hover:text-taxi focus-visible:outline-2 focus-visible:outline-taxi disabled:pointer-events-none disabled:opacity-35";

const SCROLL_SPEED = 42;

export function CityCarousel({
  title,
  icon,
  query,
  note,
  autoplay = false,
  children,
}: {
  title: string;
  icon?: ReactNode;
  query: string;
  note?: string;
  autoplay?: boolean;
  children: ReactNode[];
}) {
  const { t } = useI18n();
  const id = useId();
  const track = useRef<HTMLOListElement>(null);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [hasNext, setHasNext] = useState(false);
  const scrollable = hasPrevious || hasNext;
  const calm = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [visible, setVisible] = useState(false);
  const autoAvailable = autoplay && scrollable && !calm && !query;
  const moving = autoAvailable && visible && !paused && !hovered && !focused;
  const direction = useRef(1);
  const drag = useRef<{ id: number; x: number; left: number } | null>(null);
  const blockClick = useRef(false);

  useLayoutEffect(() => {
    track.current?.scrollTo({ left: 0, behavior: "instant" });
    direction.current = 1;
  }, [query]);

  useEffect(() => {
    const node = track.current;
    if (!node) return;
    const measure = () => {
      setHasPrevious(node.scrollLeft > 1);
      setHasNext(node.scrollWidth - node.clientWidth - node.scrollLeft > 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener("scroll", measure);
    };
  }, [children.length]);

  useEffect(() => {
    const node = track.current;
    if (!autoplay || !node) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, [autoplay]);

  useEffect(() => {
    const node = track.current;
    if (!moving || !node) return;
    let position = node.scrollLeft;
    let previous: number | undefined;
    const advance = (now: number) => {
      // Background tabs suspend animation frames. Cap the first frame back so it cannot skip.
      const elapsed = Math.min(50, now - (previous ?? now)) / 1000;
      previous = now;
      const end = node.scrollWidth - node.clientWidth;
      position = Math.max(0, Math.min(end, position + direction.current * SCROLL_SPEED * elapsed));
      // Reverse at the ends so each city needs only one card in the track.
      if (position === end) direction.current = -1;
      else if (position === 0) direction.current = 1;
      node.scrollTo({ left: position, behavior: "instant" });
      frame = requestAnimationFrame(advance);
    };
    let frame = requestAnimationFrame(advance);

    return () => cancelAnimationFrame(frame);
  }, [moving]);

  function move(direction: number) {
    const node = track.current;
    if (autoAvailable) setPaused(true);
    if (node) node.scrollBy({ left: direction * node.clientWidth });
  }

  function startDrag(event: PointerEvent<HTMLOListElement>) {
    blockClick.current = false;
    if (autoAvailable && event.pointerType !== "mouse") setPaused(true);
    if (!scrollable || event.pointerType !== "mouse" || event.button !== 0) return;
    drag.current = { id: event.pointerId, x: event.clientX, left: event.currentTarget.scrollLeft };
  }

  function moveDrag(event: PointerEvent<HTMLOListElement>) {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    const node = event.currentTarget;
    const distance = event.clientX - start.x;
    if (!node.hasPointerCapture(event.pointerId)) {
      // Let buttons and links receive a normal click until the pointer actually drags.
      if (Math.abs(distance) < 6) return;
      if (autoAvailable) setPaused(true);
      node.setPointerCapture(event.pointerId);
      node.dataset.dragging = "";
      blockClick.current = true;
    }
    node.scrollTo({ left: start.left - distance, behavior: "instant" });
  }

  function endDrag(event: PointerEvent<HTMLOListElement>) {
    const start = drag.current;
    if (start?.id !== event.pointerId) return;
    drag.current = null;
    const node = event.currentTarget;
    if (!node.hasAttribute("data-dragging")) return;
    const first = node.firstElementChild;
    const second = first?.nextElementSibling;
    const step =
      first && second
        ? second.getBoundingClientRect().left - first.getBoundingClientRect().left
        : 0;
    const distance = node.scrollLeft - start.left;
    let index = step > 0 ? Math.round(node.scrollLeft / step) : 0;
    // A short deliberate pull advances one card. Longer drags can cross several.
    if (step > 0 && Math.abs(distance) >= 40 && index === Math.round(start.left / step)) {
      index += Math.sign(distance);
    }
    delete node.dataset.dragging;
    node.scrollTo({ left: index * step });
  }

  return (
    <section
      aria-labelledby={id}
      className="mt-5"
      onFocus={
        autoplay
          ? (event) =>
              setFocused(
                event.target.matches(":focus-visible") ||
                  Boolean(track.current?.contains(event.target)),
              )
          : undefined
      }
      onBlur={
        autoplay
          ? (event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
            }
          : undefined
      }
    >
      <div className="mb-2 flex min-h-9 items-center gap-3">
        <h3
          id={id}
          className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-[0.14em] text-paper-dim uppercase"
        >
          {icon}
          {title}
        </h3>
        <span aria-hidden className="h-px flex-1 bg-sign-line" />
        {scrollable && (
          <div className="flex gap-1.5">
            <button
              type="button"
              className={ARROW}
              aria-label={t.home.carousel.previous}
              aria-describedby={id}
              aria-controls={`${id}-cities`}
              disabled={!hasPrevious}
              onClick={() => move(-1)}
            >
              <ChevronLeft aria-hidden className="size-4" />
            </button>
            <button
              type="button"
              className={ARROW}
              aria-label={t.home.carousel.next}
              aria-describedby={id}
              aria-controls={`${id}-cities`}
              disabled={!hasNext}
              onClick={() => move(1)}
            >
              <ChevronRight aria-hidden className="size-4" />
            </button>
            {autoAvailable && (
              <button
                type="button"
                className={ARROW}
                aria-label={paused ? t.home.carousel.play : t.home.carousel.pause}
                aria-describedby={id}
                aria-controls={`${id}-cities`}
                onClick={() => setPaused((value) => !value)}
              >
                {paused ? (
                  <Play aria-hidden className="size-3.5" />
                ) : (
                  <Pause aria-hidden className="size-3.5" />
                )}
              </button>
            )}
          </div>
        )}
      </div>
      {note && <p className="pb-2 text-sm leading-relaxed text-taxi">{note}</p>}
      <ol
        ref={track}
        id={`${id}-cities`}
        aria-labelledby={id}
        tabIndex={scrollable ? 0 : undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onPointerEnter={(event) => {
          if (autoplay && event.pointerType === "mouse") setHovered(true);
        }}
        onPointerLeave={(event) => {
          if (autoplay && event.pointerType === "mouse") setHovered(false);
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) endDrag(event);
        }}
        onDragStart={(event) => {
          if (scrollable) event.preventDefault();
        }}
        onClickCapture={(event) => {
          if (blockClick.current && event.detail > 0) {
            event.preventDefault();
            event.stopPropagation();
            blockClick.current = false;
          }
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          move(event.key === "ArrowRight" ? 1 : -1);
        }}
        className={cn(
          "grid auto-cols-[88%] grid-flow-col gap-3 sm:auto-cols-[calc((100%-0.75rem)/2)] lg:auto-cols-[calc((100%-1.5rem)/3)] [&>li]:min-w-0 [&>li]:snap-start max-sm:has-[>:only-child]:auto-cols-[100%]",
          "overflow-x-auto overscroll-x-contain rounded-lg [scrollbar-width:none] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-taxi motion-safe:scroll-smooth",
          !autoAvailable && "snap-x snap-mandatory",
          scrollable &&
            "cursor-grab select-none data-dragging:cursor-grabbing data-dragging:snap-none",
        )}
      >
        {children}
      </ol>
    </section>
  );
}
