"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/hooks/use-i18n";
import type { WalkGame } from "@/walk/game";

/**
 * The wasted screen's lettering, in the site's own style: the word in Tiny5, the paper colour
 * with a dark outline one of its own pixels wide, over a vignette dithered in whole pixels (no
 * band, no blending of its own), all faded as `wastedAt` says. The greying, the slow motion and
 * the lifting camera are the game's and the view's. The word is said once to a screen reader;
 * a key (the game hears those) or a tap skips ahead once it is up.
 */

/** Screen px per pixel of the vignette. */
const DOT = 3;
/** A 4 × 4 Bayer matrix: the order in which a cell's pixels darken. */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const INK = [21, 23, 26];

/** Darkens towards the corners, pixel by pixel, in the ink of the signs. */
function drawVignette(canvas: HTMLCanvasElement): void {
  const w = Math.max(1, Math.ceil(canvas.clientWidth / DOT));
  const h = Math.max(1, Math.ceil(canvas.clientHeight / DOT));
  if (canvas.width === w && canvas.height === h) return;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (x + 0.5) / w - 0.5;
      const dy = (y + 0.5) / h - 0.5;
      // 0 in the middle, 1 at the corners of an ellipse fitted to the view
      const d = Math.hypot(dx, dy) / Math.SQRT1_2;
      const dark = Math.min(1, Math.max(0, (d - 0.3) / 0.62));
      if (dark * 16 <= BAYER[(x & 3) + (y & 3) * 4] + 0.5) continue;
      const o = (x + y * w) * 4;
      img.data[o] = INK[0];
      img.data[o + 1] = INK[1];
      img.data[o + 2] = INK[2];
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
}

export function WastedOverlay({ game }: { game: WalkGame }) {
  const { t } = useI18n();
  const [on, setOn] = useState(false);
  const [said, setSaid] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const vignette = useRef<HTMLCanvasElement>(null);
  const word = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let was = false;
    return game.subscribe((s) => {
      const w = s.wasted;
      if (!!w !== was) {
        was = !!w;
        setOn(was);
        setSaid(was ? t.walk.wastedSaid : "");
      }
      if (!w) return;
      // straight into the DOM: these change every frame for a few seconds
      if (root.current) root.current.style.cursor = w.skippable ? "pointer" : "default";
      if (vignette.current) vignette.current.style.opacity = String(Math.max(w.word, w.grey * 0.8));
      if (word.current) word.current.style.opacity = String(w.word);
    });
  }, [game, t]);

  useEffect(() => {
    const canvas = vignette.current;
    if (!on || !canvas) return;
    drawVignette(canvas);
    const ro = new ResizeObserver(() => drawVignette(canvas));
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [on]);

  return (
    <>
      <p aria-live="polite" className="sr-only">
        {said}
      </p>
      {on && (
        <div
          ref={root}
          aria-hidden
          className="absolute inset-0 z-20 touch-none"
          onPointerDown={() => game.skipWasted()}
        >
          <canvas
            ref={vignette}
            className="absolute inset-0 h-full w-full opacity-0 [image-rendering:pixelated]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <p ref={word} className="walk-wasted font-pixel opacity-0 select-none">
              {t.walk.wasted}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
