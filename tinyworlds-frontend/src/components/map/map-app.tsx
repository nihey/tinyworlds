"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type CSSProperties,
} from "react";
import { toast } from "sonner";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { ExploreBanner } from "@/components/map/explore-banner";
import {
  dropAtLonLat,
  dropAtScreen,
  WalkPerson,
  type PlacedDrop,
} from "@/components/walk/walk-person";
import type { WalkScreenProps, WalkStart } from "@/components/walk/walk-screen";
import { useI18n } from "@/hooks/use-i18n";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useQuiz } from "@/hooks/use-quiz";
import { usePrefs } from "@/hooks/use-prefs";
import {
  useDocumentLanguage,
  useDonationReturn,
  useFunnelVisit,
  usePresence,
} from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import { API_URL, paymentLinkFor } from "@/lib/donate";
import { prefsStore } from "@/lib/prefs";
import { quizKey } from "@/lib/quiz";
import { siteEvent } from "@/lib/site-events";
import { cn } from "@/lib/utils";
import { textsFor } from "@/lib/sight-sign";
import {
  dataUrl,
  loadHoods,
  loadLife,
  loadManifest,
  loadPlaces,
  loadSights,
  loadSightTexts,
} from "@/map/data";
import type { Sight, SightTexts } from "@/map/sights";
import type { Locale } from "@/i18n/locale";
import { createLife } from "@/map/life";
import { MapEngine } from "@/map/engine";
import { formatHash, parseHash, parseWalkHash, writeHash, type WalkLink } from "@/map/hash";
import type { Manifest, Place } from "@/map/manifest";
import { createSearchIndex } from "@/map/search";
import { SITE_ID } from "@/site";
import { WORLD } from "@/worlds";
import { AboutDialog } from "./about-dialog";
import { CreditStrip } from "./credit-strip";
import { LoadErrorDialog } from "./load-error-dialog";
import { Minimap } from "./minimap";
import { placeMeta } from "./place-types";
import { QuizBanner } from "./quiz-banner";
import { QuizCard } from "./quiz-card";
import { SearchSign } from "./search-sign";
import { SettingsPanel } from "./settings-panel";
import { SightSign } from "./sight-sign";
import { Splash } from "./splash";
import { ToolColumn } from "./tool-column";

declare global {
  interface Window {
    tinyworld?: MapEngine;
  }
}

interface Session {
  manifest: Manifest;
  engine: MapEngine;
}

const PAN_STEP = 160; // CSS px per arrow key press
/** The map beside the walk shows the streets at least this close, CSS px per map px. */
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

/** A walk link's spot as the map's first view: the walk opens there, with the map beside it. */
function walkLinkView(hash: string): { lon: number; lat: number; scale: number } | undefined {
  const link = WORLD.walk ? parseWalkHash(hash) : null;
  return link ? { lon: link.lon, lat: link.lat, scale: WALK_MAP_SCALE } : undefined;
}

