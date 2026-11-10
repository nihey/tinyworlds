import { describe, expect, it } from "vitest";
import { DICTIONARIES, LOCALE_NAMES } from "..";
import { DEFAULT_LOCALE, isLocale, LOCALES, ogLocale, resolveLocale } from "../locale";

describe("resolveLocale", () => {
  it("takes the first of the browser's languages that we speak", () => {
    expect(resolveLocale(["pt-BR", "en-US"])).toBe("pt-BR");
    expect(resolveLocale(["en-US", "pt-BR"])).toBe("en-US");
    expect(resolveLocale(["fr-FR", "es-AR", "en"])).toBe("es-ES");
    expect(resolveLocale(["de", "ja", "pt"])).toBe("pt-BR");
  });

  it("matches on the language, whatever the region or the spelling of the tag", () => {
    expect(resolveLocale(["pt-PT"])).toBe("pt-BR");
    expect(resolveLocale(["es-419"])).toBe("es-ES");
    expect(resolveLocale(["es_MX"])).toBe("es-ES");
    expect(resolveLocale(["EN-gb"])).toBe("en-US");
    expect(resolveLocale([" pt "])).toBe("pt-BR");
  });

  it("does not mistake another language that starts the same way", () => {
    // Estonian is not Spanish, and Punjabi is not Portuguese
    expect(resolveLocale(["est", "pa-IN"])).toBe("en-US");
  });

  it("falls back to English", () => {
    expect(DEFAULT_LOCALE).toBe("en-US");
    expect(resolveLocale(["fr-FR", "de"])).toBe("en-US");
    expect(resolveLocale([])).toBe("en-US");
    expect(resolveLocale(undefined)).toBe("en-US");
    expect(resolveLocale(null)).toBe("en-US");
  });
});

describe("locales", () => {
  it("each have a dictionary and a name of their own", () => {
    for (const locale of LOCALES) {
      expect(DICTIONARIES[locale]).toBeDefined();
      expect(LOCALE_NAMES[locale]).not.toBe("");
      expect(isLocale(locale)).toBe(true);
    }
    expect(isLocale("auto")).toBe(false);
    expect(isLocale("en")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it("are written with an underscore for Open Graph", () => {
    expect(ogLocale("pt-BR")).toBe("pt_BR");
    expect(ogLocale("en-US")).toBe("en_US");
  });
});
