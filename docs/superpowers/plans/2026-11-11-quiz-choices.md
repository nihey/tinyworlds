# Quiz Choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guess the building gets a choosing step (difficulty, borough, kind), finite games with an end, and wrong answers that follow the choice.

**Architecture:** The pipeline measures fame (Wikipedia page views, cached), gives each question a level, group and area, and writes per difficulty four decoy sets (scopes all / area / group / both). The API keeps answers per level. The viewer adds a `choosing` and a `finished` phase, filters questions by the choice, queues them, and picks the set for the game's difficulty and scope.

**Tech Stack:** as the first plan (`2026-11-11-guess-the-building.md`).

**Spec:** `docs/superpowers/specs/2026-11-11-quiz-choices-design.md`.

## Global Constraints

- No commits until the owner asks; each task ends with its sub-project's tests and lint green (pipeline lint skips the untracked `silhouette-tmp.mjs`).
- Backward compatible data: `decoys` stays (hard, scope all), so the live viewer keeps working.
- The API accepts answers without `level` (= `HARD`) so the live viewer keeps working; deploy the API first.
- Every new word in en-US, pt-BR, es-ES; public repository rules; docs in each `CLAUDE.md` and the root contracts.

## Review Focus

- **Empty and tiny choices**: a chip that would leave 0 questions cannot be pressed; a current selection emptied by another change falls back ("What", then "Borough", to All); "Only N" from N ≤ 10. Test: Task 4 `countFor`/`fixChoice`.
- **A filtered game's answer standing out**: with a borough or kind chosen and enough candidates, all three wrong answers share the answer's area / group. Test: Task 2 `buildQuiz` scope sets.
- **Easy giving the same names every round**: easy sets ordered by closeness in fame, at most one per group while others remain. Test: Task 2.
- **The end of a game**: after the N-th answer, Next leads to `finished`, never to an empty round; Play again restarts the same choice. Test: Task 4 reducer.
- **Old data / old viewer**: a question without `sets` (an older file) still plays with `decoys`; an answer without `level` counts as HARD. Tests: Task 4 `setFor`, Task 3 service.

---

### Task 1: Pipeline: fame from page views

**Files:** Create `tinyworlds-pipeline/src/index/fame.ts`; Test `tinyworlds-pipeline/src/index/fame.test.ts`.

**Interfaces:**
- `function viewsWindow(today: Date): { start: string; end: string }`: the last 12 complete months, as `YYYYMM0100` / `YYYYMMDD00` (end = last day of the previous month).
- `function titleOf(url: string): string | null`: the article title from an English Wikipedia URL, as the URL has it (`Flatiron_Building`, percent-encoding kept).
- `async function pageViews(http: Http, titles: string[], window: { start: string; end: string }, log?): Promise<Map<string, number>>`: one request per title to `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/<title>/monthly/<start>/<end>`, summing `items[].views`; a missing page or a failed request is 0.
- `function loadWindow(file: string, today: Date, force: boolean): { start: string; end: string }`: the window kept in `file` (JSON), written on first use or with `force`, so reruns ask the same URLs (offline through the cache).

- [ ] Step 1: tests: `viewsWindow(new Date("2026-11-11"))` → `{ start: "2025110100", end: "2026103100" }`; `titleOf("https://en.wikipedia.org/wiki/Avenue_J_station_(BMT_Brighton_Line)")` → `"Avenue_J_station_(BMT_Brighton_Line)"`, a non-wikipedia URL → null; `pageViews` with a fake `Http` sums items, gives 0 for null and for a throwing get; `loadWindow` keeps the first window across calls with another date and replaces it with `force`.
- [ ] Step 2: run, see them fail; Step 3: implement; Step 4: pass; Step 5: `npm test && lint`.

### Task 2: Pipeline: levels, groups, areas and decoy sets

**Files:** Modify `tinyworlds-pipeline/src/index/quiz.ts`, `write-quiz.ts`, their tests; `tinyworlds-pipeline/CLAUDE.md`; root `CLAUDE.md` (data contract).

