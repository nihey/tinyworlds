"use client";

import { ArrowRight } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { siteEvent } from "@/lib/site-events";
import { cn } from "@/lib/utils";
import { SITE_ID } from "@/site";

/**
 * The sign that starts Guess the building, under "more cities and worlds": an invitation to name
 * the buildings of this map. Shown in a world with the game, once its buildings are in.
 */
export function QuizBanner({
  onStart,
  className,
  style,
}: {
  onStart: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      data-rybbit-event="quiz_start"
      data-rybbit-prop-world={SITE_ID}
      onClick={() => {
        siteEvent("quiz_start", { world: SITE_ID });
        onStart();
      }}
      className={cn(
        "quiz-invite sign group z-[5] flex items-center gap-2.5 py-2.5 pr-3 pl-3 text-left text-[13px] leading-snug font-semibold text-paper outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]",
        className,
      )}
      style={style}
    >
      <span
        aria-hidden
        className="w-[19px] shrink-0 text-center font-pixel text-[18px] leading-none text-taxi"
      >
        ?
      </span>
      <span className="min-w-0">{t.quiz.invite}</span>
      <ArrowRight
        aria-hidden
        className="size-4 shrink-0 text-taxi transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        strokeWidth={2.5}
      />
    </button>
  );
}
