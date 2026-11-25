import { clipRing } from "../walk/clip.js";

type Point = readonly [number, number];
type Deck = { across: number; width: number; z: number };
type Piece = { ring: number[]; base: number; top: number };

export type TowerFrame =
  "arched" | "round" | "braced" | "single-brace" | "three-brace" | "columns" | "flanked";

const NEW_YORK: Record<number, readonly [string, TowerFrame]> = {
  211: ["Verrazzano-Narrows Bridge", "round"],
  184: ["George Washington Bridge", "braced"],
  115: ["Bronx-Whitestone Bridge", "arched"],
  102: ["Manhattan Bridge", "flanked"],
  99: ["Throgs Neck Bridge", "arched"],
  96: ["Robert F. Kennedy Bridge", "columns"],
  94: ["Williamsburg Bridge", "single-brace"],
};

/** Reference profiles for the paired supports in the city's source data. */
export function mappedTowerFrame(city: string, height: number): readonly [string, TowerFrame] | undefined {
  if (city === "tinynyc") return NEW_YORK[height];
  if (city === "tinyphl" && height === 117) return ["Ben Franklin Bridge", "three-brace"];
}

/** One mapped deck step where it crosses the transverse plane of the tower. Ignore roads
 * passing its side or going across the bridge's axis. Steps meet in overlapping ends. */
export function deckAtTower(
  [p, q]: Point,
  [up, uq]: Point,
  halfWidth: number,
  step: { p: number; q: number; up: number; uq: number; a: number; b: number; width: number; z: number },
): Deck | null {
  const heading = step.up * up + step.uq * uq;
  if (Math.abs(heading) < 0.92) return null;
  const dp = step.p - p;
  const dq = step.q - q;
  const distance = -(dp * up + dq * uq) / heading;
  if (distance < step.a - 0.1 || distance > step.b + 0.1) return null;
  const across = (dq + step.uq * distance) * up - (dp + step.up * distance) * uq;
  const width = step.width / Math.abs(heading);
  return Math.abs(across) <= halfWidth ? { across, width, z: step.z } : null;
}

/** Build an open steel frame from the surveyed depth and width. Decks share the lower portal,
 * and the span's steel joins the legs above or below traffic. */
export function steelTower(
  ring: number[],
  [p, q]: Point,
  [up, uq]: Point,
  height: number,
  decks: readonly Deck[],
  frame: TowerFrame,
): { pieces: Piece[]; braces: number[][]; cableOffsets: [number, number] } | null {
  const highest = Math.max(...decks.map((d) => d.z));
  const lowest = Math.min(...decks.map((d) => d.z));
  const headroom = height - highest;
  if (decks.length === 0 || headroom < 14) return null;

  const local: number[] = [];
  let left = Infinity;
  let right = -Infinity;
  let front = Infinity;
  let back = -Infinity;
  for (let i = 0; i < ring.length; i += 2) {
    const dp = ring[i] - p;
    const dq = ring[i + 1] - q;
    const across = dq * up - dp * uq;
    const along = dp * up + dq * uq;
    local.push(across, along);
    left = Math.min(left, across);
    right = Math.max(right, across);
    front = Math.min(front, along);
    back = Math.max(back, along);
  }

  const width = right - left;
  if (width < 16) return null;
  const leg = Math.min(8, width * 0.18);
  const openingLeft = Math.max(
    left + 2,
    Math.min(left + leg, Math.min(...decks.map((d) => d.across - d.width / 2)) - 0.5),
  );
  const openingRight = Math.min(
    right - 2,
    Math.max(right - leg, Math.max(...decks.map((d) => d.across + d.width / 2)) + 0.5),
  );
  const toGrid = (across: number, along: number): [number, number] => [
    p + along * up - across * uq,
    q + along * uq + across * up,
  ];
  const pieces: Piece[] = [];
  const add = (lo: number, hi: number, base: number, top: number) => {
    const cut = clipRing(local, { e0: lo, e1: hi, n0: front, n1: back });
    if (cut.length === 0) return;
    const points: number[] = [];
    for (let i = 0; i < cut.length; i += 2) points.push(...toGrid(cut[i], cut[i + 1]));
    pieces.push({ ring: points, base, top });
  };
  add(left, openingLeft, 0, height);
  add(openingRight, right, 0, height);
  const thick = Math.min(8, Math.max(2.5, headroom * 0.055));
  if (lowest > 1) add(openingLeft, openingRight, Math.max(0, lowest - thick), lowest);

  const plain = frame === "arched" || frame === "round";
  const clear = highest + headroom * (plain ? 0.86 : frame === "flanked" ? 0.58 : 0.3);
  const cap = height - thick;
  add(openingLeft, openingRight, clear - thick, plain ? height : clear);
  if (!plain) add(openingLeft, openingRight, cap, height);

  if (frame !== "single-brace") {
    const rise = Math.min(
      (openingRight - openingLeft) / 2,
      headroom * (frame === "round" || frame === "flanked" ? 0.28 : 0.09),
    );
    const foot = clear - thick - rise;
    const half = (openingRight - openingLeft) / 2;
    for (let band = 0; band < 6; band++) {
      const share = (band + 0.5) / 6;
      const edge = half * (1 - Math.sqrt(1 - share * share));
      const base = foot + (rise * band) / 6;
      const top = foot + (rise * (band + 1)) / 6;
      add(openingLeft, openingLeft + edge, base, top);
      add(openingRight - edge, openingRight, base, top);
    }
  }

  const braces: number[][] = [];
  const cross = (left: number, right: number, bottom: number, top: number) => {
    for (const along of [front, back]) {
      const a = toGrid(left, along);
      const b = toGrid(right, along);
      braces.push([...a, bottom, ...b, top], [...b, bottom, ...a, top]);
    }
  };
  const mid = (clear + cap) / 2;
  const span = openingRight - openingLeft;
  if (frame === "columns") {
    for (const f of [0.25, 0.5, 0.75]) {
      const x = openingLeft + span * f;
      add(x - 0.75, x + 0.75, clear, cap);
    }
    add(openingLeft, openingRight, mid - 0.9, mid);
  } else if (frame === "flanked") {
    for (const [lo, hi] of [
      [openingLeft, openingLeft + span * 0.2],
      [openingRight - span * 0.2, openingRight],
    ]) {
      cross(lo, hi, clear, mid);
      cross(lo, hi, mid, cap);
      const inner = lo === openingLeft ? hi : lo;
      add(inner - 0.7, inner + 0.7, clear, cap);
    }
  } else if (!plain) {
    const bays = frame === "three-brace" ? 3 : frame === "braced" ? 2 : 1;
    const tier = (cap - clear) / bays;
    for (let i = 0; i < bays; i++) {
      const bottom = clear + i * tier;
      const top = bottom + tier;
      if (i > 0) add(openingLeft, openingRight, bottom - thick * 0.55, bottom);
      cross(openingLeft, openingRight, bottom, top - (i + 1 < bays ? thick * 0.55 : 0));
    }
  }
  const cableOffsets: [number, number] = [(left + openingLeft) / 2, (right + openingRight) / 2];
  return pieces.length ? { pieces, braces, cableOffsets } : null;
}