/** The whole page: the map's two canvases, and the signs floating over them. */
export function MapApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const marksRef = useRef<HTMLCanvasElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [failed, setFailed] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [placesFailed, setPlacesFailed] = useState(false);
  // whether this world has outlines to draw: known once hoods.json is in, and some have none
  const [hasHoods, setHasHoods] = useState(false);
  // the buildings that light up, the one lit now, and what Wikipedia says in the loaded language
  const [sights, setSights] = useState<Sight[]>([]);
  const [lit, setLit] = useState<{ id: string; pinned: boolean } | null>(null);
  const [sightTexts, setSightTexts] = useState<{ locale: Locale; texts: SightTexts } | null>(null);
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [donateOpen, setDonateOpen] = useState(false);
  // the city the donate sign opens with chosen (from About's benefactors), if any
  const [donateCity, setDonateCity] = useState<string | null>(null);
  // the street walk: where it opened, its screen once downloaded, the person waiting for a tap
  // on the map, and where a tap on the map beside the walk puts you
  const [walk, setWalk] = useState<WalkStart | null>(null);
  const [WalkScreen, setWalkScreen] = useState<ComponentType<WalkScreenProps> | null>(null);
  const [armed, setArmed] = useState(false);
  const [goTo, setGoTo] = useState<(WalkStart & { id: number }) | null>(null);
  const walking = walk !== null;
  const walkingRef = useRef(false);
  // you on the map beside the walk, for its scene layer
  const walkerAt = useRef<{ lat: number; lon: number; heading: number } | null>(null);
  // a walk link: the walk opens there (or, while walking, takes you there)
  const walkLinkRef = useRef<(link: WalkLink) => Promise<void>>(async () => {});

  const [prefs, setPrefs] = usePrefs();
  useTheme(prefs.theme);
  const { t, locale, copy } = useI18n();
  useDocumentLanguage(locale, copy.title);
  useDonationReturn();
  useFunnelVisit();
  usePresence();
  // donations are taken when the build names an API or a checkout for this language
  const takesDonations = API_URL !== "" || paymentLinkFor(locale, WORLD.id) !== null;
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const compact = useMediaQuery("(max-width: 639px)");
  // Guess the building's card is a sheet at the foot of the screen until it fits beside the search
  const quizSheet = useMediaQuery("(max-width: 895.98px)");

  const engine = session?.engine ?? null;

  // Load the manifest, then start the engine on the two canvases; places and hoods follow.
  useEffect(() => {
    const canvas = canvasRef.current;
    const marks = marksRef.current;
    if (!canvas || !marks) return;
    const abort = new AbortController();
    let started: MapEngine | null = null;

    (async () => {
      try {
        const manifest = await loadManifest(abort.signal);
        if (abort.signal.aborted) return;
        const live = new MapEngine({
          canvas,
          marks,
          manifest,
          tileUrl: (z, tx, ty) => dataUrl(`tiles/${z}/${tx}_${ty}.webp`, manifest.build),
          fileUrl: (path) => dataUrl(path, manifest.indexes),
          reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          start: parseHash(window.location.hash) ?? walkLinkView(window.location.hash),
        });
        started = live;
        window.tinyworld = live; // a handle for the console: tinyworld.flyTo({ lon, lat })
        setSession({ manifest, engine: live });

        // the map is usable without these; search and lines arrive when they arrive
        loadPlaces(manifest.indexes, abort.signal)
          .then((loaded) => {
            if (!abort.signal.aborted) setPlaces(loaded);
          })
          .catch(() => {
            if (!abort.signal.aborted) setPlacesFailed(true);
          });
        loadHoods(manifest.indexes, abort.signal)
          .then((hoods) => {
            if (abort.signal.aborted) return;
            live.setHoods(hoods);
            setHasHoods(hoods.length > 0);
          })
          .catch(() => {});
        loadLife(manifest.indexes, abort.signal)
          .then((life) => {
            if (!abort.signal.aborted) createLife(live, life);
          })
          .catch(() => {});
        // the outlines of the buildings that light up: once the map is drawn, never before it
        if (WORLD.sights) {
          let asked = false;
          const ask = () => {
            if (asked || abort.signal.aborted) return;
            asked = true;
            offSettle();
            loadSights(manifest.indexes, abort.signal)
              .then((list) => {
                if (abort.signal.aborted) return;
                // beside the walk no building lights up: they will when it closes
                if (!walkingRef.current) live.setSights(list);
                setSights(list);
              })
              .catch(() => {});
          };
          const offSettle = live.on("settle", ask);
          setTimeout(ask, 1500);
        }
      } catch (error) {
        if (abort.signal.aborted) return;
        setFailed(true);
        setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    })();

    return () => {
      abort.abort();
      started?.destroy();
    };
  }, [attempt]);

  const retry = () => {
    setErrorMessage(null);
    setFailed(false);
    setSession(null);
    setPlaces(null);
    setPlacesFailed(false);
    setHasHoods(false);
    setSights([]);
    setLit(null);
    setAttempt((n) => n + 1);
  };

  // the lit building, and its article in the visitor's language (asked for the first time a
  // building lights up, and again when the language changes)
  useEffect(() => engine?.on("sight", setLit), [engine]);
  const sightById = useMemo(() => new Map(sights.map((s) => [s.id, s])), [sights]);
  const asking = useRef<Locale | null>(null);
  useEffect(() => {
    if (!session || !lit || textsFor(sightTexts, locale) === "ready" || asking.current === locale)
      return;
    asking.current = locale;
    loadSightTexts(session.manifest.indexes, locale)
      .then((texts) => setSightTexts({ locale, texts }))
      .catch(() => setSightTexts({ locale, texts: {} }))
      .finally(() => {
        if (asking.current === locale) asking.current = null;
      });
  }, [session, lit, locale, sightTexts]);
  const litSight = lit ? sightById.get(lit.id) : undefined;
  const litText =
    litSight && sightTexts?.locale === locale ? sightTexts.texts[litSight.id] : undefined;

  // Guess the building: a round holds its building lit, so the article loaded above is its own
  const quiz = useQuiz({
    engine,
    sights,
    build: session?.manifest.indexes ?? null,
    locale,
    compact: quizSheet,
  });
  const quizOn = quiz.state.phase !== "off";
  // a round holds its building lit: the map's own sign for it waits until it is answered
  const quizRound = ["loading", "asking", "answered"].includes(quiz.state.phase);
  const quizArticle = quiz.sight && litSight?.id === quiz.sight.id ? litText : undefined;
  // the keys read the game as it is now, without the key handler being made again each round
  const quizRef = useRef(quiz);
  useEffect(() => {
    quizRef.current = quiz;
  });

  // settings → engine
  useEffect(() => engine?.setHoodLines(prefs.hoods), [engine, prefs.hoods]);
  useEffect(() => engine?.setLife(prefs.life), [engine, prefs.life]);
  useEffect(() => engine?.setReducedMotion(reducedMotion), [engine, reducedMotion]);

  // the view lives in the URL, so any spot can be shared
  useEffect(() => {
    if (!engine) return;
    const write = () => {
      // while walking the address holds the walk link, written by the walk
      if (walkingRef.current) return;
      const centre = engine.getCentre();
      const hash = formatHash({ ...centre, scale: engine.getView().scale });
      if (window.location.hash !== hash) writeHash(hash);
    };
    const off = engine.on("settle", write);
    const onHashChange = () => {
      const link = parseWalkHash(window.location.hash);
      if (link) {
        void walkLinkRef.current(link);
        return;
      }
      const view = parseHash(window.location.hash);
      if (view && !walkingRef.current) engine.flyTo(view);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      off();
      window.removeEventListener("hashchange", onHashChange);
    };
  }, [engine]);

  const index = useMemo(() => (places ? createSearchIndex(places) : null), [places]);

  const choosePlace = useCallback(
    (place: Place) => {
      if (!engine) return;
      const view = engine.getView();
      const limits = engine.getScaleLimits();
      // show about `span` metres of ground across the shorter side of the view
      const pxPerMetre = engine.manifest.geo.k * Math.SQRT2;
      let fitted = Math.min(view.width, view.height) / (placeMeta(place.t).span * pxPerMetre);
      // close to native size, land exactly on it: that is where the pixel art is crisp
      if (fitted > 0.55 && fitted < 1.6) fitted = 1;
      const scale = Math.min(Math.max(place.s ?? fitted, limits.min), Math.min(limits.max, 2));
      engine.setPin({ lon: place.lon, lat: place.lat, name: place.n });
      engine.flyTo({ lon: place.lon, lat: place.lat, scale });
    },
    [engine],
  );

  const clearPin = useCallback(() => engine?.setPin(null), [engine]);

  const share = useCallback(async () => {
    if (!engine) return;
    const centre = engine.getCentre();
    writeHash(formatHash({ ...centre, scale: engine.getView().scale }));
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success(t.share.copied, { description: t.share.copiedDetail });
    } catch {
      toast.error(t.share.failed, { description: url });
    }
  }, [engine, t]);

  // ---- the street walk ------------------------------------------------------------------

  const walkVersion = session?.manifest.walk;
  // a world with the walk, and data that has it
  const canWalk = WORLD.walk === true && !!walkVersion;
  const sightsRef = useRef(sights);
  useEffect(() => {
    sightsRef.current = sights;
  });
  const screenAsked = useRef(false);

  /** Opens the walk where the person was put down; the map beside it follows you there. */
  const openWalk = useCallback(
    (drop: PlacedDrop, heading?: number) => {
      if (!engine || walkingRef.current) return;
      walkingRef.current = true;
      setArmed(false);
      quizRef.current.stop();
      engine.releaseSight();
      engine.setPin(null);
      setQuery("");
      setSettingsOpen(false);
      const p = engine.projection.toMap(drop.lon, drop.lat);
      engine.jumpTo({ x: p.x, y: p.y, scale: Math.max(engine.getView().scale, WALK_MAP_SCALE) });
      walkerAt.current = { lat: drop.lat, lon: drop.lon, heading: (drop.yaw * 180) / Math.PI };
      setWalk(startOf(drop, heading));
      siteEvent("walk_start", { world: SITE_ID });
      if (screenAsked.current) return;
      screenAsked.current = true;
      import("@/components/walk/walk-screen")
        .then((m) => setWalkScreen(() => m.default))
        .catch(() => {
          screenAsked.current = false;
          walkingRef.current = false;
          setWalk(null);
          toast.error(t.walk.failed);
        });
    },
    [engine, t],
  );

  /** Back to the map, centred where you are. */
  const exitWalk = useCallback(
    (at: { lat: number; lon: number }) => {
      walkingRef.current = false;
      walkerAt.current = null;
      setWalk(null);
      setGoTo(null);
      if (!engine) return;
      const p = engine.projection.toMap(at.lon, at.lat);
      engine.jumpTo({ x: p.x, y: p.y });
      writeHash(formatHash({ ...engine.getCentre(), scale: engine.getView().scale }));
      canvasRef.current?.focus({ preventScroll: true });
    },
    [engine],
  );

  /** The map beside the walk follows you. */
  const followWalk = useCallback(
    (at: { lat: number; lon: number; heading: number }) => {
      walkerAt.current = at;
      if (!engine) return;
      const p = engine.projection.toMap(at.lon, at.lat);
      engine.jumpTo({ x: p.x, y: p.y });
    },
    [engine],
  );

  /** Puts the person down where `find` says, or says there is no street there. */
  const putDown = useCallback(
    async (find: () => Promise<PlacedDrop | null>, then: (drop: PlacedDrop) => void) => {
      try {
        const drop = await find();
        if (drop) then(drop);
        else toast(t.walk.noStreet);
      } catch {
        toast.error(t.walk.failed);
      }
    },
    [t],
  );

  const putDownAtCentre = useCallback(() => {
    if (!engine || !canWalk) return;
    const c = engine.getCentre();
    void putDown(
      () => dropAtLonLat(walkVersion, c.lon, c.lat),
      (d) => openWalk(d),
    );
  }, [engine, canWalk, walkVersion, putDown, openWalk]);

  useEffect(() => {
    walkLinkRef.current = async (link) => {
      if (!canWalk) return;
      await putDown(
        () => dropAtLonLat(walkVersion, link.lon, link.lat),
        (d) => {
          if (walkingRef.current) setGoTo({ ...startOf(d, link.heading), id: performance.now() });
          else openWalk(d, link.heading);
        },
      );
    };
  });
  // a walk link opens the walk as the map opens
  useEffect(() => {
    if (!canWalk) return;
    const link = parseWalkHash(window.location.hash);
    if (link) void walkLinkRef.current(link);
  }, [canWalk]);

  // a tap on the map: the person waiting for it is put down there; beside the walk, you go there
  const tapRef = useRef<(x: number, y: number) => void>(() => {});
  useEffect(() => {
    tapRef.current = (x, y) => {
      if (!engine || !canWalk) return;
      if (walkingRef.current)
        void putDown(
          () => dropAtScreen(engine, walkVersion, x, y),
          (d) => setGoTo({ ...startOf(d), id: performance.now() }),
        );
      else if (armed)
        void putDown(
          () => dropAtScreen(engine, walkVersion, x, y),
          (d) => openWalk(d),
        );
    };
  });
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
      tapRef.current(e.clientX - r.left, e.clientY - r.top);
    };
    // beside the walk, the wheel zooms about you: the map stays centred where you are
    const onWheel = (e: WheelEvent) => {
      if (!walkingRef.current || e.target !== canvas) return;
      e.preventDefault();
      e.stopPropagation();
      let dy = e.deltaY;
      if (e.deltaMode === 1) dy *= 16;
      else if (e.deltaMode === 2) dy *= canvas.clientHeight;
      dy = Math.max(-320, Math.min(320, dy));
      engine.zoomBy(Math.exp(-dy * (e.ctrlKey ? 0.011 : 0.0018)), undefined, false);
    };
    const root = canvas.parentElement;
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    root?.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      root?.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [engine]);

  // while walking: you on the map, and no building lights up under the pointer (the map's other
  // signs give way); back on the map, they light up again
  useEffect(() => {
    if (!engine || !walking) return;
    engine.setSights([]);
    let off: (() => void) | null = null;
    let gone = false;
    void import("@/map/walker").then((m) => {
      if (!gone) off = m.walkerLayer(engine, () => walkerAt.current);
    });
    return () => {
      gone = true;
      off?.();
      engine.setSights(sightsRef.current);
    };
  }, [engine, walking]);

  // keys
  const walkKeyRef = useRef(putDownAtCentre);
  useEffect(() => {
    walkKeyRef.current = putDownAtCentre;
  });
  useEffect(() => {
    if (!engine) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // the walk takes the keys while it is open
      if (walkingRef.current) return;
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)))
        return;
      if (document.querySelector('[role="dialog"]')) return; // a dialog or the settings panel has the keys
      // a round of Guess the building takes A–D and 1–4, Enter and N, and Esc first
      const game = quizRef.current;
      const action = quizKey(game.state.phase, {
        key: e.key,
        repeat: e.repeat,
        onControl: !!target?.closest("button, a, input, [role=button], [role=option]"),
      });
      if (action) {
        if (action === "stop") game.stop();
        else if (action === "next") game.next();
        else if (action === "start") game.start();
        else if (action === "again") game.again();
        else if (game.state.phase === "asking") game.pick(game.state.choices[action.pick]);
        e.preventDefault();
        return;
      }
      const toggle = (key: "hoods" | "tilt" | "minimap") =>
        prefsStore.set({ [key]: !prefsStore.getSnapshot()[key] });

      switch (e.key) {
        case "/":
          searchRef.current?.focus();
          break;
        case "+":
        case "=":
          engine.zoomStep(1);
          break;
        case "-":
        case "_":
          engine.zoomStep(-1);
          break;
        case "0":
          engine.fitAll();
          break;
        case "ArrowLeft":
          engine.panBy(-PAN_STEP, 0);
          break;
        case "ArrowRight":
          engine.panBy(PAN_STEP, 0);
          break;
        case "ArrowUp":
          engine.panBy(0, -PAN_STEP);
          break;
        case "ArrowDown":
          engine.panBy(0, PAN_STEP);
          break;
        case "b":
        case "B":
          if (!hasHoods) return; // nothing to draw in this world
          toggle("hoods");
          break;
        case "d":
        case "D":
          toggle("tilt");
          break;
        case "m":
        case "M":
          toggle("minimap");
          break;
        case "w":
        case "W":
          // the little person, picked up and put down in the middle of the map
          if (!WORLD.walk || e.repeat) return;
          walkKeyRef.current();
          break;
        case "Escape":
          setQuery("");
          setArmed(false);
          engine.setPin(null);
          engine.releaseSight();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [engine, hasHoods]);

  const tiltOn = prefs.tilt && prefs.tiltStrength > 0;
  const rootStyle = {
    "--tilt-blur": `${(1.5 + prefs.tiltStrength * 0.085).toFixed(2)}px`,
    "--tilt-reach": `${(20 + prefs.tiltStrength * 0.14).toFixed(1)}vh`,
  } as CSSProperties;
  const delay = (ms: number, from = -8) =>
    ({ "--sign-delay": `${ms}ms`, "--sign-from": `${from}px` }) as CSSProperties;

  return (
    <div
      className={cn("map-root", tiltOn && !walking && "tilt-on", walking && "walk-split")}
      style={rootStyle}
    >
      <canvas ref={canvasRef} className="map-tiles" tabIndex={0} aria-label={copy.mapLabel} />
      <div aria-hidden className="dusk-wash" />
      <div aria-hidden className="tilt-band" data-edge="top" data-depth="near" />
      <div aria-hidden className="tilt-band" data-edge="top" data-depth="far" />
      <div aria-hidden className="tilt-band" data-edge="bottom" data-depth="near" />
      <div aria-hidden className="tilt-band" data-edge="bottom" data-depth="far" />
      <canvas ref={marksRef} className="map-marks" aria-hidden />

      {!session && <Splash failed={failed} onRetry={retry} />}

      {/* the street walk, large, with the map beside it (below it on a phone) */}
      {session && walk && (
        <div className="walk-area">
          {WalkScreen ? (
            <WalkScreen
              manifest={session.manifest}
              start={walk}
              goTo={goTo}
              onExit={exitWalk}
              onMove={followWalk}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-sign p-4">
              <div className="sign flex flex-col items-center gap-3 px-5 py-4 text-sm">
                <p role="status" className="font-semibold">
                  {t.walk.loading}
                </p>
                {/* the walk's own keys are not there yet: the way back is */}
                <button
                  type="button"
                  onClick={() => exitWalk(walkerAt.current ?? session.engine.getCentre())}
                  className="h-8 rounded-full bg-sign-raised px-3.5 text-xs font-semibold hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-taxi focus-visible:outline-none"
                >
                  {t.walk.back}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {session && engine && walk && (
        <div className="walk-map-signs">
          <p className="sign absolute top-2 left-2 rounded-full px-3 py-1.5 text-xs font-semibold text-paper-dim">
            {t.walk.mapGoThere}
          </p>
          <CreditStrip
            engine={engine}
            onAbout={() => setAboutOpen(true)}
            readout={false}
            className="pointer-events-auto absolute right-2 bottom-2"
          />
        </div>
      )}

      {session && engine && !walk && (
        <>
          {lit && litSight && !quizRound && (
            <SightSign
              engine={engine}
              sight={litSight}
              text={litText}
              pinned={lit.pinned}
              onClose={() => engine.releaseSight()}
            />
          )}
          {/* a round answered: the building's name goes up on it (the card holds the rest) */}
          {quiz.state.phase === "answered" && quiz.sight && (
            <SightSign
              engine={engine}
              sight={quiz.sight}
              text={undefined}
              pinned={false}
              onClose={() => {}}
            />
          )}
          {quiz.state.phase !== "off" && (
            <QuizCard
              state={quiz.state}
              sights={sightById}
              article={quizArticle}
              questions={quiz.questions}
              has={quiz.has}
              choice={quiz.choice}
              areaLabel={copy.borough}
              onChoice={quiz.setChoice}
              onStart={quiz.start}
              onPick={quiz.pick}
              onNext={quiz.next}
              onAgain={quiz.again}
              onChange={quiz.change}
              onStop={quiz.stop}
            />
          )}
          <SearchSign
            index={index}
            unavailable={placesFailed}
            query={query}
            onQueryChange={setQuery}
            onChoose={choosePlace}
            onClear={clearPin}
            inputRef={searchRef}
            className="sign-in fixed top-(--edge-t) right-(--edge-r) left-(--edge-l) sm:right-auto sm:w-[25rem]"
            style={delay(60)}
          />
          {/* under the search sign, and clear of the tools that sit beside it on a narrow screen;
              the other places go up with the map's other signs and stay; the game's sign follows
              once the buildings are in, and steps aside while a game is on */}
          <div className="fixed top-[calc(var(--edge-t)+3.9375rem)] left-(--edge-l) z-[5] flex max-w-[calc(100vw-var(--edge-l)-var(--edge-r)-3.5rem)] flex-col items-start gap-2 sm:max-w-[25rem]">
            <ExploreBanner className="sign-in" style={delay(100)} />
            {WORLD.quiz && sights.length > 0 && !quizOn && (
              <QuizBanner onStart={quiz.open} className="sign-in" style={delay(0)} />
            )}
          </div>
          <ToolColumn
            northDeg={session.manifest.northDeg}
            onZoomIn={() => engine.zoomStep(1)}
            onZoomOut={() => engine.zoomStep(-1)}
            onWholeMap={() => engine.fitAll()}
            onSearch={() => searchRef.current?.focus()}
            onShare={share}
            onAbout={() => setAboutOpen(true)}
            onDonate={
              takesDonations
                ? () => {
                    setDonateCity(null);
                    setDonateOpen(true);
                  }
                : undefined
            }
            settingsOpen={settingsOpen}
            onSettingsOpenChange={setSettingsOpen}
            settings={<SettingsPanel prefs={prefs} onChange={setPrefs} hoodLines={hasHoods} />}
            person={
              canWalk ? (
                <WalkPerson
                  engine={engine}
                  version={walkVersion}
                  armed={armed}
                  onArmedChange={setArmed}
                  onDrop={(d) => openWalk(d)}
                  onCentre={putDownAtCentre}
                />
              ) : undefined
            }
            className="sign-in fixed top-[calc(var(--edge-t)+3.9375rem)] right-(--edge-r) sm:top-(--edge-t)"
            style={delay(140)}
          />
          {prefs.minimap && (
            <Minimap
              engine={engine}
              compact={compact}
              className="sign-in fixed bottom-(--edge-b) left-(--edge-l)"
              style={delay(220, 8)}
            />
          )}
          <CreditStrip
            engine={engine}
            onAbout={() => setAboutOpen(true)}
            className="sign-in fixed right-(--edge-r) bottom-(--edge-b)"
            style={delay(300, 8)}
          />
        </>
      )}

      <AboutDialog
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        attribution={session?.manifest.attribution ?? []}
        hoodLines={hasHoods}
        onDonate={
          takesDonations
            ? () => {
                // one sign at a time: the donate sign takes the About sign's place
                setAboutOpen(false);
                setDonateCity(null);
                setDonateOpen(true);
              }
            : undefined
        }
        onBecome={
          takesDonations
            ? (cityName) => {
                setAboutOpen(false);
                setDonateCity(cityName);
                setDonateOpen(true);
              }
            : undefined
        }
      />
      {takesDonations && (
        <DonateDialog open={donateOpen} onOpenChange={setDonateOpen} city={donateCity} />
      )}
      <LoadErrorDialog
        message={errorMessage}
        onDismiss={() => setErrorMessage(null)}
        onRetry={retry}
      />
    </div>
  );
}
