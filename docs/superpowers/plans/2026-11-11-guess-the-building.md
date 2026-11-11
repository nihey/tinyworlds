# Guess the Building Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A quiz on the New York map: a building is lit, its Wikipedia opening is shown with the name blanked, the visitor picks its name out of four, and sees how everyone else answered.

**Architecture:** The pipeline prepares the questions offline (`quiz.<locale>.json`: blanked text pieces and three fixed decoys per building). The API keeps one row per answer and returns a building's tally (`answerQuiz`). The viewer holds the building lit through a new engine call, shows a card on the right, sends the answer with plain `fetch` and draws the shares over the four names shown.

**Tech Stack:** Pipeline: TypeScript ESM, Commander, vitest. API: NestJS 11, `@nestjs/graphql` code-first, Prisma 7, `@nestjs/throttler`, vitest (unit with `FakePrisma`, e2e on the local Postgres). Viewer: Next.js 16 static export, React 19, Tailwind v4, vitest (node environment, pure modules only).

**Spec:** `docs/superpowers/specs/2026-11-11-guess-the-building-design.md`. Mockup: `.superpowers/brainstorm/guess-the-building/round.html`.

## Global Constraints

- No commits: the owner commits. Each task ends with its sub-project's `npm test` and `npm run lint` green.
- The repository is public: no domain, host, id or key in any tracked file; examples use `example.com`.
- No hard-coded interface strings in the viewer: every new word goes through `Strings` (`src/i18n/types.ts`) in en-US, pt-BR and es-ES.
- The pipeline stays deterministic; tiles, `sights.json` and `sights.<locale>.json` do not change.
- Nothing of the game loads before it starts: `quiz.<locale>.json` is fetched on the first tap of the sign.
- Answers go out with plain `fetch` (never Apollo Client); the game works without `NEXT_PUBLIC_API_URL`, only without shares.
- `localStorage` / `sessionStorage` always behind try/catch.
- API: code-first GraphQL, `class-validator` inputs, the public mutation `@Public()` + `GqlThrottlerGuard`; snake_case tables and columns.
- Wikipedia text is CC BY-SA 4.0: the card says it comes from Wikipedia with the name hidden, and links the article once answered.
- Documentation is updated in the task that changes the thing (root `CLAUDE.md` contracts, each sub-project's `CLAUDE.md`, `deploy/README.md`).

## Review Focus

- **The API slow, failing or absent**: the round still ends; the card shows the verdict without shares within 5 s, never a spinner forever. Test: Task 5, `sendAnswer` resolves `null` on timeout, HTTP error and GraphQL errors.
- **Quiz file and `sights.json` out of step** (an id in one and not the other): that question is skipped, never a card with a missing name. Test: Task 5, `nextQuestion` skips a question whose sight or any decoy is unknown.
- **A late tally** (Next pressed before it came back): it must not land on the next building's card. Test: Task 5, `quizReducer` ignores a `tally` for another `sightId`.
- **Repeated names** (two sights called "Atlantic Terminal"): never two identical names among the four. Test: Task 1, `pickDecoys` skips a candidate whose folded name equals the answer's or a chosen decoy's.
- **Storage blocked**: the game plays, remembering played buildings only in memory. Test: Task 5, `loadPlayed` / `savePlayed` with a throwing store.

---

### Task 1: Pipeline: blanking and decoys (pure)

**Files:**
- Create: `tinyworlds-pipeline/src/index/quiz.ts`
- Test: `tinyworlds-pipeline/src/index/quiz.test.ts`

**Interfaces:**
- Produces (all exported from `src/index/quiz.ts`):
  - `type QuizLocale = "en-US" | "pt-BR" | "es-ES"`; `const QUIZ_LOCALES: QuizLocale[]`
  - `interface QuizSight { id: string; n: string; t: string; b?: string; lon: number; lat: number }`
  - `interface QuizText { title: string; text: string; lang: string }`
  - `interface QuizQuestion { id: string; decoys: [string, string, string]; parts: string[]; lang: string }`
  - `const MIN_LEFT = 60` (characters left to read after blanking)
  - `function fold(s: string): string`: lower case, accents off, character by character so `fold(s).length === s.length`
  - `function distinctiveWords(name: string, placeWords: ReadonlySet<string>): string[]`: folded words of ≥ 2 characters not in `COMMON_WORDS` nor `placeWords` (both folded)
  - `function blankName(text: string, names: string[], placeWords: ReadonlySet<string>): string[]`: `parts`, `parts.join("") === text`, odd indices blanked
  - `function kindOf(sight: { n: string; t: string }): string`
  - `function groundDistance(a: { lon: number; lat: number }, b: { lon: number; lat: number }): number` (metres, equirectangular, R = 6371008.8)
  - `function pickDecoys(answer: QuizSight, pool: QuizSight[], visible: string[], placeWords: ReadonlySet<string>): [string, string, string] | null`
  - `function buildQuiz(sights: QuizSight[], texts: Record<QuizLocale, Record<string, QuizText>>, placeWords: string[]): { files: Record<QuizLocale, { questions: QuizQuestion[] }>; report: QuizReport }`
  - `interface QuizReport { questions: number; noDecoys: string[]; short: Record<QuizLocale, string[]> }` (names)

Rules the code must follow (from the spec):
- `COMMON_WORDS`: one list for the three languages: articles and prepositions (the, a, an, of, and, at, on, in, de, del, la, las, el, los, do, da, dos, das, o, os, a, as, e, y, at, …) and building words (building, tower, bridge, museum, station, terminal, center, centre, hall, church, cathedral, chapel, theatre, theater, hotel, library, park, square, plaza, street, avenue, st, ave, house, memorial, monument, edificio, edifício, torre, puente, ponte, museo, museu, estación, estação, teatro, iglesia, igreja, catedral, biblioteca, calle, rua, avenida, …).
- `placeWords`: the city's `sights.placeWords` plus every distinct `b` of the sights, split into words and folded.
- `blankName`: first each name (sight name, article title) as a whole phrase with an optional leading article (`the|el|la|los|las|o|a|os|as`), then each distinctive word with an optional possessive (`'s`, `’s`); whole words, on folded text; spans separated only by spaces, hyphens or dashes merge.
- `kindOf`: `t` when it is `station`, `bridge` or `museum`; else the first kind word in the folded name, mapped (cathedral, church|chapel → church, synagogue, temple, mosque, theatre|theater → theatre, hotel, library, hall, hospital, school, college, stadium, arena); else `general`.
- `pickDecoys`: candidates are other pool sights of `kindOf(answer)`, nearest first by `groundDistance`; if that kind has fewer than 4 sights in the pool, then `general` sights (nearest first) after them. Skip a candidate whose distinctive words intersect the answer's, any of whose distinctive words appears as a whole word in any of `visible` (the question's even parts joined, one string per language), or whose folded name equals the answer's or a chosen decoy's. `null` when fewer than three remain.
- `buildQuiz`: the pool is the sights with an `en-US` text, in `sights` order. For each: blank the text in every locale (names: sight `n` and that locale's `title`); decoys chosen once against the three visible texts; a locale keeps the question only if what is not blanked is ≥ `MIN_LEFT` characters. `lang` is the text's own.

- [ ] **Step 1: Write the failing tests** in `quiz.test.ts`:
  - `fold`: `fold("Édifício São") === "edificio sao"`, same length as the input.
  - `distinctiveWords("Flatiron Building", new Set()) → ["flatiron"]`; `distinctiveWords("New York Life Building", new Set(["new", "york"])) → ["life"]`.
  - `blankName("The Flatiron Building is in the Flatiron District.", ["Flatiron Building"], none)` → `["", "The Flatiron Building", " is in the ", "Flatiron", " District."]`.
  - `blankName` takes possessives and accents: `"Macy's flagship… Macy’s"` with name `"Macy's"` blanks both; `"El Edificio Telefónica"` with name `"Edificio Telefonica"` blanks `"El Edificio Telefónica"`.
  - `blankName` merges neighbours: `"the rebuilt World Trade Center site"` with name `"3 World Trade Center"` → the middle part is `"World Trade"` (one blank, `Center` left).
  - `blankName` leaves place words: name `"New York Life Building"`, placeWords `{new, york}`, text `"…in New York City."` → `New York` not blanked.
  - `kindOf({ n: "St. Patrick's Cathedral", t: "landmark" }) === "cathedral"`, `kindOf({ n: "Neue Galerie", t: "museum" }) === "museum"`, `kindOf({ n: "Olympic Tower", t: "building" }) === "general"`.
  - `pickDecoys` prefers the same kind over a nearer general sight (a museum answer, a general sight 100 m away, three museums 2 km away → the three museums).
  - `pickDecoys` borrows from general when the kind has fewer than four sights.
  - `pickDecoys` skips a candidate sharing a distinctive word (`"One World Trade Center"` never gets `"3 World Trade Center"`), one named in the visible text, and one with the answer's or a decoy's name (two `"Atlantic Terminal"` sights never both offered, nor offered against an `"Atlantic Terminal"` answer).
  - `pickDecoys` returns `null` with fewer than three candidates.
  - `buildQuiz` on four sights: same decoys in every locale; a locale whose text is too short after blanking drops that question only there (listed in `report.short`); `lang` copied from the text.

- [ ] **Step 2: Run them to see them fail**
  Run: `cd tinyworlds-pipeline && npx vitest run src/index/quiz.test.ts`
  Expected: FAIL, `quiz.js` not found.

- [ ] **Step 3: Implement `src/index/quiz.ts`** with the exports and rules above. No imports from `config.ts` (pure).

- [ ] **Step 4: Run the tests to see them pass**
  Run: `npx vitest run src/index/quiz.test.ts`
  Expected: PASS.

- [ ] **Step 5: Checkpoint**: `npm test && npm run lint` green in `tinyworlds-pipeline`.

### Task 2: Pipeline: the `quiz` step, deploy and data contract

**Files:**
- Create: `tinyworlds-pipeline/src/index/write-quiz.ts`
- Modify: `tinyworlds-pipeline/src/cli.ts` (new `quiz` command; `all` runs it after `wiki`)
- Modify: `tinyworlds-pipeline/src/cities/types.ts` (`sights.placeWords?: string[]`), `tinyworlds-pipeline/src/cities/tinynyc.ts`
- Modify: `deploy/deploy.sh` (`--index` uploads `quiz*.json`; `world_problems` checks them), `deploy/README.md`
- Modify: root `CLAUDE.md` (data contract), `tinyworlds-pipeline/CLAUDE.md` (commands, stages)
- Test: `tinyworlds-pipeline/src/index/write-quiz.test.ts`

**Interfaces:**
- Consumes: `buildQuiz`, `QUIZ_LOCALES` (Task 1); `stampIndexes(out, log)` (`src/index/stamp.ts`); `CITY`, `DIRS` (`src/config.ts`).
- Produces: `function writeQuiz(opts?: { out?: string; list?: boolean; placeWords?: string[]; log?: (m: string) => void }): void`. Reads `<out>/sights.json` and `<out>/sights.<locale>.json`; with no `sights.json` or no texts, logs `quiz: no sights with articles, nothing to ask` and returns. Writes `<out>/quiz.<locale>.json` as `{ questions: QuizQuestion[] }`, then `stampIndexes`. Logs `quiz: <n> questions; en-US <k>, pt-BR <k>, es-ES <k>`, plus each left-out name with its reason. With `list`, logs every question per locale as `<name> → <text with each blank as ▇>`. `placeWords` defaults to `CITY.sights?.placeWords ?? []`.
- CLI: `npm run cli -- --city tinynyc quiz [--out <dir>] [--list]`.
- tinynyc: `placeWords: ["New York", "New York City", "NYC", "Nueva York", "Nova Iorque", "Nova York"]`.

- [ ] **Step 1: Write the failing test** `write-quiz.test.ts`: in a temp dir with a `manifest.json`, a `sights.json` of five sights and three `sights.<locale>.json`, `writeQuiz({ out, placeWords: [] , log })` writes three `quiz.<locale>.json` whose questions have three decoys and `parts.join("")` equal to the source text, and the manifest's `indexes` changes. A dir with no `sights.json` writes nothing and does not throw.
- [ ] **Step 2: Run it to see it fail**: `npx vitest run src/index/write-quiz.test.ts` → FAIL.
- [ ] **Step 3: Implement `writeQuiz`**, the `quiz` command, `all` (`if (CITY.sights) { await buildWiki(); writeQuiz(); }`), the `placeWords` field (documented in `types.ts` like its neighbours) and tinynyc's list.
- [ ] **Step 4: Run it to see it pass**: `npx vitest run src/index/write-quiz.test.ts` → PASS.
- [ ] **Step 5: Run it on New York**: `npm run cli -- --city tinynyc quiz --list > <scratchpad>/quiz-list.txt`. Expected: about 390 questions per locale. Read the list through: no question may keep a distinctive word of its own name; fix the common-word lists (and add a Task 1 test for the case) where one does.
- [ ] **Step 6: Deploy script**: in the `--index` branch, add `"$data"/quiz*.json` to the loop that collects `sights*.json`; in `world_problems`, when `$FRONTEND/src/worlds/$world.ts` contains `quiz: true` and `$FRONTEND/public/data/$world/quiz.en-US.json` is missing, print `no quiz (run 'npm run cli -- --city $world quiz' in tinyworlds-pipeline)`. Run `bash -n deploy/deploy.sh` and `deploy/deploy.sh check` → no problem listed.
- [ ] **Step 7: Docs**: root `CLAUDE.md` data contract gains `quiz.<locale>.json` (tree line and a `### quiz.<locale>.json` section with the `QuizQuestion` shape, "optional: a world without it has no game"); `tinyworlds-pipeline/CLAUDE.md` gains the command and `index/quiz.ts`, `index/write-quiz.ts` in the tree; `deploy/README.md`'s `--index` line names the quiz files.
- [ ] **Step 8: Checkpoint**: `npm test && npm run lint` green in `tinyworlds-pipeline`.

### Task 3: API: answers and tallies

**Files:**
- Modify: `tinyworlds-api/prisma/schema.prisma` (model `QuizAnswer`, exactly as in the spec)
- Create: `tinyworlds-api/prisma/migrations/<timestamp>_quiz_answers/migration.sql` (via `npx prisma migrate dev --name quiz_answers`)
- Create: `tinyworlds-api/src/quiz/quiz.module.ts`, `quiz.resolver.ts`, `quiz.service.ts`, `dto/answer-quiz.input.ts`, `models/quiz-tally.model.ts`
- Modify: `tinyworlds-api/src/app.module.ts` (import `QuizModule`)
- Modify: `tinyworlds-api/test/fake-prisma.ts` (`quizAnswers` rows; `quizAnswer.createMany`, `quizAnswer.groupBy`)
- Modify: `tinyworlds-api/test/app.e2e-spec.ts` (truncate `quiz_answers`; a `describe('the quiz')`)
- Modify: `tinyworlds-api/CLAUDE.md`; root `CLAUDE.md` (API contract; "The API exists only for donations" line also names the game's answers)
- Test: `tinyworlds-api/src/quiz/quiz.service.spec.ts`

**Interfaces:**
- GraphQL (exact):
  ```graphql
  input AnswerQuizInput { visitId: ID  world: String!  sightId: String!  choice: String!  locale: String }
  type QuizPick { choice: String!  count: Int! }
  type QuizTally { answers: Int!  picks: [QuizPick!]! }
  type Mutation { answerQuiz(input: AnswerQuizInput!): QuizTally! }
  ```
- `export const SIGHT_ID_PATTERN = /^[a-z0-9][a-z0-9 :._-]{0,79}$/` (in `dto/answer-quiz.input.ts`); `visitId` `@IsOptional() @IsUUID()`; `world` `@Matches(WORLD_PATTERN)`; `sightId`, `choice` `@Matches(SIGHT_ID_PATTERN)`; `locale` `@IsOptional() @IsIn(LOCALES)`.
- `export const ANSWERS_PER_MINUTE = 30` (in `quiz.resolver.ts`), `@Throttle({ default: { limit: ANSWERS_PER_MINUTE, ttl: 60_000 } })`.
- `QuizService.answer(facts: { visitId?: string | null; world: string; sightId: string; choice: string; locale?: string | null }): Promise<QuizTally>`: with a `visitId`, `createMany({ data: [...], skipDuplicates: true })`; then `tally`.
- `QuizService.tally(world: string, sightId: string): Promise<QuizTally>`: `quizAnswer.groupBy({ by: ['choice'], where: { world, sightId }, _count: { _all: true } })`; `picks` sorted by count descending, then choice; `answers` their sum.

- [ ] **Step 1: Write the failing unit tests** (`quiz.service.spec.ts`, with `FakePrisma`):
  - `answer` records `{ visitId, world, sightId, choice, locale }` and returns `{ answers: 1, picks: [{ choice, count: 1 }] }`.
  - The same visit answering the same building again records nothing more and gets the same tally; another visit adds to it; the same visit on another building or world counts.
  - Without `visitId` nothing is recorded and the tally comes back.
  - `tally` orders picks by count, then by choice, and counts only that world's and building's rows.
- [ ] **Step 2: Run them to see them fail**: `cd tinyworlds-api && npx vitest run src/quiz` → FAIL.
- [ ] **Step 3: Schema and migration**: add the model; `npx prisma migrate dev --name quiz_answers` against the local Postgres (`docker compose up -d` if it is down); check the SQL makes `quiz_answers` with the unique `(visit_id, world, sight_id)` and the index `(world, sight_id)`.
- [ ] **Step 4: Implement** the module, service, resolver, DTO and models (each field with a `description`, like the funnel's), the fake's two calls, and register `QuizModule`.
- [ ] **Step 5: Run the unit tests to see them pass**: `npx vitest run src/quiz` → PASS.
- [ ] **Step 6: e2e tests** in `app.e2e-spec.ts`, `describe('the quiz')`:
  - two visits answer `b19j7udl` (one right, one `b1abc`), the second answer's tally is `{ answers: 2, picks: [...] }` with both; the first visit answering again changes nothing.
  - an answer without `visitId` is not stored (`prisma.quizAnswer.count()` unchanged) and gets the tally.
  - `visitId: 'me'`, `world: 'Tiny NYC'`, `sightId: 'B<script>'`, `locale: 'fr-FR'` each answer `BAD_REQUEST`, and nothing is stored.
  Run: `npm run test:e2e` → PASS.
- [ ] **Step 7: Docs**: `tinyworlds-api/CLAUDE.md` (the quiz module, the table, the once-per-visit rule, that the API keeps no copy of the questions); root `CLAUDE.md` API contract gains the input, the two types and the mutation, and its "How the pieces fit" line about the API says it also keeps the game's answers.
- [ ] **Step 8: Checkpoint**: `npm test && npm run lint` green in `tinyworlds-api`.

### Task 4: Viewer: a building held lit

**Files:**
- Modify: `tinyworlds-frontend/src/map/sight-state.ts`, `tinyworlds-frontend/src/map/engine.ts`
- Test: `tinyworlds-frontend/src/map/__tests__/sight-state.test.ts`

**Interfaces:**
- `SightState` gains `held?: string | null` (absent = none).
- `export function hold(s: SightState, id: string | null): SightState`: `id` → `{ hovered: null, pinned: null, leftAt: null, held: id }`; `null` → `{ hovered: null, pinned: null, leftAt: null, held: null }`.
- While `held` is set: `hover`, `leave`, `press`, `tap`, `release` and `keepInView` return the state unchanged; `shown` returns `{ id: held, pinned: true }`.
- `MapEngine.holdSight(id: string | null): void` → `this.setSightState(hold(this.sightState, id))` (the `sight` event fires as for a pin; the spotlight and the sight's picture follow as they do now).

- [ ] **Step 1: Write the failing tests** in `sight-state.test.ts`:
  - `hold` over a pinned and hovered state lights only the held one (`shown` → `{ id: "b", pinned: true }`).
  - While held: `hover(s, "c")`, `press(s, "c")`, `tap(s, null)`, `leave(s)`, `release(s)` and `keepInView(s, () => false)` all return `s` itself.
  - `hold(s, null)` leaves nothing lit (`shown` → `null`) and hovering works again.
- [ ] **Step 2: Run them to see them fail**: `cd tinyworlds-frontend && npx vitest run src/map/__tests__/sight-state.test.ts` → FAIL.
- [ ] **Step 3: Implement** `hold`, the guards, `shown`, and `MapEngine.holdSight` (documented beside `releaseSight`).
- [ ] **Step 4: Run them to see them pass** → PASS.
- [ ] **Step 5: Checkpoint**: `npm test && npm run lint && npm run typecheck` green in `tinyworlds-frontend`.

### Task 5: Viewer: quiz data and game logic (pure)

**Files:**
- Create: `tinyworlds-frontend/src/map/quiz.ts` (contract types, `parseQuiz`)
- Modify: `tinyworlds-frontend/src/map/data.ts` (`loadQuiz`)
- Create: `tinyworlds-frontend/src/lib/quiz.ts` (game logic), `tinyworlds-frontend/src/lib/quiz-api.ts` (the answer)
- Test: `tinyworlds-frontend/src/map/__tests__/quiz.test.ts`, `tinyworlds-frontend/src/lib/__tests__/quiz.test.ts`, `tinyworlds-frontend/src/lib/__tests__/quiz-api.test.ts`

**Interfaces:**
- `src/map/quiz.ts`: `interface QuizQuestion { id: string; decoys: [string, string, string]; parts: string[]; lang: string }`; `function parseQuiz(value: unknown): QuizQuestion[]` (keeps entries with a string `id`, three distinct string decoys none equal to `id`, a non-empty string array `parts`; `lang` defaults to `"en"`; anything else → `[]`).
- `src/map/data.ts`: `function loadQuiz(build: string, locale: Locale, signal?: AbortSignal): Promise<QuizQuestion[]>` through `getOptionalJson(dataUrl(\`quiz.${locale}.json\`, build), signal)`; a 404 is `[]`.
- `src/lib/quiz.ts`:
  - `interface QuizTally { answers: number; picks: { choice: string; count: number }[] }`
  - `type QuestionKind = "building" | "station" | "bridge" | "museum"`; `function questionKind(t: SightType): QuestionKind`
  - `function nextQuestion(questions: QuizQuestion[], played: ReadonlySet<string>, has: (id: string) => boolean, random: () => number): { question: QuizQuestion; played: Set<string> } | null`: usable = questions whose `id` and three decoys all pass `has`; pick at random among those not played; when none is left, start over with an empty played set; `null` when nothing is usable. The returned `played` includes the pick.
  - `function choicesFor(question: QuizQuestion, random: () => number): string[]`: the id and its decoys, Fisher–Yates shuffled.
  - `function tallyShares(tally: QuizTally, choices: string[]): { people: number; shares: Map<string, number> }`: counted over `choices` only; shares 0 when `people` is 0.
  - `const playedKey = (world: string) => \`${world}.quiz.played\``; `function loadPlayed(store: Pick<Storage, "getItem">, world: string): Set<string>`; `function savePlayed(store: Pick<Storage, "setItem">, world: string, played: ReadonlySet<string>): void` (JSON array; both swallow errors).
  - `interface Box { left: number; top: number; right: number; bottom: number }`; `function sightBox(rings: number[][]): Box`; `function roundView(box: Box, screen: { width: number; height: number }, free: Box, limits: { min: number; max: number }): { x: number; y: number; scale: number }`: scale fits the box into 60% of `free` on both axes, clamped to `[limits.min, min(limits.max, 2)]`, and snapped to 1 when between 0.55 and 1.6 (as `choosePlace` does); `x, y` put the box's centre at `free`'s centre on screen.
  - `type QuizState = { phase: "off" } | { phase: "empty" } | { phase: "loading"; round: number; right: number } | { phase: "asking"; round: number; right: number; question: QuizQuestion; choices: string[] } | { phase: "answered"; round: number; right: number; question: QuizQuestion; choices: string[]; pick: string; tally: QuizTally | null | "waiting" }`
  - `type QuizAction = { type: "start" } | { type: "ask"; question: QuizQuestion; choices: string[] } | { type: "pick"; choice: string } | { type: "tally"; sightId: string; tally: QuizTally | null } | { type: "next" } | { type: "fail" } | { type: "stop" }`
  - `function quizReducer(state: QuizState, action: QuizAction): QuizState`: `start` (from `off` or `empty`) → `loading { round: 0, right: 0 }`; `ask` (from `loading`) → `asking`, `round + 1`; `pick` (from `asking` only, the choice one of `choices`) → `answered`, `right + 1` when `choice === question.id`, `tally: "waiting"`; `tally` (from `answered` with `question.id === sightId`) sets it; `next` (from `answered`) → `loading` keeping `round` and `right`; `fail` → `empty`; `stop` → `off`; anything else returns `state` itself.
- `src/lib/quiz-api.ts`:
  - `const ANSWER = "mutation AnswerQuiz($input: AnswerQuizInput!) { answerQuiz(input: $input) { answers picks { choice count } } }"`
  - `function answerRequest(input: { visitId: string | null; world: string; sightId: string; choice: string; locale: Locale }): { query: string; variables: { input: Record<string, string> } }` (no `visitId` key when null)
  - `function parseTally(body: unknown): QuizTally | null`
  - `function sendAnswer(input: Omit<Parameters<typeof answerRequest>[0], "visitId">, opts?: { fetch?: typeof fetch; apiUrl?: string; visitId?: string | null; timeoutMs?: number }): Promise<QuizTally | null>`: defaults `API_URL`, `currentVisit()`, 5000 ms; `null` without an API, on a timeout (abort), an HTTP error, GraphQL `errors` or a malformed body; never throws.

- [ ] **Step 1: Write the failing tests**:
  - `map/__tests__/quiz.test.ts`: `parseQuiz` keeps a good question, drops one with two decoys, a decoy equal to its id, or empty `parts`; `parseQuiz(null)` → `[]`.
  - `lib/__tests__/quiz.test.ts`:
    - `nextQuestion` never returns a played question while unplayed ones remain; returns the only unplayed one with `random = () => 0.99`; starts over when all are played; **skips a question whose sight or any decoy fails `has`**; `null` when none is usable.
    - `choicesFor` returns the four ids, each once, in an order set by `random`.
    - `questionKind("station") === "station"`, `questionKind("landmark") === "building"`.
    - `tallyShares({ answers: 10, picks: [{a,6},{b,2},{gone,2}] }, ["a","b","c","d"])` → `people 8`, `a 0.75`, `b 0.25`, `c 0`.
    - **`loadPlayed` with a store whose `getItem` throws → empty set; `savePlayed` with a throwing `setItem` does not throw**; a round trip keeps the ids; garbage JSON → empty set.
    - `roundView`: the box's centre lands on the free area's centre (`(x - view.x) * scale + width/2` style check), scale clamped to `limits` and to 2, snapped to 1 for a box that would fit at 1.2.
    - `quizReducer`: start → loading → ask (round 1) → pick right (right 1, tally "waiting") → **a second pick is ignored** → tally for the question lands → **a tally for another sightId is ignored** → next → loading (round 1, right 1) → ask (round 2); `stop` from any phase → `off`; `fail` → `empty`.
  - `lib/__tests__/quiz-api.test.ts`: `answerRequest` omits `visitId` when null; `sendAnswer` returns the tally from `{ data: { answerQuiz: … } }`; **returns `null` for HTTP 500, for `{ errors: [...] }`, without an API URL (and makes no request), and when fetch never answers (fake timers past `timeoutMs`)**.
- [ ] **Step 2: Run them to see them fail**: `npx vitest run src/map/__tests__/quiz.test.ts src/lib/__tests__/quiz.test.ts src/lib/__tests__/quiz-api.test.ts` → FAIL.
- [ ] **Step 3: Implement** the three modules and `loadQuiz`.
- [ ] **Step 4: Run them to see them pass** → PASS.
- [ ] **Step 5: Checkpoint**: `npm test && npm run lint && npm run typecheck` green.

### Task 6: Viewer: the sign, the card and the map

**Files:**
- Create: `tinyworlds-frontend/src/components/map/quiz-banner.tsx`, `tinyworlds-frontend/src/components/map/quiz-card.tsx`, `tinyworlds-frontend/src/hooks/use-quiz.ts`
- Modify: `tinyworlds-frontend/src/components/map/map-app.tsx`, `tinyworlds-frontend/src/components/map/sight-sign.tsx` (`MAP_SIGNS`), `tinyworlds-frontend/src/app/globals.css`
- Modify: `tinyworlds-frontend/src/worlds/types.ts` (`quiz?: boolean`, documented: needs `sights`), `tinyworlds-frontend/src/worlds/tinynyc.ts` (`quiz: true`)
- Modify: `tinyworlds-frontend/src/lib/site-events.ts` (`"quiz_start"` in `SiteEventName`)
- Modify: `tinyworlds-frontend/src/i18n/types.ts`, `en.ts`, `pt-BR.ts`, `es-ES.ts`
- Modify: `tinyworlds-frontend/CLAUDE.md`

**Interfaces:**
- Consumes: Task 4 `engine.holdSight`; Task 5 everything; existing `loadSightTexts` texts through map-app's `litText` for the article link; `currentVisit()` inside `sendAnswer`; `siteEvent`.
- `Strings.quiz` (exact keys; English wording given, pt-BR and es-ES written to match):
  ```ts
  quiz: {
    invite: string;   // "Guess the building: can you name what you see?"
    title: string;    // "Guess the building"
    score: string;    // "round {round} · {right} right"
    close: string;    // "Stop playing"
    ask: { building: string; station: string; bridge: string; museum: string };
                      // "Which building is this?", "Which station is this?", "Which bridge is this?", "Which museum is this?"
    source: string;   // "From Wikipedia, with the name hidden"
    blank: string;    // "hidden name"
    right: string;    // "Right!"
    wrong: string;    // "Not quite. It's {name}."
    you: string;      // "you"
    people: { one: string; other: string };   // "{n} person has answered this one" / "{n} people have answered this one"
    first: string;    // "You're the first to answer this one."
    next: string;     // "Next building"
    stop: string;     // "Stop"
    loading: string;  // "Finding a building…"
    empty: string;    // "No buildings to guess right now."
  }
  ```
  The article link reuses `t.sight.readOn`.
- `useQuiz(args: { engine: MapEngine | null; sights: Sight[]; build: string | null; locale: Locale; compact: boolean }): { state: QuizState; sight: Sight | undefined; start(): void; pick(choice: string): void; next(): void; stop(): void }`:
  - keeps one `QuizQuestion[]` per locale (fetched with `loadQuiz` on `start`/`next` when missing; a failure or an empty list dispatches `fail`);
  - on `loading`: `nextQuestion(questions, played, id => sightById.has(id), Math.random)`, saves `played` (`localStorage`, `WORLD.id`), dispatches `ask` with `choicesFor`, calls `engine.holdSight(id)` and `engine.flyToMap(roundView(sightBox(sight.rings), view, free, engine.getScaleLimits()))` where `free` is `{ left: 16, top: 72, right: width - 448, bottom: height - 16 }` on a wide screen and `{ left: 0, top: 112, right: width, bottom: height * 0.5 }` when `compact`;
  - `pick`: dispatches `pick`, then `sendAnswer({ world: WORLD.id, sightId, choice, locale })` and dispatches `tally` with what comes back;
  - `stop`: dispatches `stop` and `engine.holdSight(null)`; also on unmount.
  - A language change during a round leaves the card as it is; the next round loads the new language's file.
- `QuizBanner({ onStart, className, style }: { onStart(): void; className?: string; style?: CSSProperties })`: a `<button>` with classes `quiz-invite sign …` in the `ExploreBanner` style (pixel "?" glyph in the accent, `t.quiz.invite`, `ArrowRight`), `data-rybbit-event="quiz_start"`, `data-rybbit-prop-world={SITE_ID}`, `onClick` → `siteEvent("quiz_start", { world: SITE_ID })` and `onStart()`.
- `QuizCard({ state, sights, article, onPick, onNext, onStop }: { state: Exclude<QuizState, { phase: "off" }>; sights: Map<string, Sight>; article: SightText | undefined; onPick(id: string): void; onNext(): void; onStop(): void })`: `role="group"`, `aria-label={t.quiz.title}`, class `quiz-card sign`; the layout of the mockup's frames 2 and 3:
  - header: `t.quiz.title` in the pixel face (`font-pixel`, accent), `t.quiz.score` (`round` and `right` filled), a close `bullet` (`aria-label={t.quiz.close}`);
  - `loading`: `t.quiz.loading`; `empty`: `t.quiz.empty` and the Stop button;
  - `asking`: `t.quiz.ask[questionKind(sight.t)]`; the text with `lang={question.lang}`, each odd part an inline bar of one fixed width (`inline-block w-[4.5em] h-[0.9em] bg-paper align-[-0.1em]`, `aria-label={t.quiz.blank}`, `role="img"`); `t.quiz.source` small and dim under it; four buttons keyed A–D with the sights' names;
  - `answered`: the verdict (`t.quiz.right`, or `t.quiz.wrong` with `{name}`); the text whole, odd parts in the accent and bold; the buttons disabled, the right one `bg-taxi text-taxi-ink`, the visitor's pick marked with a left bar in a red that reads on the sign and `· {t.quiz.you}`; once the tally is in (not `"waiting"`, not `null`): a bar behind each name at its share and the whole percentage (`Intl.NumberFormat(locale, { style: "percent" })`), and the people line (`t.quiz.first` when `people === 1`, else `t.quiz.people` by `Intl.PluralRules`, the number by `Intl.NumberFormat`); `Next building →` (`autoFocus`, `bg-taxi`), `Stop`, and `t.sight.readOn` linking `article.url` in a new tab when `article` is there.
  - Placement: `fixed` at `top-(--edge-t) right-[calc(var(--edge-r)+3.75rem)] w-[25rem]` from `sm`; below `sm` a sheet `bottom-(--edge-b) left-(--edge-l) right-(--edge-r) max-h-[55vh] overflow-y-auto`.
- `map-app.tsx`:
  - `ExploreBanner` and `QuizBanner` stack in one fixed column at the banner's current place (`flex flex-col gap-2`); `QuizBanner` shows only when `WORLD.quiz`, `sights.length > 0` and `state.phase === "off"`.
  - While `asking`, `loading` or `empty`, no `SightSign`; while `answered`, `<SightSign sight={the question's sight} text={undefined} pinned={false} onClose={() => {}} />` (its name only); otherwise as now.
  - `QuizCard` rendered when `state.phase !== "off"`, with `article` = map-app's text for the held sight.
  - Keys: while `asking`, `a`–`d` and `1`–`4` pick (before the `b`/`d` toggles); while `answered`, `Enter` and `n` go to the next building; `Escape` stops the game first when one is on.
- `sight-sign.tsx`: `MAP_SIGNS` adds `.map-root .quiz-invite, .map-root .quiz-card`.
- `globals.css`: the rule hiding `.other-places` while the search box is in use also hides `.quiz-invite`.

- [ ] **Step 1: Strings**: add `quiz` to `Strings` and the three dictionaries. Run `npx vitest run src/i18n` → PASS (same keys and placeholders everywhere).
- [ ] **Step 2: World flag, site event, `MAP_SIGNS`, CSS** as above. `npm run typecheck` → green.
- [ ] **Step 3: `useQuiz`, `QuizBanner`, `QuizCard`** as specified.
- [ ] **Step 4: Wire `map-app.tsx`** (layout column, signs, card, keys).
- [ ] **Step 5: Run it**: `NEXT_PUBLIC_API_URL=http://localhost:4000/api/graphql npm run dev` with the API up (Task 3) and `public/data/tinynyc` holding the Task 2 quiz files. In a browser at `http://localhost:3000`, check: the sign appears under the banner once the map settles; a tap flies to a lit building whose name sign stays hidden; four names; a pick shows the verdict, the name sign, the shares and the people line; Next goes on; Esc or Stop ends it with nothing lit and the map where it was; keys A–D/1–4/Enter/Esc work; at 390 px wide the card is a bottom sheet with the building above it; with the API stopped a round still ends (no shares); switching the language in settings changes the next round's text.
- [ ] **Step 6: Docs**: `tinyworlds-frontend/CLAUDE.md` gains a "Guess the building" section (files, data, the hold, the card's states, the keys, the API fallback, `quiz_start`) and `quiz_start` in the analytics list.
- [ ] **Step 7: Checkpoint**: `npm test && npm run lint && npm run typecheck` green in `tinyworlds-frontend`.

### Task 7: Whole-branch check

- [ ] **Step 1**: `deploy/deploy.sh check` lists no problem.
- [ ] **Step 2**: `npm test && npm run lint` in all three sub-projects; `npm run test:e2e` and `npm run build` in `tinyworlds-api`; `npm run typecheck` in `tinyworlds-frontend`.
- [ ] **Step 3**: `git diff` and `git status` hold no deployment detail (domain, host, ids, keys) and no stray file; the spec's goals each have their code.
