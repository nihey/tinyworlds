import { describe, expect, it } from "vitest";
import { DICTIONARIES, LOCALES } from "@/i18n";
import { DEFAULT_WORLD, HOME, IS_HOME, resolveWorld, WORLD, WORLDS } from "..";

describe("resolveWorld", () => {
  it("defaults to tinynyc", () => {
    expect(DEFAULT_WORLD).toBe("tinynyc");
    expect(resolveWorld(undefined).id).toBe("tinynyc");
    expect(resolveWorld("  ").id).toBe("tinynyc");
    expect(WORLD.id).toBe("tinynyc");
  });

  it("picks a world by id", () => {
    expect(resolveWorld("tinyrao").id).toBe("tinyrao");
    expect(resolveWorld("tinyrao").homeLocale).toBe("pt-BR");
    expect(resolveWorld("tinynyc").homeLocale).toBe("en-US");
  });

  it("stops on an id it does not know, naming the ones it does", () => {
    expect(() => resolveWorld("tinysp")).toThrow(/tinysp.*tinynyc, tinyrao.*home/);
  });

  it("keeps the front page apart: it is a build target, not a world", () => {
    expect(HOME).toBe("home");
    expect(WORLDS[HOME]).toBeUndefined();
    expect(IS_HOME).toBe(false);
  });
});

describe("worlds", () => {
  it("are filed under their own id and have a dictionary", () => {
    for (const [key, world] of Object.entries(WORLDS)) {
      expect(world.id).toBe(key);
      expect(DICTIONARIES[world.homeLocale]).toBeDefined();
      expect(world.wordmark).toMatch(/^[a-z]+$/);
      expect(world.accent.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(world.accent.ink).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("say everything about themselves in every language, with the same shape", () => {
    const shape = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(shape)
        : typeof value === "object" && value !== null
          ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, shape(child)]))
          : typeof value;
    const texts = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : typeof value === "object" && value
          ? Object.values(value).flatMap(texts)
          : [];
    for (const world of Object.values(WORLDS)) {
      const home = shape(world.copy[world.homeLocale]);
      for (const locale of LOCALES) {
        const copy = world.copy[locale];
        expect(copy, `${world.id} ${locale}`).toBeDefined();
        // same keys, and the same number of notes under the About text
        expect(shape(copy), `${world.id} ${locale}`).toEqual(home);
        for (const text of texts(copy)) expect(text.trim(), `${world.id} ${locale}`).not.toBe("");
        expect(copy.title.startsWith(`tiny${world.wordmark} · `), `${world.id} ${locale}`).toBe(
          true,
        );
      }
    }
  });

  it("call their districts what the city calls them", () => {
    expect(LOCALES.map((locale) => WORLDS.tinynyc.copy[locale].borough)).toEqual([
      "Borough",
      "Distrito",
      "Distrito",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyrao.copy[locale].borough)).toEqual([
      "Region",
      "Região",
      "Región",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinyrao.copy[locale].hoodLines.label)).toEqual([
      "Sub-sectors",
      "Subsetores",
      "Subsectores",
    ]);
    expect(LOCALES.map((locale) => WORLDS.tinynyc.copy[locale].hoodLines.label)).toEqual([
      "Neighbourhood lines",
      "Linhas dos bairros",
      "Límites de barrios",
    ]);
  });

  it("write search aliases the way queries are normalised: lower case, no accents", () => {
    for (const world of Object.values(WORLDS)) {
      for (const [short, long] of Object.entries(world.search.abbreviations)) {
        expect(short).toMatch(/^[a-z0-9]+$/);
        for (const word of long) expect(word).toMatch(/^=?[a-z0-9]+$/);
      }
    }
  });
});

/** The relative luminance and contrast ratio of WCAG 2. */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("accent colours", () => {
  const SIGN = "#15171a";
  const SIGN_DUSK = "#1b1e22";

  it("carry their ink, and read on the signs, at WCAG AA or better", () => {
    for (const world of Object.values(WORLDS)) {
      expect(contrast(world.accent.color, world.accent.ink)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(world.accent.color, SIGN)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(world.accent.color, SIGN_DUSK)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
