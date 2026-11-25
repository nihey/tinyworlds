import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The font files every page preloads, read from next/font's manifest when the page is built.
 *
 * next/font writes these preload tags itself, but it looks a page up in its manifest by the
 * page's file name (`page.home`, `page.map`: next.config.ts's `pageExtensions`), while the
 * manifest files it as `page`, so it never finds them. Without the tags the fonts were only
 * asked for once the stylesheet had been read, and the wordmark showed in a fallback font
 * first. The layout writes the tags instead, from the same manifest. Anything amiss (no
 * manifest, another shape) is a page without them, never a failed build; in development there
 * are none (the manifest there may be an old build's).
 */
export function fontPreloads(
  dir = path.join(process.cwd(), ".next", "server"),
  production = process.env.NODE_ENV === "production",
): string[] {
  if (!production) return [];
  try {
    const manifest = JSON.parse(
      readFileSync(path.join(dir, "next-font-manifest.json"), "utf8"),
    ) as {
      app?: Record<string, unknown>;
    };
    const files = new Set<string>();
    for (const list of Object.values(manifest.app ?? {}))
      if (Array.isArray(list))
        for (const file of list)
          if (typeof file === "string" && file.endsWith(".woff2")) files.add(file);
    return [...files].sort();
  } catch {
    return [];
  }
}
