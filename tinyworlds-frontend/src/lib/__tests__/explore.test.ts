import { describe, expect, it } from "vitest";
import { cameFromHome, invites, placesUrl, putAwayAt } from "../explore";

describe("the invitation to the other places", () => {
  it("is for whoever landed on a map, while there are other places", () => {
    expect(invites(8, 0, false)).toBe(true);
    expect(invites(0, 0, false)).toBe(false);
  });

  it("is not for someone who has just come from the list", () => {
    expect(invites(8, 0, true)).toBe(false);
  });

  it("stays away once put away, until there are more places", () => {
    expect(invites(8, 8, false)).toBe(false);
    expect(invites(9, 8, false)).toBe(true);
    expect(invites(7, 8, false)).toBe(false);
  });

  it("reads what was stored, and nothing from anything else", () => {
    expect(putAwayAt("8")).toBe(8);
    for (const raw of [null, "", "yes", "-3", "2.5", "NaN"])
      expect(putAwayAt(raw), String(raw)).toBe(0);
  });

  it("knows the front page as where a visitor came from", () => {
    const origin = "https://example.com";
    expect(cameFromHome("https://example.com/", origin, "/")).toBe(true);
    expect(cameFromHome("https://example.com/?donated=1#cities", origin, "/")).toBe(true);
    expect(cameFromHome("https://example.com/tinyrao/", origin, "/")).toBe(false);
    expect(cameFromHome("https://news.example.org/", origin, "/")).toBe(false);
    expect(cameFromHome("", origin, "/")).toBe(false);
    expect(cameFromHome("https://example.com/", origin, "https://example.com/")).toBe(true);
  });

  it("leads to the front page's list of places", () => {
    expect(placesUrl("/")).toBe("/#cities");
    expect(placesUrl("https://example.com/#top")).toBe("https://example.com/#cities");
  });
});
