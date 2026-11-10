// Serves the static export (out/) the way production does: under the base path.
//   NEXT_PUBLIC_BASE_PATH=/tinynyc npm run build && NEXT_PUBLIC_BASE_PATH=/tinynyc npm run preview
// (use the same NEXT_PUBLIC_* values for both commands; the build inlines them, this only reads the base path)
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../out", import.meta.url)));
const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");
const port = Number(process.env.PORT ?? 4173);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

if (!existsSync(root)) {
  console.error("No out/ directory. Run `npm run build` first.");
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  let path = decodeURIComponent(url.pathname);
  if (base) {
    if (path === base) {
      res.writeHead(308, { location: `${base}/` }).end();
      return;
    }
    if (!path.startsWith(`${base}/`)) {
      res
        .writeHead(404, { "content-type": "text/plain" })
        .end(`Not found. The site is at ${base}/`);
      return;
    }
    path = path.slice(base.length);
  }
  let file = join(root, normalize(path));
  if (!file.startsWith(root)) {
    res.writeHead(403).end();
    return;
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
  if (!existsSync(file)) {
    res.writeHead(404, { "content-type": "text/plain" }).end("Not found");
    return;
  }
  res.writeHead(200, {
    "content-type": TYPES[extname(file)] ?? "application/octet-stream",
    "cache-control": "no-cache",
  });
  createReadStream(file).pipe(res);
}).listen(port, () => {
  console.log(`tinyworlds preview: http://localhost:${port}${base}/`);
});
