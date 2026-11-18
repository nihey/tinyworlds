"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type RefObject,
} from "react";
import { toast } from "sonner";
import {
  dropAtLonLat,
  dropAtMapPx,
  dropAtScreen,
  type PlacedDrop,
} from "@/components/walk/walk-person";
import type { WalkAt, WalkScreenProps, WalkStart } from "@/components/walk/walk-screen";
import { useI18n } from "@/hooks/use-i18n";
import { siteEvent } from "@/lib/site-events";
import type { MapEngine } from "@/map/engine";
import { formatHash, parseWalkHash, writeHash, type WalkLink } from "@/map/hash";
import type { Manifest } from "@/map/manifest";
import type { Sight } from "@/map/sights";
import { SITE_ID } from "@/site";
import { WORLD } from "@/worlds";

/**
 * The street walk as the map sees it: opening it where the person was put down (after checking
 * the browser can draw it, before its code is downloaded), the map kept still underneath while
 * the walk fills the screen, a tap on the map (the armed person put down there), walk links, the
 * way back (the map where you are, at your height on a bridge), and the map key while the walk's
 * own code is still on its way. Everything of the walk itself comes through `import()`.
 */

/** Back from a walk, the map shows the streets at least this close, CSS px per map px. */
const WALK_MAP_SCALE = 1;
/** A press on the map that moves less than this (CSS px) and is let go within this (ms) is a tap. */
const TAP_MOVE = 6;
const TAP_MS = 500;

/** Where the person was put down, in the walk's metres, facing along the way (or as a link says). */
const startOf = (drop: PlacedDrop, heading?: number): WalkStart => ({
  e: drop.e,
  n: drop.n,
  z: drop.z,
  yaw: heading === undefined ? drop.yaw : (heading * Math.PI) / 180,
});

/** A walk link's spot as the map's first view: the walk opens there, over the map. */
export function walkLinkView(
  hash: string,
): { lon: number; lat: number; scale: number } | undefined {
  const link = WORLD.walk ? parseWalkHash(hash) : null;
  return link ? { lon: link.lon, lat: link.lat, scale: WALK_MAP_SCALE } : undefined;
}

/** Where you are on the map as it draws you: the ground point raised by your height. */
function drawnAt(engine: MapEngine, at: { lat: number; lon: number; z?: number }) {
  const p = engine.projection.toMap(at.lon, at.lat);
  return { x: p.x, y: p.y - Math.max(0, at.z ?? 0) * engine.manifest.geo.kz };
}

const typing = (e: KeyboardEvent) => {
  const target = e.target as HTMLElement | null;
  return !!target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
};

export interface StreetWalk {
  /** a world with the walk, and data that has it */
  canWalk: boolean;
  /** the walk's files' version (`manifest.walk`) */
  version: string | undefined;
  walking: boolean;
  /** the same, for handlers that outlive a render */
  walkingRef: RefObject<boolean>;
  /** the person tapped (or clicked), waiting to be put down on the map */
  armed: "touch" | "mouse" | null;
  setArmed: (armed: "touch" | "mouse" | null) => void;
  /** the walk's screen and what it is given, once its code is in */
  Screen: ComponentType<WalkScreenProps> | null;
  screenProps: Omit<WalkScreenProps, "lightMode"> | null;
  openWalk: (drop: PlacedDrop, heading?: number) => void;
  /** back to the map, centred where you are (or where the walk was opening) */
  leave: () => void;
  putDownAtCentre: () => void;
  /** the person let go at (x, y) CSS px of the map's canvas: the walk opens there, or the map
   * says there is no street */
  putDownAtScreen: (x: number, y: number) => void;
  /** whether this browser can draw the walk (asked once; false says so in a toast): what the
   * person asks when it is picked up, before any of the walk's data is fetched */
  canDraw: () => Promise<boolean>;
}

