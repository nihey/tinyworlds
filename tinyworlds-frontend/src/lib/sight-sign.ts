import type { Strings } from "@/i18n";
import type { Locale } from "@/i18n/locale";
import type { Sight, SightText, SightTexts } from "@/map/sights";

/** Space between the anchor and the sign, and between the sign and the screen's edges (CSS px). */
const GAP = 16;
const MARGIN = 8;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where the sign goes (its top-left, CSS px): to the right of its anchor, or to the left where
 * the right has no room, below any of the map's own signs (`over`: the search, the banner, the
 * tools) it would otherwise slide under, and always whole on screen.
 */
export function placeSign(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  over: Box[] = [],
): { x: number; y: number } {
  let x = anchor.x + GAP;
  if (x + size.w > viewport.w - MARGIN) x = anchor.x - GAP - size.w;
  x = clamp(x, MARGIN, Math.max(MARGIN, viewport.w - MARGIN - size.w));
  const bottom = Math.max(MARGIN, viewport.h - MARGIN - size.h);
  let y = clamp(anchor.y, MARGIN, bottom);
  // out of each sign's way: to its left where that fits, else below it; top to bottom, and again
  // while a move lands it on another
  const boxes = [...over].sort((a, b) => a.y - b.y);
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const box of boxes) {
      const across = x < box.x + box.w && box.x < x + size.w;
      const down = y < box.y + box.h && box.y < y + size.h;
      if (!across || !down) continue;
      const left = box.x - MARGIN - size.w;
      if (left >= MARGIN) x = left;
      else y = box.y + box.h + MARGIN;
      moved = true;
    }
    if (!moved) break;
  }
  return { x, y: Math.min(y, bottom) };
}

export interface SignContent {
  /** type · context line, e.g. "Landmark · Manhattan" (set in capitals by the sign) */
  kicker: string;
  name: string;
  /** the opening of its article, in the language it is written in */
  text?: string;
  lang?: string;
  link?: { href: string; label: string };
}

/** What the sign says about a sight, given its article (if it has one) and the visitor's words. */
export function signContent(sight: Sight, text: SightText | undefined, t: Strings): SignContent {
  const type =
    sight.t === "building" || sight.t === "borough" ? t.sight.building : t.placeTypes[sight.t];
  const content: SignContent = {
    kicker: sight.b ? `${type} · ${sight.b}` : type,
    name: sight.n,
  };
  if (text) {
    content.text = text.text;
    content.lang = text.lang;
    content.link = { href: text.url, label: t.sight.readOn };
  }
  return content;
}

/** Whether the visitor's language's texts are in, or must be loaded. */
export function textsFor(
  loaded: { locale: Locale; texts: SightTexts } | null,
  locale: Locale,
): "load" | "ready" {
  return loaded?.locale === locale ? "ready" : "load";
}
