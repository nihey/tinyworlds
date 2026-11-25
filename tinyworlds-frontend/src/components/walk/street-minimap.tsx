"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/hooks/use-i18n";
import type { WalkGame } from "@/walk/game";
import {
  easeSpan,
  MinimapDrawer,
  minimapSpan,
  paletteHex,
  type MinimapTones,
} from "@/walk/minimap";
import { LIT, SHADE } from "@/walk/render/palette";
import { WORLD } from "@/worlds";

/**
 * The walk's minimap in the bottom-left corner (`walk/minimap.ts` draws it): a small square sign
 * of the streets round you, turned with you and zoomed out with your speed. Drawn at most 20
 * times a second, from the game's own place and heading; a picture for a screen reader, named
 * once, and no target for a touch (the thumb stick under it takes it).
 */

/** About this many CSS px a pixel. */
const PIXEL = 2;
/** Ms between two drawings. */
const EVERY = 50;

/** The minimap's size for a box `css` px across at this device pixel ratio: an odd number of
 * pixels (so you stand in the middle one), each a whole number of device pixels. */
function sizing(css: number, dpr: number): { pixels: number; cssPx: number } {
  const unit = Math.max(1, Math.round(PIXEL * dpr)) / dpr;
  let pixels = Math.max(1, Math.floor(css / unit));
  if (pixels % 2 === 0) pixels -= 1;
  return { pixels, cssPx: pixels * unit };
}

/** The tones: the sign's dark for the land, the palette's deep water, paper for the streets. */
function tonesFor(game: WalkGame, canvas: HTMLCanvasElement): MinimapTones {
  const ix = game.world.index;
  const sign = getComputedStyle(canvas).getPropertyValue("--sign").trim();
  return {
    land: /^#[0-9a-f]{6}$/i.test(sign) ? sign : "#15171a",
    water: paletteHex(ix, "water", SHADE, "#2b5575"),
    // a light paper, the major streets a touch brighter: the lane markings' own white
    street: paletteHex(ix, "concrete", LIT, "#b9b7af"),
    major: paletteHex(ix, "markingWhite", LIT, "#e4e3db"),
    // the bridges and highways: a warm tone apart from the streets, the water and the accent
    elevated: paletteHex(ix, "salmon", LIT, "#e3ab8d"),
    you: WORLD.accent.color,
    ink: "#15171a",
    north: "#f4f2ec",
  };
}

export function StreetMinimap({ game, reducedMotion }: { game: WalkGame; reducedMotion: boolean }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const box = boxRef.current;
    if (!canvas || !box) return;
    let drawer: MinimapDrawer;
    try {
      drawer = new MinimapDrawer(canvas, game.world, tonesFor(game, canvas));
    } catch {
      // no 2d canvas: the walk goes on without it
      box.hidden = true;
      return;
    }
    let dpr = 0;
    const fit = () => {
      dpr = window.devicePixelRatio || 1;
      const { pixels, cssPx } = sizing(box.clientWidth, dpr);
      if (canvas.width !== pixels || canvas.height !== pixels) {
        canvas.width = pixels;
        canvas.height = pixels;
      }
      canvas.style.width = `${cssPx}px`;
      canvas.style.height = `${cssPx}px`;
    };
    let needsFit = true;
    const observer = new ResizeObserver(() => {
      needsFit = true;
    });
    observer.observe(box);
    let raf = 0;
    let last = -Infinity;
    let span = Number.NaN;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < EVERY) return;
      const dt = (now - last) / 1000;
      last = now;
      // Resizing clears the canvas, so resize only on the frame that redraws it.
      if (needsFit || (window.devicePixelRatio || 1) !== dpr) {
        fit();
        needsFit = false;
      }
      const v = game.state.vehicle;
      span = easeSpan(span, minimapSpan(v ? v.speed : 0), dt, reducedMotion);
      drawer.draw(game.position(), span);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [game, reducedMotion]);

  return (
    <div
      ref={boxRef}
      role="img"
      aria-label={t.walk.minimap}
      className="walk-minimap sign pointer-events-none absolute z-[4] grid place-items-center overflow-hidden"
    >
      <canvas ref={canvasRef} aria-hidden className="block [image-rendering:pixelated]" />
    </div>
  );
}
