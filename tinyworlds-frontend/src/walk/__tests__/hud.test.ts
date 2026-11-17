import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { esES } from "@/i18n/es-ES";
import { ptBR } from "@/i18n/pt-BR";
import { defaultBindings, rebind } from "../controls";
import { damageText, hintMode, hintText, lifeText, lifeTone, speedText } from "../hud-text";

describe("lifeTone", () => {
  it("is green from 50, amber under 50, red under 25", () => {
    expect(lifeTone(100)).toBe("ok");
    expect(lifeTone(64)).toBe("ok");
    expect(lifeTone(50)).toBe("ok");
    expect(lifeTone(49)).toBe("low");
    expect(lifeTone(25)).toBe("low");
    expect(lifeTone(24)).toBe("critical");
    expect(lifeTone(0)).toBe("critical");
  });
});

describe("lifeText", () => {
  it("says the life in whole points, of the most there is", () => {
    expect(lifeText(63.6, en.walk)).toBe("Life 64 of 100");
    expect(lifeText(-3, en.walk)).toBe("Life 0 of 100");
  });
});

describe("damageText", () => {
  it("says the damage in whole per cent", () => {
    expect(damageText(0.416, en.walk)).toBe("Damage 42%");
    expect(damageText(1.4, en.walk)).toBe("Damage 100%");
  });
});

describe("speedText", () => {
  it("speaks miles per hour in an imperial world, kilometres elsewhere", () => {
    expect(speedText(13.41, "imperial", en.walk)).toBe("30 mph");
    expect(speedText(13.41, "metric", en.walk)).toBe("48 km/h");
    expect(speedText(-13.41, "metric", en.walk)).toBe("48 km/h");
    expect(speedText(Number.NaN, "metric", en.walk)).toBe("0 km/h");
  });
});

describe("hintMode", () => {
  it("names the hint for each way of moving", () => {
    expect(hintMode("foot")).toBe("foot");
    expect(hintMode("swim")).toBe("swim");
    expect(hintMode("drive")).toBe("drive");
    expect(hintMode("boat")).toBe("sail");
    expect(hintMode("down")).toBe("foot");
  });
});

describe("hintText", () => {
  it("names the current keys", () => {
    const d = defaultBindings();
    expect(hintText("foot", d, en.walk)).toBe(
      "WASD walk · Left Shift run · Space jump · F get in · M map · P keys",
    );
    expect(hintText("drive", d, en.walk)).toContain("Space handbrake");
  });

  it("follows a rebinding", () => {
    const b = rebind(defaultBindings(), "jump", 0, "KeyJ");
    expect(hintText("foot", b, en.walk)).toContain("J jump");
    expect(hintText("foot", b, en.walk)).not.toContain("Space");
  });

  it("takes an action's second key when the first is gone, and says when it has none", () => {
    const d = defaultBindings();
    const b = {
      ...d,
      sprint: [null, "ShiftRight"] as [null, string],
      jump: [null, null] as [null, null],
    };
    const text = hintText("foot", b, en.walk);
    expect(text).toContain("Right Shift run");
    expect(text).toContain("None jump");
  });

  it("leaves no placeholder in any language", () => {
    const d = defaultBindings();
    for (const dict of [en, ptBR, esES])
      for (const mode of ["foot", "swim", "drive", "sail"] as const)
        expect(hintText(mode, d, dict.walk), `${dict.walk.back} ${mode}`).not.toMatch(/[{}]/);
  });
});
