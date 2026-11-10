import { cn } from "@/lib/utils";
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
  return (
    <span
      role="img"
      aria-label={suffix === SITE_WORDMARK ? SITE_NAME : `tiny${suffix}`}
      className={cn("font-pixel leading-none tracking-[0.03em] select-none", className)}
    >
      <span aria-hidden>tiny</span>
      <span
        aria-hidden
        className={plain ? undefined : "text-taxi"}
        style={accent ? { color: accent } : undefined}
      >
        {suffix}
      </span>
    </span>
  );
}
