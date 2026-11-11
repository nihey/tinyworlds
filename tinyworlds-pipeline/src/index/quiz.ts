/**
 * The questions of "Guess the building" (quiz.<locale>.json), made from the sights and their
 * Wikipedia openings: each text with the building's name blanked out, and three other famous
 * places of the same kind, nearest first, to offer beside the right one. Pure: the step that
 * reads and writes the files is write-quiz.ts.
 */

export type QuizLocale = "en-US" | "pt-BR" | "es-ES";
export const QUIZ_LOCALES: QuizLocale[] = ["en-US", "pt-BR", "es-ES"];

/** A sight as sights.json has it, as far as the quiz needs it. */
export interface QuizSight {
  id: string;
  n: string;
  t: string;
  b?: string;
  lon: number;
  lat: number;
  /** what it is, for its decoys (kindOf with its opening); worked out from the name when absent */
  kind?: string;
}

/** A sight's article in one language, as sights.<locale>.json has it. */
export interface QuizText {
  title: string;
  text: string;
  lang: string;
  /** the article: two sights with one article are one question */
  url?: string;
}

/** One question: the sight, the three wrong names, and its text cut into pieces (odd ones blanked). */
export interface QuizQuestion {
  id: string;
  decoys: [string, string, string];
  parts: string[];
  lang: string;
}

export interface QuizReport {
  /** questions that got three decoys */
  questions: number;
  /** names of the sights that could not get three */
  noDecoys: string[];
  /** per language, names of the sights whose text was too short once blanked */
  short: Record<QuizLocale, string[]>;
}

/** Characters left to read once the name is blanked, below which a question is not fair. */
export const MIN_LEFT = 60;

/**
 * Words that say nothing about which place it is: articles and prepositions, numbers, and what
 * buildings are (in the three languages). They stay in view, and two names sharing one are not
 * alike for it.
 */
const COMMON_WORDS = new Set(
  `the an of and at on in to for by from with near
  de del la las el los lo do da dos das os as em no na nos nas en y e al um uma una un uno
  one two three four five six seven eight nine ten first second third
  dos tres cuatro cinco seis siete ocho nueve diez dois quatro sete oito nove dez
  building buildings tower towers bridge museum station terminal center centre hall church
  cathedral chapel theatre theater hotel library park square plaza street avenue st ave road
  house memorial monument place court college school university hospital stadium arena market
  edificio edifício torre puente ponte museo museu estacion estación estacao estação teatro
  iglesia igreja catedral capilla capela biblioteca calle rua avenida plaza praca praça parque
  palacio palácio casa mercado colegio colégio escuela escola hospital estadio estádio`
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => fold(w)),
);

/**
 * A kind word in a name → the kind it makes (the decoys of a church are places of worship).
 * Kinds that would be one or two in a city are grouped, so they find decoys of their own.
 */
const KIND_WORDS: Record<string, string> = {
  cathedral: "worship",
  catedral: "worship",
  church: "worship",
  chapel: "worship",
  iglesia: "worship",
  igreja: "worship",
  capilla: "worship",
  capela: "worship",
  synagogue: "worship",
  temple: "worship",
  mosque: "worship",
  theatre: "venue",
  theater: "venue",
  teatro: "venue",
  hotel: "hotel",
  library: "library",
  biblioteca: "library",
  hospital: "hospital",
  school: "school",
  college: "school",
  escuela: "school",
  escola: "school",
  stadium: "stadium",
  estadio: "stadium",
  arena: "stadium",
};

/** Types that are a kind of their own. */
const KIND_TYPES = new Set(["station", "bridge"]);

/**
 * What an English opening says a place is ("… is a concert venue"), word → kind; the first one
 * after "is a" wins. Halls are concert venues, lodges, dormitories and towers, so a building is
 * known by what its article calls it rather than by its name.
 */
const KIND_IN_TEXT: Record<string, string> = {
  museum: "museum",
  gallery: "museum",
  library: "library",
  theater: "venue",
  theatre: "venue",
  venue: "venue",
  auditorium: "venue",
  "concert hall": "venue",
  "music hall": "venue",
  "performing arts": "venue",
  cathedral: "worship",
  church: "worship",
  chapel: "worship",
  synagogue: "worship",
  temple: "worship",
  mosque: "worship",
  parish: "worship",
  hotel: "hotel",
  school: "school",
  college: "school",
  university: "school",
  stadium: "stadium",
  arena: "stadium",
  ballpark: "stadium",
};
const KIND_PHRASES = Object.keys(KIND_IN_TEXT).sort((a, b) => b.length - a.length);

const WORD = /[\p{L}\p{N}]+/gu;
const EDGE_BEFORE = "(?<![\\p{L}\\p{N}])";
const EDGE_AFTER = "(?![\\p{L}\\p{N}])";
const ARTICLE = "(?:(?:the|el|la|los|las|o|os)\\s+)?";
const POSSESSIVE = "(?:['’]s)?";

