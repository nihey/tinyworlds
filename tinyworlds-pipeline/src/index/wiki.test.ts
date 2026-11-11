import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { articleFor, cachedHttp, excerpt, normalizeTitle, titleMatches, type Http } from "./wiki.js";

describe("titles", () => {
  it("normalises case, accents, punctuation and spacing", () => {
    expect(normalizeTitle("Café   Wha?")).toBe("cafe wha");
  });

  it("matches the same name, with or without a leading The or a trailing qualifier", () => {
    expect(titleMatches("The Met", "Met")).toBe(true);
    expect(titleMatches("Flatiron Building", "Flatiron Building")).toBe(true);
    expect(titleMatches("Citi Field", "Citi Field (stadium)")).toBe(true);
    expect(titleMatches("Verrazzano-Narrows Bridge", "Verrazzano–Narrows Bridge")).toBe(true);
  });

  it("does not take the article of a building that is gone", () => {
    expect(titleMatches("Louis Armstrong Stadium", "Louis Armstrong Stadium (1978–2016)")).toBe(false);
    expect(titleMatches("270 Park Avenue", "270 Park Avenue (2025–present)")).toBe(true);
  });

  it("does not match a different place that shares words", () => {
    expect(titleMatches("Wall Street", "40 Wall Street")).toBe(false);
    expect(titleMatches("America's Response Monument", "One World Trade Center")).toBe(false);
  });
});

describe("excerpt", () => {
  const short1 = "The Empire State Building is a skyscraper in Midtown Manhattan.";
  const short2 = "It was the tallest building in the world for nearly forty years.";

  it("keeps whole sentences while they fit", () => {
    expect(excerpt(`${short1} ${short2}`)).toBe(`${short1} ${short2}`);
  });

  it("stops before a sentence that would pass the limit", () => {
    const long = "A".repeat(100) + " is a very long third sentence that goes on.";
    expect(excerpt(`${short1} ${short2} ${long}`)).toBe(`${short1} ${short2}`);
  });

  it("does not break a sentence at an abbreviation", () => {
    const text = "St. Patrick's Cathedral is a church in Manhattan. It faces Rockefeller Center.";
    expect(excerpt(text, 60)).toBe("St. Patrick's Cathedral is a church in Manhattan.");
  });

  it("cuts a single overlong sentence at a word, with an ellipsis", () => {
    const words = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ") + ".";
    const out = excerpt(words);
    expect(out.length).toBeLessThanOrEqual(220);
    expect(out.endsWith("…")).toBe(true);
    expect(out.slice(0, -1)).toMatch(/word\d+$/);
  });
});

/** An Http that answers from a table of URL fragments, and counts what it was asked. */
function stub(answers: [string, unknown][]): Http & { asked: string[] } {
  const asked: string[] = [];
  return {
    asked,
    async get(url: string) {
      asked.push(url);
      for (const [part, answer] of answers) if (url.includes(part)) return answer;
      return null;
    },
  };
}

const ESB = { n: "Empire State Building", lon: -73.9857, lat: 40.7484 };
const summary = (title: string, extract: string, url: string, type = "standard"): unknown => ({
  type,
  title,
  extract,
  content_urls: { desktop: { page: url } },
});

