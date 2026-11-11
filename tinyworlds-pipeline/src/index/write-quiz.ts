import fs from "node:fs";
import path from "node:path";
import { CITY, DIRS } from "../config.js";
import { buildQuiz, QUIZ_LOCALES, type QuizLocale, type QuizSight, type QuizText } from "./quiz.js";
import { stampIndexes } from "./stamp.js";

/**
 * The `quiz` step: "Guess the building"'s questions (quiz.<locale>.json) from sights.json and
 * the sights' Wikipedia openings (sights.<locale>.json, the `wiki` step). Offline and
 * deterministic. `list` prints every blanked text, to read them through.
 */
export function writeQuiz(
  opts: {
    out?: string;
    list?: boolean;
    placeWords?: string[];
    aliases?: Record<string, string[]>;
    log?: (m: string) => void;
  } = {},
): void {
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

  const { files, report } = buildQuiz(
    sights,
    texts,
    opts.placeWords ?? CITY.sights?.placeWords ?? [],
    opts.aliases ?? CITY.sights?.aliases ?? {},
  );
  for (const locale of QUIZ_LOCALES)
    fs.writeFileSync(path.join(out, `quiz.${locale}.json`), JSON.stringify(files[locale]));
  stampIndexes(out, log);

  if (opts.list) {
    const name = new Map(sights.map((s) => [s.id, s.n]));
    for (const locale of QUIZ_LOCALES)
      for (const q of files[locale].questions)
        log(`${locale}  ${name.get(q.id)} → ${q.parts.map((p, i) => (i % 2 ? "▇" : p)).join("")}`);
  }
  log(
    `quiz: ${report.questions} questions; ` +
      QUIZ_LOCALES.map((l) => `${l} ${files[l].questions.length}`).join(", "),
  );
  if (report.noDecoys.length) log(`quiz: no three decoys for ${report.noDecoys.join(", ")}`);
  for (const locale of QUIZ_LOCALES)
    if (report.short[locale].length)
      log(`quiz: too little left to read in ${locale}: ${report.short[locale].join(", ")}`);
}
