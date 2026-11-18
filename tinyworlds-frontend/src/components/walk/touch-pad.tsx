"use client";

import { Camera, CircleStop, Volume2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import type { ActionId } from "@/walk/controls";
import type { WalkGame } from "@/walk/game";

/** How far the stick must move for full input, in CSS pixels. */
const STICK = 40;
const LOOK = 2.2;

type Finger = { id: number; x: number; y: number };

function capture(event: ReactPointerEvent): boolean {
  try {
    event.currentTarget.setPointerCapture(event.pointerId);
    return true;
  } catch {
    return false;
  }
}

/** Held controls capture their finger. One-shot actions also work with keyboard activation. */
function TouchButton({
  game,
  action,
  label,
  icon: Icon,
  primary,
  urgent,
  hold,
}: {
  game: WalkGame;
  action: ActionId;
  label: string;
  icon?: LucideIcon;
  primary?: boolean;
  urgent?: boolean;
  hold?: boolean;
}) {
  const finger = useRef<number | null>(null);
  const tap = () => {
    game.press(action, true);
    game.press(action, false);
  };
  const release = (event: ReactPointerEvent) => {
    if (finger.current !== event.pointerId) return;
    finger.current = null;
    game.press(action, false);
  };

  useEffect(
    () => () => {
      if (finger.current !== null) game.press(action, false);
    },
    [action, game],
  );

  return (
    <button
      type="button"
      aria-label={Icon ? label : undefined}
      className={cn(
        "sign pointer-events-auto flex min-h-11 min-w-11 touch-none items-center justify-center rounded-full text-xs font-semibold select-none active:brightness-125 focus-visible:ring-2 focus-visible:ring-taxi focus-visible:outline-none",
        !Icon && "px-4",
        primary && "min-h-12 bg-taxi text-taxi-ink",
        urgent && "bg-[#c8473c] text-white ring-2 ring-paper",
      )}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        if (!hold) tap();
        else if (finger.current === null && capture(event)) {
          finger.current = event.pointerId;
          game.press(action, true);
        }
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onClick={(event) => {
        if (event.detail === 0) tap();
      }}
    >
      {Icon ? <Icon aria-hidden className="size-5" strokeWidth={2.25} /> : label}
    </button>
  );
}

/** The left half moves. The right half looks. Action buttons sit above the gesture surface. */
export function TouchPad({ game }: { game: WalkGame }) {
  const { t } = useI18n();
  const w = t.walk.touch;
  const base = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const move = useRef<Finger | null>(null);
  const look = useRef<Finger | null>(null);
  const [mode, setMode] = useState(game.state.mode);
  const [near, setNear] = useState(game.state.near?.kind);
  const [riding, setRiding] = useState(game.state.vehicle?.kind === "motorcycle");
  const [urgent, setUrgent] = useState(game.state.vehicle?.explodesIn != null);

  useEffect(
    () =>
      game.subscribe((s) => {
        setMode(s.mode);
        setNear(s.near?.kind);
        setRiding(s.vehicle?.kind === "motorcycle");
        setUrgent(s.vehicle?.explodesIn != null);
      }),
    [game],
  );

  useEffect(() => {
    const clear = () => {
      move.current = null;
      look.current = null;
      game.stick(0, 0);
      if (base.current) base.current.style.display = "none";
    };
    window.addEventListener("blur", clear);
    return () => {
      window.removeEventListener("blur", clear);
      clear();
    };
  }, [game]);

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const left = event.clientX < bounds.left + bounds.width / 2;
    const slot = left ? move : look;
    if (slot.current || !capture(event)) return;
    slot.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (left && base.current && knob.current) {
      base.current.style.display = "grid";
      base.current.style.transform = `translate3d(${event.clientX - bounds.left - STICK}px, ${event.clientY - bounds.top - STICK}px, 0)`;
      knob.current.style.transform = "none";
    }
  };

  const onMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const stick = move.current;
    if (stick?.id === event.pointerId) {
      const x = event.clientX - stick.x;
      const y = event.clientY - stick.y;
      const length = Math.max(STICK, Math.hypot(x, y));
      const dx = x / length;
      const dy = y / length;
      game.stick(dx, dy);
      if (knob.current)
        knob.current.style.transform = `translate3d(${dx * STICK}px, ${dy * STICK}px, 0)`;
    }
    const camera = look.current;
    if (camera?.id === event.pointerId) {
      game.look((event.clientX - camera.x) * LOOK, (event.clientY - camera.y) * LOOK);
      camera.x = event.clientX;
      camera.y = event.clientY;
    }
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (look.current?.id === event.pointerId) look.current = null;
    if (move.current?.id !== event.pointerId) return;
    move.current = null;
    game.stick(0, 0);
    if (base.current) base.current.style.display = "none";
  };

  const driving = mode === "drive" || mode === "boat";

  return (
    <div
      className="pointer-events-none absolute inset-0 z-[5] select-none"
      onContextMenu={(event) => event.preventDefault()}
    >
      <div
        className="pointer-events-auto absolute inset-0 touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onLostPointerCapture={onUp}
      >
        <div
          ref={base}
          aria-hidden
          className="pointer-events-none absolute top-0 left-0 hidden size-20 place-items-center rounded-full border-2 border-paper/50 bg-sign/25"
        >
          <div ref={knob} className="size-8 rounded-full bg-taxi/85" />
        </div>
      </div>

      <div className="absolute right-(--edge-r) bottom-[calc(var(--edge-b)+2.25rem)] grid max-w-[calc(100%-var(--edge-l)-var(--edge-r)-var(--walk-mm)-0.5rem)] justify-items-end gap-2">
        {driving ? (
          <>
            <div className="flex flex-wrap justify-end gap-1.5">
              <TouchButton game={game} action="horn" label={w.horn} icon={Volume2} hold />
              <TouchButton game={game} action="camera" label={w.camera} icon={Camera} />
              {mode === "drive" && (
                <TouchButton
                  game={game}
                  action="handbrake"
                  label={w.brake}
                  icon={CircleStop}
                  hold
                />
              )}
            </div>
            <TouchButton
              game={game}
              action="exit"
              label={riding ? w.dismount : w.exit}
              primary
              urgent={urgent}
            />
          </>
        ) : (
          <div className="flex flex-wrap justify-end gap-2">
            {near && (
              <TouchButton
                game={game}
                action="enter"
                label={near === "motorcycle" ? w.mount : w.enter}
                primary
              />
            )}
            {mode === "foot" && <TouchButton game={game} action="jump" label={w.jump} hold />}
          </div>
        )}
      </div>
    </div>
  );
}
