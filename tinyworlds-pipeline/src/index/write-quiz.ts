import fs from "node:fs";
import path from "node:path";
import { CITY, DIRS } from "../config.js";
import { makeProjection } from "../projection.js";
import { GEO } from "../scene/build.js";
import { districtLookup } from "./build.js";
import { loadWindow, pageViews, titleOf } from "./fame.js";
import { buildQuiz, QUIZ_LOCALES, type QuizLocale, type QuizSight, type QuizText } from "./quiz.js";
import { stampIndexes } from "./stamp.js";
import { cachedHttp } from "./wiki.js";

/**
 * The `quiz` step: "Guess the building"'s questions (quiz.<locale>.json) from sights.json and
 * the sights' Wikipedia openings (sights.<locale>.json, the `wiki` step), with how famous each
 * is (its article's page views over a year, asked once and cached beside the `wiki` cache, so a
 * rerun is offline and deterministic) and the city's boroughs (`borough` places in places.json).
 * `list` prints every blanked text with its level, group and views, to read them through.
 */
export async function writeQuiz(
  opts: {
    out?: string;
    list?: boolean;
    placeWords?: string[];
    aliases?: Record<string, string[]>;
    /** page views by sight id; asked of Wikimedia (through the cache) when absent */
    views?: Record<string, number>;
    /** ask for page views again, over the last twelve months as of today */
    forceViews?: boolean;
    /** the district a point is in; the city's own, from its raw areas, when absent */
    districtAt?: (lon: number, lat: number) => string;
    log?: (m: string) => void;
  } = {},
): Promise<void> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const out = path.resolve(opts.out ?? DIRS.out);
  const readJson = (file: string): unknown => {
    const full = path.join(out, file);
    return fs.existsSync(full) ? (JSON.parse(fs.readFileSync(full, "utf8")) as unknown) : null;
  };

  const sights = (readJson("sights.json") as { sights?: QuizSight[] } | null)?.sights ?? [];
  const texts = Object.fromEntries(
    QUIZ_LOCALES.map((locale) => [
      locale,
      (readJson(`sights.${locale}.json`) as Record<string, QuizText> | null) ?? {},
    ]),
  ) as Record<QuizLocale, Record<string, QuizText>>;
  if (sights.length === 0 || Object.keys(texts["en-US"]).length === 0) {
    log("quiz: no sights with articles, nothing to ask");
    return;
  }

  const districts = opts.districtAt ? undefined : cityDistricts();
  const areas = ((readJson("places.json") as { places?: { n: string; t: string }[] } | null)?.places ?? [])
    .filter((p) => p.t === "borough")
    .map((p) => p.n)
    .concat(districts?.names ?? []);
  const views = opts.views ?? (await viewsOf(sights, texts["en-US"], opts.forceViews ?? false, log));
  const { files, report } = buildQuiz(
    sights,
    texts,
    opts.placeWords ?? CITY.sights?.placeWords ?? [],
    opts.aliases ?? CITY.sights?.aliases ?? {},
    { views, areas, districtAt: opts.districtAt ?? districts?.at },
  );
  for (const locale of QUIZ_LOCALES)
    fs.writeFileSync(path.join(out, `quiz.${locale}.json`), JSON.stringify(files[locale]));
  stampIndexes(out, log);

  if (opts.list) {
    const name = new Map(sights.map((s) => [s.id, s.n]));
    for (const locale of QUIZ_LOCALES)
      for (const q of files[locale].questions)
        log(
          `${locale}  ${name.get(q.id)} [${q.level} ${q.group}${q.area ? `, ${q.area}` : ""}, ${views[q.id] ?? 0} views] → ` +
            q.parts.map((p, i) => (i % 2 ? "▇" : p)).join(""),
        );
  }
  log(
    `quiz: ${report.questions} questions; ` +
      QUIZ_LOCALES.map((l) => `${l} ${files[l].questions.length}`).join(", "),
  );
  log(
    `quiz: levels easy ${report.levels[0]}, medium ${report.levels[1]}, hard ${report.levels[2]}; ` +
      `narrowed sets borrowing: easy ${report.borrowed.easy}, medium ${report.borrowed.medium}, hard ${report.borrowed.hard}`,
  );
  if (report.noDecoys.length) log(`quiz: no three decoys for ${report.noDecoys.join(", ")}`);
  for (const locale of QUIZ_LOCALES)
    if (report.short[locale].length)
      log(`quiz: too little left to read in ${locale}: ${report.short[locale].join(", ")}`);
}

/** Each sight's article's page views over a year, by sight id (0 without an English article). */
async function viewsOf(
  sights: QuizSight[],
  en: Record<string, QuizText>,
  force: boolean,
  log: (m: string) => void,
): Promise<Record<string, number>> {
  const dir = path.join(DIRS.raw, "wikipedia");
  const window = loadWindow(path.join(dir, "pageviews-window.json"), new Date(), force);
  const http = cachedHttp(dir, fetch, { force, delayMs: 100 });
  const titles = new Map<string, string>();
  for (const s of sights) {
    const title = en[s.id]?.url ? titleOf(en[s.id].url!) : null;
    if (title) titles.set(s.id, title);
  }
  log(
    `quiz: page views ${window.start.slice(0, 6)}–${window.end.slice(0, 6)} for ${new Set(titles.values()).size} articles`,
  );
  const byTitle = await pageViews(http, [...new Set(titles.values())], window, log);
  return Object.fromEntries([...titles].map(([id, title]) => [id, byTitle.get(title) ?? 0]));
}

/**
 * The city's own districts, for a city whose sights' context lines are neighbourhoods
 * (`sights.areaByDistrict`): their names (all of them: Covington's middle is off the map, so it
 * is no `borough` place, yet its downtown is on it) and which one a point is in. None without
 * the city's raw data (tests), or for any other city.
 */
function cityDistricts(): { names: string[]; at: (lon: number, lat: number) => string } | undefined {
  if (!CITY.sights?.areaByDistrict) return undefined;
  try {
    const { districts } = CITY.areas(DIRS.raw);
    return { names: districts.map((d) => d.name), at: districtLookup(makeProjection(GEO), districts) };
  } catch {
    return undefined;
  }
}
