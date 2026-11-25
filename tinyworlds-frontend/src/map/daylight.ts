/** Five evenly spaced samples per sRGB channel, interleaved RGB for the street shaders. */
export interface CityLight {
  curve: number[];
  lamps: number;
}

export type LightMode = "light" | "dark" | "cycle";
export const DAY_LENGTH_MS = 6 * 60_000;
export const DAY: CityLight = {
  curve: [0, 0, 0, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 1, 1, 1],
  lamps: 0,
};
const DUSK: CityLight = {
  curve: [0.06, 0.045, 0.09, 0.28, 0.18, 0.23, 0.61, 0.36, 0.34, 0.88, 0.56, 0.44, 1, 0.83, 0.65],
  lamps: 0.35,
};
export const NIGHT: CityLight = {
  curve: [
    0.025, 0.035, 0.085, 0.075, 0.105, 0.2, 0.145, 0.205, 0.34, 0.26, 0.34, 0.49, 0.52, 0.59, 0.73,
  ],
  lamps: 1,
};
const DAWN: CityLight = {
  curve: [0.055, 0.055, 0.11, 0.23, 0.2, 0.28, 0.49, 0.4, 0.48, 0.77, 0.63, 0.64, 1, 0.88, 0.83],
  lamps: 0.3,
};

// Noon at page load. The clock keeps its phase through map turns and Street Walk.
const STOPS: readonly [number, CityLight][] = [
  [0, DAY],
  [0.23, DUSK],
  [0.43, NIGHT],
  [0.6, NIGHT],
  [0.77, DAWN],
  [0.96, DAY],
  [1, DAY],
];

export function cityLightAt(elapsedMs: number): CityLight {
  const phase = (elapsedMs % DAY_LENGTH_MS) / DAY_LENGTH_MS;
  for (let i = 1; i < STOPS.length; i++) {
    const [end, to] = STOPS[i];
    if (phase > end) continue;
    const [start, from] = STOPS[i - 1];
    if (from === to || phase === start) return from;
    if (phase === end) return to;
    const t = (phase - start) / (end - start);
    const weight = t * t * (3 - 2 * t);
    return {
      curve: from.curve.map((v, k) => v + (to.curve[k] - v) * weight),
      lamps: from.lamps + (to.lamps - from.lamps) * weight,
    };
  }
  return DAY;
}

/** Update only the active renderer. Fixed light and background tabs need no timer. */
export function watchCityLight(mode: LightMode, apply: (light: CityLight) => void): () => void {
  if (mode !== "cycle") {
    apply(mode === "dark" ? NIGHT : DAY);
    return () => {};
  }
  let timer: number | undefined;
  const update = () => apply(cityLightAt(performance.now()));
  const resume = () => {
    window.clearInterval(timer);
    if (document.hidden) return;
    update();
    timer = window.setInterval(update, 500);
  };
  resume();
  document.addEventListener("visibilitychange", resume);
  return () => {
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", resume);
  };
}
