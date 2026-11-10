/** Settings that stay between visits, per browser. The page works the same without storage. */
import { isLocale, type LocalePref } from "@/i18n/locale";
import { SITE_ID } from "@/site";

export type ThemePref = "system" | "light" | "dark";

export interface Prefs {
  minimap: boolean;
  /** neighbourhood lines */
  hoods: boolean;
  tilt: boolean;
  /** 0–100 */
  tiltStrength: number;
  theme: ThemePref;
  /** moving things on the map */
  life: boolean;
  /** the interface's language; "auto" follows the browser */
  lang: LocalePref;
}

/** One namespace per world (and one for the front page), so worlds on one origin keep their own settings. */
export const PREFS_KEY = `${SITE_ID}.prefs`;

export const DEFAULT_PREFS: Prefs = {
  minimap: true,
  hoods: false,
  tilt: true,
  tiltStrength: 50,
  theme: "system",
  life: true,
  lang: "auto",
};

/** Keeps what is valid in a stored value and fills the rest with defaults. */
export function sanitizePrefs(value: unknown): Prefs {
  const out: Prefs = { ...DEFAULT_PREFS };
  if (typeof value !== "object" || value === null) return out;
  const v = value as Record<string, unknown>;
  if (typeof v.minimap === "boolean") out.minimap = v.minimap;
  if (typeof v.hoods === "boolean") out.hoods = v.hoods;
  if (typeof v.tilt === "boolean") out.tilt = v.tilt;
  if (typeof v.life === "boolean") out.life = v.life;
  if (typeof v.tiltStrength === "number" && Number.isFinite(v.tiltStrength))
    out.tiltStrength = Math.min(100, Math.max(0, Math.round(v.tiltStrength)));
  if (v.theme === "system" || v.theme === "light" || v.theme === "dark") out.theme = v.theme;
  if (v.lang === "auto" || isLocale(v.lang)) out.lang = v.lang;
  return out;
}

function read(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? sanitizePrefs(JSON.parse(raw)) : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS; // private window, or storage blocked
  }
}

let current: Prefs | null = null;
const listeners = new Set<() => void>();

function onStorage(e: StorageEvent): void {
  if (e.key !== PREFS_KEY) return;
  current = read(); // changed in another tab
  for (const listener of listeners) listener();
}

export const prefsStore = {
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0) window.addEventListener("storage", onStorage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot(): Prefs {
    return (current ??= read());
  },
  getServerSnapshot(): Prefs {
    return DEFAULT_PREFS;
  },
  set(patch: Partial<Prefs>): void {
    current = sanitizePrefs({ ...prefsStore.getSnapshot(), ...patch });
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(current));
    } catch {
      /* this visit only */
    }
    for (const listener of listeners) listener();
  },
};
