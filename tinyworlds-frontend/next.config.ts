import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// The site is a static export, one build per world, served under a sub-path such as /tinynyc
// in production. The base path is inlined at build time.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

// One app, two kinds of page: a world's map (src/app/page.map.tsx) or the front page that lists
// the worlds (src/app/page.home.tsx, for NEXT_PUBLIC_WORLD=home). Only the one this build is for
// counts as a page, so the front page never ships the map engine, nor a map the front page.
const home = (process.env.NEXT_PUBLIC_WORLD ?? "").trim() === "home";

// The worlds that have a hero film of their own, by what is in public/loops/: hero.jpg is the
// first world's (src/worlds: DEFAULT_WORLD), hero-<id>.jpg another's. The front page's hero
// goes round these (src/site.ts: HERO_FILMS), so a world added without a film is simply not in
// it. Set NEXT_PUBLIC_HERO_FILMS by hand to try the hero with fewer.
const loops = path.join(process.cwd(), "public", "loops");
const heroFilms = existsSync(loops)
  ? readdirSync(loops)
      .flatMap((file) => {
        if (file === "hero.jpg") return ["tinynyc"];
        const world = /^hero-([a-z0-9]+)\.jpg$/.exec(file)?.[1];
        return world ? [world] : [];
      })
      .sort()
  : [];

// The front page's pictures that have smaller copies in public/loops/ (`npm run stills`): a
// world's card ("card-tinynyc": -400 and -800.webp) and a hero still ("hero-tinyrao": -960 and
// -1280.webp). Only a picture with all its sizes is offered them (src/site.ts: STILLS), so a
// world added before its copies are made simply keeps its original.
const STILL_WIDTHS: Record<string, number[]> = { card: [400, 800], hero: [960, 1280] };
const stillFiles = existsSync(loops) ? new Set(readdirSync(loops)) : new Set<string>();
const stills = [...stillFiles]
  .flatMap((file) => {
    const match = /^((card|hero)(?:-[a-z0-9]+)?)-\d+\.webp$/.exec(file);
    return match ? [{ name: match[1], kind: match[2] }] : [];
  })
  .filter(({ name, kind }) =>
    STILL_WIDTHS[kind].every((width) => stillFiles.has(`${name}-${width}.webp`)),
  )
  .map(({ name }) => name);

const nextConfig: NextConfig = {
  output: "export",
  pageExtensions: [home ? "home.tsx" : "map.tsx", "tsx", "ts"],
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: {
    NEXT_PUBLIC_HERO_FILMS: process.env.NEXT_PUBLIC_HERO_FILMS ?? heroFilms.join(","),
    NEXT_PUBLIC_STILLS: process.env.NEXT_PUBLIC_STILLS ?? [...new Set(stills)].sort().join(","),
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
