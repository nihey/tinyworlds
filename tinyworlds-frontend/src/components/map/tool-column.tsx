"use client";

import {
  Heart,
  Info,
  Link2,
  Map as MapIcon,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";
import { SITE_ID } from "@/site";
import { Compass } from "./compass";

interface ToolButtonProps extends ComponentProps<"button"> {
  label: string;
  /** the key that does the same */
  hint?: string;
}

function ToolButton({ label, hint, className, children, ...props }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label={label} className={cn("bullet", className)} {...props}>
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" sideOffset={10}>
        {label}
        {hint && (
          <kbd data-slot="kbd" className="ml-1 rounded-sm bg-sign/15 px-1.5 py-0.5 font-semibold">
            {hint}
          </kbd>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

const Rule = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn("my-0.5 h-px w-6 bg-sign-line", className)} />
);

interface ToolColumnProps {
  northDeg: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onWholeMap: () => void;
  onSearch: () => void;
  onShare: () => void;
  onAbout: () => void;
  /** absent when this build takes no donations: then there is no heart */
  onDonate?: () => void;
  settingsOpen: boolean;
  onSettingsOpenChange: (open: boolean) => void;
  /** the settings panel's contents */
  settings: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/** The strip of round buttons down the right edge, under the compass. */
export function ToolColumn({
  northDeg,
  onZoomIn,
  onZoomOut,
  onWholeMap,
  onSearch,
  onShare,
  onAbout,
  onDonate,
  settingsOpen,
  onSettingsOpenChange,
  settings,
  className,
  style,
}: ToolColumnProps) {
  const { t } = useI18n();
  const icon = { className: "size-[18px]", strokeWidth: 2.25 } as const;
  return (
    <nav
      aria-label={t.tools.navLabel}
      className={cn("sign z-10 flex flex-col items-center gap-0.5 p-1", className)}
      style={style}
    >
      <Compass northDeg={northDeg} />
      <Rule />
      {/* fingers pinch; the zoom buttons are for mice and keyboards */}
      <ToolButton label={t.tools.zoomIn} hint="+" onClick={onZoomIn} className="max-sm:hidden">
        <Plus {...icon} />
      </ToolButton>
      <ToolButton label={t.tools.zoomOut} hint="−" onClick={onZoomOut} className="max-sm:hidden">
        <Minus {...icon} />
      </ToolButton>
      <ToolButton label={t.tools.wholeMap} hint="0" onClick={onWholeMap}>
        <MapIcon {...icon} />
      </ToolButton>
      <Rule />
      <ToolButton label={t.tools.search} hint="/" onClick={onSearch}>
        <Search {...icon} />
      </ToolButton>
      <ToolButton label={t.tools.share} onClick={onShare}>
        <Link2 {...icon} />
      </ToolButton>
      <Popover open={settingsOpen} onOpenChange={onSettingsOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button type="button" aria-label={t.tools.settings} className="bullet">
                <SlidersHorizontal {...icon} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="left" sideOffset={10}>
            {t.tools.settings}
          </TooltipContent>
        </Tooltip>
        <PopoverContent
          side="left"
          align="start"
          sideOffset={12}
          collisionPadding={12}
          className="sign w-[min(19rem,calc(100vw-5.5rem))] gap-0 overflow-hidden p-0 ring-0"
        >
          {settings}
        </PopoverContent>
      </Popover>
      <ToolButton label={t.tools.about} onClick={onAbout}>
        <Info {...icon} />
      </ToolButton>
      {onDonate && (
        <>
          <Rule />
          <ToolButton
            label={t.tools.donate}
            onClick={onDonate}
            data-rybbit-event="donate_open"
            data-rybbit-prop-world={SITE_ID}
          >
            <Heart className="size-[18px] fill-taxi text-taxi" strokeWidth={2.25} />
          </ToolButton>
        </>
      )}
    </nav>
  );
}
