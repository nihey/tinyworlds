import { PIXEL_ART, type PixelArt } from "./pixel-art";

export type PixelArtName = keyof typeof PIXEL_ART;

/** A pixel picture as an inline SVG, one rect per pixel, drawn at a whole-number scale so it stays crisp. */
export function PixelIcon({ art, scale = 1 }: { art: PixelArtName; scale?: number }) {
  const { palette, rows }: PixelArt = PIXEL_ART[art];
  const width = rows[0].length;
  const height = rows.length;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${height}`}
      width={width * scale}
      height={height * scale}
      shapeRendering="crispEdges"
      className="block shrink-0"
    >
      {rows.flatMap((row, y) =>
        Array.from(row).flatMap((c, x) =>
          palette[c]
            ? [<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={palette[c]} />]
            : [],
        ),
      )}
    </svg>
  );
}

/**
 * A small plaque: a pixel icon and a few words in the pixel font, 18px tall inside a one-pixel
 * stepped border. The icon is lifted so a badge sits on a name's line without making the row taller.
 */
export function PixelBadge({
  art,
  label,
  title,
}: {
  art: PixelArtName;
  label: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex h-[18px] shrink-0 items-center gap-1 bg-[#2a2311] pr-[5px] pl-[3px] align-middle font-pixel text-[10px] leading-none tracking-[0.06em] whitespace-nowrap text-taxi uppercase shadow-[0_-1px_0_0_#7a5d0c,0_1px_0_0_#7a5d0c,-1px_0_0_0_#7a5d0c,1px_0_0_0_#7a5d0c]"
    >
      <span className="-mt-[3px] flex">
        <PixelIcon art={art} />
      </span>
      {label}
    </span>
  );
}
