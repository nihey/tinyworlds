import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadWindow, pageViews, titleOf, viewsWindow } from "./fame.js";
import type { Http } from "./wiki.js";

describe("viewsWindow", () => {
  it("is the last twelve complete months", () => {
    expect(viewsWindow(new Date("2026-11-11T12:00:00Z"))).toEqual({
      start: "2025110100",
      end: "2026103100",
    });
    expect(viewsWindow(new Date("2026-03-01T00:00:00Z"))).toEqual({
      start: "2025030100",
      end: "2026022800",
    });
  });
});

describe("titleOf", () => {
  it("takes the title an English Wikipedia address names, as it is written there", () => {
    expect(titleOf("https://en.wikipedia.org/wiki/Avenue_J_station_(BMT_Brighton_Line)")).toBe(
      "Avenue_J_station_(BMT_Brighton_Line)",
    );
    expect(titleOf("https://en.wikipedia.org/wiki/Caf%C3%A9_Wha%3F")).toBe("Caf%C3%A9_Wha%3F");
    expect(titleOf("https://pt.wikipedia.org/wiki/Flatiron_Building")).toBeNull();
    expect(titleOf("not a url")).toBeNull();
  });
});

describe("pageViews", () => {
  const window = { start: "2025110100", end: "2026103100" };

  it("sums each article's months, and counts a missing or failing one as nothing", async () => {
    const asked: string[] = [];
    const http: Http = {
      get: (url) => {
        asked.push(url);
        if (url.includes("/Flatiron_Building/"))
          return Promise.resolve({ items: [{ views: 100 }, { views: 23 }] });
        if (url.includes("/Gone/")) return Promise.resolve(null);
        return Promise.reject(new Error("503"));
      },
    };
    const views = await pageViews(http, ["Flatiron_Building", "Gone", "Broken"], window, () => {});
    expect(views.get("Flatiron_Building")).toBe(123);
    expect(views.get("Gone")).toBe(0);
    expect(views.get("Broken")).toBe(0);
    expect(asked[0]).toBe(
      "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/Flatiron_Building/monthly/2025110100/2026103100",
    );
  });
});

describe("loadWindow", () => {
  it("keeps the first window, so reruns ask the same addresses, until forced", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fame-"));
    const file = path.join(dir, "pageviews-window.json");
    const first = loadWindow(file, new Date("2026-11-11"), false);
    expect(loadWindow(file, new Date("2027-02-02"), false)).toEqual(first);
    expect(loadWindow(file, new Date("2027-02-02"), true)).toEqual({
      start: "2026020100",
      end: "2027013100",
    });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
