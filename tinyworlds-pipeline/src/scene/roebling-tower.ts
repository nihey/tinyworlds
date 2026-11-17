/** Roebling's mapped tower footings end at the roadway. */
export const ROEBLING_DECK_HEIGHT = 23;
/** The two-lane roadway between the mapped masonry jambs. */
export const ROEBLING_ROAD_WIDTH = 8.4;

const ARCH_BANDS = 8;

type Point = [number, number];

const between = ([p, q]: Point, [r, s]: Point, fraction: number): Point => [
  p + (r - p) * fraction,
  q + (s - q) * fraction,
];

/** Fill the corners below a mapped lintel to form a semicircular arch. The lintel's
 * longer sides face the bridge span and its shorter sides meet the existing jambs. */
export function roeblingPortalShoulders(
  ring: readonly number[],
  crown: number,
): { ring: number[]; base: number; top: number }[] {
  if (ring.length !== 8) return [];
  const corners: Point[] = [
    [ring[0], ring[1]],
    [ring[2], ring[3]],
    [ring[4], ring[5]],
    [ring[6], ring[7]],
  ];
  const sides = corners.map(([p, q], i) => {
    const [r, s] = corners[(i + 1) % 4];
    return Math.hypot(r - p, s - q);
  });
  const front = sides[0] + sides[2] > sides[1] + sides[3] ? 0 : 1;
  const a = corners[front];
  const b = corners[front + 1];
  const c = corners[front + 2];
  const d = corners[(front + 3) % 4];
  const radius = (sides[front] + sides[front + 2]) / 4;
  const spring = crown - radius;
  if (radius <= 0 || spring <= ROEBLING_DECK_HEIGHT) return [];

  const pieces: { ring: number[]; base: number; top: number }[] = [];
  for (let i = 0; i < ARCH_BANDS; i++) {
    const base = spring + (radius * i) / ARCH_BANDS;
    const top = spring + (radius * (i + 1)) / ARCH_BANDS;
    const level = (i + 0.5) / ARCH_BANDS;
    const inset = (1 - Math.sqrt(1 - level ** 2)) / 2;
    pieces.push(
      { ring: [...a, ...between(a, b, inset), ...between(d, c, inset), ...d], base, top },
      { ring: [...between(b, a, inset), ...b, ...c, ...between(c, d, inset)], base, top },
    );
  }
  return pieces;
}
