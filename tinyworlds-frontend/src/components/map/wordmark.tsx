import { cn } from "@/lib/utils";
import { wordmarkScale } from "@/lib/wordmark";
import { SITE_NAME, SITE_WORDMARK } from "@/site";

/**
 * "tiny" plus the city's initials in the pixel face, the initials lit in the world's colour.
 * By default the site's own name; `suffix` names another world (the front page's cards).
 */
export function Wordmark({
  className,
  plain = false,
  suffix = SITE_WORDMARK,
  accent,
}: {
  className?: string;
  plain?: boolean;
  suffix?: string;
  /** another world's colour, for its half of the word */
  accent?: string;
}) {
  const scale = wordmarkScale(suffix);
  return (
    <span
      role="img"
      aria-label={suffix === SITE_WORDMARK ? SITE_NAME : `tiny${suffix}`}
      className={cn("font-pixel leading-none tracking-[0.03em] select-none", className)}
    >
      {/* a long name ("tinykingslanding") is set smaller, so it fits where an airport code does */}
      <span aria-hidden style={scale < 1 ? { fontSize: `${scale}em` } : undefined}>
        tiny
        <span
          className={plain ? undefined : "text-taxi"}
          style={accent ? { color: accent } : undefined}
        >
          {suffix}
        </span>
      </span>
    </span>
  );
}
