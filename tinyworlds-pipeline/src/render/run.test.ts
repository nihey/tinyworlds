import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { keptFromManifest } from "./run.js";

let dir: string;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-"));
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("keptFromManifest", () => {
  it("keeps the walk's version, and nothing else, of the manifest a render replaces", () => {
    const file = path.join(dir, "manifest.json");
    fs.writeFileSync(
      file,
      JSON.stringify({ name: "tinynyc", build: "old", indexes: "abc", walk: "0123456789ab" }),
    );
    expect(keptFromManifest(file)).toEqual({ walk: "0123456789ab" });
  });

  it("keeps no walk in the other view's manifest: the walk is the world's own view's", () => {
    const file = path.join(dir, "manifest.json");
    fs.writeFileSync(file, JSON.stringify({ name: "tinynyc", build: "old", walk: "0123456789ab" }));
    expect(keptFromManifest(file, true)).toEqual({});
  });

  it("keeps nothing from a manifest without a walk, an unreadable one or none", () => {
    const file = path.join(dir, "manifest.json");
    expect(keptFromManifest(file)).toEqual({});
    fs.writeFileSync(file, JSON.stringify({ name: "tinyrao", build: "old" }));
    expect(keptFromManifest(file)).toEqual({});
    fs.writeFileSync(file, "{ not json");
    expect(keptFromManifest(file)).toEqual({});
  });
});
