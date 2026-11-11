"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { DonateDialog } from "@/components/donate/donate-dialog";
import { ExploreBanner } from "@/components/map/explore-banner";
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
import { formatHash, parseHash, writeHash } from "@/map/hash";
import type { Manifest, Place } from "@/map/manifest";
import { createSearchIndex } from "@/map/search";
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
          start: parseHash(window.location.hash) ?? undefined,
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
                live.setSights(list);
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
      const centre = engine.getCentre();
      const hash = formatHash({ ...centre, scale: engine.getView().scale });
      if (window.location.hash !== hash) writeHash(hash);
    };
    const off = engine.on("settle", write);
    const onHashChange = () => {
      const view = parseHash(window.location.hash);
      if (view) engine.flyTo(view);
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

  // keys
  useEffect(() => {
    if (!engine) return;
    const onKeyDown = (e: KeyboardEvent) => {
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
        case "Escape":
          setQuery("");
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
    <div className={cn("map-root", tiltOn && "tilt-on")} style={rootStyle}>
      <canvas ref={canvasRef} className="map-tiles" tabIndex={0} aria-label={copy.mapLabel} />
      <div aria-hidden className="dusk-wash" />
      <div aria-hidden className="tilt-band" data-edge="top" data-depth="near" />
      <div aria-hidden className="tilt-band" data-edge="top" data-depth="far" />
      <div aria-hidden className="tilt-band" data-edge="bottom" data-depth="near" />
      <div aria-hidden className="tilt-band" data-edge="bottom" data-depth="far" />
      <canvas ref={marksRef} className="map-marks" aria-hidden />

      {!session && <Splash failed={failed} onRetry={retry} />}

      {session && engine && (
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