**Interfaces:**
- `type QuizLevelName = "easy" | "medium" | "hard"`; `type Scope = "all" | "area" | "group" | "both"`; `type Group = "buildings" | "museums" | "landmarks" | "stations"`.
- `kindOf` gains the kind `monument` (statue, sculpture, monument, memorial, obelisk, arch, fountain, in the opening).
- `function groupOf(kind: string): Group` (general/hotel/school → buildings; museum/library → museums; bridge/stadium/venue/worship/monument → landmarks; station → stations).
- `function levelsOf(views: number[]): (1 | 2 | 3)[]` (by rank: top 25% → 1, up to 60% → 2, rest 3; ties by input order).
- `QuizSight` gains `views?: number`, `level?: 1|2|3`, `group?: Group`, `area?: string`.
- `QuizQuestion` gains `sets: Partial<Record<QuizLevelName, Partial<Record<Scope, [string,string,string]>>>>` (a scope's set omitted when equal to that level's `all`), `level`, `group`, `area?`; `decoys` = `sets.hard.all`.
- `buildQuiz(sights, texts, placeWords, aliases = {}, opts: { views?: Record<string, number>; areas?: string[] } = {})`: views by sight id; areas = the city's district names (a sight's `b` counts only if listed). Report gains `borrowed: Record<QuizLevelName, number>`.
- `writeQuiz` fetches views (Task 1, cache `data/<city>/raw/wikipedia/`, window file `pageviews-window.json` there; `opts.views` to inject in tests; `--force-views`) and areas from `places.json` (`t === "borough"`).

Selection (spec "Decoys per difficulty and scope"): candidates = questions with level ≤ the difficulty's (1/2/3), not the answer, passing the existing exclusions; scoped by area / group; ordered per difficulty (hard: same kind, distance; medium: same kind, |log views difference|; easy: kind free → other groups first, then |log Δ|, one per group while others remain; kind fixed → other kinds first, then |log Δ|); borrow from the same difficulty outside the scope (keep group before area), then from any level.

- [ ] Step 1: tests (RED): `groupOf`; `kindOf` → `monument` for "is a colossal sculpture"; `levelsOf([9,1,5,3])`; `buildQuiz` on a small city (two areas, two groups, varied views): (a) every `area` set's three share the answer's area when the area has ≥ 3 candidates; (b) `group` sets share its group; (c) easy `all` set has three groups other than the answer's when available; (d) a level-3 question has only `hard` sets, a level-1 has all three; (e) a lone-area question's `area` set borrows and the report counts it; (f) `decoys` equals `sets.hard.all`; (g) easy sets over several answers use more than three distinct names (spread).
- [ ] Step 2–4: fail, implement, pass. Step 5: run on New York (`quiz --list`), check: no leaks (scan), level sizes ~98/138/157, a Bronx easy game's `area` sets are Bronx names. Step 6: docs. Step 7: `npm test && lint && tsc`.

### Task 3: API: answers per level

**Files:** `tinyworlds-api/prisma/schema.prisma` (+ migration `20261111230000_quiz_level`), `src/quiz/*`, `test/fake-prisma.ts`, `test/app.e2e-spec.ts`, `CLAUDE.md` (API and root contract).

**Interfaces:** `enum QuizLevel { EASY MEDIUM HARD }` (registered for GraphQL); `QuizAnswer.level QuizLevel @default(HARD)`; unique `(visit_id, world, sight_id, level)`; `AnswerQuizInput.level?: QuizLevel`; `QuizService.answer(facts & { level?: QuizLevel })`, `tally(world, sightId, choices?, level = 'HARD')`.

- [ ] Step 1: tests (RED): the same visit answers a building on EASY and on HARD → two rows, tallies separate; no `level` → HARD; e2e: `level: EASY` tally excludes HARD answers; an unknown level → 400 from GraphQL.
- [ ] Step 2–4; migration SQL checked by hand (adds the enum, the column with default, swaps the unique index); `prisma generate`; Step 5: unit + e2e + lint + typecheck + build.

### Task 4: Viewer: choices, games and data (pure)

