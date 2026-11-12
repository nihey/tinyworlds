import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "..";

/** Every leaf of a dictionary as "path.to.key" → value. */
function leaves(value: unknown, path = "", out = new Map<string, unknown>()): Map<string, unknown> {
  if (typeof value === "object" && value !== null) {
    for (const [key, child] of Object.entries(value)) {
      leaves(child, path ? `${path}.${key}` : key, out);
    }
  } else out.set(path, value);
  return out;
}

const placeholders = (text: string): string[] => (text.match(/\{[^{}]+\}/g) ?? []).sort();

describe("dictionaries", () => {
  const en = leaves(DICTIONARIES["en-US"]);

  it("have the same keys in every language, none of them empty", () => {
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      const mine = leaves(dictionary);
      expect([...mine.keys()].sort(), locale).toEqual([...en.keys()].sort());
      for (const [key, value] of mine) {
        if (typeof value === "string") expect(value.trim(), `${locale} ${key}`).not.toBe("");
      }
    }
  });

  it("tell someone with nothing on their page that gifts go by the email they signed in with", () => {
    // a donor who gave under another address must not think the gift is lost
    for (const [locale, dictionary] of Object.entries(DICTIONARIES))
      expect(dictionary.me.noStonesBody, locale).toMatch(/e-?mail|correo/i);
  });

  it("keep the same key caps in the help lines", () => {
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      for (const key of ["keysSearch", "keysToggles", "keysTogglesNoHoods"] as const) {
        expect(placeholders(dictionary.about[key]), `${locale} ${key}`).toEqual(
          placeholders(DICTIONARIES["en-US"].about[key]),
        );
      }
    }
  });

  it("word request errors with the address and the status", () => {
    for (const dictionary of Object.values(DICTIONARIES)) {
      expect(dictionary.errors.answered("/data/x.json", 404)).toMatch(/\/data\/x\.json .* 404$/);
    }
  });

  it("say how many other places there are", () => {
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      expect(placeholders(dictionary.explore.more), locale).toEqual(["{n}"]);
    }
  });

  it("keep the placeholders of the admin pages", () => {
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      const { admin } = dictionary;
      expect(placeholders(admin.signIn.sent), locale).toEqual(["{email}", "{minutes}"]);
      expect(placeholders(admin.signedInAs), locale).toEqual(["{email}"]);
      expect(placeholders(admin.funnel.ofPrevious), locale).toEqual(["{share}"]);
      expect(placeholders(admin.funnel.ofVisits), locale).toEqual(["{share}"]);
      expect(placeholders(admin.days.note), locale).toEqual(["{zone}"]);
    }
  });

  it("name the joined button with the words it shows, first (WCAG 2.5.3)", () => {
    for (const [locale, { lists }] of Object.entries(DICTIONARIES))
      expect(lists.leaveAria.startsWith(lists.toldYou), locale).toBe(true);
  });

  it("keep the placeholders of the lists", () => {
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      const { lists } = dictionary;
      expect(placeholders(lists.tellMeAria), locale).toEqual(["{city}"]);
      expect(placeholders(lists.leaveAria), locale).toEqual(["{city}"]);
      expect(placeholders(lists.waitingMany), locale).toEqual(["{n}"]);
      expect(placeholders(lists.join.cityTitle), locale).toEqual(["{city}"]);
      expect(placeholders(lists.join.doneCity), locale).toEqual(["{city}"]);
      expect(placeholders(lists.join.doneBody), locale).toEqual(["{city}", "{email}"]);
      expect(placeholders(lists.join.doneBodyNew), locale).toEqual(["{email}"]);
      expect(placeholders(lists.join.help), locale).toEqual(["{city}"]);
      expect(placeholders(lists.join.signIn.sent), locale).toEqual(["{email}"]);
      expect(placeholders(lists.me.leaveLabel), locale).toEqual(["{city}"]);
    }
  });

  it("keep the placeholders of the donate sign", () => {
    for (const [locale, dictionary] of Object.entries(DICTIONARIES)) {
      expect(placeholders(dictionary.donate.body), locale).toEqual(["{wordmark}"]);
      expect(placeholders(dictionary.donate.progress), locale).toEqual(["{goal}", "{raised}"]);
      expect(placeholders(dictionary.donate.preview), locale).toEqual([
        "{added}",
        "{goal}",
        "{raised}",
      ]);
      expect(placeholders(dictionary.donate.actionAmount), locale).toEqual(["{amount}"]);
      expect(placeholders(dictionary.donate.useTyped), locale).toEqual(["{name}"]);
      expect(placeholders(dictionary.donate.alreadyBuilt), locale).toEqual(["{name}"]);
      expect(placeholders(dictionary.home.donateTo), locale).toEqual(["{city}"]);
      expect(placeholders(dictionary.donate.donations.none), locale).toEqual([]);
      expect(placeholders(dictionary.donate.donations.one), locale).toEqual(["{n}"]);
      expect(placeholders(dictionary.donate.donations.other), locale).toEqual(["{n}"]);
    }
  });
});
