import fs from "node:fs";
import { CITY, DIRS } from "../config.js";

export async function fetchAll(opts: { force: boolean; only?: string }): Promise<void> {
  fs.mkdirSync(DIRS.raw, { recursive: true });
  const log = (msg: string) => console.log(msg);
  for (const source of CITY.sources) {
    if (opts.only && source.name !== opts.only) continue;
    await source.fetch({ rawDir: DIRS.raw, bbox: CITY.bbox, force: opts.force, log });
  }
}
