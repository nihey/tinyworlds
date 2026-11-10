import type { NextConfig } from "next";

// The site is a static export, one build per world, served under a sub-path such as /tinynyc
// in production. The base path is inlined at build time.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

// One app, two kinds of page: a world's map (src/app/page.map.tsx) or the front page that lists
// the worlds (src/app/page.home.tsx, for NEXT_PUBLIC_WORLD=home). Only the one this build is for
// counts as a page, so the front page never ships the map engine, nor a map the front page.
const home = (process.env.NEXT_PUBLIC_WORLD ?? "").trim() === "home";

const nextConfig: NextConfig = {
  output: "export",
  pageExtensions: [home ? "home.tsx" : "map.tsx", "tsx", "ts"],
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
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
