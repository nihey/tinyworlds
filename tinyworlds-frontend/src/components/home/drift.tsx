"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A list that drifts by when there is more of it than fits: up a column, or along a row. The
 * list is then there twice over, so where it ends it begins again with no seam (the second
 * copy is nothing to a screen reader or the keyboard). It stands still under the pointer and
 * while something in it has the focus, and never moves under `prefers-reduced-motion`: there
 * it is one list that can be scrolled by hand. A list that fits is simply the list.
 */
export function Drift({
  axis,
  speed,
  className,
  children,
}: {
  axis: "x" | "y";
  /** CSS px a second */
  speed: number;
  className?: string;
  /** the list, with its own gap after its last item (`pb-*` / `pr-*`): the copies meet there */
  children: ReactNode;
}) {
  const frame = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLDivElement>(null);
  // how long one copy takes to pass; null while the list fits, or may not move
  const [seconds, setSeconds] = useState<number | null>(null);

  useEffect(() => {
    const window_ = frame.current;
    const copy = first.current;
    if (!window_ || !copy) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    const measure = () => {
      const room = axis === "y" ? window_.clientHeight : window_.clientWidth;
      const length = axis === "y" ? copy.offsetHeight : copy.offsetWidth;
      setSeconds(!still.matches && length > room ? length / speed : null);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(window_);
    observer.observe(copy);
    still.addEventListener("change", measure);
    return () => {
      observer.disconnect();
      still.removeEventListener("change", measure);
    };
  }, [axis, speed]);

  return (
    <div
      ref={frame}
      data-drifting={seconds === null ? undefined : ""}
      className={cn("drift", axis === "y" ? "drift-y" : "drift-x", className)}
    >
      <div
        className="drift-track"
        style={seconds === null ? undefined : { animationDuration: `${seconds}s` }}
      >
        <div ref={first}>{children}</div>
        {seconds !== null && (
          <div aria-hidden inert>
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
