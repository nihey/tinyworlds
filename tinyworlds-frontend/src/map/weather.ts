import { DAY, type CityLight } from "./daylight";

export const CONDITIONS = ["clear", "cloudy", "fog", "rain", "snow", "storm"] as const;
export type WeatherCondition = (typeof CONDITIONS)[number];
export type WeatherPref = "live" | WeatherCondition;

export function isCondition(value: unknown): value is WeatherCondition {
  return CONDITIONS.some((condition) => condition === value);
}

// Fraction of atmospheric colour mixed into the scene, its RGB, and street visibility
// relative to a clear day. Colours are in the same display space as the daylight ramp.
export const ATMOSPHERE = {
  clear: { veil: 0, tint: [0, 0, 0], visibility: 1 },
  cloudy: { veil: 0.27, tint: [0.37, 0.42, 0.48], visibility: 0.87 },
  fog: { veil: 0.49, tint: [0.77, 0.82, 0.82], visibility: 0.23 },
  rain: { veil: 0.34, tint: [0.25, 0.34, 0.41], visibility: 0.6 },
  snow: { veil: 0.33, tint: [0.8, 0.85, 0.9], visibility: 0.53 },
  storm: { veil: 0.49, tint: [0.16, 0.21, 0.29], visibility: 0.4 },
} as const;

/** Apply weather before the city's time-of-day curve, so night fog stays dark. */
export function weatherLight(light: CityLight, condition: WeatherCondition): CityLight {
  if (condition === "clear") return light;
  const { veil, tint } = ATMOSPHERE[condition];
  return {
    lamps: light.lamps,
    curve: DAY.curve.map((input, i) => {
      const channel = i % 3;
      const x = 4 * (input * (1 - veil) + tint[channel] * veil);
      const low = Math.min(3, Math.floor(x));
      const a = light.curve[3 * low + channel];
      return a + (light.curve[3 * (low + 1) + channel] - a) * (x - low);
    }),
  };
}

export function precipitates(condition: WeatherCondition): boolean {
  return condition === "rain" || condition === "snow" || condition === "storm";
}
