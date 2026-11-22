/**
 * A pixel picture (one character per pixel, a palette for the characters that are drawn) as
 * one SVG path per colour: each row's runs of a colour are one rectangle, `M x y h n v 1 h -n z`.
 * The same picture as one rect per pixel was a hundred elements a badge, and the front page,
 * which bakes the badges of every city being funded into its HTML, carried thousands.
 */
export function pixelPaths(
  rows: readonly string[],
  palette: Readonly<Record<string, string>>,
): { fill: string; d: string }[] {
  const byColour = new Map<string, string[]>();
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = palette[row[x]];
      let end = x + 1;
      while (end < row.length && palette[row[end]] === fill) end++;
      if (fill) {
        const runs = byColour.get(fill) ?? [];
        runs.push(`M${x} ${y}h${end - x}v1h-${end - x}z`);
        byColour.set(fill, runs);
      }
      x = end;
    }
  });
  return [...byColour].map(([fill, runs]) => ({ fill, d: runs.join("") }));
}
