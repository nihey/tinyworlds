import type { Strings } from "@/i18n/types";
import { keyLabel, type ActionId, type Bindings } from "./controls";
import { LIFE_MAX } from "./health";

/**
 * What the walk's corner sign says, as plain text from the state and the dictionary: the life
 * bar's tone and label, the damage, the speed in the world's units, and the line of keys.
 */

type WalkWords = Strings["walk"];

export type LifeTone = "ok" | "low" | "critical";

/** Green from half, amber under half, red under a quarter. */
export function lifeTone(life: number): LifeTone {
  if (life < 25) return "critical";
  if (life < 50) return "low";
  return "ok";
}

const whole = (x: number, lo: number, hi: number) =>
  Number.isFinite(x) ? Math.min(hi, Math.max(lo, Math.round(x))) : lo;

/** "Life 64 of 100", for a screen reader. */
export function lifeText(life: number, w: WalkWords): string {
  return w.lifeLabel
    .replace("{n}", String(whole(life, 0, LIFE_MAX)))
    .replace("{max}", String(LIFE_MAX));
}

/** "Damage 42%": a vehicle's damage, 0 to 1. */
export function damageText(damage: number, w: WalkWords): string {
  return w.damageLabel.replace("{n}", String(whole(damage * 100, 0, 100)));
}

const MPH = 2.236936;
const KMH = 3.6;

/** A speed in m/s, whichever way it goes, in the world's units: "30 mph", "48 km/h". */
export function speedText(ms: number, units: "imperial" | "metric", w: WalkWords): string {
  const speed = Number.isFinite(ms) ? Math.abs(ms) : 0;
  return units === "imperial"
    ? w.speed.mph.replace("{n}", String(Math.round(speed * MPH)))
    : w.speed.kmh.replace("{n}", String(Math.round(speed * KMH)));
}

export type HintMode = keyof WalkWords["hints"];

/** Which line of keys a way of moving shows; lying in the street shows the one you get up to. */
export function hintMode(mode: "foot" | "swim" | "drive" | "down" | "boat"): HintMode {
  if (mode === "boat") return "sail";
  if (mode === "swim" || mode === "drive") return mode;
  return "foot";
}

/** The line of keys with each `{action}` as its first key now (its second if the first is gone). */
export function hintText(mode: HintMode, b: Bindings, w: WalkWords): string {
  return w.hints[mode].replace(/\{(\w+)\}/g, (all, id: string) => {
    const pair = b[id as ActionId];
    if (!pair) return all;
    const code = pair[0] ?? pair[1];
    return code ? keyLabel(code, w.keys) : w.unbound;
  });
}
