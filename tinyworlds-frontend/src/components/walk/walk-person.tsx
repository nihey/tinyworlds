"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import type { MapEngine } from "@/map/engine";
import { PERSON, PERSON_H, PERSON_W, personColours } from "@/map/person";
import type { Drop } from "@/walk/drop";
import type { MapFrame, WalkData } from "@/walk/load";
import { WORLD } from "@/worlds";

/**
 * The little person in the tool column, and the three ways to put it down: drag it onto the
 * map (the ways it can stand on light up near the pointer, and it dangles over the spot), tap
 * it and then tap the map (`armed`: the map's own tap is taken by `useStreetWalk`), or the
 * keyboard (activating the button, like the W key, puts it down in the middle of the map).
 * Nothing of the walk is downloaded until the person is picked up: the squares, the drop and
 * the highlight come through `import()`. A point on the map is a point as the map draws it:
 * a bridge's deck is drawn raised, so it is hit where it is drawn, not at its footprint.
 */

/** The ways within this many metres of the pointer light up while the person is carried. */
const LIGHT_REACH = 110;
/** A press that moves less than this, CSS px, is a tap, not a drag. */
const DRAG_START = 6;

async function walkData(version: string | undefined) {
  const { walkData: load } = await import("@/walk/load");
  return load(version);
}

/** The walk's data, and how the map on screen places it (its projection, whichever way it is
 * turned). */
async function walkOnMap(
  engine: MapEngine,
  version: string | undefined,
): Promise<{ data: WalkData; frame: MapFrame }> {
  const { walkData: load, mapFrame } = await import("@/walk/load");
  const data = await load(version);
  return { data, frame: mapFrame(data.ix.geo, engine) };
}

/** Where a person put down stands, in the walk's metres (z: on a deck) and on the ground of the map. */
export type PlacedDrop = Drop & { lon: number; lat: number };

const placed = (data: WalkData, drop: Drop | null): PlacedDrop | null => {
  if (!drop) return null;
  const [lon, lat] = data.toLonLat(drop.e, drop.n);
  return { ...drop, lon, lat };
};

/**
 * Where a person put down at (lon, lat) on the ground stands (a walk link's spot), or null when
 * there is no street within reach. Throws when the walk's data cannot be read.
 */
export async function dropAtLonLat(
  version: string | undefined,
  lon: number,
  lat: number,
): Promise<PlacedDrop | null> {
  const data = await walkData(version);
  return placed(data, await data.dropAt(lon, lat));
}

/** The same for a point of the map as it is drawn, in its map px: a raised deck where it is drawn. */
export async function dropAtMapPx(
  engine: MapEngine,
  version: string | undefined,
  x: number,
  y: number,
): Promise<PlacedDrop | null> {
  const { data, frame } = await walkOnMap(engine, version);
  return placed(data, await data.dropAtMap(frame, x, y));
}

/** The same for a point on the map's canvas, in CSS px from its top left. */
export async function dropAtScreen(
  engine: MapEngine,
  version: string | undefined,
  x: number,
  y: number,
): Promise<PlacedDrop | null> {
  const m = engine.screenToMap(x, y);
  return dropAtMapPx(engine, version, m.x, m.y);
}

/** The person as pixels: an SVG, `px` CSS px per pixel. */
export function PersonFigure({ px, className }: { px: number; className?: string }) {
  const colours = personColours(WORLD.accent.color);
  return (
    <svg
      aria-hidden
      width={PERSON_W * px}
      height={PERSON_H * px}
      viewBox={`0 0 ${PERSON_W} ${PERSON_H}`}
      shapeRendering="crispEdges"
      className={className}
    >
      {PERSON.flatMap((row, y) =>
        [...row].map((ch, x) =>
          colours[ch] ? (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colours[ch]} />
          ) : null,
        ),
      )}
    </svg>
  );
}

interface WalkPersonProps {
  engine: MapEngine;
  /** the walk's files' version: `manifest.walk` */
  version: string | undefined;
  /** tapped (with a finger, or clicked with a mouse), waiting for the same on the map */
  armed: "touch" | "mouse" | null;
  onArmedChange: (armed: "touch" | "mouse" | null) => void;
  /** let go at (x, y) CSS px of the map's canvas (`useStreetWalk`'s `putDownAtScreen`) */
  onDropAt: (x: number, y: number) => void;
  /** activated from the keyboard: put down in the middle of the map */
  onCentre: () => void;
  /** whether the walk can be drawn here (says so when not): asked as the person is picked up */
  canDraw: () => Promise<boolean>;
}

interface Carry {
  id: number;
  x0: number;
  y0: number;
  moving: boolean;
}

