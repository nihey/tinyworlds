"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import type { ActionId } from "@/walk/controls";
import type { WalkGame, WalkState } from "@/walk/game";

/**
 * The walk on a touch screen: a thumb stick wherever a finger comes down on the left half
 * (it walks, swims, drives or sails), dragging on the right half looks round, and buttons do
 * what the keys would: jump and get in on foot, the horn, the camera, the brake and getting out
 * at the wheel, in the bottom-right corner (above the credit, clear of the minimap across from
 * it, which lets touches through to the stick). Back to the map is the signs' own button, which
 * stays above even the wasted screen, so it is one tap away whatever happens.
 */

/** How far the stick's knob goes from where the thumb came down, CSS px. */
const STICK = 48;
/** Touch moves look this much more than the mouse's. */
const LOOK = 2.2;

interface Finger {
  id: number;
  stick: boolean;
  x0: number;
  y0: number;
  x: number;
  y: number;
}

export function TouchPad({ game }: { game: WalkGame }) {
  const { t } = useI18n();
  const pad = useRef<HTMLDivElement>(null);
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const fingers = useRef(new Map<number, Finger>());
  const [mode, setMode] = useState<WalkState["mode"]>(game.state.mode);
  const [near, setNear] = useState(game.state.near !== null);

  useEffect(
    () =>
      game.subscribe((s) => {
        setMode(s.mode);
        setNear(s.near !== null);
      }),
    [game],
  );

  const showStick = (x: number, y: number, dx: number, dy: number, on: boolean) => {
    const b = base.current;
    const k = knob.current;
    if (!b || !k) return;
    b.style.display = on ? "block" : "none";
    b.style.transform = `translate(${x - STICK}px, ${y - STICK}px)`;
    k.style.transform = `translate(${dx}px, ${dy}px)`;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = pad.current?.getBoundingClientRect();
    if (!r) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* gone already */
    }
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const stick = x < r.width / 2 && ![...fingers.current.values()].some((f) => f.stick);
    fingers.current.set(e.pointerId, { id: e.pointerId, stick, x0: x, y0: y, x, y });
    if (stick) showStick(x, y, 0, 0, true);
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    const r = pad.current?.getBoundingClientRect();
    if (!f || !r) return;
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    if (f.stick) {
      let dx = x - f.x0;
      let dy = y - f.y0;
      const len = Math.hypot(dx, dy);
      if (len > STICK) {
        dx = (dx / len) * STICK;
        dy = (dy / len) * STICK;
      }
      game.stick(dx / STICK, dy / STICK);
      showStick(f.x0, f.y0, dx, dy, true);
    } else {
      game.look((x - f.x) * LOOK, (y - f.y) * LOOK);
    }
    f.x = x;
    f.y = y;
  };

  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const f = fingers.current.get(e.pointerId);
    fingers.current.delete(e.pointerId);
    if (f?.stick) {
      game.stick(0, 0);
      showStick(0, 0, 0, 0, false);
    }
  };

  // a button held down is the key held down; it never starts a stick or a look
  const hold = (action: ActionId) => ({
    onPointerDown: (e: ReactPointerEvent) => {
      e.stopPropagation();
      game.press(action, true);
    },
    onPointerUp: (e: ReactPointerEvent) => {
      e.stopPropagation();
      game.press(action, false);
    },
    onPointerCancel: () => game.press(action, false),
    onPointerLeave: () => game.press(action, false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  });

  const driving = mode === "drive" || mode === "boat";
  const button =
    "sign pointer-events-auto flex h-14 min-w-14 items-center justify-center rounded-full px-3 text-xs font-semibold select-none active:bg-sign-raised";

  return (
    <div
      ref={pad}
      className="absolute inset-0 z-[5] touch-none select-none"
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <div
        ref={base}
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 hidden size-24 rounded-full border-2 border-paper/50 bg-sign/25"
      >
        <div
          ref={knob}
          className="absolute top-1/2 left-1/2 -mt-[18px] -ml-[18px] size-9 rounded-full bg-taxi/85"
        />
      </div>

      {/* in the bottom-right corner over the credit, wrapping before they reach the minimap */}
      <div className="pointer-events-none absolute right-(--edge-r) bottom-[calc(var(--edge-b)+2.25rem)] flex max-w-[calc(100%-var(--walk-mm)-2.75rem)] flex-col items-end gap-2">
        <div className="flex flex-wrap justify-end gap-2">
          {driving ? (
            <>
              <button type="button" className={button} {...hold("horn")}>
                {t.walk.touch.horn}
              </button>
              <button type="button" className={button} {...hold("camera")}>
                {t.walk.touch.camera}
              </button>
              {mode === "drive" && (
                <button type="button" className={button} {...hold("handbrake")}>
                  {t.walk.touch.brake}
                </button>
              )}
              <button
                type="button"
                className={cn(button, "bg-taxi text-taxi-ink")}
                {...hold("exit")}
              >
                {t.walk.touch.exit}
              </button>
            </>
          ) : (
            <>
              {near && (
                <button
                  type="button"
                  className={cn(button, "bg-taxi text-taxi-ink")}
                  {...hold("enter")}
                >
                  {t.walk.touch.enter}
                </button>
              )}
              {mode === "foot" && (
                <button type="button" className={button} {...hold("jump")}>
                  {t.walk.touch.jump}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