describe("articleFor", () => {
  it("finds the English article nearby and its Portuguese and Spanish versions", async () => {
    const http = stub([
      [
        "list=geosearch",
        { query: { geosearch: [{ title: "Herald Square" }, { title: "Empire State Building" }] } },
      ],
      [
        "prop=langlinks",
        {
          query: {
            pages: [
              {
                title: "Empire State Building",
                langlinks: [
                  { lang: "pt", title: "Empire State Building" },
                  { lang: "es", title: "Empire State Building" },
                  { lang: "fr", title: "Empire State Building" },
                ],
              },
            ],
          },
        },
      ],
      [
        "en.wikipedia.org/api/rest_v1",
        summary(
          "Empire State Building",
          "An Art Deco skyscraper.",
          "https://en.wikipedia.org/wiki/Empire_State_Building",
        ),
      ],
      [
        "pt.wikipedia.org/api/rest_v1",
        summary(
          "Empire State Building",
          "Um arranha-céu.",
          "https://pt.wikipedia.org/wiki/Empire_State_Building",
        ),
      ],
      [
        "es.wikipedia.org/api/rest_v1",
        summary(
          "Empire State Building",
          "Un rascacielos.",
          "https://es.wikipedia.org/wiki/Empire_State_Building",
        ),
      ],
    ]);
    const found = await articleFor(http, ESB);
    expect(found.en).toEqual({
      title: "Empire State Building",
      url: "https://en.wikipedia.org/wiki/Empire_State_Building",
      text: "An Art Deco skyscraper.",
    });
    expect(found.pt?.text).toBe("Um arranha-céu.");
    expect(found.es?.url).toBe("https://es.wikipedia.org/wiki/Empire_State_Building");
  });

  it("leaves out a language with no article", async () => {
    const http = stub([
      ["list=geosearch", { query: { geosearch: [{ title: "Empire State Building" }] } }],
      [
        "prop=langlinks",
        {
          query: {
            pages: [
              { title: "Empire State Building", langlinks: [{ lang: "pt", title: "Empire State Building" }] },
            ],
          },
        },
      ],
      [
        "wikipedia.org/api/rest_v1",
        summary("Empire State Building", "Text.", "https://x.wikipedia.org/wiki/E"),
      ],
    ]);
    const found = await articleFor(http, ESB);
    expect(found.en).toBeDefined();
    expect(found.pt).toBeDefined();
    expect(found.es).toBeUndefined();
  });

  it("skips a disambiguation page", async () => {
    const http = stub([
      ["list=geosearch", { query: { geosearch: [{ title: "Empire State Building" }] } }],
      ["prop=langlinks", { query: { pages: [{ title: "Empire State Building" }] } }],
      [
        "en.wikipedia.org/api/rest_v1",
        summary("Empire State Building", "may refer to:", "u", "disambiguation"),
      ],
    ]);
    expect((await articleFor(http, ESB)).en).toBeUndefined();
  });

  it("finds nothing when no nearby title matches", async () => {
    const http = stub([["list=geosearch", { query: { geosearch: [{ title: "Herald Square" }] } }]]);
    expect(await articleFor(http, ESB)).toEqual({ en: undefined, pt: undefined, es: undefined });
  });

  // answers for both the street's article and the station's, each by its own title
  const STATION = "Tremont Avenue station (IRT Third Avenue Line)";
  const tremont: [string, unknown][] = [
    ["titles=Tremont%20Avenue%20station", { query: { pages: [{ title: STATION }] } }],
    ["titles=Tremont%20Avenue&", { query: { pages: [{ title: "Tremont Avenue" }] } }],
    ["summary/Tremont_Avenue_station", summary(STATION, "A station.", "https://en.wikipedia.org/wiki/S")],
    ["summary/Tremont_Avenue", summary("Tremont Avenue", "A street.", "https://en.wikipedia.org/wiki/T")],
  ];

  it("does not take a street's article for a station named after it", async () => {
    const http = stub([
      ["list=geosearch", { query: { geosearch: [{ title: "Tremont Avenue" }] } }],
      ...tremont,
    ]);
    const station = { n: "Tremont Avenue", t: "station", lon: -73.9, lat: 40.85 };
    expect((await articleFor(http, station)).en).toBeUndefined();
  });

  it("takes the station's own article for a station named after its street", async () => {
    const http = stub([
      ["list=geosearch", { query: { geosearch: [{ title: "Tremont Avenue" }, { title: STATION }] } }],
      ...tremont,
    ]);
    const station = { n: "Tremont Avenue", t: "station", lon: -73.9, lat: 40.85 };
    expect((await articleFor(http, station)).en?.title).toBe(
      "Tremont Avenue station (IRT Third Avenue Line)",
    );
  });

  it("takes a station's bare name when it already says what it is", async () => {
    const http = stub([
      ["list=geosearch", { query: { geosearch: [{ title: "Grand Central Terminal" }] } }],
      ["prop=langlinks", { query: { pages: [{ title: "Grand Central Terminal" }] } }],
      [
        "en.wikipedia.org/api/rest_v1",
        summary("Grand Central Terminal", "A terminal.", "https://en.wikipedia.org/wiki/G"),
      ],
    ]);
    const station = { n: "Grand Central Terminal", t: "station", lon: -73.97, lat: 40.75 };
    expect((await articleFor(http, station)).en?.title).toBe("Grand Central Terminal");
  });

  it("prefers the article named exactly as the sight over a qualified one nearer", async () => {
    const http = stub([
      ["list=geosearch", { query: { geosearch: [{ title: "Citi Field (1964)" }, { title: "Citi Field" }] } }],
      ["prop=langlinks", { query: { pages: [{ title: "Citi Field" }] } }],
      [
        "en.wikipedia.org/api/rest_v1",
        summary("Citi Field", "A stadium.", "https://en.wikipedia.org/wiki/C"),
      ],
    ]);
    const found = await articleFor(http, { n: "Citi Field", lon: -73.85, lat: 40.76 });
    expect(http.asked.find((u) => u.includes("prop=langlinks"))).toContain("titles=Citi%20Field&");
    expect(found.en?.title).toBe("Citi Field");
  });

  it("asks nothing when the city forbids a match", async () => {
    const http = stub([]);
    expect(await articleFor(http, ESB, null)).toEqual({ en: undefined, pt: undefined, es: undefined });
    expect(http.asked).toEqual([]);
  });

  it("takes the city's forced title without searching", async () => {
    const http = stub([
      ["prop=langlinks", { query: { pages: [{ title: "Solomon R. Guggenheim Museum" }] } }],
      [
        "en.wikipedia.org/api/rest_v1",
        summary("Solomon R. Guggenheim Museum", "A museum.", "https://en.wikipedia.org/wiki/G"),
      ],
    ]);
    const found = await articleFor(
      http,
      { n: "Guggenheim Museum", lon: -73.959, lat: 40.783 },
      "Solomon R. Guggenheim Museum",
    );
    expect(found.en?.title).toBe("Solomon R. Guggenheim Museum");
    expect(http.asked.some((u) => u.includes("geosearch"))).toBe(false);
  });
});

