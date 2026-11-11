import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CITY, DIRS } from "../config.js";
import { WIKI_USER_AGENT } from "../env.js";
import { stampIndexes } from "./stamp.js";

/**
 * The `wiki` step: each sight's Wikipedia article, in English, Portuguese and Spanish, matched
 * once and kept (sights.<locale>.json). Offline after the first run: every answer is cached under
 * data/<city>/raw/wikipedia/. A doubtful match is no match.
 */

export type Lang = "en" | "pt" | "es";
export interface Article {
  title: string;
  url: string;
  text: string;
}
export type Articles = Record<Lang, Article | undefined>;

/** The interface languages and the Wikipedia each one reads. */
const LOCALES: { locale: string; lang: Lang }[] = [
  { locale: "en-US", lang: "en" },
  { locale: "pt-BR", lang: "pt" },
  { locale: "es-ES", lang: "es" },
];

/** How far around a sight's point its article may be, in metres. */
const RADIUS = 300;
/** At most this many characters of the article's opening. */
const MAX_TEXT = 220;

/** "Café   Wha?" → "cafe wha"; a leading "the" goes too. */
export function normalizeTitle(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "");
}

/** Is this article about the place of that name? A trailing "(stadium)" on the title is ignored. */
export function titleMatches(name: string, title: string): boolean {
  // "(1978–2016)": the one that stood here before, not the one on the map
  if (/\(\s*\d{4}\s*[–—-]\s*\d{4}\s*\)\s*$/.test(title)) return false;
  const bare = title.replace(/\s*\([^)]*\)\s*$/, "");
  return normalizeTitle(name) !== "" && normalizeTitle(name) === normalizeTitle(bare);
}

/** A station's name that already says what it is ("Grand Central Terminal", "Fulton Center"). */
const SAYS_STATION = /\b(station|terminal|terminus|center|centre|hub|depot)\b/;

/**
 * Is this article about the sight? A station is often named after its street ("Tremont Avenue"):
 * it takes "<name> station", and its bare name only when that already says it is a station.
 */
function isAbout(sight: { n: string; t?: string }, title: string): boolean {
  if (sight.t !== "station") return titleMatches(sight.n, title);
  if (titleMatches(`${sight.n} station`, title)) return true;
  return SAYS_STATION.test(normalizeTitle(sight.n)) && titleMatches(sight.n, title);
}

/** Words that end in a full stop without ending a sentence. */
const ABBREVIATION = /(?:^|\s)(?:St|Mt|Ft|Mr|Mrs|Ms|Dr|Jr|Sr|Ave|No|Co|Inc|Ltd|vs|U\.S|D\.C|[A-Z])\.$/;

/** The opening of an article: whole sentences while they fit in `max`, else one cut at a word. */
export function excerpt(text: string, max = MAX_TEXT): string {
  const parts = text.trim().split(/(?<=[.!?])\s+/);
  const sentences: string[] = [];
  for (const part of parts) {
    const last = sentences.length - 1;
    if (last >= 0 && ABBREVIATION.test(sentences[last])) sentences[last] += ` ${part}`;
    else sentences.push(part);
  }
  let out = "";
  for (const s of sentences) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > max) break;
    out = next;
  }
  if (out) return out;
  const cut = sentences[0].slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, "")}…`;
}

export interface Http {
  /** The parsed JSON at a URL, or null when the page is not there. */
  get(url: string): Promise<unknown>;
}

/** An Http that keeps every answer in `dir` (null for a missing page) and spaces its requests. */
export function cachedHttp(
  dir: string,
  fetchImpl: typeof fetch,
  opts: {
    force: boolean;
    delayMs: number;
    /** first pause after a 429 with no Retry-After */ backoffMs?: number;
  },
): Http {
  fs.mkdirSync(dir, { recursive: true });
  let last = 0;
  return {
    async get(url: string): Promise<unknown> {
      const file = path.join(dir, `${createHash("sha1").update(url).digest("hex")}.json`);
      if (!opts.force && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
      const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      let res: Response;
      // told to slow down (429, 503): wait as long as asked (else 2 s, doubling) and ask again
      for (let attempt = 0; ; attempt++) {
        const wait = last + opts.delayMs - Date.now();
        if (wait > 0) await sleep(wait);
        last = Date.now();
        res = await fetchImpl(url, {
          headers: { "User-Agent": WIKI_USER_AGENT, Accept: "application/json" },
        });
        if ((res.status !== 429 && res.status !== 503) || attempt >= 5) break;
        const header = res.headers.get("Retry-After");
        const asked = header === null ? NaN : Number(header);
        const backoff = (opts.backoffMs ?? 2000) * 2 ** attempt;
        await sleep(Number.isFinite(asked) && asked >= 0 ? asked * 1000 : backoff);
      }
      if (res.status === 404) {
        fs.writeFileSync(file, "null");
        return null;
      }
      if (!res.ok) throw new Error(`${url} answered ${res.status}`);
      const json: unknown = await res.json();
      fs.writeFileSync(file, JSON.stringify(json));
      return json;
    },
  };
}

const api = (lang: Lang, params: string): string =>
  `https://${lang}.wikipedia.org/w/api.php?${params}&format=json&formatversion=2`;