export function WalkPerson({
  engine,
  version,
  armed,
  onArmedChange,
  onDropAt,
  onCentre,
  canDraw,
}: WalkPersonProps) {
  const { t } = useI18n();
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const carry = useRef<Carry | null>(null);
  // where the person was picked up: it dangles from the pointer from there
  const [carried, setCarried] = useState<{ x: number; y: number } | null>(null);
  const carrying = carried !== null;
  // what letting go here would do: walk, nothing (no street), or not known yet
  const [verdict, setVerdict] = useState<"walk" | "none" | null>(null);
  const dangle = useRef<HTMLDivElement>(null);
  // a click comes after the pointer lets go: after a drag, it is not a tap
  const dragged = useRef(false);
  // the latest point under the pointer, and whether one is being looked at
  const wanted = useRef<{ x: number; y: number } | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  // what pressed the person last: the armed sign says tap or click after it
  const pointer = useRef<"touch" | "mouse">("mouse");

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      void import("@/map/walker").then((m) => m.dropHighlight(engine, null));
    };
  }, [engine]);

  /** The map canvas's own point under a screen point, or null off the map. */
  const onMap = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = document.elementFromPoint(clientX, clientY);
    if (!(el instanceof HTMLCanvasElement) || !el.classList.contains("map-tiles")) return null;
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };

  /** Lights the ways near the point under the pointer, one look at a time. */
  const look = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      // nothing of the walk is fetched, and no "Let go" said, where it cannot be drawn
      if (!(await canDraw())) {
        carry.current = null;
        clear();
        return;
      }
      const [{ data, frame }, walker] = await Promise.all([
        walkOnMap(engine, version),
        import("@/map/walker"),
      ]);
      while (wanted.current && alive.current && carry.current?.moving) {
        const p = wanted.current;
        wanted.current = null;
        const m = engine.screenToMap(p.x, p.y);
        const drop = await data.dropAtMap(frame, m.x, m.y);
        if (!carry.current?.moving) break;
        walker.dropHighlight(engine, {
          ways: data.waysNearMap(frame, m.x, m.y, LIGHT_REACH),
          frame,
        });
        setVerdict(drop ? "walk" : "none");
      }
    } catch {
      // the walk's data is not there: letting go says so
    } finally {
      busy.current = false;
    }
  };

  const clear = () => {
    setCarried(null);
    setVerdict(null);
    wanted.current = null;
    void import("@/map/walker").then((m) => m.dropHighlight(engine, null));
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* the pointer is already gone */
    }
    carry.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moving: false };
    dragged.current = false;
    pointer.current = e.pointerType === "mouse" ? "mouse" : "touch";
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const c = carry.current;
    if (!c || c.id !== e.pointerId) return;
    if (!c.moving) {
      if (Math.hypot(e.clientX - c.x0, e.clientY - c.y0) < DRAG_START) return;
      c.moving = true;
      dragged.current = true;
      onArmedChange(null);
      setCarried({ x: e.clientX, y: e.clientY });
    }
    if (dangle.current)
      dangle.current.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    const p = onMap(e.clientX, e.clientY);
    if (!p) {
      setVerdict(null);
      return;
    }
    wanted.current = p;
    void look();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const c = carry.current;
    if (!c || c.id !== e.pointerId) return;
    carry.current = null;
    if (!c.moving) return;
    clear();
    if (e.type === "pointercancel") return;
    const p = onMap(e.clientX, e.clientY);
    if (p) onDropAt(p.x, p.y);
  };

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    // Enter or Space: no pointer, so no spot either; the middle of the map, as W does
    if (e.detail === 0) {
      onArmedChange(null);
      onCentre();
      return;
    }
    if (armed) {
      onArmedChange(null);
      return;
    }
    const how = pointer.current;
    void canDraw().then((ok) => ok && onArmedChange(how));
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={t.walk.person}
            aria-pressed={armed !== null}
            className="bullet touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onClick}
          >
            <PersonFigure px={2} className={cn(carrying && "opacity-30")} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="left"
          sideOffset={10}
          className="max-w-56 flex-col items-start gap-0.5"
        >
          <span className="flex items-center gap-1">
            {t.walk.person}
            <kbd data-slot="kbd" className="ml-1 rounded-sm bg-sign/15 px-1.5 py-0.5 font-semibold">
              W
            </kbd>
          </span>
          <span className="block font-normal opacity-80">{t.walk.personHint}</span>
        </TooltipContent>
      </Tooltip>
      {carried &&
        createPortal(
          <div
            ref={dangle}
            aria-hidden
            className="pointer-events-none fixed top-0 left-0 z-50"
            style={{ transform: `translate(${carried.x}px, ${carried.y}px)` }}
          >
            {/* held by the head: it hangs below the pointer, swinging a little */}
            <div className={cn("-translate-x-1/2 translate-y-1", !reducedMotion && "walk-dangle")}>
              <PersonFigure px={3} className="drop-shadow-[0_6px_4px_rgba(0,0,0,0.35)]" />
            </div>
            {verdict && (
              <div className="sign mt-2 -translate-x-1/2 rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap">
                {verdict === "walk" ? t.walk.dropHere : t.walk.noStreet}
              </div>
            )}
          </div>,
          document.body,
        )}
      {armed &&
        createPortal(
          <div
            role="status"
            className="sign sign-in fixed bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+7.5rem)] left-1/2 z-40 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-full px-3.5 py-2 text-center text-sm font-semibold"
            style={{ "--sign-from": "8px" } as React.CSSProperties}
          >
            {armed === "touch" ? t.walk.tapMap : t.walk.clickMap}
          </div>,
          document.body,
        )}
    </>
  );
}
