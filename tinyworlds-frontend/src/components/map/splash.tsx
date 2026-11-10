"use client";

import { RotateCw } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n";
import { Wordmark } from "./wordmark";

const STOREYS = [14, 26, 18, 38, 22, 30, 12];

interface SplashProps {
  failed: boolean;
  onRetry: () => void;
}

/** Before the manifest arrives: the wordmark and a skyline going up. */
export function Splash({ failed, onRetry }: SplashProps) {
  const { t, copy } = useI18n();
  return (
    <div className="fixed inset-0 z-[3] flex flex-col items-center justify-center gap-5 text-[#15171a] dusk:text-paper">
      <div aria-hidden className="skyline flex h-10 items-end gap-[3px] text-current">
        {STOREYS.map((h, i) => (
          <i
            key={i}
            style={{
              height: h,
              background: "currentColor",
              animationDelay: `${i * -190}ms`,
              animationPlayState: failed ? "paused" : undefined,
            }}
          />
        ))}
      </div>
      <Wordmark plain className="text-[44px]" />
      {failed ? (
        <button
          type="button"
          onClick={onRetry}
          className="sign flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
        >
          <RotateCw className="size-4" strokeWidth={2.5} />
          {t.loadError.retry}
        </button>
      ) : (
        <p role="status" className="text-sm font-medium opacity-60">
          {copy.splash}
        </p>
      )}
    </div>
  );
}