interface Summary {
  type?: string;
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
}

async function summaryOf(http: Http, lang: Lang, title: string): Promise<Article | undefined> {
  const s = (await http.get(
    `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(" ", "_"))}`,
  )) as Summary | null;
  const url = s?.content_urls?.desktop?.page;
  if (!s || s.type === "disambiguation" || !s.extract || !url) return undefined;
  return { title: s.title ?? title, url, text: excerpt(s.extract) };
}

/**
 * A sight's article in each language: the English one whose title matches its name among the
 * articles near its point (or the city's `override`: a title, or null for none), then the
 * Portuguese and Spanish ones it links to.
 */
export async function articleFor(
  http: Http,
  sight: { n: string; t?: string; lon: number; lat: number },
  override?: string | null,
): Promise<Articles> {
  const none: Articles = { en: undefined, pt: undefined, es: undefined };
  if (override === null) return none;
  let title = override;
  if (title === undefined) {
    const near = (await http.get(
      api(
        "en",
        `action=query&list=geosearch&gscoord=${sight.lat}|${sight.lon}&gsradius=${RADIUS}&gslimit=500`,
      ),
    )) as { query?: { geosearch?: { title: string }[] } } | null;
    // an article named exactly as the sight first, then the nearest one that matches
    const about = (near?.query?.geosearch ?? []).filter((g) => isAbout(sight, g.title));
    title = (about.find((g) => normalizeTitle(g.title) === normalizeTitle(sight.n)) ?? about[0])?.title;
  }
  if (title === undefined) return none;

  const links = (await http.get(
    api("en", `action=query&prop=langlinks&titles=${encodeURIComponent(title)}&lllimit=500&redirects=1`),
  )) as { query?: { pages?: { title?: string; langlinks?: { lang: string; title: string }[] }[] } } | null;
  const page = links?.query?.pages?.[0];
  const titles: Record<Lang, string | undefined> = { en: page?.title ?? title, pt: undefined, es: undefined };
  for (const link of page?.langlinks ?? [])
    if (link.lang === "pt" || link.lang === "es") titles[link.lang] = link.title;

  const out: Articles = { ...none };
  for (const lang of ["en", "pt", "es"] as const) {
    const t = titles[lang];
    if (t) out[lang] = await summaryOf(http, lang, t);
  }
  return out;
}

/** Reads sights.json and writes sights.<locale>.json: English stands in where a language has none. */
export async function buildWiki(
  opts: { out?: string; force?: boolean; log?: (m: string) => void } = {},
): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const out = path.resolve(opts.out ?? DIRS.out);
  const file = path.join(out, "sights.json");
  if (!fs.existsSync(file)) throw new Error("no sights.json: run index first");
  const { sights } = JSON.parse(fs.readFileSync(file, "utf8")) as {
    sights: { id: string; n: string; t: string; lon: number; lat: number }[];
  };
  const overrides = new Map(
    Object.entries(CITY.sights?.wikipedia ?? {}).map(([name, title]) => [name.toLowerCase(), title]),
  );
  const http = cachedHttp(path.join(DIRS.raw, "wikipedia"), fetch, {
    force: opts.force ?? false,
    delayMs: 200,
  });

  const texts: Record<string, Record<string, Article & { lang: Lang }>> = {};
  for (const { locale } of LOCALES) texts[locale] = {};
  let matched = 0;
  let failed = 0;
  for (const [i, sight] of sights.entries()) {
    let found: Articles;
    try {
      found = await articleFor(http, sight, overrides.get(sight.n.toLowerCase()));
    } catch (error) {
      failed++;
      log(`wiki: ${sight.n}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (found.en) matched++;
    for (const { locale, lang } of LOCALES) {
      const article = found[lang] ?? found.en;
      if (article) texts[locale][sight.id] = { ...article, lang: found[lang] ? lang : "en" };
    }
    if ((i + 1) % 100 === 0) log(`wiki: ${i + 1}/${sights.length} sights, ${matched} with an article`);
  }
  for (const { locale } of LOCALES)
    fs.writeFileSync(path.join(out, `sights.${locale}.json`), JSON.stringify(texts[locale]));
  stampIndexes(out, log);
  log(
    `wiki: ${matched} of ${sights.length} sights have an article${failed ? `, ${failed} failed (run again)` : ""}`,
  );
}
