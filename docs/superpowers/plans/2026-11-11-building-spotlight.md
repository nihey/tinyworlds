# Building spotlight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In `tinynyc`, a building found in the search lights up under the pointer (the rest of
the map dims, a thin accent contour) with a sign giving its type, name, the opening of its
Wikipedia article in the visitor's language and a link to it; a click or tap pins the sign.

**Architecture:** The pipeline's `index` step picks the sights from the search entries, finds
each one's volumes in the scene and writes their drawn silhouettes to `sights.json`; a new
`wiki` step matches each sight to a Wikipedia article (cached, offline) and writes
`sights.<locale>.json`. The viewer loads the shapes after the first paint, hit-tests and draws
the spotlight on the marks canvas, and shows a React sign beside it.

**Tech Stack:** pipeline: TypeScript ESM, DuckDB, vitest, `polygon-clipping@0.15.7` (new);
viewer: Next.js 16 static export, React 19, canvas 2D, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-building-spotlight-design.md`

## Global Constraints

- Work in a git worktree off `origin/main` (`superpowers:using-git-worktrees`): another session
  has uncommitted changes in `tinyworlds-frontend` (consent, About, i18n) and `deploy/`. In the
  worktree, symlink `tinyworlds-pipeline/data` and `tinyworlds-frontend/public/data` to the main
  checkout's (generated, gitignored) and run `npm ci` in both sub-projects.
- The repository is public: no domain, host or ids in any file. The Wikipedia `User-Agent` is
  `tinyworlds-pipeline/0.1 (https://github.com/nihey/tinyworlds)`; no e-mail address.
- No hard-coded interface strings: every new word in `en.ts`, `pt-BR.ts`, `es-ES.ts`.
- Existing tiles must not change: after any scene change, `preview` Midtown, DUMBO and Citi Field
  before and after and `cmp` them (byte-identical).
- Dim: `rgb(12 14 16 / 0.58)`; contour: the world's accent (`TAXI` in `engine.ts`), 2 CSS px.
- Description: the article's opening, cut at a sentence end, at most 220 characters.
- Geosearch radius 300 m; a point snaps to a footprint within 4 m; a statue within 30 m; a bridge
  tower belongs to the bridge whose deck passes within 40 m.
- Sight types: a `PlaceType` or `"building"` (named by the building's own name).
- Run `npm run lint` and `npm test` in each touched sub-project before every commit. Commit
  messages follow the repo's style (an imperative sentence, no prefix) and end with the
  session's `Claude-Session:` line.

## Review Focus

- A world without sights never asks for `sights.json` (`World.sights` unset), and a data set
  missing `sights.json` or `sights.<locale>.json` leaves the map as today: no spotlight, no
  error dialog. → Task 7 tests 404s; Task 9 gates loading on `WORLD.sights`.
- A sight with no article in any language: the sign shows kicker and name only, no empty
  paragraph, no dead link. → Task 9 test on `signContent`.
- The pointer moving across a dense cluster of towers: one event per change of sight, none
  while it stays on the same one, and leaving all buildings clears it. → Task 8 reducer tests.
- The visitor switches language with a sign pinned: the text reloads in the new language.
  → Task 9 test on `textsFor`.
- A tall building whose anchor is off the top of the screen, or near an edge: the sign stays
  fully inside the viewport. → Task 9 tests on `placeSign`.

---

### Task 1: Scene records who owns the bridge and statue volumes

**Files:**
- Create: `tinyworlds-pipeline/src/scene/owners.ts`, `tinyworlds-pipeline/src/scene/owners.test.ts`
- Modify: `tinyworlds-pipeline/src/scene/build.ts` (segment query ~L717: add `names."primary"`;
  `bridgePieces` gains `name`; deck emission ~L1444; supports ~L1307; statues ~L1637; write
  `owners.json` next to the scene at the end)

**Interfaces:**
- Produces: `interface Owners { bridges: { name: string; vols: number[] }[]; statues: { lon: number; lat: number; vols: number[] }[] }`;
  `function nearestBridge(x: number, y: number, decks: { name: string; xy: number[] }[], maxPx: number): string | null`
  (decks' `xy` flat map px of their pieces' points); file `DIRS.scene/owners.json` (JSON `Owners`).

- [ ] **Step 1: Write the failing tests** in `owners.test.ts`:
  `nearestBridge` returns `"Brooklyn Bridge"` for a point 10 px from its deck and `null` for a
  point 60 px from every deck with `maxPx = 40`; with two decks it returns the nearer one's name.
- [ ] **Step 2:** `npx vitest run src/scene/owners.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `nearestBridge` (distance to the decks' segments) in `owners.ts`.
  In `build.ts`: a deck step's volume index is `volumes.count` before `addShape` when the count
  grew after it; record it under the piece's segment name (skip unnamed pieces). Each support
  volume goes to `nearestBridge(...)` with `maxPx = 40 * proj.pxPerMetre`. Each statue's pieces
  go to `statues[i]` with the statue's lon/lat. Write `owners.json` with `JSON.stringify`.
- [ ] **Step 4:** tests PASS; `npm run cli -- --city tinynyc scene`; then
  `node -e "const o=require('./data/tinynyc/scene/owners.json');console.log(o.bridges.find(b=>b.name==='Brooklyn Bridge')?.vols.length, o.statues.length)"`
  prints a positive number and `1`. Previews of Midtown/DUMBO/Citi Field `cmp` identical to
  ones taken before the change.
- [ ] **Step 5: Commit** "Record which volumes belong to each bridge and statue".

### Task 2: Silhouettes

**Files:**
- Create: `tinyworlds-pipeline/src/index/silhouette.ts`, `tinyworlds-pipeline/src/index/silhouette.test.ts`
- Modify: `tinyworlds-pipeline/package.json` (`npm i polygon-clipping@0.15.7`)

**Interfaces:**
- Produces: `interface Piece { rings: number[][]; lift: number; rise: number }` (ground rings as
  flat map px; `lift` px from the ground to the piece's base; `rise` px from the ground to its
  top, roof included); `function silhouette(pieces: Piece[], tolerance?: number): number[][]`
  (flat rings, even-odd, coordinates rounded to 0.5 px; `tolerance` px for Douglas–Peucker,
  default 1).

- [ ] **Step 1: Write the failing tests:**
  - one square footprint `[0,0, 10,0, 10,10, 0,10]` with `lift 0, rise 20` → one ring whose
    bounding box is x 0..10, y −20..10;
  - two squares that touch → one ring;
  - a piece with `lift 5, rise 8` (a deck in the air) → bounding box y −8..5;
  - a donut footprint (outer + hole), `rise 2` → two rings (the hole survives).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**: per piece, the ring at `−lift`, the ring at `−rise` and one quad per
  edge between them; `union` them all with `polygon-clipping`; simplify each ring; flatten.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** "Draw the outline of a building as the map shows it".

### Task 3: Which entries are sights, and what they are called

**Files:**
- Create: `tinyworlds-pipeline/src/index/sights.ts`, `tinyworlds-pipeline/src/index/sights.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type Source = "curated" | "building" | "poi" | "station";
  type SightType = PlaceType | "building";
  interface Candidate { n: string; t: PlaceType; b?: string; r: number; lon: number; lat: number; order: number; src: Source; seed?: number }
  interface Found { key: string; vols: number[]; seed?: number }
  interface SightDraft { key: string; vols: number[]; n: string; t: SightType; b?: string; lon: number; lat: number }
  function resolveSights(cands: Candidate[], find: (c: Candidate) => Found | null, ownName: (seed: number) => string | undefined): SightDraft[]
  ```
  (`PlaceType` exported from `index/build.ts`.)

- [ ] **Step 1: Write the failing tests** (`find` and `ownName` are stubs):
  - "Metropolitan Museum of Art" (curated) and "The Met" (poi) on one key → one sight named
    "Metropolitan Museum of Art";
  - a building with own name "One World Trade Center", candidates "America's Response
    Monument" (poi, r 34) and "One World Trade Center" (curated) → named "One World Trade Center";
  - own name "555TEN", only candidate "Union Station, Washington DC" (poi) → named "555TEN",
    `t: "building"`;
  - no own name, two poi candidates r 34 with `order` 7 and 3 → named by `order` 3;
  - a candidate for which `find` returns `null` → no sight;
  - `lon`/`lat` of a sight are those of the entry that named it (the own-name case: the best
    candidate's).
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** `resolveSights`: group by `Found.key`; name by curated (highest `r`)
  → own name of `Found.seed` → best `r`, then lowest `order`. Output ordered by the naming
  entry's `r` descending, then `order`.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** "Decide which search entries are sights and what to call them".

### Task 4: Finding a sight's structure in the scene

**Files:**
- Create: `tinyworlds-pipeline/src/index/structures.ts`, `tinyworlds-pipeline/src/index/structures.test.ts`

**Interfaces:**
- Consumes: `Scene` (`render/scene.ts`: `vol.ringStart/vertStart/xy/bbox/seed/base/top/roofH`),
  `Owners` (Task 1), `Candidate`/`Found` (Task 3), `Projection`.
- Produces: `interface Stands { ring: number[]; seeds: number[] }` (ring in map px);
  `function makeFinder(scene: Scene, owners: Owners, proj: Projection, stands: Stands[]): (c: Candidate) => Found | null`;
  `function piecesOf(scene: Scene, vols: number[]): Piece[]` (Task 2's `Piece`).
  Keys: `b<seed in base 36>`, `bridge:<lower-case name>`, `statue:<index>`.

- [ ] **Step 1: Write the failing tests** on a hand-built three-volume scene (two volumes with
  seed 7 side by side, one with seed 9 apart):
  - a point inside seed 7's first footprint → both seed-7 volumes, key `b7`;
  - a point 3 m outside it → the same; 6 m outside → `null`;
  - a `building` candidate with `seed: 9` whose point is elsewhere → seed 9's volume;
  - a `bridge` candidate "Brooklyn Bridge" with `owners.bridges` holding that name → its vols,
    key `bridge:brooklyn bridge`; a bridge name not in owners → `null`;
  - a point 20 m from `owners.statues[0]` → key `statue:0`;
  - a point inside a `Stands` ring → the volumes of its seeds;
  - `piecesOf` gives `lift = base`, `rise = top + roofH`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement**: a bucket grid (256 px cells) over volume bboxes; order of tests:
  bridge (by `t === "bridge"`), statue, stands, `seed` (building entries), footprint (inside,
  else nearest edge within `4 * proj.pxPerMetre`). A seed's volumes are those with that seed
  whose bboxes lie within 300 m of the hit.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** "Find the building, stands, statue or bridge a search entry names".

### Task 5: The index writes `sights.json`

**Files:**
- Modify: `tinyworlds-pipeline/src/cities/types.ts` (`Curated.sight?: boolean`;
  `City.sights?: { wikipedia?: Record<string, string | null> }`), `src/cities/tinynyc.ts`
  (`sights: {}`), `src/cities/tinynyc.places.ts` (`sight: true` on curated structures),
  `src/index/build.ts`
- Test: `tinyworlds-pipeline/src/index/sights.test.ts` (one more case)

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `out/sights.json` = `{ sights: { id, n, t, b?, lon, lat, rings, front, anchor }[] }`
  (`id` = the key; `front` = max ground y of the footprints; `anchor` = `[x, y]` of the
  silhouette's topmost point); exported `toSightFile(drafts, scene): object` for the test.

- [ ] **Step 1: Write the failing test**: `toSightFile` on one draft over a one-volume scene
  gives `front` = the footprint's max y and `anchor[1]` = the silhouette's min y.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** In `buildIndex` (only when `CITY.sights`):
  - `Place` gets internal `src`, `seed`, `sight` fields, stripped when `places.json` is written;
  - curated entries are candidates only with `sight: true`; "buildings with a name" select `id`
    and carry `seed = hashString(id)` (`scene/hash.ts`); POIs are candidates except categories
    `college_university`, `airport`, `zoo`, `amusement_park`; subway/rail stations are
    candidates; streets, hoods, boroughs and parks never are;
  - `ownName`: `SELECT id, names."primary"` of named buildings → `Map<seed, name>`;
  - `Stands`: each `land_use` `class = 'stadium'` polygon (projected ring) with the seeds of the
    `grandstand`/`stadium` buildings whose `ST_PointOnSurface` it contains;
  - `loadScene(DIRS.scene)`, `owners.json`, `makeFinder`, `resolveSights`, `silhouette(piecesOf(...))`;
  - log `sights: N (by source …)`.
  Flag `sight: true` in `tinynyc.places.ts` on every curated entry that is one building,
  stadium, statue or bridge (Empire State, Chrysler, One WTC, Flatiron, Yankee Stadium, Citi
  Field, Madison Square Garden, Grand Central, the museums, the bridges, …), never on areas
  (Times Square, Wall Street, Rockefeller Center, Hudson Yards, Coney Island, Central Park, the
  airports, Ellis Island, Roosevelt Island, Lincoln Center, the universities).
- [ ] **Step 4:** tests PASS; `npm run cli -- --city tinynyc index`; then check with node:
  the count is between 1,000 and 1,600; "Empire State Building", "One World Trade Center",
  "Yankee Stadium", "Citi Field", "Brooklyn Bridge", "Statue of Liberty" are sights; no sight is
  named "Wall Street", "Times Square", "Rockefeller Center" or "Hudson Yards"; 555TEN's sight
  is called "555TEN". `places.json` is byte-identical to the one before this task.
- [ ] **Step 5: Commit** "Write the sights: what lights up under the pointer, and its outline".

### Task 6: The `wiki` step

**Files:**
- Create: `tinyworlds-pipeline/src/index/wiki.ts`, `tinyworlds-pipeline/src/index/wiki.test.ts`
- Modify: `src/env.ts` (`WIKI_USER_AGENT`), `src/cli.ts` (command `wiki [--force]`; `all` runs
  it after `index` when `CITY.sights`)

**Interfaces:**
- Consumes: `out/sights.json`, `CITY.sights.wikipedia` (overrides keyed by lower-case sight
  name: an English title, or `null` for none).
- Produces: `out/sights.en-US.json`, `sights.pt-BR.json`, `sights.es-ES.json`, each
  `{ [id]: { title: string; url: string; text: string; lang: "en" | "pt" | "es" } }`; cache in
  `DIRS.raw/wikipedia/<sha1 of url>.json`. Pure exports: `normalizeTitle(s: string): string`,
  `titleMatches(name: string, title: string): boolean`, `excerpt(text: string, max?: number): string`;
  `interface Http { get(url: string): Promise<unknown> }`;
  `function cachedHttp(dir: string, fetchImpl: typeof fetch, opts: { force: boolean; delayMs: number }): Http`;
  `function articleFor(http: Http, sight: { n: string; lon: number; lat: number }, override?: string | null): Promise<Record<"en" | "pt" | "es", { title: string; url: string; text: string } | undefined>>`;
  `function buildWiki(opts: { out?: string; force?: boolean; log?: (m: string) => void }): Promise<void>`.

- [ ] **Step 1: Write the failing tests:**
  - `titleMatches("The Met", "Met")`, `titleMatches("Flatiron Building", "Flatiron Building")`,
    `titleMatches("Citi Field", "Citi Field (stadium)")` are true;
    `titleMatches("Wall Street", "40 Wall Street")` and
    `titleMatches("America's Response Monument", "One World Trade Center")` are false;
    `normalizeTitle("Café   Wha?")` is `"cafe wha"`;
  - `excerpt` keeps two short sentences, stops before a third that would pass 220 characters,
    and cuts a single 300-character sentence at a word with "…";
  - `articleFor` with a stub `Http`: geosearch lists "Empire State Building" → English summary,
    Portuguese and Spanish from the language links; a `disambiguation` summary is skipped; no
    Spanish link → `es` undefined; override `null` → all undefined without any request;
  - `cachedHttp` calls `fetchImpl` once for the same URL twice, and again with `force`.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** Geosearch:
  `https://en.wikipedia.org/w/api.php?action=query&list=geosearch&gscoord=<lat>|<lon>&gsradius=300&gslimit=50&format=json&formatversion=2`;
  links: `…&prop=langlinks&titles=<t>&lllimit=500&redirects=1`; summaries:
  `https://<lang>.wikipedia.org/api/rest_v1/page/summary/<title>` (`type`, `extract`,
  `content_urls.desktop.page`). Sequential, `delayMs` 100, `User-Agent: WIKI_USER_AGENT`; a
  failed request is logged and treated as no article. `buildWiki` writes each locale's file
  with the English entry where its language has none.
- [ ] **Step 4:** tests PASS; `npm run cli -- --city tinynyc wiki`; the log reports matches;
  `sights.en-US.json` has "Empire State Building" with a `https://en.wikipedia.org/` URL. Look
  over 30 random matches by hand and add overrides for any wrong one. Run again: no network
  (the cache answers), identical files.
- [ ] **Step 5: Commit** "Match the sights to their Wikipedia articles".

### Task 7: The viewer reads the sights

**Files:**
- Create: `tinyworlds-frontend/src/map/sights.ts`, `tinyworlds-frontend/src/map/__tests__/sights.test.ts`
- Modify: `tinyworlds-frontend/src/map/data.ts`, `src/map/__tests__/data.test.ts`

**Interfaces:**
- Produces:
  ```ts
  type SightType = PlaceType | "building";
  interface Sight { id: string; n: string; t: SightType; b?: string; lon: number; lat: number; rings: number[][]; front: number; anchor: [number, number] }
  interface SightText { title: string; url: string; text: string; lang: string }
  type SightTexts = Record<string, SightText>;
  interface SightShape extends Sight { paths: Float64Array[]; left: number; top: number; right: number; bottom: number }
  function parseSights(json: unknown): Sight[];          // drops malformed entries
  function parseSightTexts(json: unknown): SightTexts;  // drops malformed entries
  function buildSightShapes(sights: Sight[]): SightShape[];
  function sightAt(shapes: SightShape[], x: number, y: number): number; // index or -1
  // data.ts
  function loadSights(build: string, signal?: AbortSignal): Promise<Sight[]>;                 // 404 → []
  function loadSightTexts(build: string, locale: Locale, signal?: AbortSignal): Promise<SightTexts>; // 404 → {}
  ```

- [ ] **Step 1: Write the failing tests:** `sightAt` finds a point inside a square; misses a
  point in a ring's hole (even-odd); of two overlapping sights returns the larger `front`;
  `parseSights` drops an entry without `rings` and one with a non-finite `front`;
  `loadSights` and `loadSightTexts` resolve to `[]` / `{}` on a 404 (stub `fetch`).
- [ ] **Step 2:** `npx vitest run src/map/__tests__/sights.test.ts src/map/__tests__/data.test.ts` → FAIL.
- [ ] **Step 3: Implement** (bbox reject before the ring test).
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: Commit** "Read the sights in the viewer".

### Task 8: The engine spotlights, pins and tells

**Files:**
- Create: `tinyworlds-frontend/src/map/sight-state.ts`, `src/map/__tests__/sight-state.test.ts`
- Modify: `tinyworlds-frontend/src/map/engine.ts`

**Interfaces:**
- Consumes: Task 7.
- Produces:
  ```ts
  interface SightState { hovered: string | null; pinned: string | null }
  function hover(s: SightState, id: string | null): SightState;
  function press(s: SightState, id: string | null): SightState;  // click or tap
  function release(s: SightState): SightState;                   // Esc, close button
  function shown(s: SightState): { id: string; pinned: boolean } | null;
  // engine
  EngineEvents.sight: (shown: { id: string; pinned: boolean } | null) => void;
  setSights(sights: Sight[]): void;
  releaseSight(): void;
  sightAnchor(id: string): MapPoint | null; // screen px of the sight's anchor
  ```

- [ ] **Step 1: Write the failing tests** for the reducer: hovering A then A again returns the
  same object (no change); hovering A then `null` clears; `press(A)` pins A; with A pinned,
  hovering B leaves `shown` = A pinned; `press(null)` and `release` unpin; `press(A)` on pinned
  A unpins; `shown` prefers the pinned one.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement** the reducer, then the engine:
  - mouse move (same per-frame throttle as the hood hover): `hover(sightAt(...))`; when a sight
    is under the pointer the hovered hood is cleared;
  - `tap()`: a mouse click and a touch tap both `press(sightAt(...))`; a touch tap on no sight
    keeps today's hood behaviour; double-tap zoom unchanged; a drag never presses;
  - `onPointerLeave` hovers `null`;
  - `drawMarks`: when `shown`, fill the screen with the dim with the silhouette cut out
    (`evenodd`), then stroke the silhouette with the accent at 2 CSS px; drawn after the hood
    lines, before the pin; `show` covers it;
  - emit `sight` only when `shown` changes.
- [ ] **Step 4:** tests PASS; `npm run typecheck`.
- [ ] **Step 5: Commit** "Spotlight the building under the pointer".

### Task 9: The sign, the words, the credit

**Files:**
- Create: `tinyworlds-frontend/src/components/map/sight-sign.tsx`, `src/lib/sight-sign.ts`,
  `src/lib/__tests__/sight-sign.test.ts`
- Modify: `src/i18n/types.ts`, `en.ts`, `pt-BR.ts`, `es-ES.ts`, `src/components/map/map-app.tsx`,
  `src/components/map/about-dialog.tsx`, `src/worlds/types.ts` (`World.sights?: boolean`: the
  world's data has sights), `src/worlds/tinynyc.ts` (`sights: true`)

**Interfaces:**
- Consumes: Tasks 7–8; `t.placeTypes`, `t.dialog.close`.
- Produces:
  ```ts
  // lib/sight-sign.ts
  function placeSign(anchor: { x: number; y: number }, size: { w: number; h: number }, viewport: { w: number; h: number }): { x: number; y: number };
  function signContent(sight: Sight, text: SightText | undefined, t: Strings): { kicker: string; name: string; text?: string; link?: { href: string; label: string } };
  function textsFor(loaded: { locale: Locale; texts: SightTexts } | null, locale: Locale): "load" | "ready";
  // i18n
  Strings.sight: { building: string; readOn: string };
  Strings.about.descriptions: string;
  ```
  Copy (exact):
  | key | en | pt-BR | es-ES |
  |---|---|---|---|
  | `sight.building` | Building | Edifício | Edificio |
  | `sight.readOn` | Read on Wikipedia | Ler na Wikipédia | Leer en Wikipedia |
  | `about.descriptions` | Building descriptions from Wikipedia, under CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ | Descrições dos edifícios da Wikipédia, sob CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ | Descripciones de los edificios de Wikipedia, bajo CC BY-SA 4.0: https://creativecommons.org/licenses/by-sa/4.0/ |

- [ ] **Step 1: Write the failing tests:**
  - `placeSign`: right of the anchor with a 16 px gap when it fits; flipped left near the right
    edge; an anchor above the viewport puts the sign at y = 8; never outside an 8 px margin;
  - `signContent`: kicker `"LANDMARK · MANHATTAN"`-style from `t.placeTypes` (`t.sight.building`
    for `"building"`), uppercase applied by CSS not by the function, so the test expects
    `"Landmark · Manhattan"`; no text → no `text`, no `link`; a `pt` article → link label
    `t.sight.readOn`, href the article URL;
  - `textsFor`: `null` → `"load"`; loaded `en-US` asked `pt-BR` → `"load"`; same → `"ready"`.
  The existing i18n tests cover the new keys in all three languages.
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: Implement.** `map-app.tsx`: when `WORLD.sights`, start `loadSights` on the
  engine's first `settle`, then `engine.setSights`; listen to `engine.on("sight")`; load `sights.<locale>.json` on the
  first shown sight and whenever the locale changes after that (`textsFor`); Escape also calls
  `engine.releaseSight()`. `SightSign` is a `sign`-styled box, max width 280 px, kicker in the
  accent, name, text, a `target="_blank" rel="noopener"` link and, when pinned, a close button
  (`t.dialog.close`); its position is written through a ref on every `view` event
  (`engine.sightAnchor` + `placeSign`), not React state. About shows `t.about.descriptions`
  (through `Linked`) under the map data when `WORLD.sights`.
- [ ] **Step 4:** tests PASS; `npm run lint`, `npm run typecheck`; `npm run dev` and check in a
  browser: hover the Empire State (spotlight + sign), click it (pinned, close button, link
  opens Wikipedia in a new tab), Esc releases, switch the language in settings with a sign
  pinned (text changes), hover a listing-only building (name only or its article), a phone-size
  window with touch emulation (tap pins, tap elsewhere releases, double-tap still zooms).
- [ ] **Step 5: Commit** "Show what a building is, and where to read more".

### Task 10: Documentation and the data for New York

**Files:**
- Modify: `CLAUDE.md` (data contract: `sights.json`, `sights.<locale>.json`; the root layout
  note), `tinyworlds-pipeline/CLAUDE.md` (the `wiki` command, sights in the index, owners in
  the scene, the `sights`/`sight` city fields, the Wikipedia data row with CC BY-SA 4.0),
  `tinyworlds-frontend/CLAUDE.md` (the spotlight: hover, pin, sign, loading order, credit)

- [ ] **Step 1:** write the docs.
- [ ] **Step 2:** in the pipeline, `npm run cli -- --city tinynyc scene && npm run cli -- --city tinynyc index && npm run cli -- --city tinynyc wiki`;
  the tiles are untouched (no render needed).
- [ ] **Step 3:** `npm run lint && npm test` in both sub-projects; a production build check:
  move `public/data` away by absolute path, `NEXT_PUBLIC_WORLD=tinynyc npm run build`, move it
  back.
- [ ] **Step 4: Commit** "Document the building spotlight".
- [ ] **Step 5:** stop and report to the owner; shipping (PR, merge, `deploy/deploy.sh tinynyc`)
  waits for their word.
