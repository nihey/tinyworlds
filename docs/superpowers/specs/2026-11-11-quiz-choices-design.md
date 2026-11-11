# Guess the building: difficulty, borough and kind

*Design, 2026-11-11. World: `tinynyc`. Builds on `2026-11-11-guess-the-building-design.md`
(live since PR #7 and #8).*

## Why

The game asks any of New York's 393 buildings, from the Flatiron Building (312,471 views of
its Wikipedia article last year) to the Avenue J subway station (33). The owner wants players
to choose how hard it is, which borough they play and what kind of place they are asked about,
so a newcomer can start with the famous ones and a local can play their own borough.

## What the visitor sees (decided by the owner)

Mockup: `.superpowers/brainstorm/guess-the-building/setup.html` (confirmed "all good", with
every guess listed below).

- **The sign opens a choosing step** in the card instead of going straight to a round:
  - **Difficulty**: easy, medium or hard. Harder means both **less famous buildings** and
    **wrong answers that are harder to tell apart**. Easy asks only the most recognisable
    buildings, with wrong answers that are famous too but plainly other kinds of place; hard
    can ask anything, with look-alike neighbours as wrong answers; medium is between.
  - **Borough**: all of them, or one of the five.
  - **What**: all, buildings, museums, landmarks, or "other", which is labelled **Stations**
    because that is what it is (76 subway and train stations).
  - One choice per row. Each difficulty has a short line under its name.
- **How many**: a line says how many buildings the game has ("96 buildings in this game").
  A choice that would leave **no** building cannot be picked (struck out); when only a
  **handful** are left the line says so ("Only 2 buildings in this game") and the game starts.
- **Remembered**: the last choice comes back next time; the first time it is easy, all
  boroughs, all kinds.
- **Playing**: the header carries the choice and counts rounds against the game's buildings
  ("round 3 of 96 · 2 right"). A gear in the header goes back to choosing, which starts a new
  game.
- **The end**: after the game's last building, the card says how many the player got right out
  of how many, and offers to play again (today the list just starts over).
- **Tallies per difficulty**: each difficulty offers different wrong answers, so "how everyone
  answered" is kept per difficulty.
- **The wrong answers follow the choice** (decided after the builder check): with a borough
  chosen they come from that borough, with a kind chosen they are of that kind, whenever there
  are enough; only a combination too small to give three borrows from outside it (most of
  Staten Island), accepting that such a name may stand out. Difficulty still shapes them within
  the choice.

## How it is made (Claude's calls)

### Pipeline (`index/quiz.ts`, `index/write-quiz.ts`)

- **Fame.** Each question's English article's page views over the last 12 complete months
  (Wikimedia's pageviews API, `per-article/en.wikipedia/all-access/user/<title>/monthly/…`,
  summed). Fetched in the `quiz` step through the same cache as `wiki` (`cachedHttp` into
  `data/<city>/raw/wikipedia/`, the project's `WIKI_USER_AGENT`, polite pacing), so a rerun asks
  nothing and stays deterministic; the 12-month window is fixed by the cache's first run and
  moves only with `--force`. A missing count is 0 (the least famous).
- **Levels (cumulative).** By fame, among all questions: the top **25%** are level 1 (in easy,
  medium and hard), the next up to **60%** level 2 (medium and hard), the rest level 3 (hard
  only). In New York that is about 98 / 138 / 157: easy draws from ~98, medium from ~236, hard
  from all 393.
- **Group** (what the "What" row filters), from the kind `kindOf` already gives (the opening's
  "is a …"), with one new kind:
  - **buildings**: general, hotel, school;
  - **museums**: museum, library;
  - **landmarks**: bridge, stadium, venue, worship, and the new **monument** (statue,
    sculpture, monument, memorial, obelisk, arch, fountain), so the Statue of Liberty is a
    landmark;
  - **stations**: station.
- **Area** (what the "Borough" row filters): the sight's context line (`b`) when it is one of
  the city's districts (the `borough` places in `places.json`, or the city's `areas()`); none
  otherwise (bridges between boroughs, Liberty Island): such a question is only in "all
  boroughs".
