"use client";

import { useId } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useI18n } from "@/hooks/use-i18n";
import { LOCALE_NAMES, LOCALES, type LocalePref } from "@/i18n";
import type { Prefs, ThemePref } from "@/lib/prefs";

interface RowProps {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: React.ReactNode;
}

function Row({ label, hint, checked, onChange, children }: RowProps) {
  const id = useId();
  return (
    <div className="px-3.5 py-2">
      <div className="flex min-h-7 items-center gap-2">
        <label htmlFor={id} className="flex-1 cursor-pointer text-sm font-medium">
          {label}
        </label>
        {hint && (
          <kbd aria-hidden className="kbd-key max-sm:hidden">
            {hint}
          </kbd>
        )}
        <Switch id={id} checked={checked} onCheckedChange={onChange} />
      </div>
      {children}
    </div>
  );
}

const THEMES: ThemePref[] = ["system", "light", "dark"];
const LANGUAGES: LocalePref[] = ["auto", ...LOCALES];

const PILL =
  "h-7 rounded-full! px-3 text-xs font-semibold text-paper-dim hover:bg-transparent hover:text-paper data-[state=on]:bg-taxi data-[state=on]:text-taxi-ink";

interface SettingsPanelProps {
  prefs: Prefs;
  onChange: (patch: Partial<Prefs>) => void;
  /** the world has outlines to draw (hoods.json is not empty) */
  hoodLines: boolean;
}

export function SettingsPanel({ prefs, onChange, hoodLines }: SettingsPanelProps) {
  const strengthId = useId();
  const { t, copy } = useI18n();
  const keys: [string[], string][] = [
    [["/"], t.settings.keys.search],
    [["+", "−"], t.settings.keys.zoom],
    [["0"], t.settings.keys.wholeMap],
    [["←", "↑", "↓", "→"], t.settings.keys.move],
  ];
  return (
    <div className="pb-1.5">
      <div aria-hidden className="h-[3px] bg-taxi" />
      <h2 className="px-3.5 pt-3 pb-1 text-[10.5px] font-semibold tracking-[0.14em] text-paper-dim uppercase">
        {t.settings.title}
      </h2>

      <Row
        label={t.settings.minimap}
        hint="M"
        checked={prefs.minimap}
        onChange={(minimap) => onChange({ minimap })}
      />
      {hoodLines && (
        <Row
          label={copy.hoodLines.label}
          hint="B"
          checked={prefs.hoods}
          onChange={(hoods) => onChange({ hoods })}
        />
      )}
      <Row
        label={t.settings.tilt}
        hint="D"
        checked={prefs.tilt}
        onChange={(tilt) => onChange({ tilt })}
      >
        {prefs.tilt && (
          <div className="flex items-center gap-3 pt-2 pb-1">
            <label htmlFor={strengthId} className="text-xs text-paper-dim">
              {t.settings.strength}
            </label>
            <Slider
              id={strengthId}
              aria-label={t.settings.tiltStrengthLabel}
              min={0}
              max={100}
              step={5}
              value={[prefs.tiltStrength]}
              onValueChange={([tiltStrength]) => onChange({ tiltStrength })}
              className="flex-1"
            />
          </div>
        )}
      </Row>
      <Row label={t.settings.life} checked={prefs.life} onChange={(life) => onChange({ life })} />

      <div className="flex items-center gap-2 px-3.5 pt-2 pb-2.5">
        <span id={`${strengthId}-theme`} className="flex-1 text-sm font-medium">
          {t.settings.timeOfDay}
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0}
          aria-labelledby={`${strengthId}-theme`}
          value={prefs.theme}
          onValueChange={(theme) => {
            // a single-choice group reports "" when the chosen one is pressed again: keep it
            if (theme) onChange({ theme: theme as ThemePref });
          }}
          className="rounded-full bg-sign-raised p-0.5"
        >
          {THEMES.map((theme) => (
            <ToggleGroupItem key={theme} value={theme} className={PILL}>
              {t.settings.themes[theme]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="px-3.5 pt-1 pb-2.5">
        <span id={`${strengthId}-lang`} className="block pb-1.5 text-sm font-medium">
          {t.settings.language}
        </span>
        <ToggleGroup
          type="single"
          size="sm"
          spacing={0}
          aria-labelledby={`${strengthId}-lang`}
          value={prefs.lang}
          onValueChange={(lang) => {
            if (lang) onChange({ lang: lang as LocalePref });
          }}
          className="w-full justify-between rounded-full bg-sign-raised p-0.5"
        >
          {LANGUAGES.map((lang) => (
            <ToggleGroupItem
              key={lang}
              value={lang}
              // each language under its own name, said in that language
              lang={lang === "auto" ? undefined : lang}
              className={`${PILL} flex-1 px-2`}
            >
              {lang === "auto" ? t.settings.languageAuto : LOCALE_NAMES[lang]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 border-t border-sign-line px-3.5 pt-3 pb-1.5 text-xs text-paper-dim max-sm:hidden">
        {keys.map(([caps, does]) => (
          <li key={does} className="flex items-center gap-1">
            {caps.map((k) => (
              <kbd key={k} className="kbd-key">
                {k}
              </kbd>
            ))}
            <span className="pl-0.5">{does}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
