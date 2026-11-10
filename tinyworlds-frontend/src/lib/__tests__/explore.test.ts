import { describe, expect, it } from "vitest";
import { placesUrl } from "../explore";

describe("the invitation to the other places", () => {
  it("leads to the front page's list of places", () => {
    expect(placesUrl("/")).toBe("/#cities");
    expect(placesUrl("https://example.com/")).toBe("https://example.com/#cities");
    expect(placesUrl("https://example.com/#top")).toBe("https://example.com/#cities");
  });
});
