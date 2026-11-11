import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * The indexes of a world's data folder: every JSON file but the manifest (places, hoods, life,
 * the sights and their texts) and the sights' pictures. The tiles and the minimap are the
 * render's, versioned by its `build`.
 */
function indexFiles(out: string): string[] {
  const files = fs
    .readdirSync(out)
    .filter((name) => name.endsWith(".json") && name !== "manifest.json")
    .sort();
  const pictures = path.join(out, "sights");
  if (fs.existsSync(pictures))
    for (const name of fs.readdirSync(pictures).sort()) files.push(`sights/${name}`);
  return files;
}

/** A version for a world's indexes: a hash of their names and contents, so it moves only when they do. */
export function indexesVersion(out: string): string {
  const hash = createHash("sha256");
  for (const file of indexFiles(out)) {
    hash.update(`${file}\0`);
    hash.update(fs.readFileSync(path.join(out, file)));
    hash.update("\0");
  }
  return hash.digest("hex").slice(0, 12);
}

/**
 * Names the indexes' version in the manifest (`indexes`), so the viewer asks for them anew when
 * they change, and only then, without a new render and without the tiles' caches being lost.
 * A folder with no manifest yet is left alone: the render writes one, and the next stamp fills it.
 */
export function stampIndexes(out: string, log: (m: string) => void): void {
  const file = path.join(out, "manifest.json");
  if (!fs.existsSync(file)) return;
  const manifest = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  const version = indexesVersion(out);
  if (manifest.indexes === version) return;
  manifest.indexes = version;
  fs.writeFileSync(file, JSON.stringify(manifest));
  log(`index: the manifest names the indexes' version ${version}`);
}