**Files:** `tinyworlds-frontend/src/map/quiz.ts` (parse the new fields, tolerant of old files), `src/lib/quiz.ts`, `src/lib/quiz-api.ts` (send `level`), tests.

**Interfaces (lib/quiz.ts):**
- `type QuizLevelName = "easy" | "medium" | "hard"`; `type Group = …`; `interface QuizChoice { level: QuizLevelName; area: string | null; group: Group | null }`; `DEFAULT_CHOICE = { level: "easy", area: null, group: null }`.
- `function inChoice(q: QuizQuestion, c: QuizChoice): boolean` (level ≤ c.level and has that level's set, area and group match).
- `function countFor(questions, c): number`; `function chipCounts(questions, c): { levels: Record<QuizLevelName, number>; areas: Map<string, number>; groups: Map<Group, number> }` (each with the other two rows fixed); `function fixChoice(questions, c): QuizChoice` (resets group, then area, to null while the count is 0); `function areasOf(questions): string[]` (most questions first).
- `function scopeOf(c): Scope`; `function setFor(q, c): [string,string,string]` (`sets[level][scope] ?? sets[level].all ?? decoys`).
- `function gameOrder(questions, c, played, random): string[]` (matching ids, shuffled, played-before last).
- `loadChoice/saveChoice(store, world)` (`<world>.quiz.choice`), try/catch, validated.
- `QuizState` phases: `off | choosing | loading | asking | answered | finished | empty`; game fields `{ choice, queue: string[], index, right }` (round = index + 1, of = queue.length). Actions: `open`, `start {choice, queue}`, `ask {question, choices}`, `pick`, `tally`, `next` (→ `loading`, or `finished` after the last), `change` (→ `choosing`), `again {queue}`, `fail`, `stop`.
- `quizKey`: in `choosing`, Enter → `"start"`; in `finished`, Enter → `"again"`.
- `answerRequest`/`sendAnswer` input gains `level: QuizLevelName` (sent as `EASY|MEDIUM|HARD`).

- [ ] Step 1: tests (RED) for each function: parse old and new files; `inChoice` levels cumulative; `chipCounts` zero for an impossible chip; `fixChoice` order; `setFor` fallbacks; `gameOrder` played last; reducer through choose → 2 rounds → finished → again → change → stop, `next` after the last never `loading`; `quizKey` additions; `answerRequest` carries `level`.
- [ ] Step 2–5: fail, implement, pass, `npm test && lint && typecheck`.

### Task 5: Viewer: the choosing step, the header, the end

**Files:** `src/components/map/quiz-card.tsx` (+ maybe `quiz-choose.tsx`), `src/hooks/use-quiz.ts`, `src/components/map/map-app.tsx` (keys, open), i18n ×4, `tinyworlds-frontend/CLAUDE.md`.

**Interfaces:** `Strings.quiz` gains `levels: Record<QuizLevelName, { name: string; line: string }>`, `groups: Record<Group | "all", string>` (Stations for `stations`), `allAreas`, `difficulty`, `area`, `what`, `count: { one; other }` ("{n} building(s) in this game"), `few: { one; other }` ("Only {n} …"), `start`, `change` (gear aria-label), `of` ("round {round} of {total}" forms: `score` gains `{total}`), `end: { one; other }` ("You named {right} of {total}"), `again`, `changeChoice`. `useQuiz` gains `open()`, `start(choice)`, `again()`, `change()`, `choice`, `questions` (for the choosing step's counts).

- [ ] Step 1: strings + i18n test. Step 2: card states (choosing with chips and count, header tags + gear + "round r of N", finished). Step 3: hook (load questions on `open`, remembered choice, queue, level in answers). Step 4: keys. Step 5: run in Chrome against the local API: choose, play to the end of a small game (Staten Island), again, change, a struck-out chip, phone width. Step 6: docs. Step 7: `npm test && lint && typecheck`.

### Task 6: Whole check

- [ ] `deploy/deploy.sh check`; all suites, lints, types, API build and e2e; leak scan on the new files; `git diff` free of deployment details.
