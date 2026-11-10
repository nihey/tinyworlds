import { describe, expect, it } from "vitest";
import { GITHUB_URL, HOME_URL, SITE_ID, SITE_NAME, worldCardUrl, worldUrl } from "@/site";

describe("site", () => {
  it("is the default world unless the build says otherwise", () => {
    expect(SITE_ID).toBe("tinynyc");
    expect(SITE_NAME).toBe("tinynyc");
    expect(HOME_URL).toBe("/");
  });

  it("points at the project's source", () => {
    expect(GITHUB_URL).toBe("https://github.com/nihey/tinyworlds");
  });

  it("finds each world, and its share card, in the world's own folder", () => {
    expect(worldUrl("tinyrao")).toBe("/tinyrao/");
    expect(worldCardUrl("tinyrao")).toBe("/tinyrao/og/tinyrao.jpg");
    expect(worldUrl("tinynyc", "/worlds")).toBe("/worlds/tinynyc/");
    expect(worldCardUrl("tinynyc", "/worlds")).toBe("/worlds/tinynyc/og/tinynyc.jpg");
  });

  it("can take the cards from one folder in development", () => {
    expect(worldCardUrl("tinyrao", "", "/og")).toBe("/og/tinyrao.jpg");
  });
});
