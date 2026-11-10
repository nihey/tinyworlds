import { describe, expect, it } from "vitest";
import { invites, placesUrl, putAwayAt } from "../explore";

describe("the invitation to the other places", () => {
  it("is for everyone on a map, while there are other places", () => {
    expect(invites(8, 0)).toBe(true);
    expect(invites(0, 0)).toBe(false);
  });

  it("stays away once put away, until there are more places", () => {
    expect(invites(8, 8)).toBe(false);
    expect(invites(9, 8)).toBe(true);
    expect(invites(7, 8)).toBe(false);
  });

  it("reads what was stored, and nothing from anything else", () => {
    expect(putAwayAt("8")).toBe(8);
    for (const raw of [null, "", "yes", "-3", "2.5", "NaN"])
      expect(putAwayAt(raw), String(raw)).toBe(0);
  });

  it("leads to the front page's list of places", () => {
    expect(placesUrl("/")).toBe("/#cities");
    expect(placesUrl("https://example.com/#top")).toBe("https://example.com/#cities");
  });
});