- **Decoys per difficulty and scope.** A round's wrong answers depend on the difficulty and on
  how the choice narrows it: its **scope** is `all` (all boroughs, all kinds), `area` (a
  borough chosen), `group` (a kind chosen) or `both`. A question's area and group are those
  chosen when it is asked, so the scope only says "from the same area / group as the answer".
  For each difficulty a question is in and each scope, the pipeline picks three:
  - **candidates**: the questions of that difficulty (level ≤ the difficulty's, so easy's are
    all famous), minus the answer, minus every exclusion the current rule has (shared
    distinctive words, named in the text in any language, a twin or same name, an address the
    text rules out), within the scope;
  - **order**:
    - **hard**: the same kind first, then the nearest (as today);
    - **medium**: the same kind first, then the closest in fame (page views, on a log scale);
    - **easy**: with the kind free (`all`, `area`), other groups first, then the closest in fame,
      at most one per group while others are left, so the three differ plainly from the answer
      and from each other; with the kind fixed (`group`, `both`), other kinds within the group
      first (a library beside a museum), then the closest in fame. Ordering by closeness in
      fame, not by fame itself, spreads the wrong answers over the whole famous pool instead of
      offering the same few names every round;
  - **borrowing**: when the scope has fewer than three, the rest come from the same difficulty
    outside the scope (the same group before the same area is let go), then from any
    difficulty. The step reports how many sets had to borrow.
  Every question then has, per difficulty it is in, four sets (`all`, `area`, `group`, `both`;
  a question without an area has the `area` sets equal to `all`'s, and so on). A difficulty a
  question still cannot get three for leaves it out of that difficulty (reported).
- **Output**, backward compatible (the live viewer reads `decoys` and ignores the rest):
  ```ts
  // { questions: {
  //   id; parts; lang;                   // as today
  //   decoys: [string, string, string];  // hard, scope all (what the live viewer reads)
  //   sets: {                            // per difficulty it is in, per scope
  //     easy?: Record<"all" | "area" | "group" | "both", [string, string, string]>;
  //     medium?: Record<…>;
  //     hard: Record<…>;
  //   };
  //   level: 1 | 2 | 3;                  // the easiest difficulty it is in
  //   group: "buildings" | "museums" | "landmarks" | "stations";
  //   area?: string;                     // its borough, as the data names it ("Bronx")
  // }[] }
  ```
  The root `CLAUDE.md`'s data contract and the pipeline's `CLAUDE.md` say so. `--list` also
  prints each question's level, group, area and views.

### API (`quiz/`)

- `quiz_answers` gains `level` (enum `QuizLevel { EASY MEDIUM HARD }`, default `HARD`; rows
  already there were answered with hard's decoys, so they are `HARD`). The unique key becomes
  `(visit_id, world, sight_id, level)`: a visit answers a building once per difficulty.
- `AnswerQuizInput.level: QuizLevel` (optional, `HARD` when absent, which is what the live
  viewer sends by saying nothing). The tally counts that level's answers only.
- Contract docs: the root `CLAUDE.md` and `tinyworlds-api/CLAUDE.md`. Deploy the API first.

### Viewer

- **The choosing step** is a new phase of the card (`choosing`) that the sign opens. Rows:
  difficulty (a three-way switch, with a line under each: "famous, clear choices", "known,
  closer choices", "anything, look-alikes"), borough (chips: "All" and the areas found in the
  questions, most questions first), what (chips: "All", "Buildings", "Museums", "Landmarks",
  "Stations"). A chip whose pick would leave no question, with the other two rows as they are,
  is struck out and cannot be pressed. A change that empties the current selection resets
  "What", then "Borough", to "All".
- **The count** is the questions matching the choice in the visitor's language (a question
  counts for a difficulty only if it has that difficulty's sets); "Only N buildings in this
  game" when N ≤ 10. Start begins the game.
- **Remembered** in `localStorage` (`<world>.quiz.choice`: level, area, group), behind
  try/catch; default easy / all / all.
- **A game** is the matching questions in a random order, those this browser has played
  before last (the played list stays as it is, now an ordering rather than a filter), each
  asked once. The header shows the tags of the choice and "round r of N · k right"; the gear
  returns to choosing (the game and its score are dropped); Esc and the close button stop as
  today. After the N-th answer, Next leads to **the end**: "You named k of N" (plural forms in
  each language), "Play again" (the same choice, a new order), "Change" (back to choosing),
  "Stop".
- **Rounds** use the set for the game's difficulty and scope (`sets[level][scope]`); the answer
  carries `level` and, as today, the four names offered.
- **Keys**: in the choosing step Enter starts; the rest as today.
- **Words**: every new label in en-US, pt-BR and es-ES; group and difficulty names, the count
  lines, the end screen. Borough names are the data's ("Bronx"), as the search shows them.
- The viewer's `CLAUDE.md` describes the choosing step, the game and the end.

## Goals

- A player picks difficulty, borough and kind in one step, sees how many buildings that makes,
  and plays exactly those, once each, to a final score.
- Easy is plainly easier than hard: famous buildings and clear choices against obscure ones
  and look-alikes.
- Nothing the live game does breaks while the parts are deployed one after another.

## Non-goals (this round)

- Picking several boroughs or kinds at once.
- Other worlds (they have no sights yet); the mechanism follows whatever areas and groups a
  world's questions carry.
- Leaderboards, saved scores, per-borough or per-kind tallies.
- Difficulty-specific texts (the same opening, blanked the same way, at every level).

## Anti-goals

- A choice that can be started with no building in it.
- An easy question made hard by obscure wrong answers, or a hard one made trivial by wrong
  answers of another kind.
- A filtered game whose answer stands out as the only name of the chosen borough or kind,
  wherever the choice has three others to offer.
- A slower map, or the game's data fetched before the sign is pressed.
- The live viewer failing on the new question files before its own deploy.

## Constraints

- Public repository; every new word in three languages; the pipeline deterministic from its
  cache; the API's public mutation throttled as today; documentation in each `CLAUDE.md`.
- Wikimedia's API asks for a descriptive user agent and gentle request rates: one request per
  article, sequential, cached.

## Known and accepted

- Page views drift: a later run with `--force` may move a building from one level to another,
  and its tallies for the levels it leaves simply stop growing.
- Staten Island has 6 questions in all, so most of its combinations are a handful or none, and
  their wrong answers borrow from other boroughs.
- Players with different choices see different wrong answers for the same building and
  difficulty; the tally stays per difficulty, counted over the names each player was offered,
  so "how many got it right" keeps its meaning.
- Answers given before this change count as hard.

## Left to the builder

- The exact percentile cut-offs if 25% / 60% gives an easy pool that looks wrong when read
  through (`--list`), as long as easy is the famous end.
- The monument kind's word list, and how "other groups, most famous first" is spread when a
  group is thin.
- How areas are recognised as districts in a city's data.
- Layout details of the choosing step and the end, within the mockup.
