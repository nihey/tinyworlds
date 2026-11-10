"use client";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import type { Strings } from "@/i18n";

function describe(northDeg: number, c: Strings["compass"]): string {
  const deg = (((northDeg % 360) + 540) % 360) - 180; // −180…180, clockwise from up
  const abs = Math.round(Math.abs(deg));
  if (abs < 8) return c.up;
  if (abs > 172) return c.down;
  const right = deg > 0;
  if (abs < 82) return right ? c.upRight : c.upLeft;
  if (abs <= 98) return right ? c.right : c.left;
  return right ? c.downRight : c.downLeft;
}

/** Where true north points on this map: the view is turned to line the avenues up with the pixels. */
export function Compass({ northDeg }: { northDeg: number }) {
  const { t } = useI18n();
  const rad = (northDeg * Math.PI) / 180;
  const label = describe(northDeg, t.compass);
  // the letter rides just beyond the needle's tip, and stays upright
  const nx = 20 + Math.sin(rad) * 14;
  const ny = 20 - Math.cos(rad) * 14;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          tabIndex={0}
          className="flex size-10 items-center justify-center rounded-full outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
        >
          <svg viewBox="0 0 40 40" className="size-10" aria-hidden>
            <circle
              cx="20"
              cy="20"
              r="18.25"
              fill="none"
              stroke="var(--sign-line)"
              strokeWidth="1.5"
            />
            <g transform={`rotate(${northDeg} 20 20)`}>
              <path d="M20 11.5 23 20h-6z" fill="var(--taxi)" />
              <path d="M20 28.5 23 20h-6z" fill="var(--paper-dim)" opacity="0.55" />
            </g>
            <circle cx="20" cy="20" r="1.4" fill="var(--sign)" />
            <text
              x={nx}
              y={ny}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="8"
              fontWeight="700"
              fill="var(--paper)"
            >
              {t.compass.letter}
            </text>
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={10}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
