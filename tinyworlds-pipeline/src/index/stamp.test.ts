import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { indexesVersion, stampIndexes } from "./stamp.js";

let out: string;
const put = (file: string, body: string): void => {
  fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true });
  fs.writeFileSync(path.join(out, file), body);
};
const manifest = (): Record<string, unknown> =>
  JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")) as Record<string, unknown>;

beforeEach(() => {
  out = fs.mkdtempSync(path.join(os.tmpdir(), "stamp-"));
  put("manifest.json", JSON.stringify({ name: "tinyx", build: "b1" }));
  put("places.json", '{"places":[]}');
  put("sights.json", '{"sights":[]}');
  put("sights/a.webp", "picture a");
  put("tiles/0/0_0.webp", "tile");
  put("overview.webp", "minimap");
});
afterEach(() => fs.rmSync(out, { recursive: true, force: true }));

describe("indexesVersion", () => {
  it("moves when an index, a text or a picture changes", () => {
    const before = indexesVersion(out);
    put("places.json", '{"places":[1]}');
    const places = indexesVersion(out);
    expect(places).not.toBe(before);
    put("sights.en-US.json", "{}");
    const texts = indexesVersion(out);
    expect(texts).not.toBe(places);
    put("sights/a.webp", "picture a, redrawn");
    expect(indexesVersion(out)).not.toBe(texts);
  });

  it("stays put for the render's files and the manifest", () => {
    const before = indexesVersion(out);
    put("tiles/0/0_0.webp", "tile, redrawn");
    put("overview.webp", "minimap, redrawn");
    put("manifest.json", JSON.stringify({ name: "tinyx", build: "b2" }));
    expect(indexesVersion(out)).toBe(before);
  });
});

describe("stampIndexes", () => {
  it("names the version in the manifest and keeps the rest of it", () => {
    stampIndexes(out, () => {});
    expect(manifest()).toEqual({ name: "tinyx", build: "b1", indexes: indexesVersion(out) });
  });

  it("leaves a folder with no manifest alone", () => {
    fs.rmSync(path.join(out, "manifest.json"));
    stampIndexes(out, () => {});
    expect(fs.existsSync(path.join(out, "manifest.json"))).toBe(false);
  });
});
