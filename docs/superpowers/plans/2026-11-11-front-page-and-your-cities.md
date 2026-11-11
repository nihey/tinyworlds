# The front page and "Your cities" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the front page and `/me/` send people onward: a ranking of stone cards with
labelled Donate and Benefactors actions (built cities kept and lit), a hero carousel of every
world, and a `/me/` that always has cities to fund and worlds to explore.

**Architecture:** Frontend only (the front page's build), plus a hero film per world from
`tinyworlds-videos`. Every rule lives in a pure helper with tests (`lib/`); components only
lay out what the helpers answer, from the three things the pages already fetch
(`cityMilestones`, `worldVisits`, `myGiving`). One section, `BuildNext`, is shared by both
pages.

**Tech Stack:** Next.js 16 static export, React 19, TypeScript strict, Tailwind v4, shadcn/ui,
lucide-react, vitest; HyperFrames + ffmpeg for the films.

**Spec:** `docs/superpowers/specs/2026-11-11-front-page-and-your-cities-design.md`. Mockup:
`.superpowers/brainstorm/front-page-and-your-cities/index.html` (a guide for layout, not a
specification; where it and the spec differ, the spec wins).

## Global Constraints

- **No API change.** Nothing under `tinyworlds-api/` is touched.
- **Where the work happens:** a branch in its own worktree, never `main`: a push to `main`
  deploys the site by itself. Commit per task on the branch; **push nothing** without the
  owner's word. Every commit message ends with
  `Claude-Session: https://claude.ai/code/session_01MykmSPT3sVq1nLhtsnCRAG`.
- **A worktree starts bare:** `npm ci` in `tinyworlds-frontend`, `tinyworlds-videos` and
  `tinyworlds-pipeline` (the videos import its source). `public/data/` is not there (gitignored).
- **Next.js 16:** before writing anything Next-specific (the config, a page file), read the
  matching guide in `tinyworlds-frontend/node_modules/next/dist/docs/` (`AGENTS.md` says why).
- **Words:** no visible string or aria-label outside `i18n/` (`types.ts`, `en.ts`, `pt-BR.ts`,
  `es-ES.ts`). English is fixed in Task 3; Portuguese and Spanish are written in the register
  the dictionaries already have.
- **Look:** everything is a `sign` (dark in both themes) except the top links and section
  titles, which sit on the fog with today's heading ink (`text-[#15171a] dusk:text-paper`).
  Tokens only (`taxi`, `paper`, `sign-line`…); never the yellow as a literal. lucide-react
  icons, shadcn components, named exports, `@/` imports, no browser-native modals.
- **Stones:** one per US$1 (`STONE_CENTS`), fifteen to a row, a plain bar above 60 stones.
- **Ranking:** "Built" is `status === "BUILT" && raisedCents >= goalCents`; 8 collecting cities
  and 6 built ones show before their "show all".
- **Carousel:** 8 s a slide, a 600 ms fade; never moves by itself under
  `prefers-reduced-motion` or `Save-Data`, while hidden, off screen, hovered or focused.
- **Films:** 1280 × 720, 12 s, no sign; New York's stays `public/loops/hero.{mp4,jpg}`, the
  others are `public/loops/hero-<world>.{mp4,jpg}`.
- **Donating never depends on the API:** every fallback of today stays (`donateMode`).
- **Public repository:** no domain, host or key in a tracked file.
- **Components have no unit tests in this repo.** Their rules are the helpers of Tasks 1 and 2;
  each UI task ends with `npm run typecheck && npm run lint && npm test` in
  `tinyworlds-frontend` and a look in a browser at the states the task lists.

### Looking at the pages

- API: one is usually listening on `localhost:4000` (the main checkout's, `npm run start:dev`
  there if not). Its `ALLOWED_ORIGINS` decides which port the front page may use.
- Front page: `NEXT_PUBLIC_WORLD=home NEXT_PUBLIC_CARDS_BASE=/og
  NEXT_PUBLIC_API_URL=http://localhost:4000/api/graphql npm run dev` in the worktree's
  `tinyworlds-frontend` (add `-- -p <port>` for an allowed port that is free).
- `/me/` signed in: ask for a link with any address; in development the mail, code included,
  is written to the API's log. A donor with gifts needs rows in the local database
  (`tinyworlds-api/CLAUDE.md`, "How a donation is recorded").
- Widths 390 and 1280; day and dusk (the theme setting lives in `localStorage`
  `home.prefs`); English and Portuguese.

## Review Focus

1. **A goal or a sum that is not round** ($35 of $30, a 2,550-cent goal, 150 cents raised): the
   wall never draws more stones than the goal or a laid stone that is not paid for. → Task 1.
2. **The API away or slow** (list failed, counts never arrive): both pages keep a way to
   donate and to explore, nothing jumps when numbers arrive, no figure reads "0". → Tasks 2, 5, 9.
3. **One hero film, or none listed:** the carousel is a still picture with no controls and
   no timer, as the hero is today. → Tasks 2, 7.
4. **Long words:** "Ribeirão Preto", a 60-character city someone typed, Portuguese labels:
   card buttons stay on one row, the hero sign keeps its height. → Tasks 4, 7, 9.
5. **A donor's odd stones:** scattered numbers, none in a city (gave after it was funded),
   gifts to the project alone. → Tasks 1, 8.

---

### Task 1: Stones and the ranking (pure)

**Files:**
- Create: `tinyworlds-frontend/src/lib/stones.ts`, `src/lib/__tests__/stones.test.ts`
- Modify: `src/lib/city-picker.ts` (the ranking, bottom of the file), `src/lib/__tests__/city-picker.test.ts`

**Interfaces:**
- Consumes: `STONE_CENTS` (`lib/benefactors.ts`), `CityMilestone`, `selectable` (`lib/donate.ts`).
- Produces:
  - `STONES_PER_ROW = 15`, `WALL_MAX_STONES = 60`
  - `interface CityStones { total: number; laid: number }`
  - `cityStones(raisedCents: number, goalCents: number): CityStones`
  - `type WallLook = "mine" | "laid" | "empty"`
  - `wallLooks(stones: CityStones, mine?: number[]): WallLook[]` (one per stone; `mine` are
    1-based stone numbers and only count where a stone is laid)
  - `Ranking` gains `built: CityMilestone[]`; `RANKING_LIMIT = 8`; `BUILT_LIMIT = 6`
  - `leading(ranking: Ranking, n: number): CityMilestone[]` (funded, then ranked; never built)

- [ ] **Step 1: Write the failing tests**

```ts
// stones.test.ts
it("lays a stone per whole dollar, and all of them once the goal is reached", () => {
  expect(cityStones(1000, 3000)).toEqual({ total: 30, laid: 10 });
  expect(cityStones(0, 3000)).toEqual({ total: 30, laid: 0 });
  expect(cityStones(150, 3000)).toEqual({ total: 30, laid: 1 });
  expect(cityStones(2999, 3000)).toEqual({ total: 30, laid: 29 });
  expect(cityStones(3500, 3000)).toEqual({ total: 30, laid: 30 });
});
it("counts a last, partial stone in the goal", () => {
  expect(cityStones(2500, 2550)).toEqual({ total: 26, laid: 25 });
  expect(cityStones(2550, 2550)).toEqual({ total: 26, laid: 26 });
});
it("has no stones for a goal that is none", () => {
  expect(cityStones(500, 0)).toEqual({ total: 0, laid: 0 });
});
it("tells the donor's stones from the others', among the laid ones only", () => {
  const stones = { total: 5, laid: 3 };
  expect(wallLooks(stones)).toEqual(["laid", "laid", "laid", "empty", "empty"]);
  expect(wallLooks(stones, [3, 1, 5, 9])).toEqual(["mine", "laid", "mine", "empty", "empty"]);
});
```

```ts
// city-picker.test.ts, in describe("rankCities"); add to `cities`:
//   city({ name: "Dallas", raisedCents: 3500, goalCents: 3000, status: "BUILT", worldId: "tinydal" }),
//   city({ name: "Cincinnati", raisedCents: 3000, goalCents: 3000, status: "BUILT", worldId: "tinycvg" }),
//   city({ name: "Orlando", raisedCents: 2000, goalCents: 3000, status: "BUILT", worldId: "tinyorl" }),
it("keeps the built cities that were funded in full, the most raised first", () => {
  expect(rankCities(cities).built.map((c) => c.name)).toEqual(["Dallas", "Cincinnati"]);
});
it("leads with the funded, then the best funded, and never a built city", () => {
  expect(leading(rankCities(cities), 3).map((c) => c.name)).toEqual(["Tokyo", "Lisbon", "São Paulo"]);
});
```

Update the three existing expectations the change touches: "leaves built cities out
altogether" becomes "keeps built cities out of the funded and the ranked" (same assertion);
the two `toEqual({ funded, ranked, anyRaised })` gain `built: []`; `RANKING_LIMIT` is `8`
("shows eight before asking to show all") and a new line expects `BUILT_LIMIT` to be `6`.

- [ ] **Step 2: Run them and see them fail**

Run: `cd tinyworlds-frontend && npx vitest run src/lib/__tests__/stones.test.ts src/lib/__tests__/city-picker.test.ts`
Expected: FAIL (`stones` not found; `built`, `leading`, `BUILT_LIMIT` undefined; limit 10).

- [ ] **Step 3: Implement** `cityStones`, `wallLooks` and the constants in `lib/stones.ts`
  (`total = ceil(goal / STONE_CENTS)`; `laid = raised >= goal ? total : floor(raised /
  STONE_CENTS)`, never above `total`); `built`, `leading`, the limits in `lib/city-picker.ts`
  (`built` sorted like `funded`: most raised, then name).

- [ ] **Step 4: Run them and see them pass**, then `npm test` for the whole project.

- [ ] **Step 5: Commit** `feat(viewer): stones of a city, and a ranking that keeps its built cities`

---

### Task 2: Totals, slides, the tile, badges, where the films are (pure)

**Files:**
- Create: `src/lib/home.ts`, `src/lib/__tests__/home.test.ts`
- Modify: `src/lib/visits.ts`, `src/lib/benefactors.ts`, `src/site.ts`, `next.config.ts`, and
  their tests (`visits.test.ts`, `benefactors.test.ts`, `site.test.ts`)

**Interfaces:**
- Produces:
  - `siteTotals(counts: WorldCounts | null): { visits: number; live: number } | null` (`lib/visits.ts`)
  - `lib/home.ts`: `SLIDE_MS = 8000`, `FADE_MS = 600`;
    `stepSlide(current: number, by: number, count: number): number` (wraps both ways);
    `tileSpan(cards: number, columns: number): number` (what is left of the last row; the whole
    row when it is full);
    `interface AdvanceState { slides: number; calm: boolean; saveData: boolean; hidden: boolean; inView: boolean; hovered: boolean; focused: boolean }`;
    `mayAdvance(state: AdvanceState): boolean`
  - `lib/benefactors.ts`: `interface EarnedBadges { founding: string[]; firstStone: string[]; keystone: string[] }`
    (city names, in the giving's order); `earnedBadges(cities: MyCity[]): EarnedBadges`;
    `earnedWhere(names: string[], cities: { one: string; other: string }): string | null`
  - `site.ts`: `HERO_FILMS: string[]` (from `NEXT_PUBLIC_HERO_FILMS`, comma-separated world
    ids); `worldHero(id: string, base = LOOPS_BASE): { loop: string; still: string }`;
    `heroSlides(ids: string[], films: string[], lead = HERO.world): string[]`;
    `RANKING_PATH = \`${BASE_PATH}/#ranking\``; `CITIES_PATH = \`${BASE_PATH}/#cities\``
  - `next.config.ts` sets `env.NEXT_PUBLIC_HERO_FILMS` from `public/loops/`: `hero.jpg` counts
    for `tinynyc`, `hero-<id>.jpg` for `<id>`.
- [ ] **Step 1: Write the failing tests**

```ts
// visits.test.ts
it("adds the worlds' visits up, and knows nothing before they come", () => {
  expect(siteTotals(null)).toBeNull();
  expect(siteTotals(new Map([["a", { visits: 10, live: 2 }], ["b", { visits: 5, live: 0 }]])))
    .toEqual({ visits: 15, live: 2 });
});

// home.test.ts
it("goes round the slides both ways", () => {
  expect(stepSlide(0, 1, 12)).toBe(1);
  expect(stepSlide(11, 1, 12)).toBe(0);
  expect(stepSlide(0, -1, 12)).toBe(11);
  expect(stepSlide(3, 1, 0)).toBe(0);
});
it("gives the tile what is left of the last row, or a row of its own", () => {
  expect(tileSpan(7, 3)).toBe(2);
  expect(tileSpan(7, 2)).toBe(1);
  expect(tileSpan(9, 3)).toBe(3);
  expect(tileSpan(9, 2)).toBe(1);
  expect(tileSpan(4, 1)).toBe(1);
  expect(tileSpan(0, 3)).toBe(3);
});
it("moves on only when someone is watching and nobody is choosing", () => {
  const watching = { slides: 12, calm: false, saveData: false, hidden: false, inView: true, hovered: false, focused: false };
  expect(mayAdvance(watching)).toBe(true);
  for (const change of [{ slides: 1 }, { calm: true }, { saveData: true }, { hidden: true },
    { inView: false }, { hovered: true }, { focused: true }])
    expect(mayAdvance({ ...watching, ...change })).toBe(false);
});

// benefactors.test.ts (myCity: a small factory beside the file's existing ones)
it("says which badges were earned, and where", () => {
  const cities = [
    myCity({ name: "Los Angeles", founderNumber: 1, firstStone: true }),
    myCity({ name: "Philadelphia", founderNumber: 2 }),
    myCity({ name: "Dallas", founderNumber: null }),
  ];
  expect(earnedBadges(cities)).toEqual({
    founding: ["Los Angeles", "Philadelphia"], firstStone: ["Los Angeles"], keystone: [],
  });
  const words = { one: "{n} city", other: "{n} cities" };
  expect(earnedWhere([], words)).toBeNull();
  expect(earnedWhere(["Dallas", "Lisbon"], words)).toBe("Dallas, Lisbon");
  expect(earnedWhere(["Dallas", "Lisbon", "Paris"], words)).toBe("3 cities");
});

// site.test.ts
it("finds each world's hero film, New York's under its old name", () => {
  expect(worldHero("tinynyc")).toEqual({ loop: "/loops/hero.mp4", still: "/loops/hero.jpg" });
  expect(worldHero("tinylax")).toEqual({ loop: "/loops/hero-tinylax.mp4", still: "/loops/hero-tinylax.jpg" });
});
it("shows the worlds that have a film, in the registry's order, and never none", () => {
  expect(heroSlides(["tinynyc", "tinyrao", "tinylax"], ["tinylax", "tinynyc"])).toEqual(["tinynyc", "tinylax"]);
  expect(heroSlides(["tinynyc", "tinyrao"], [])).toEqual(["tinynyc"]);
});
```

- [ ] **Step 2: Run them and see them fail** (`npx vitest run src/lib/__tests__/{visits,home,benefactors,site}.test.ts`).

- [ ] **Step 3: Implement** the helpers. In
  `next.config.ts`, list the films with `node:fs` at config time and pass them through `env`
  (check the Next 16 guide for `env`; if it is gone, pass the list as a prop from
  `page.home.tsx`, which may read the folder at build time, and keep `heroSlides` as it is).

- [ ] **Step 4: Run the tests, typecheck and lint.** Expected: all pass.

- [ ] **Step 5: Commit** `feat(viewer): the front page's sums, slides and tile; a donor's badges; where the hero films are`

---

### Task 3: The words

**Files:**
- Modify: `src/i18n/types.ts`, `src/i18n/en.ts`, `src/i18n/pt-BR.ts`, `src/i18n/es-ES.ts`
- Test: `src/i18n/__tests__/i18n.test.ts` (existing: same keys and placeholders in every language)

**Interfaces:**
- Produces these keys (English fixed; `{…}` are placeholders):

| Key | English |
| --- | --- |
| `home.ranking` (changed) | Build the next city |
| `home.navLabel` | Sections |
| `home.citiesLine` | Real places, drawn by code from open data. |
| `home.imaginedLine` | Fan-made maps of places from stories, on layouts invented for them. |
| `home.rankingLine` | Pick the city you want next, or name your own. |
| `home.exploreShort` | Explore |
| `home.fundNext` | Fund the next city |
| `home.carousel.label` / `.previous` / `.next` / `.show` | Worlds to explore / Previous / Next / Show {city} |
| `home.numbers.worlds` `{one, other}` | city or world / cities and worlds |
| `home.numbers.visits` `{one, other}` | visit so far / visits so far |
| `home.numbers.live` | exploring right now |
| `home.numbers.funding` `{one, other}` | city being funded / cities being funded |
| `home.next.kicker` / `.title` | Next up / Which city should I build next? |
| `home.next.body` | Each one takes about {goal}. The most funded is built first. |
| `home.next.action` / `.ranking` | Fund a city / See the ranking |
| `donate.build.steps.pick` `{title, body}` | Pick a city / The most funded one is built next. |
| `donate.build.steps.give` `{title, body}` | Give from {amount} / Every dollar lays a stone, with your name on it if you like. |
| `donate.build.steps.build` `{title, body}` | At {goal}, I build it / Anything above keeps the servers running. |
| `donate.build.stonesLaid` | {laid} of {total} stones laid |
| `donate.build.firstUnclaimed` | The First Stone is still unclaimed |
| `donate.build.raised` | {amount} raised |
| `donate.build.fundedInFull` | Funded in full |
| `donate.build.groupBuilt` | Built · funded by their benefactors |
| `donate.build.other` `{title, body, action}` | A city that is not here? / Name any city in the world and it joins the ranking. / Donate and name it |
| `me.noStones` / `me.noStonesBody` | No stones laid yet. / Give to a city and it shows up here: what you gave, the stones you laid and the badges you earned. |
| `me.badgesToEarn` / `me.yourBadges` | Badges to earn / Your badges |
| `me.badges.founding` `{name, how}` | Founding Benefactor / Help fund a city before it is built. You get a founder's number. |
| `me.badges.firstStone` `{name, how}` | First Stone / Lay a city's very first stone. |
| `me.badges.keystone` `{name, how}` | Keystone / Lay the last one: the stone that gets it built. |
| `me.badges.notYet` | Not yet |
| `me.badges.inCities` `{one, other}` | {n} city / {n} cities |
| `me.tiles.cities` `{one, other}` / `.stones` `{one, other}` / `.given` | city, cities / stone laid, stones laid / given |
| `me.legendYours` / `me.legendOthers` | yours / other benefactors' |
| `me.giveAgain` | Give again |
| `me.buildBody` | Each one takes about {goal}. Pick the one you want next: the most funded is built first. |
| `me.buildAll` | See all {n} cities, or name your own |
| `me.exploring` `{title, body, all}` | Keep exploring / Most visited first. / All {n} on the front page |

- Removes nothing: `me.empty` and `me.summary*` are still read until Task 8, which removes them.

- [ ] **Step 1:** Add the keys to `types.ts` with a comment where a placeholder needs
  saying; run `npm run typecheck`. Expected: FAIL, the three dictionaries lack the keys.
- [ ] **Step 2:** Write the English as the table has it, then Portuguese and Spanish.
- [ ] **Step 3:** `npm run typecheck && npx vitest run src/i18n`. Expected: PASS.
- [ ] **Step 4: Commit** `feat(viewer): the words of the new front page and Your cities`

---

### Task 4: The stone cards and "Build the next city" on the front page

**Files:**
- Create: `src/components/donate/stone-wall.tsx`, `src/components/donate/city-fund-card.tsx`,
  `src/components/donate/build-next.tsx`
- Modify: `src/components/home/landing.tsx` (the ranking section; `CityRow` goes),
  `tinyworlds-frontend/CLAUDE.md` (Donations: "The front page's ranking")

**Interfaces:**
- Consumes: Task 1 (`cityStones`, `wallLooks`, `STONES_PER_ROW`, `WALL_MAX_STONES`,
  `rankCities`, `RANKING_LIMIT`, `BUILT_LIMIT`), Task 3's `donate.build.*`, `Milestones`
  (`hooks/use-milestones.ts`), `PixelIcon`, `statusLabel`, `defaultGoal`, `withGoal`,
  `formatUsd`, `donationsLabel`, `worldUrl`, `worldCardUrl`.
- Produces:
  - `StoneWall({ stones, mine, label, valueText, className }: { stones: CityStones; mine?: number[]; label: string; valueText: string; className?: string })`:
    a `progressbar`; the first and last stone marked as `StoneGrid` marks them; "mine" in
    `bg-taxi`, "laid" in `bg-taxi` when no `mine` is given and `#7a5d0c` when one is, "empty"
    `bg-white/[0.08]`; one plain bar of the same height above `WALL_MAX_STONES`.
  - `CityFundCard({ city, place, onDonate, onBenefactors }: { city: CityMilestone; place?: number; onDonate: (city: string) => void; onBenefactors: (slug: string) => void })`
  - `BuiltCityCard({ city, onBenefactors }: { city: CityMilestone; onBenefactors: (slug: string) => void })`
  - `OtherCityCard({ onDonate }: { onDonate: () => void })`
  - `BuildNext({ milestones, onDonate, onBenefactors }: { milestones: Milestones; onDonate: (city: string | null) => void; onBenefactors: (slug: string) => void })`:
    the whole body of the section, inside one sign.
  - `BuildNextShort({ milestones, count, columns, onDonate, onBenefactors }: { milestones: Milestones; count: number; columns: 1 | 2; onDonate: (city: string | null) => void; onBenefactors: (slug: string) => void })`:
    the first `count` of `leading(...)` as cards, no steps, no groups (for `/me/`, Task 8).

- [ ] **Step 1: `StoneWall` and the three cards.** What each shows is the spec's section 1 and
  "The stone card and its section". Decisions the spec leaves implicit:
  - Benefactors shows when `city.donations > 0`; Donate always (never on a built card).
  - Donate keeps `data-rybbit-event="donate_open"`, `data-rybbit-prop-world={SITE_ID}` and
    `data-rybbit-prop-city`; button names are `home.donateTo` and `home.benefactorsOf`. Every
    other button that opens the Donate sign in this plan carries the same hook, without a
    city when it has none (the last card, the tile's "Fund a city", "Give again").
  - A built card's band is a plain `<img>` (`loading="lazy"`), removed on error; Explore is a
    link named `home.explore`.
  - A name never wraps (`truncate`); the two buttons share the row equally.
- [ ] **Step 2: `BuildNext`.** With a list: the steps; "Built" (first `BUILT_LIMIT`, then a
  "show all" of its own); "Funded" (`home.funded`, as today); the collecting ones under
  `donate.groupFunding` when a group stands above them, with `home.rankingEmpty` when
  nobody gave, the first `RANKING_LIMIT`, then `OtherCityCard` as the grid's last cell, then
  today's "show all". Grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`. Loading:
  `donate.loading`. No list (`API_URL === ""` or failed): `home.nextPitch` and today's Donate
  button, nothing else. `BuildNextShort` has the same loading line and the same fallback.
- [ ] **Step 3: The front page.** In `landing.tsx` the section keeps `id="ranking"`, takes
  `home.ranking` as its title and renders `<BuildNext>`; delete `CityRow`, `SUBHEADING` and
  the imports nothing uses any more.
- [ ] **Step 4: Verify.** `npm run typecheck && npm run lint && npm test`, then in the
  browser at 390 and 1280: a built city (Dallas, Cincinnati) lit with its picture; a
  collecting city with and without donations; "show all"; the last card opens the Donate
  sign with no city; Benefactors opens the sign for that city; with the API stopped, the
  fallback. Portuguese: both buttons on one row at 390.
- [ ] **Step 5:** Rewrite "The front page's ranking" in `tinyworlds-frontend/CLAUDE.md`
  (stone cards, the Built group and its rule, the limits, the last card).
- [ ] **Step 6: Commit** `feat(viewer): the ranking as stone cards; built cities stay, lit`

---

### Task 5: The front page around it: links, titles, cards, the tile, the numbers

**Files:**
- Create: `src/components/home/section-head.tsx`, `src/components/home/world-card.tsx`,
  `src/components/home/next-city-tile.tsx`, `src/components/home/site-numbers.tsx`
- Modify: `src/components/home/landing.tsx`, `tinyworlds-frontend/CLAUDE.md` ("Targets:
  worlds and the front page")

**Interfaces:**
- Consumes: Task 2 (`siteTotals`, `tileSpan`), Task 1 (`leading`, `rankCities`), Task 3's
  `home.*`, `MovingPicture`, `MilestoneBar`, `visitsLine`, `LIVE_SHOWN_ABOVE`.
- Produces:
  - `SectionHead({ id, title, line }: { id: string; title: string; line?: string })` (an `h2`
    with that id, and its line)
  - `WorldCard({ world, count, showVisits, onBenefactors }: { world: World; count: WorldCount | undefined; showVisits: boolean; onBenefactors?: () => void })`
  - `SmallWorldCard({ world, count }: { world: World; count: WorldCount | undefined })` (picture
    with its loop, name, visits; for `/me/`)
  - `NextCityTile({ cards, milestones, onDonate }: { cards: number; milestones: Milestones; onDonate: () => void })`
  - `SiteNumbers({ worlds, totals, funding }: { worlds: number; totals: { visits: number; live: number } | null; funding: number | null })`

- [ ] **Step 1: `SectionHead`, `WorldCard`, `SmallWorldCard`.** The card stays one link to
  the world with the Benefactors button as its sibling (never inside the link): picture, name,
  text, visits line as today; then a hairline and a foot with "Explore" and its arrow on the
  left, the Benefactors button on the right. The hover ring is `world.accent.color` (a CSS
  variable on the card).
- [ ] **Step 2: `NextCityTile`.** A sign with a dashed outline inside it; spans
  `tileSpan(cards, 2)` columns from `sm` and `tileSpan(cards, 3)` from `lg` (literal class
  names for each value, so Tailwind sees them); the three `leading` cities as
  `MilestoneBar`s beside the text when it spans more than one column, under it otherwise.
  Drawn only where donations are taken; the bars only with a list.
- [ ] **Step 3: `SiteNumbers`.** One sign, a cell per figure that is known: worlds always;
  visits when `totals` is there and above 0; live when above `LIVE_SHOWN_ABOVE`; funding
  when not null and above 0. Fixed height from the first paint; two by two below `sm`.
  Numbers through `Intl.NumberFormat(locale)`, labels by `Intl.PluralRules`.
- [ ] **Step 4: `landing.tsx`.** Top row: anchors to `#cities`, `#imagined`, `#ranking` (where
  donations are taken), `#open-source`, hidden below `sm`, in a `nav` named `home.navLabel`;
  "Your cities" as a sign-coloured pill (with an API). `SiteNumbers` under the hero (with an
  API). Each group of worlds: `SectionHead` and the cards, the tile last in Cities only. Open
  source: one sign, its sentence led by the title in bold and the GitHub button beside it
  (under it on phones), the `h2` kept for assistive technology. Footer unchanged.
- [ ] **Step 5: Verify.** Typecheck, lint, tests; in the browser at 390 and 1280, day and
  dusk: the tile's span with nine cities (a row of its own at 1280, one column at 640); the
  strip before and after the counts arrive (throttle the network: no jump); the card's two
  actions by keyboard (Tab reaches both, Enter on Benefactors does not follow the link).
- [ ] **Step 6:** Update "Targets: worlds and the front page" in the frontend `CLAUDE.md`
  (the links, the strip and its rules, the card's foot, the tile).
- [ ] **Step 7: Commit** `feat(viewer): the front page's links, titles, numbers and the next-city tile`

---

### Task 6: A hero film for every world

**Files:**
- Modify: `tinyworlds-videos/scripts/worlds.ts`, `scripts/plates.ts`, `scripts/flyovers.ts`,
  `tinyworlds-videos/CLAUDE.md`, `deploy/deploy.sh` (`check_all`), root `CLAUDE.md` ("The
  front page moves", "Adding a world" step 4)
- Create (rendered, committed): `tinyworlds-frontend/public/loops/hero-<world>.{mp4,jpg}` for
  every world but `tinynyc`

**Interfaces:**
- Produces:
  - `interface HeroShot { lon?: number; lat?: number; shrink: number; dx: number; dy: number; a: number; b: number }`
  - `HEROES: Record<string, HeroShot>` (one per world of the registry; replaces `HERO`)
  - `heroName(world: string): string` (`"hero"` for `tinynyc`, else `"hero-<world>"`)
  - `npm run flyovers -- hero [world …]` renders the hero rows of the worlds named (all without names).

- [ ] **Step 1: The tiles.** In the worktree make `tinyworlds-frontend/public/data/` a real
  folder of links, one per world, to the main checkout's `public/data/<world>`. Dallas and
  Cincinnati: ask the session that rendered them (`ListAgents`, then `SendMessage`) whether
  the tiles in `.claude/worktrees/dallas-cincinnati/tinyworlds-frontend/public/data/` are the
  render that is deployed; link them on a yes. On a no, or no answer by the end of this task,
  leave those two out and note it for the hand-over.
- [ ] **Step 2: `HEROES`.** New York's values are today's (`lon: -74.011, lat: 40.7075,
  shrink: 2.5, dx: -400, dy: 30, a: 170, b: 85`). Start every other world from its flyover's
  `shrink` (2 for the three imagined places, which have none) and `dx: -400, dy: 30, a: 170,
  b: 85`. `plates.ts` cuts a plate and writes a row (`name: heroName(id)`, the blank sign) for
  each world asked for; `writeRows` orders hero rows after the worlds. `flyovers.ts` takes
  world names after `hero`.
- [ ] **Step 3: Frame each one by eye.** `npm run plates -- <world>` and look at
  `flyover/assets/plates/hero-<world>.png`. The page's sign covers, of the 2 : 1 picture, the
  box from 2 % to 46 % across and 32 % to 96 % down. Accept a framing when what the picture
  is about (the skyline, the castle, the coast) stands right of that box, and the right half
  is not empty sea, fog or fields. Otherwise change `lon`/`lat`, `shrink`, `dx`, `dy` and
  cut again.
- [ ] **Step 4: Render.** `npm run flyovers -- hero`. Expected: a line per film, each mp4
  under about 1 MB. Look at every `hero-<world>.jpg`.
- [ ] **Step 5:** `npm run typecheck && npm run lint` in `tinyworlds-videos`.
- [ ] **Step 6: The check and the docs.** `deploy.sh check_all` says, for a world with no
  `hero-<world>.jpg` (and that is not `tinynyc`), "ok (no hero film yet: it is left out of
  the front page's carousel)", as it does for a missing loop. Videos `CLAUDE.md`: the
  commands' comments, "The hero" paragraph (one per world, the imagined ones included and
  why: the front page's own pictures, never shared). Root `CLAUDE.md`: "The front page
  moves", and step 4 of "Adding a world" (`HEROES` and `npm run flyovers -- hero <id>`).
- [ ] **Step 7:** Remove the worktree's `public/data/` folder of links (a `next build` would
  copy every tile). **Commit** `feat(videos): a hero film for every world`

---

### Task 7: The hero carousel

**Files:**
- Create: `src/components/home/hero-carousel.tsx`
- Modify: `src/components/home/moving-picture.tsx`, `src/components/home/landing.tsx`,
  `tinyworlds-frontend/CLAUDE.md` ("The front page's pictures move")

**Interfaces:**
- Consumes: Task 2 (`heroSlides`, `HERO_FILMS`, `worldHero`, `stepSlide`, `mayAdvance`,
  `SLIDE_MS`, `FADE_MS`), Task 3's `home.carousel.*`, `home.exploreShort`, `home.fundNext`,
  `useMediaQuery`, `Wordmark`, `WORLDS`.
- Produces:
  - `MovingPicture` gains `active?: boolean` (default `true`): its loop is fetched and played
    only while it is active and on screen.
  - `HeroCarousel({ takesDonations }: { takesDonations: boolean })`: the whole `<header>`.

- [ ] **Step 1: `MovingPicture`.** `active` joins the conditions of the effect that plays the
  loop; a picture that stops being active pauses.
- [ ] **Step 2: `HeroCarousel`.** Slides are `heroSlides(Object.keys(WORLDS), HERO_FILMS)`.
  Only the current slide and the one leaving are in the DOM, stacked, the newer fading in
  over `FADE_MS` (no fade under reduced motion); the next slide's still is preloaded one
  second before its turn. A timer of `SLIDE_MS` runs while `mayAdvance(...)` holds
  (`prefers-reduced-motion`, `navigator.connection?.saveData`, `document.visibilityState`,
  an `IntersectionObserver`, pointer enter/leave, focus in/out); choosing a slide restarts it.
  With one slide: no controls, no timer.
  - The sign: as today down to the pitch; a hairline; the slide's `Wordmark` (its suffix in
    its accent) and its city on one line, truncated; then "Explore" (link to the world, named
    `home.explore`) and, where donations are taken, "Fund the next city" (`#ranking`), on
    one row. The picture is a link to the same world.
  - Controls: a sign-coloured pill with previous, a dot per slide (the current one wider, in
    that world's accent, `aria-current`), next; names from `home.carousel`. At the picture's
    lower right from `lg`; at its top right below. The arrows are at least 40 px.
  - The slide's change is announced politely (`aria-live="polite"` on the title) only after
    a choice by hand, never by the timer.
- [ ] **Step 3: `landing.tsx`** renders `<HeroCarousel>` in place of the `<header>`.
- [ ] **Step 4: Verify.** Typecheck, lint, tests; in the browser: twelve slides go round at
  1280 and 390; the sign keeps its height on every slide ("tinykingslanding", "Ribeirão
  Preto"); nothing worth seeing sits under the sign on any slide (reframe in Task 6's way if
  one does); the network panel shows a film asked for only when its slide comes up; with
  reduced motion emulated it stands still and the arrows work; rename the films away
  (`NEXT_PUBLIC_HERO_FILMS=tinynyc`) and the hero is today's still picture with no controls.
- [ ] **Step 5:** Rewrite "The front page's pictures move" in the frontend `CLAUDE.md` for
  the carousel (slides, films, when it moves, `NEXT_PUBLIC_HERO_FILMS` in the environment
  table as set by the config, not by hand).
- [ ] **Step 6: Commit** `feat(viewer): the hero is a carousel of every world`

---

### Task 8: "Your cities"

**Files:**
- Create: `src/hooks/use-giving.ts`, `src/components/me/me-page.tsx`,
  `src/components/me/badges.tsx`, `src/components/me/keep-exploring.tsx`
- Modify: `src/components/me/me-app.tsx`, `src/components/me/your-cities.tsx`,
  `tinyworlds-frontend/CLAUDE.md` ("Your cities")

**Interfaces:**
- Consumes: Task 1 (`cityStones`), Task 2 (`earnedBadges`, `earnedWhere`, `RANKING_PATH`,
  `CITIES_PATH`), Task 3's `me.*`, Task 4 (`StoneWall`, `BuildNextShort`), Task 5
  (`SectionHead`, `SmallWorldCard`), `DonateDialog`, `BenefactorsSign`, `useDonationReturn`,
  `useMilestones`, `useWorldVisits`, `byVisits`, `givingSummary`.
- Produces:
  - `useGiving(session: AdminSession, onEnded: () => void): { load: GivingLoad; retry: () => void; patch: (change: (giving: MyGiving) => MyGiving) => void }`
    with `type GivingLoad = { state: "loading" } | { state: "failed" } | { state: "ready"; giving: MyGiving }`
    (today's fetching, moved out of `YourCities`)
  - `MePage({ session, onEnded, onSignOut }: { session: AdminSession; onEnded: () => void; onSignOut: () => void })`
  - `YourCities({ session, load, retry, patch, onEnded, onGive }: { session: AdminSession; load: GivingLoad; retry: () => void; patch: (change: (giving: MyGiving) => MyGiving) => void; onEnded: () => void; onGive: (city: string) => void })`:
    the giving sign alone (the address and "Sign out" leave it for `MePage`'s top row)
  - `BadgesToEarn()`, `YourBadges({ cities }: { cities: MyCity[] })`
  - `KeepExploring()`

- [ ] **Step 1: `useGiving`, `MePage`.** `MePage` is `max-w-5xl`: a top row (the wordmark home,
  then the address and "Sign out"); from `lg` two columns, `5fr 7fr` while `cities` is empty
  (or still loading) and `7fr 5fr` once it is not; the giving sign left; right, a
  sign titled `home.ranking` with the line `me.buildBody` (`{goal}` from `defaultGoal`), then
  `BuildNextShort` (`count` 4 in 2 columns when nothing was given, 2 in 1 column otherwise),
  then `me.buildAll` to `RANKING_PATH` with `{n}` the cities not built; under that sign, for a
  donor, `YourBadges`; `KeepExploring` under both. It owns the Donate sign and the benefactors' sign
  (one at a time, as `landing.tsx` does) and calls `useDonationReturn()`.
- [ ] **Step 2: `YourCities`.** Nothing given (`cities.length === 0`): `me.noStones`,
  `me.noStonesBody`, `BadgesToEarn`, and the project line when `projectCents > 0`. A donor:
  three tiles from `givingSummary` (labels by plural rule), then each city: a thumbnail
  (`worldCardUrl`, built cities only, dropped on error), name, badges and meta line as today,
  `StoneWall` with `mine={city.stones}` when it has any (and the two-item legend when the
  wall has both kinds), "Give again" unless `status === "BUILT"`, the listing row as today.
  Loading, failed and the name editor as today.
- [ ] **Step 3: `badges.tsx`, `keep-exploring.tsx`.** Badges: the three pixel pictures
  (`PixelIcon`, scale 3 for founding, 2 for the others), dimmed when not earned (`opacity`
  and `grayscale`), each with its name and `how`; earned ones add `earnedWhere(...)` in the
  accent, unearned ones in "Your badges" lead their line with `me.badges.notYet`.
  `KeepExploring`: `SectionHead`, the first eight of `byVisits(Object.values(WORLDS), ranked)`
  as `SmallWorldCard`s (two a row, four from `lg`), `me.exploring.all` to `CITIES_PATH` with
  `{n}` the registry's count.
- [ ] **Step 4: `me-app.tsx`** renders `<MePage>` when signed in; the sign-in sheet is
  untouched. Remove what nothing reads any more: `summaryLine`, `SummaryWords` and their
  tests (`lib/benefactors.ts`), and `me.empty`, `me.summaryCities`, `me.summaryStones`,
  `me.summaryGiven` from `types.ts` and the three dictionaries.
- [ ] **Step 5: Verify.** Typecheck, lint, tests; in the browser at 390 and 1280, signed in
  as: an address with no gifts; one with gifts to the project only; a donor with a built
  city, a collecting one and a city where they laid no stone. Donate from a card, cancel the
  checkout, and land back on `/me/` with the address clean. The listing switch and the name
  editor still work.
- [ ] **Step 6:** Rewrite "Your cities" in the frontend `CLAUDE.md`.
- [ ] **Step 7: Commit** `feat(viewer): Your cities always has somewhere to go`

---

### Task 9: The whole thing, looked at

**Files:**
- Modify: whatever the look turns up; `README.md` only if a command or variable changed.

- [ ] **Step 1:** `npm run typecheck && npm run lint && npm test` in `tinyworlds-frontend`;
  `npm run typecheck && npm run lint` in `tinyworlds-videos`; `deploy/deploy.sh check`.
  Expected: all pass; the check lists every world "ok".
- [ ] **Step 2:** A production build of the front page (`NEXT_PUBLIC_WORLD=home npm run
  build`, with no `public/data/` in the way) and `npm run preview`: `/` and `/me/` load, and
  a world's build still does (`NEXT_PUBLIC_WORLD=tinynyc npm run build`: it must not have
  picked up a front-page import).
- [ ] **Step 3: Both pages, every state**, at 390 and 1280, day and dusk, English and
  Portuguese: the Review Focus list, one by one, the API stopped included. Compare with the
  mockup; fix what reads worse than it.
- [ ] **Step 4:** `git diff main --stat` and a search of the diff for a domain, a host or a
  key. Expected: none.
- [ ] **Step 5: Commit** what the look changed, and hand over: what was built, what was left
  out (the two films, if their tiles could not be had), and screenshots of both pages.
