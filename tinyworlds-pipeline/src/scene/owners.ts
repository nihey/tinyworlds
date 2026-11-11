/**
 * Which volumes of the scene belong to what is not a building: the bridges (their decks and
 * towers, by the roads' names) and the statues. The index reads it to light a bridge or a statue
 * up as one thing (`owners.json`, next to the scene).
 */
export interface Owners {
  bridges: { name: string; vols: number[] }[];
  statues: { lon: number; lat: number; vols: number[] }[];
}

/** Distance from (x, y) to the segment (ax, ay)–(bx, by). */
function toSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

/**
 * The bridge whose deck passes nearest (x, y), if one passes within `maxPx`. A deck's `xy` is a
 * flat path of map px [x0, y0, x1, y1, …].
 */
export function nearestBridge(
  x: number,
  y: number,
  decks: { name: string; xy: number[] }[],
  maxPx: number,
): string | null {
  let best: string | null = null;
  let bestD = maxPx;
  for (const deck of decks) {
    const xy = deck.xy;
    for (let i = 0; i + 3 < xy.length; i += 2) {
      const d = toSegment(x, y, xy[i], xy[i + 1], xy[i + 2], xy[i + 3]);
      if (d <= bestD) {
        bestD = d;
        best = deck.name;
      }
    }
  }
  return best;
}
