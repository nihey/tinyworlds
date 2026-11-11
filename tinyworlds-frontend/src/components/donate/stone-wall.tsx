import {
  STONES_PER_ROW,
  WALL_MAX_STONES,
  wallLooks,
  type CityStones,
  type WallLook,
} from "@/lib/stones";
import { cn } from "@/lib/utils";

const MARK =
  "after:absolute after:inset-[30%] after:rotate-45 after:rounded-[1px] after:bg-taxi-ink after:content-['']";

/**
 * A city's funding as its foundation: one stone per dollar, fifteen to a row, the first and
 * the last marked as the benefactors' sign marks them. With `mine` (a donor's stone numbers)
 * theirs stay bright and the others' go dimmer. A foundation too large to read stone by stone
 * is one plain bar. To assistive technology it is a progress bar either way.
 */
export function StoneWall({
  stones,
  mine,
  label,
  valueText,
  className,
}: {
  stones: CityStones;
  /** the donor's own stone numbers (1-based); given, the other laid stones are drawn dimmer */
  mine?: number[];
  /** names the bar: the city */
  label: string;
  /** what it stands at, in words: "$10 of $30" */
  valueText: string;
  className?: string;
}) {
  const filled = stones.total > 0 ? stones.laid / stones.total : 0;
  const bar = {
    role: "progressbar",
    "aria-label": label,
    "aria-valuemin": 0,
    "aria-valuemax": 100,
    "aria-valuenow": Math.round(filled * 100),
    "aria-valuetext": valueText,
  } as const;

  if (stones.total === 0 || stones.total > WALL_MAX_STONES)
    return (
      <div {...bar} className={cn("h-1.5 overflow-hidden rounded-full bg-white/12", className)}>
        <div className="h-full rounded-full bg-taxi" style={{ width: `${filled * 100}%` }} />
      </div>
    );

  const look: Record<WallLook, string> = {
    mine: "bg-taxi",
    // the badges' dark gold: someone else's stone, beside the donor's own
    laid: mine ? "bg-[#7a5d0c]" : "bg-taxi",
    empty: "bg-white/[0.08]",
  };
  const last = stones.total - 1;
  return (
    <div
      {...bar}
      className={cn("grid gap-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${STONES_PER_ROW}, minmax(0, 1fr))` }}
    >
      {wallLooks(stones, mine).map((stone, i) => (
        <span
          key={i}
          aria-hidden
          className={cn(
            "relative aspect-square rounded-[2px] shadow-[inset_0_-2px_0_rgb(0_0_0/0.25)]",
            look[stone],
            (i === 0 || i === last) && MARK,
          )}
        />
      ))}
    </div>
  );
}
