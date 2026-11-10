import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, sanitizePrefs } from "../prefs";

describe("sanitizePrefs", () => {
  it("falls back to the defaults for junk", () => {
    expect(sanitizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs("nope")).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ theme: "neon", tilt: "yes", tiltStrength: "9" })).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ lang: "fr-FR" })).toEqual(DEFAULT_PREFS);
    expect(sanitizePrefs({ lang: "en" })).toEqual(DEFAULT_PREFS);
  });

  it("keeps valid values and clamps the strength", () => {
    expect(
      sanitizePrefs({ theme: "dark", hoods: true, tiltStrength: 140.4, minimap: false }),
    ).toEqual({
      ...DEFAULT_PREFS,
      theme: "dark",
      hoods: true,
      tiltStrength: 100,
      minimap: false,
    });
  });

  it("follows the browser's language unless one was chosen", () => {
    expect(DEFAULT_PREFS.lang).toBe("auto");
    expect(sanitizePrefs({ lang: "es-ES" }).lang).toBe("es-ES");
    expect(sanitizePrefs({ lang: "auto" }).lang).toBe("auto");
  });
});
