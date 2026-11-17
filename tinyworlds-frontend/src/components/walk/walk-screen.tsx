"use client";

import { RotateCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { loadLife } from "@/map/data";
import { formatWalkHash, writeHash } from "@/map/hash";
import type { Manifest } from "@/map/manifest";
import { loadBindings, saveBindings, type Bindings } from "@/walk/controls";
import { WalkGame } from "@/walk/game";
import { enToLonLat, lonLatToEN } from "@/walk/geo";
import { walkData } from "@/walk/load";
import { billboardAreas } from "@/walk/render/billboards";
import { PIXEL_DEFAULT, PIXEL_MAX, PIXEL_MIN, WalkView } from "@/walk/render/view";
import { QualityLadder } from "@/walk/quality";
import { WalkSound } from "@/walk/sound";
import { canDrawWalk } from "@/walk/webgl";
import { WORLD } from "@/worlds";
import { ControlsMenu } from "./controls-menu";
import { StreetMinimap } from "./street-minimap";
import { TouchPad } from "./touch-pad";
import { WalkHud } from "./walk-hud";
import { WastedOverlay } from "./wasted-overlay";

/**
 * The street walk: the only way in to it, the default export of a module the map reaches only
 * through `import()`, so three.js and the walk's code load when a walk opens and not before.
 * It checks that the browser can draw it, reads the walk's index, builds the view and the game,
 * and takes the keys (not while typing or while a dialog is open; the controls menu takes the
 * next key itself when a key is being changed), the mouse through pointer lock (a click on the
 * view asks for it, Esc lets it go), and the touch pad on a touch screen. It fills the screen,
 * with the minimap of the streets round you in its corner (`StreetMinimap`); the map waits
 * underneath, still. The map's key (M) works from the moment it mounts, before the walk is in and
 * after it fails. It writes a walk link once you stand still, and leaves with where you are (on a
 * bridge, how high) for the map to open there.
 */

export interface WalkStart {
  e: number;
  n: number;
  /** radians from north, clockwise */
  yaw: number;
  /** the feet's height when it is known (dropped on a bridge's deck), else found */
  z?: number;
}

/** Where you are, for the map and the walk link: the ground point, how high (a deck: the map draws it raised), and which way you face (degrees). */
export interface WalkAt {
  lat: number;
  lon: number;
  z: number;
  heading: number;
}

export interface WalkScreenProps {
  /** the world's own manifest (north up), whichever way the map underneath is turned: the walk's
   * version, its origin (`geo`), the first view (`start`) and the ferries' version */
  manifest: Manifest;
  start: WalkStart;
  /** a walk link followed while walking: you are put there (a new `id` each time) */
  goTo?: (WalkStart & { id: number }) | null;
  /** the walk is open: its game runs (said once per walk, for the page analytics) */
  onOpen?: () => void;
  onExit: (at: WalkAt) => void;
}

/** Only the visit's first walk, opened by New York's first view, finds the red supercar there. */
const STARTER_REACH = 400;
/** Metres over your feet the map's person looks for the surface you stand on (a jump's height). */
const FEET = 0.25;
/** Standing still this long, s, writes the walk link. */
const SETTLE = 0.6;
/** Ms after the first squares are shown before the frame rate counts. */
const WARM_UP = 3000;
const UNITS = WORLD.units === "imperial" ? "imperial" : "metric";

// kept for the visit, never stored: what the walk was left with
let walked = false;
let keptPixel: number | null = null;
let pixelChosen = false;
let keptSound = true;
let keptCrowd = 0;

const storage = (): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const degrees = (yaw: number) => ((((yaw * 180) / Math.PI) % 360) + 360) % 360;

/** Lets go of a canvas's WebGL context at once: a page may only hold a few. */
function loseContext(canvas: HTMLCanvasElement): void {
  try {
    const gl = canvas.getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    // nothing to let go of
  }
}

export default function WalkScreen({ manifest, start, goTo, onOpen, onExit }: WalkScreenProps) {
  const { t } = useI18n();
  const touch = useMediaQuery("(pointer: coarse)");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const darkRef = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "failed">("loading");
  const [game, setGame] = useState<WalkGame | null>(null);
  const viewRef = useRef<WalkView | null>(null);
  const soundRef = useRef<WalkSound | null>(null);
  const [bindings, setBindings] = useState<Bindings>(() =>
    loadBindings(typeof window === "undefined" ? null : storage()),
  );
  const [pixel, setPixel] = useState(keptPixel ?? PIXEL_DEFAULT);
  const [sound, setSound] = useState(keptSound);
  const [menuOpen, setMenuOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  // the first squares are in: until then the streets are still on their way
  const [streets, setStreets] = useState(false);

  // the latest callbacks and keys, for the loops that outlive a render
  const exitRef = useRef(onExit);
  const openRef = useRef(onOpen);
  const bindingsRef = useRef(bindings);
  useEffect(() => {
    exitRef.current = onExit;
    openRef.current = onOpen;
    bindingsRef.current = bindings;
  });
  const startRef = useRef(start);
  const pixelRef = useRef(pixel);
  useEffect(() => {
    pixelRef.current = pixel;
  });

  /** Where you are for the map and the walk link: the game's place and heading, and the surface
   * under your feet (the deck you are on, never one above you, whatever the camera does). */
  const whereAt = useCallback(
    (p: { e: number; n: number; z: number; yaw: number }): WalkAt => {
      const [lon, lat] = enToLonLat(manifest.geo, p.e, p.n);
      const world = viewRef.current?.world;
      const height = world ? world.surfaceUnder(p.e, p.n, p.z, FEET).z : p.z;
      return { lat, lon, z: Math.max(0, height), heading: degrees(p.yaw) };
    },
    [manifest.geo],
  );

  /** Leaves the walk, with the map where you are (where the walk was to start, before it has). */
  const exit = useCallback(() => {
    if (document.pointerLockElement) document.exitPointerLock();
    const s = startRef.current;
    exitRef.current(game ? whereAt(game.position()) : whereAt({ ...s, z: s.z ?? 0 }));
  }, [game, whereAt]);

  // open: the browser, the index and the ferries' routes, then the view and the game
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = startRef.current;
    const [lon, lat] = enToLonLat(manifest.geo, s.e, s.n);
    const there = { lat, lon, z: Math.max(0, s.z ?? 0), heading: degrees(s.yaw) };
    if (!canDrawWalk()) {
      toast.error(t.walk.noWebgl);
      exitRef.current(there);
      return;
    }
    let cancelled = false;
    let view: WalkView | null = null;
    let made: WalkGame | null = null;
    let sound: WalkSound | null = null;
    // a phone may take the GPU back (a tab put in the background): the walk says it stopped,
    // and Try again draws on a new canvas
    const onLost = (e: Event) => {
      e.preventDefault();
      made?.stop();
      setPhase("failed");
    };
    canvas.addEventListener("webglcontextlost", onLost);
    (async () => {
      try {
        const [data, life] = await Promise.all([
          walkData(manifest.walk),
          // the ferries of the world's own folder: the walk's version, whichever way the map is turned
          loadLife(manifest.indexes, undefined, { own: true }).catch(() => ({ ferries: [] })),
        ]);
        if (cancelled) return;
        try {
          view = new WalkView(canvas, data.ix, (i, j) => data.square(i, j), {
            billboards: billboardAreas(data.ix.geo, WORLD.billboards),
          });
        } catch {
          // a context the browser would not give after all
          toast.error(t.walk.noWebgl);
          exitRef.current(there);
          return;
        }
        view.setPixel(keptPixel ?? PIXEL_DEFAULT);
        sound = new WalkSound();
        sound.enabled = keptSound;
        const [se, sn] = lonLatToEN(data.ix.geo, manifest.start.lon, manifest.start.lat);
        const starter = !walked && Math.hypot(s.e - se, s.n - sn) <= STARTER_REACH;
        walked = true;
        made = new WalkGame({
          view,
          ix: data.ix,
          life: life.ferries,
          start: s,
          bindings: bindingsRef.current,
          reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          sound,
          units: UNITS,
          starter,
        });
        // the crowd an earlier walk of the visit had to lower
        const crowd = new QualityLadder(keptCrowd).crowd;
        made.setCrowd(crowd.people, crowd.cars);
        viewRef.current = view;
        soundRef.current = sound;
        made.start();
        setGame(made);
        setPhase("ready");
        openRef.current?.();
        canvas.focus({ preventScroll: true });
      } catch {
        if (!cancelled) setPhase("failed");
      }
    })();
    return () => {
      cancelled = true;
      canvas.removeEventListener("webglcontextlost", onLost);
      // the game lets its sound go; one that never got a game is let go here
      if (made) made.dispose();
      else sound?.dispose();
      view?.dispose();
      if (view) loseContext(canvas);
      viewRef.current = null;
      soundRef.current = null;
      setGame(null);
      setStreets(false);
    };
    // the walk opens once per attempt; what it opens at is read from refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // the settings: the keys (kept in the browser), the pixels and the sound (for the visit)
  useEffect(() => game?.setBindings(bindings), [game, bindings]);
  useEffect(() => {
    viewRef.current?.setPixel(pixel);
    keptPixel = pixel;
  }, [pixel, game]);
  useEffect(() => {
    if (soundRef.current) soundRef.current.enabled = sound;
    keptSound = sound;
  }, [sound, game]);
  const changeBindings = useCallback((b: Bindings) => {
    setBindings(b);
    saveBindings(storage(), b);
  }, []);
  const choosePixel = useCallback((n: number) => {
    pixelChosen = true;
    setPixel(Math.max(PIXEL_MIN, Math.min(PIXEL_MAX, Math.round(n))));
  }, []);

  // a walk link followed while walking: you are put there (once: a new game after Try again
  // starts where the walk was to start, not at the last link)
  const wentTo = useRef<number | null>(null);
  useEffect(() => {
    if (!game || !goTo || wentTo.current === goTo.id) return;
    wentTo.current = goTo.id;
    game.teleport(goTo.e, goTo.n, goTo.z, goTo.yaw);
  }, [game, goTo]);

  // the tunnel's dark, straight into the DOM
  useEffect(() => {
    if (!game) return;
    return game.subscribe((s) => {
      if (darkRef.current) darkRef.current.style.opacity = String(s.dark);
    });
  }, [game]);

  // the walk link once you stand still; the frame rate
  useEffect(() => {
    if (!game) return;
    let raf = 0;
    let last = { e: Number.NaN, n: Number.NaN, yaw: Number.NaN };
    let lastZ = 0;
    let still = 0;
    let written = false;
    let before = performance.now();
    let shown = false;
    let shownAt = 0;
    const ladder = new QualityLadder(keptCrowd);
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = (now - before) / 1000;
      before = now;
      if (!shown && (viewRef.current?.squares().ready ?? 0) > 0) {
        shown = true;
        setStreets(true);
      }
      const p = game.position();
      const at = whereAt(p);
      if (
        Math.hypot(p.e - last.e, p.n - last.n) > 0.05 ||
        !(Math.abs(p.yaw - last.yaw) < 0.005) ||
        Math.abs(at.z - lastZ) > 0.05
      ) {
        last = p;
        lastZ = at.z;
        still = 0;
        written = false;
      } else if (dt < 0.25) {
        still += dt;
        if (!written && still >= SETTLE) {
          written = true;
          writeHash(formatWalkHash(at));
        }
      }
      // too slow: a step down (`QualityLadder`), counted from a few seconds after the first
      // squares are in (building them is slow for a moment anywhere), while the page is in view
      if (shown && shownAt === 0) shownAt = now;
      const view = viewRef.current;
      if (!view || !shown || now - shownAt < WARM_UP || document.visibilityState !== "visible") {
        ladder.reset();
        return;
      }
      const step = ladder.frame(dt, {
        reflections: view.reflections,
        pixel: pixelRef.current,
        pixelChosen,
      });
      if (step === "reflections") view.setReflections(false);
      else if (step === "crowd") {
        game.setCrowd(ladder.crowd.people, ladder.crowd.cars);
        keptCrowd = ladder.crowdAt;
      } else if (step === "pixel") setPixel((n) => Math.min(PIXEL_MAX, n + 1));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [game, whereAt]);

  // the keys, while the walk is open: the map's own from the start (loading, failed), all of
  // them once the game runs
  useEffect(() => {
    const ignored = (e: KeyboardEvent) => {
      if (e.metaKey) return true;
      if (e.ctrlKey && !e.code.startsWith("Control")) return true;
      if (e.altKey && !e.code.startsWith("Alt")) return true;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return true;
      // a dialog has the keys (the controls menu takes them itself)
      return document.querySelector('[role="dialog"]') !== null;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || ignored(e)) return;
      if (!game) {
        if (e.repeat || !bindings.map.includes(e.code)) return;
        e.preventDefault();
        exit();
        return;
      }
      const acts = game.keyDown(e.code);
      if (acts.length === 0) return;
      e.preventDefault();
      if (e.repeat) return;
      for (const a of acts) {
        if (a === "map") exit();
        else if (a === "menu") {
          game.releaseKeys();
          if (document.pointerLockElement) document.exitPointerLock();
          setMenuOpen(true);
        } else if (a === "pixelDown") choosePixel(pixel - 1);
        else if (a === "pixelUp") choosePixel(pixel + 1);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => game?.keyUp(e.code);
    const onBlur = () => game?.releaseKeys();
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, [game, exit, pixel, choosePixel, bindings]);

  // the mouse: captured by a click on the view, let go by Esc (the browser's)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!game || !canvas) return;
    const onLock = () => {
      const on = document.pointerLockElement === canvas;
      setLocked(on);
      if (!on) game.releaseKeys();
    };
    const onMouse = (e: MouseEvent) => {
      if (document.pointerLockElement === canvas) game.look(e.movementX, e.movementY);
    };
    document.addEventListener("pointerlockchange", onLock);
    document.addEventListener("mousemove", onMouse);
    return () => {
      document.removeEventListener("pointerlockchange", onLock);
      document.removeEventListener("mousemove", onMouse);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
    };
  }, [game]);

  const askLock = () => {
    const canvas = canvasRef.current;
    // the sounds may start only from a gesture: this click is one
    soundRef.current?.wake();
    if (!canvas || touch || document.pointerLockElement === canvas) return;
    try {
      const asked = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      asked?.catch?.(() => {});
    } catch {
      // no pointer lock here: the keys still turn
    }
  };

  return (
    <div className="walk-pane relative h-full w-full overflow-hidden bg-sign">
      {/* a new canvas for each attempt: one whose context was lost cannot give another */}
      <canvas
        key={attempt}
        ref={canvasRef}
        tabIndex={0}
        aria-label={t.walk.viewLabel}
        className="block h-full w-full cursor-crosshair outline-none"
        onClick={askLock}
      />
      <div
        ref={darkRef}
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-0 bg-black opacity-0",
          !reducedMotion && "transition-opacity duration-300",
        )}
      />

      {game && phase === "ready" && (
        <>
          <StreetMinimap game={game} reducedMotion={reducedMotion} />
          {touch && <TouchPad game={game} />}
          <WalkHud
            game={game}
            bindings={bindings}
            units={UNITS}
            touch={touch}
            reducedMotion={reducedMotion}
            showLook={!touch && !locked && !menuOpen}
            onMenu={() => {
              game.releaseKeys();
              setMenuOpen(true);
            }}
            onBack={exit}
          />
          <WastedOverlay game={game} />
          <ControlsMenu
            open={menuOpen}
            onOpenChange={(open) => {
              setMenuOpen(open);
              if (!open) canvasRef.current?.focus({ preventScroll: true });
            }}
            bindings={bindings}
            onBindings={changeBindings}
            pixel={pixel}
            onPixel={choosePixel}
            sound={sound}
            onSound={setSound}
          />
        </>
      )}

      {(phase !== "ready" || !streets) && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
          <div
            role={phase === "failed" ? "alert" : "status"}
            className="sign pointer-events-auto flex max-w-sm flex-col items-center gap-3 px-5 py-4 text-center text-sm"
          >
            {phase !== "failed" ? (
              <>
                <p className="font-semibold">{t.walk.loading}</p>
                <Button
                  variant="secondary"
                  onClick={exit}
                  className="h-8 rounded-full px-3.5 text-xs font-semibold"
                >
                  {t.walk.back}
                </Button>
              </>
            ) : (
              <>
                <p className="leading-relaxed">{t.walk.failed}</p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={exit}
                    className="h-9 rounded-full px-4 font-semibold"
                  >
                    {t.walk.back}
                  </Button>
                  <Button
                    onClick={() => {
                      // stopped mid-walk (the GPU taken back): on again where you were
                      if (game) startRef.current = game.position();
                      setPhase("loading");
                      setAttempt((n) => n + 1);
                    }}
                    className="h-9 gap-2 rounded-full px-4 font-semibold"
                  >
                    <RotateCw className="size-4" strokeWidth={2.5} />
                    {t.loadError.retry}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
