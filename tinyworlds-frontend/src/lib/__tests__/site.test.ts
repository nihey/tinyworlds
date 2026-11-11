import { describe, expect, it } from "vitest";
import {
  BUILT_CITIES,
  CITIES_PATH,
  CONTACT_EMAIL,
  CONTACT_URL,
  GITHUB_URL,
  HERO,
  HERO_FILMS,
  heroSlides,
  HOME_CARD_PATH,
  HOME_URL,
  RANKING_PATH,
  SITE_ID,
  SITE_NAME,
  worldCardUrl,
  worldHero,
  worldLoopUrl,
  worldUrl,
} from "@/site";

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

  it("keeps the moving pictures in the front page's own folder", () => {
    expect(worldLoopUrl("tinyrao")).toBe("/loops/tinyrao.mp4");
    expect(worldLoopUrl("tinyrao", "/sub/loops")).toBe("/sub/loops/tinyrao.mp4");
    expect(HERO).toEqual({ world: "tinynyc", loop: "/loops/hero.mp4", still: "/loops/hero.jpg" });
    expect(HOME_CARD_PATH).toBe("/og/tinyworlds.jpg");
  });

  it("finds each world's hero film, New York's under its old name", () => {
    expect(worldHero("tinynyc")).toEqual({ loop: "/loops/hero.mp4", still: "/loops/hero.jpg" });
    expect(worldHero("tinylax")).toEqual({
      loop: "/loops/hero-tinylax.mp4",
      still: "/loops/hero-tinylax.jpg",
    });
    expect(worldHero("tinylax", "/sub/loops").still).toBe("/sub/loops/hero-tinylax.jpg");
  });

  it("shows the worlds that have a film, in the registry's order, and never none", () => {
    expect(heroSlides(["tinynyc", "tinyrao", "tinylax"], ["tinylax", "tinynyc"])).toEqual([
      "tinynyc",
      "tinylax",
    ]);
    expect(heroSlides(["tinynyc", "tinyrao"], [])).toEqual(["tinynyc"]);
    expect(heroSlides(["tinynyc", "tinyrao"], ["tinyelsewhere"])).toEqual(["tinynyc"]);
  });

  it("knows of no film until the build lists them", () => {
    expect(HERO_FILMS).toEqual([]);
  });

  it("finds the front page's cities and its ranking from its other pages", () => {
    expect(CITIES_PATH).toBe("/#cities");
    expect(RANKING_PATH).toBe("/#ranking");
  });

  it("says where to write about the project", () => {
    expect(CONTACT_EMAIL).toBe("me@nihey.org");
    expect(CONTACT_URL).toBe("mailto:me@nihey.org");
  });

  it("knows which places are already worlds, under every name a donor might type", () => {
    expect(BUILT_CITIES).toEqual([
      "New York",
      "Nova York",
      "Nueva York",
      "Ribeirão Preto",
      "Orlando",
      "El Calafate",
      "Valencia",
      "Valência",
      "Las Vegas",
      "Los Angeles",
      "Los Ángeles",
      "Dallas",
      "Cincinnati",
      "Pittsburgh",
      "Philadelphia",
      "Filadélfia",
      "Filadelfia",
      "Colorado Springs",
      "Truckee",
      "Winterfell",
      "Invernalia",
      "King's Landing",
      "Porto Real",
      "Desembarco del Rey",
      "Westeros",
      "Poniente",
    ]);
  });

  it("can take the cards from one folder in development", () => {
    expect(worldCardUrl("tinyrao", "", "/og")).toBe("/og/tinyrao.jpg");
  });
});