/** Lower case without accents, one character for one, so positions in the result are the text's. */
export function fold(s: string): string {
  let out = "";
  for (const c of s) {
    const f = c.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
    if (f.length === c.length) out += f;
    else {
      const lower = c.toLowerCase();
      out += lower.length === c.length ? lower : c;
    }
  }
  return out;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The folded words of a text. */
const wordsOf = (s: string): string[] => fold(s).match(WORD) ?? [];

/**
 * The words of a name that say which place it is: not common, and not the city's own place
 * words, unless those are all it has ("Brooklyn" is what tells the Brooklyn Bridge from the
 * Manhattan Bridge; "New York" in the New York Life Building tells nothing).
 */
export function distinctiveWords(name: string, placeWords: ReadonlySet<string>): string[] {
  const own: string[] = [];
  const places: string[] = [];
  for (const w of wordsOf(name)) {
    if (w.length < 2 || COMMON_WORDS.has(w) || own.includes(w) || places.includes(w)) continue;
    (placeWords.has(w) ? places : own).push(w);
  }
  return own.length > 0 ? own : places;
}

/** Words an acronym may leave out: "Museum of Arts and Design" is MAD. */
const SMALL_WORDS = new Set("the of and for at on in a an de del la el los las do da dos das y e".split(" "));

/** Number words, which an acronym may leave out: One World Trade Center is "One WTC". */
const NUMBER_WORDS = new Set(
  "one two three four five six seven eight nine ten uno dos tres um dois".split(" "),
);

/** Articles, which an acronym leaves out more often than prepositions: Museum of the Moving Image is MoMI. */
const ARTICLES = new Set("the a an el la los las o os as".split(" "));

/** A name's initials, folded: of every word, without its articles, without its small words. */
function initialsOf(name: string): string[] {
  const words = wordsOf(name).filter((w) => !/^\d/.test(w));
  const of = (keep: (w: string) => boolean) =>
    words
      .filter(keep)
      .map((w) => w[0])
      .join("");
  return [
    of(() => true),
    of((w) => !ARTICLES.has(w)),
    of((w) => !SMALL_WORDS.has(w)),
    of((w) => !SMALL_WORDS.has(w) && !NUMBER_WORDS.has(w)),
  ].filter((s) => s.length >= 2);
}

/** Does a folded text hold this folded word, whole? */
const holdsWord = (folded: string, word: string): boolean =>
  new RegExp(EDGE_BEFORE + escape(word) + EDGE_AFTER, "u").test(folded);

/**
 * The text cut into pieces, the odd ones being what is blanked: each name as a whole phrase
 * (with a leading article), then each distinctive word of the names (with a possessive), on the
 * folded text. Blanks that only spaces or dashes keep apart become one.
 */
export function blankName(text: string, names: string[], placeWords: ReadonlySet<string>): string[] {
  const folded = fold(text);
  const spans: [number, number][] = [];
  const find = (pattern: string) => {
    for (const m of folded.matchAll(new RegExp(pattern, "gu")))
      if (m[0].length > 0) spans.push([m.index, m.index + m[0].length]);
  };
  const phraseOf = (words: string) => escape(words).replace(/\s+/g, "\\s+").replace(/['’]/g, "['’]");
  for (const name of names) {
    const words = fold(name).trim();
    if (!words) continue;
    find(EDGE_BEFORE + ARTICLE + phraseOf(words) + EDGE_AFTER);
    // "Avenue J station": nothing in it is distinctive, so "Avenue J" is what names it
    if (distinctiveWords(name, placeWords).length === 0) {
      const all = wordsOf(name);
      let end = all.length;
      while (end > 0 && COMMON_WORDS.has(all[end - 1])) end--;
      if (end > 0 && end < all.length) find(EDGE_BEFORE + phraseOf(all.slice(0, end).join(" ")) + EDGE_AFTER);
    }
  }
  for (const name of names)
    for (const word of distinctiveWords(name, placeWords))
      find(EDGE_BEFORE + escape(word) + POSSESSIVE + EDGE_AFTER);
  // a run of the name's own words that holds a place word and another: "the Bronx Museum" of
  // "The Bronx Museum of the Arts" (but not "New York" alone, in "New York City")
  const nameWords = new Set(names.flatMap(wordsOf));
  const tokens = [...folded.matchAll(WORD)].map((m) => ({ w: m[0], a: m.index, b: m.index + m[0].length }));
  for (let i = 0; i < tokens.length;) {
    let j = i;
    while (
      j < tokens.length &&
      nameWords.has(tokens[j].w) &&
      (j === i || /^[\s\-‐‑–—]*$/.test(text.slice(tokens[j - 1].b, tokens[j].a)))
    )
      j++;
    let [from, to] = [i, j - 1];
    while (from <= to && SMALL_WORDS.has(tokens[from].w)) from++;
    while (to >= from && SMALL_WORDS.has(tokens[to].w)) to--;
    const run = tokens.slice(from, to + 1);
    if (run.length >= 2 && run.some((t) => placeWords.has(t.w)) && run.some((t) => !placeWords.has(t.w)))
      spans.push([run[0].a, run[run.length - 1].b]);
    i = Math.max(j, i + 1);
  }
  // the name's initials, as an opening gives them: "(MoMA)", "(SNFL)", "(MAD)"
  const initials = new Set(names.flatMap(initialsOf));
  for (const m of text.matchAll(/(?<![\p{L}\p{N}])\p{L}{2,8}(?![\p{L}\p{N}])/gu))
    if ((m[0].match(/\p{Lu}/gu)?.length ?? 0) >= 2 && initials.has(fold(m[0])))
      spans.push([m.index, m.index + m[0].length]);

  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const merged: [number, number][] = [];
  for (const [a, b] of spans) {
    const last = merged.at(-1);
    if (last && (a <= last[1] || /^[\s\-‐‑–—]*$/.test(text.slice(last[1], a))))
      last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const parts: string[] = [];
  let at = 0;
  for (const [a, b] of merged) {
    parts.push(text.slice(at, a), text.slice(a, b));
    at = b;
  }
  parts.push(text.slice(at));
  return parts;
}

/** What kind of place a sight is, for its decoys: its type, a kind word in its name, or general. */
export function kindOf(sight: { n: string; t: string }, opening?: string): string {
  if (KIND_TYPES.has(sight.t)) return sight.t;
  if (opening) {
    const said = fold(opening).match(/\b(?:is|was)\s+(?:a|an|the)\b([^.;]{0,90})/u);
    if (said) {
      let best: { at: number; kind: string } | null = null;
      for (const phrase of KIND_PHRASES) {
        const m = new RegExp(EDGE_BEFORE + escape(phrase) + "s?" + EDGE_AFTER, "u").exec(said[1]);
        if (m && (!best || m.index < best.at)) best = { at: m.index, kind: KIND_IN_TEXT[phrase] };
      }
      if (best) return best.kind;
    }
  }
  for (const w of wordsOf(sight.n)) if (KIND_WORDS[w]) return KIND_WORDS[w];
  return sight.t === "museum" ? "museum" : "general";
}

const R = 6371008.8;

/** Metres between two points on the ground (equirectangular: plenty within a city). */
export function groundDistance(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * R * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad * R;
  return Math.hypot(x, y);
}

/**
 * A name as compared with another: its words but the common ones ("Avenue J" and "Avenue J
 * station", "Carnegie Hall" and "Carnegie Hall Tower" are the same), else the whole name.
 */
const sameName = (name: string): string => {
  const own = wordsOf(name).filter((w) => !COMMON_WORDS.has(w));
  return own.length > 0 ? own.join(" ") : wordsOf(name).join(" ");
};

const ORDINALS: Record<string, string> = {
  first: "1st",
  second: "2nd",
  third: "3rd",
  fourth: "4th",
  fifth: "5th",
  sixth: "6th",
  seventh: "7th",
  eighth: "8th",
  ninth: "9th",
  tenth: "10th",
  eleventh: "11th",
  twelfth: "12th",
};

/** Folded, with ordinals written as numbers: "Fifth Avenue" and "5th Avenue" are one street. */
const streetForm = (s: string): string => fold(s).replace(/[\p{L}]+/gu, (w) => ORDINALS[w] ?? w);

/** "712 Fifth Avenue" → "5th avenue": the street of a name that is an address. */
function streetOf(name: string): string | null {
  const m = /^\s*\d[\p{L}\p{N}]*(?:\s*[-–]\s*\d+)?\s+(.+)$/u.exec(streetForm(name));
  return m ? m[1].trim() : null;
}

/**
 * Three other places to offer beside the answer: of its kind, nearest first (then the nearest
 * general places, when its kind has fewer than four), never one sharing a distinctive word with
 * it, one the question's visible text names, or one named like it or like another decoy.
 * `visible` is the question's text with the blanks taken out, one string per language.
 */
export function pickDecoys(
  answer: QuizSight,
  pool: QuizSight[],
  visible: string[],
  placeWords: ReadonlySet<string>,
): [string, string, string] | null {
  const kindOfSight = (s: QuizSight) => s.kind ?? kindOf(s);
  const kind = kindOfSight(answer);
  const nearest = (list: QuizSight[]) =>
    list
      .map((s) => ({ s, d: groundDistance(answer, s) }))
      .sort((a, b) => a.d - b.d)
      .map(({ s }) => s);
  const others = pool.filter((s) => s.id !== answer.id);
  const ofKind = others.filter((s) => kindOfSight(s) === kind);
  let candidates = nearest(ofKind);
  if (ofKind.length + 1 < 4 && kind !== "general")
    candidates = candidates.concat(nearest(others.filter((s) => kindOfSight(s) === "general")));

  const answerWords = new Set(distinctiveWords(answer.n, placeWords));
  const texts = visible.map(fold);
  const streets = visible.map(streetForm);
  const names = new Set([sameName(answer.n)]);
  const chosen: string[] = [];
  for (const c of candidates) {
    const words = distinctiveWords(c.n, placeWords);
    if (words.some((w) => answerWords.has(w))) continue;
    if (words.length > 0 && texts.some((t) => words.every((w) => holdsWord(t, w)))) continue;
    const name = sameName(c.n);
    if (names.has(name)) continue;
    // an address the question's own address rules out: "712 Fifth Avenue" beside "at 721 Fifth Avenue"
    const street = streetOf(c.n);
    if (
      street &&
      streets.some((t) =>
        new RegExp(
          EDGE_BEFORE + "\\d[\\p{L}\\p{N}]*(?:\\s*[-–]\\s*\\d+)?\\s+" + escape(street) + EDGE_AFTER,
          "u",
        ).test(t),
      )
    )
      continue;
    names.add(name);
    chosen.push(c.id);
    if (chosen.length === 3) return chosen as [string, string, string];
  }
  return null;
}

/** What is left to read of a blanked text: its even pieces. */
const visibleOf = (parts: string[]): string => parts.filter((_, i) => i % 2 === 0).join(" ");

/**
 * Every question, per language. The questions are the sights with an English text (every
 * language falls back to it), in the sights' order; decoys are chosen once, against all three
 * languages' texts, so a building's tallies mean the same thing everywhere.
 */
export function buildQuiz(
  sights: QuizSight[],
  texts: Record<QuizLocale, Record<string, QuizText>>,
  placeWords: string[],
  aliases: Record<string, string[]> = {},
): { files: Record<QuizLocale, { questions: QuizQuestion[] }>; report: QuizReport } {
  const places = new Set<string>();
  for (const words of [...placeWords, ...sights.map((s) => s.b ?? "")])
    for (const w of wordsOf(words)) places.add(w);
  const aliasesOf = new Map(Object.entries(aliases).map(([name, list]) => [name.toLowerCase(), list]));

  // one question per article: two sights on one article ("Avenue J", "Avenue J station") are one
  const articles = new Set<string>();
  const pool: QuizSight[] = [];
  for (const sight of sights) {
    const en = texts["en-US"][sight.id];
    if (!en) continue;
    const article = en.url ?? en.title;
    if (articles.has(article)) continue;
    articles.add(article);
    pool.push({ ...sight, kind: kindOf(sight, en.text) });
  }
  const files: Record<QuizLocale, { questions: QuizQuestion[] }> = {
    "en-US": { questions: [] },
    "pt-BR": { questions: [] },
    "es-ES": { questions: [] },
  };
  const report: QuizReport = {
    questions: 0,
    noDecoys: [],
    short: { "en-US": [], "pt-BR": [], "es-ES": [] },
  };

  for (const sight of pool) {
    // the building's own area is part of its name ("Liberty" of the Statue of Liberty, on Liberty Island)
    const own = new Set(wordsOf(sight.b ?? ""));
    const placesHere = new Set([...places].filter((w) => !own.has(w)));
    const blanked = new Map<QuizLocale, { parts: string[]; lang: string }>();
    for (const locale of QUIZ_LOCALES) {
      const text = texts[locale][sight.id];
      if (!text) continue;
      // "181st Street station (IRT Broadway–Seventh Avenue Line)": the line is not its name
      const title = text.title.replace(/\s*\([^)]*\)\s*$/, "");
      const names = [sight.n, title, ...(aliasesOf.get(sight.n.toLowerCase()) ?? [])];
      blanked.set(locale, { parts: blankName(text.text, names, placesHere), lang: text.lang });
    }
    const visible = [...blanked.values()].map((b) => visibleOf(b.parts));
    const decoys = pickDecoys(sight, pool, visible, places);
    if (!decoys) {
      report.noDecoys.push(sight.n);
      continue;
    }
    report.questions++;
    for (const [locale, { parts, lang }] of blanked) {
      const left = parts
        .filter((_, i) => i % 2 === 0)
        .join("")
        .replace(/\s+/g, " ")
        .trim().length;
      if (left < MIN_LEFT) report.short[locale].push(sight.n);
      else files[locale].questions.push({ id: sight.id, decoys, parts, lang });
    }
  }
  return { files, report };
}