export function useStreetWalk({
  engine,
  manifest,
  canvasRef,
  sights,
  onOpening,
}: {
  engine: MapEngine | null;
  /** the world's own manifest (north up), whichever way the map is turned: it names the walk's
   * version, and the walk is one for both views */
  manifest: Manifest | null;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  sights: Sight[];
  /** the map's other signs give way: the quiz stops, the search empties, … */
  onOpening: () => void;
}): StreetWalk {
  const { t } = useI18n();
  const version = manifest?.walk;
  const canWalk = WORLD.walk === true && !!version;

  const [walk, setWalk] = useState<WalkStart | null>(null);
  const [Screen, setScreen] = useState<ComponentType<WalkScreenProps> | null>(null);
  const [armed, setArmed] = useState<"touch" | "mouse" | null>(null);
  const [goTo, setGoTo] = useState<(WalkStart & { id: number }) | null>(null);
  const walking = walk !== null;
  const walkingRef = useRef(false);
  // where the walk opened, for the way back before its screen is in
  const walkerAt = useRef<WalkAt | null>(null);
  const opening = useRef(false);
  const screenAsked = useRef(false);
  // the map key while the walk's own code is on its way: M, or what the visitor chose instead
  const mapKeys = useRef<string[]>(["KeyM"]);
  const latest = useRef({ onOpening, sights });
  useEffect(() => {
    latest.current = { onOpening, sights };
  });

  /** Back to the map, centred where you are. */
  const exitWalk = useCallback(
    (at: { lat: number; lon: number; z?: number }) => {
      walkingRef.current = false;
      walkerAt.current = null;
      setWalk(null);
      setGoTo(null);
      if (!engine) return;
      engine.jumpTo(drawnAt(engine, at));
      // the address holds the walk link until now: the map's own view again
      writeHash(formatHash({ ...engine.getCentre(), scale: engine.getView().scale }));
      canvasRef.current?.focus({ preventScroll: true });
    },
    [engine, canvasRef],
  );

  const leave = useCallback(() => {
    if (!engine) return;
    exitWalk(walkerAt.current ?? engine.getCentre());
  }, [engine, exitWalk]);

  /** The walk opened: the page analytics hear of it (no click marks it). */
  const opened = useCallback(
    () => siteEvent("walk_start", { world: SITE_ID }, { rybbit: true }),
    [],
  );

  // whether the browser can draw the walk: once it can, it is not asked again (the check is a
  // few lines and a throwaway context; the walk is not)
  const drawable = useRef(false);
  const canDraw = useCallback(async (): Promise<boolean> => {
    if (drawable.current) return true;
    let ok: boolean;
    try {
      ok = (await import("@/walk/webgl")).canDrawWalk();
    } catch {
      toast.error(t.walk.failed);
      return false;
    }
    if (!ok) toast.error(t.walk.noWebgl);
    drawable.current = ok;
    return ok;
  }, [t]);

  /** Opens the walk where the person was put down, the map waiting underneath there. */
  const openWalk = useCallback(
    async (drop: PlacedDrop, heading?: number) => {
      if (!engine || walkingRef.current || opening.current) return;
      opening.current = true;
      try {
        // a browser that cannot draw it never downloads it
        if (!(await canDraw())) return;
        walkingRef.current = true;
        setArmed(null);
        latest.current.onOpening();
        engine.releaseSight();
        engine.setPin(null);
        const at: WalkAt = {
          lat: drop.lat,
          lon: drop.lon,
          z: Math.max(0, drop.z),
          heading: ((heading ?? (drop.yaw * 180) / Math.PI) + 360) % 360,
        };
        walkerAt.current = at;
        engine.jumpTo({
          ...drawnAt(engine, at),
          scale: Math.max(engine.getView().scale, WALK_MAP_SCALE),
        });
        setGoTo(null);
        setWalk(startOf(drop, heading));
        void import("@/walk/controls")
          .then(({ loadBindings }) => {
            let store: Storage | null = null;
            try {
              store = window.localStorage;
            } catch {
              // blocked: the defaults
            }
            mapKeys.current = loadBindings(store).map.filter((k): k is string => !!k);
          })
          .catch(() => {});
        if (screenAsked.current) return;
        screenAsked.current = true;
        import("@/components/walk/walk-screen")
          .then((m) => setScreen(() => m.default))
          .catch(() => {
            screenAsked.current = false;
            walkingRef.current = false;
            walkerAt.current = null;
            setWalk(null);
            toast.error(t.walk.failed);
          });
      } finally {
        opening.current = false;
      }
    },
    [engine, t, canDraw],
  );

  /** Puts the person down where `find` says (then `then`), or says there is no street there;
   * nothing of the walk is fetched where it cannot be drawn. */
  const putDown = useCallback(
    async (find: () => Promise<PlacedDrop | null>, then: (drop: PlacedDrop) => void) => {
      if (!walkingRef.current && !(await canDraw())) return;
      try {
        const drop = await find();
        if (drop) then(drop);
        else toast(t.walk.noStreet);
      } catch {
        toast.error(t.walk.failed);
      }
    },
    [t, canDraw],
  );

  const putDownAtScreen = useCallback(
    (x: number, y: number) => {
      if (!engine || !canWalk) return;
      void putDown(
        () => dropAtScreen(engine, version, x, y),
        (d) => void openWalk(d),
      );
    },
    [engine, canWalk, version, putDown, openWalk],
  );

  const putDownAtCentre = useCallback(() => {
    if (!engine || !canWalk) return;
    const v = engine.getView();
    void putDown(
      () => dropAtMapPx(engine, version, v.x, v.y),
      (d) => void openWalk(d),
    );
  }, [engine, canWalk, version, putDown, openWalk]);

  /** A walk link: the walk opens there, or, while walking, takes you there. */
  const followLink = useRef<(link: WalkLink) => void>(() => {});
  /** A tap on the map at (x, y) CSS px: the armed person put down there. */
  const tapAt = useRef<(x: number, y: number) => void>(() => {});
  useEffect(() => {
    followLink.current = (link) => {
      if (!canWalk) return;
      void putDown(
        () => dropAtLonLat(version, link.lon, link.lat),
        (d) => {
          if (walkingRef.current) setGoTo({ ...startOf(d, link.heading), id: performance.now() });
          else void openWalk(d, link.heading);
        },
      );
    };
    tapAt.current = (x, y) => {
      if (!engine || !canWalk || walkingRef.current || !armed) return;
      void putDown(
        () => dropAtScreen(engine, version, x, y),
        (d) => void openWalk(d),
      );
    };
  });

  // a walk link opens the walk as the map opens, and when the address is changed to one
  useEffect(() => {
    if (!canWalk) return;
    const link = parseWalkHash(window.location.hash);
    if (link) followLink.current(link);
    const onHashChange = () => {
      const changed = parseWalkHash(window.location.hash);
      if (changed) followLink.current(changed);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [canWalk]);

  // taps on the map
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!engine || !canvas) return;
    const down = new Map<number, { x: number; y: number; t: number }>();
    let many = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (down.size > 0) many = true;
      down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    };
    const onUp = (e: PointerEvent) => {
      const d = down.get(e.pointerId);
      down.delete(e.pointerId);
      const pinched = many;
      if (down.size === 0) many = false;
      if (!d || pinched || e.type === "pointercancel") return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_MOVE) return;
      if (performance.now() - d.t > TAP_MS) return;
      const r = canvas.getBoundingClientRect();
      tapAt.current(e.clientX - r.left, e.clientY - r.top);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
    };
  }, [engine, canvasRef]);

  // while walking the map is covered: it draws nothing (life included) and no building lights
  // up; back on the map it is drawn where you are, and they light up again
  useEffect(() => {
    if (!engine || !walking) return;
    engine.setSights([]);
    engine.setPaused(true);
    return () => {
      engine.setPaused(false);
      engine.setSights(latest.current.sights);
    };
  }, [engine, walking]);

  // the map key while the walk's code is on its way (once it is in, the walk takes its keys)
  useEffect(() => {
    if (!walking || Screen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || typing(e)) return;
      // a chord is the browser's or the page's, not the map key (as the walk's own keys have it)
      if (e.metaKey) return;
      if (e.ctrlKey && !e.code.startsWith("Control")) return;
      if (e.altKey && !e.code.startsWith("Alt")) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (!mapKeys.current.includes(e.code)) return;
      e.preventDefault();
      leave();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [walking, Screen, leave]);

  const screenProps: Omit<WalkScreenProps, "lightMode"> | null =
    manifest && walk ? { manifest, start: walk, goTo, onOpen: opened, onExit: exitWalk } : null;

  return {
    canWalk,
    version,
    walking,
    walkingRef,
    armed,
    setArmed,
    Screen,
    screenProps,
    openWalk: (drop, heading) => void openWalk(drop, heading),
    leave,
    putDownAtCentre,
    putDownAtScreen,
    canDraw,
  };
}
