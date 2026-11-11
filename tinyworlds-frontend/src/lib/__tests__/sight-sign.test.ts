import { describe, expect, it } from "vitest";
import { en } from "@/i18n/en";
import { ptBR } from "@/i18n/pt-BR";
import type { Sight } from "@/map/sights";
import { placeSign, signContent, textsFor } from "../sight-sign";

describe("placeSign", () => {
  const size = { w: 280, h: 120 };
  const viewport = { w: 1200, h: 800 };

  it("hangs right of the anchor with a gap when it fits", () => {
    expect(placeSign({ x: 300, y: 200 }, size, viewport)).toEqual({ x: 316, y: 200 });
  });

  it("flips to the left near the right edge", () => {
    expect(placeSign({ x: 1000, y: 200 }, size, viewport)).toEqual({ x: 1000 - 16 - 280, y: 200 });
  });

  it("comes down onto the screen when the anchor is above it", () => {
    expect(placeSign({ x: 300, y: -500 }, size, viewport).y).toBe(8);
  });

  it("steps below the map's own signs where it would land under them", () => {
    const phone = { w: 390, h: 844 };
    const search = { x: 12, y: 12, w: 366, h: 52 };
    const banner = { x: 12, y: 74, w: 310, h: 56 };
    const tools = { x: 330, y: 74, w: 48, h: 280 };
    // it moves left of the tools, and below the search and the banner, which span the screen
    expect(placeSign({ x: 60, y: 40 }, size, phone, [search, banner, tools])).toEqual({
      x: 330 - 8 - 280,
      y: 74 + 56 + 8,
    });
  });

  it("stays where it is when the map's signs are not in its way", () => {
    const search = { x: 12, y: 12, w: 400, h: 52 };
    expect(placeSign({ x: 700, y: 20 }, size, viewport, [search])).toEqual({ x: 716, y: 20 });
  });

  it("never leaves an 8 px margin, whatever the anchor", () => {
    for (const anchor of [
      { x: -100, y: 2000 },
      { x: 5000, y: -100 },
      { x: 100, y: 790 },
    ]) {
      const { x, y } = placeSign(anchor, size, { w: 400, h: 300 });
      expect(x).toBeGreaterThanOrEqual(8);
      expect(x + size.w).toBeLessThanOrEqual(400 - 8);
      expect(y).toBeGreaterThanOrEqual(8);
      expect(y + size.h).toBeLessThanOrEqual(300 - 8);
    }
  });
});

describe("signContent", () => {
  const sight: Sight = {
    id: "b1",
    n: "Empire State Building",
    t: "landmark",
    b: "Manhattan",
    lon: -73.9857,
    lat: 40.7484,
    rings: [[0, 0, 1, 0, 1, 1]],
    front: 1,
    anchor: [0, 0],
  };

  it("names the type and the context above the name", () => {
    expect(signContent(sight, undefined, en)).toMatchObject({
      kicker: "Landmark · Manhattan",
      name: "Empire State Building",
    });
  });

  it("calls a sight named by its own building a building", () => {
    expect(signContent({ ...sight, t: "building", b: undefined }, undefined, ptBR).kicker).toBe(
      ptBR.sight.building,
    );
  });

  it("shows no words and no link without an article", () => {
    const content = signContent(sight, undefined, en);
    expect(content.text).toBeUndefined();
    expect(content.link).toBeUndefined();
  });

  it("links to the article, in the visitor's words", () => {
    const content = signContent(
      sight,
      {
        title: "Empire State Building",
        url: "https://pt.wikipedia.org/wiki/Empire_State_Building",
        text: "Um arranha-céu.",
        lang: "pt",
      },
      ptBR,
    );
    expect(content.text).toBe("Um arranha-céu.");
    expect(content.lang).toBe("pt");
    expect(content.link).toEqual({
      href: "https://pt.wikipedia.org/wiki/Empire_State_Building",
      label: ptBR.sight.readOn,
    });
  });
});

describe("textsFor", () => {
  it("loads when nothing is loaded yet, or another language is", () => {
    expect(textsFor(null, "en-US")).toBe("load");
    expect(textsFor({ locale: "en-US", texts: {} }, "pt-BR")).toBe("load");
  });

  it("is ready when the visitor's language is loaded", () => {
    expect(textsFor({ locale: "pt-BR", texts: {} }, "pt-BR")).toBe("ready");
  });
});
