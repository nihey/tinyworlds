import fs from "node:fs";
import path from "node:path";
import { REPO } from "./world.js";

/**
 * Where the site lives, for the pictures that say so (a flyover's sign, the film's end card).
 * The repository is public and never names it: it comes from SITE_URL in the environment, or
 * from DEPLOY_URL in the gitignored deploy/.env. Without either the pictures simply leave it out.
 */
export function siteUrl(): string | null {
  const fromEnv = (process.env.SITE_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");
  const file = path.join(REPO, "deploy/.env");
  if (!fs.existsSync(file)) return null;
  const line = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .find((l) => l.startsWith("DEPLOY_URL="));
  const value =
    line
      ?.slice("DEPLOY_URL=".length)
      .trim()
      .replace(/^["']|["']$/g, "") ?? "";
  return value ? value.replace(/\/+$/, "") : null;
}

/** The address as people read it: no scheme, no trailing slash. */
export function siteAddress(): string | null {
  return siteUrl()?.replace(/^https?:\/\//, "") ?? null;
}