describe("cachedHttp", () => {
  it("fetches a URL once, and again when forced", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-"));
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response(JSON.stringify({ ok: calls }), { status: 200 });
    }) as typeof fetch;
    const http = cachedHttp(dir, fetchImpl, { force: false, delayMs: 0 });
    expect(await http.get("https://en.wikipedia.org/a")).toEqual({ ok: 1 });
    expect(await http.get("https://en.wikipedia.org/a")).toEqual({ ok: 1 });
    expect(calls).toBe(1);
    const forced = cachedHttp(dir, fetchImpl, { force: true, delayMs: 0 });
    expect(await forced.get("https://en.wikipedia.org/a")).toEqual({ ok: 2 });
    expect(calls).toBe(2);
  });

  it("waits and asks again when told to slow down", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-"));
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls === 1
        ? new Response("slow down", { status: 429, headers: { "Retry-After": "0" } })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const http = cachedHttp(dir, fetchImpl, { force: false, delayMs: 0 });
    expect(await http.get("https://en.wikipedia.org/c")).toEqual({ ok: true });
    expect(calls).toBe(2);
  });

  it("backs off on its own when not told how long to wait", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-"));
    const times: number[] = [];
    const fetchImpl = (async () => {
      times.push(Date.now());
      return times.length === 1
        ? new Response("slow down", { status: 429 })
        : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    const http = cachedHttp(dir, fetchImpl, { force: false, delayMs: 0, backoffMs: 40 });
    expect(await http.get("https://en.wikipedia.org/d")).toEqual({ ok: true });
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(35);
  });

  it("remembers a missing page as nothing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wiki-"));
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return new Response("not found", { status: 404 });
    }) as typeof fetch;
    const http = cachedHttp(dir, fetchImpl, { force: false, delayMs: 0 });
    expect(await http.get("https://pt.wikipedia.org/b")).toBeNull();
    expect(await http.get("https://pt.wikipedia.org/b")).toBeNull();
    expect(calls).toBe(1);
  });
});
