# Guess the building: a quiz on the map's famous buildings

*Design, 2026-11-11. World: `tinynyc` first.*

## Why

The New York map already lights up its famous buildings and says what they are (the building
spotlight, `2026-11-11-building-spotlight-design.md`). The owner wants a game on top of it for
the people who are already wandering the city: a building is lit, its Wikipedia opening is
shown with the name taken out, and the visitor picks its name out of four. Answers are kept, so
after each one the visitor sees how many people got that building right or wrong. They play as
many rounds as they like, then go back to exploring.

## What the visitor sees (decided by the owner)

Mockup: `.superpowers/brainstorm/guess-the-building/round.html` (real tinynyc tiles around the
Flatiron Building; the owner confirmed it, with the notes below, as "correct").

- **The way in.** A new sign in the top-left column, under the "more cities and worlds to
  explore" banner, for everyone, in a world that has the game. It reads as an invitation
  ("Guess the building: can you name what you see?").
- **A round.** The map flies to a building and lights it the way hovering does now (the
  spotlight: the rest of the map dimmed, the building in full colour inside the accent
  contour). Its name sign stays hidden. A card shows the opening of its Wikipedia article with
  the name taken out, wherever it appears in the text (also "the ▇ District"), and four names:
  one right, three wrong.
- **The wrong names are other famous buildings nearby**, so the question is about knowing the
  building itself, not which part of the city it is in.
- **Answering.** The verdict, the building's name going up on it, the text shown whole, and
  for each of the four names the share of people who picked it, the right one marked in the
  accent, the visitor's own pick marked; a line with how many people have answered this
  building. Then "Next building" or "Stop".
- **As many rounds as they like.** A running score ("round 3 · 2 right") lasts only while they
  play; nothing about the visitor is kept.
- **The card sits on the right**, out of the building's way; the search stays where it is.
- **New York only for now**: it is the only world with sights and their Wikipedia texts (397
  buildings with an article).
- **Language.** The interface follows the visitor (en-US, pt-BR, es-ES). The text is the
  article in their language where one exists, else the English one, as the spotlight's sign
  does (in New York 99 of the 397 have a Portuguese article, 271 a Spanish one).

## How it is made (Claude's calls)

### Pipeline: a `quiz` step

- **Runs after `wiki`**, as part of `npm run all` wherever a city has sights, and on its own
  (`npm run cli -- --city tinynyc quiz`). It reads `sights.json` and the three
  `sights.<locale>.json` and calls nothing on the network; it is deterministic.
- **Questions** are the sights that have an article (397 in New York). A question's text in a
  language is that language's text from `sights.<locale>.json`.
- **Blanking the name.** In each text, blank:
  1. the sight's name and the article's title as whole phrases (with a leading article: "The",
     "El", "La", "O", "A"), then
  2. every remaining *distinctive* word of either: a word that is not on a per-language list
     of common words (articles and prepositions; building words such as Building, Tower,
     Bridge, Museum, Station, Theatre, Edificio, Torre, Puente, Museo, Estación, Teatro, Edifício,
     Ponte, Estação…; and the city's own place words: New York, Nueva York, Nova Iorque,
     Manhattan, Brooklyn, the other boroughs). "Flatiron District" becomes "▇ District".
  Matching is whole-word, case- and accent-insensitive, and takes a possessive ("Macy's") with
  the word. Neighbouring blanks merge into one.
- **A question is left out in a language** when what is left to read after blanking is too
  short to be fair (about 60 characters). A quick count on the current data: 6 of 397 drop
  out in English and Portuguese, 8 in Spanish.
- **The wrong names (decoys).** Three other questions' sights, so every name on offer is a
  notable place, never a shop listing. They are chosen once per question, the same in every
  language (so a building's per-name tallies mean the same thing for everyone):
  - **of the same kind as the answer**, because the blanked text keeps words like "an art
    museum" or "a Catholic cathedral" in view, and a museum offered against three office
    towers is no question at all (on the current data, nearest-in-a-broad-family would do
    that to 19 of the 31 museums and about 1 in 8 of the rest). The kind is, in order: the
    sight's type when it is `station`, `bridge` or `museum`; else a kind word in its name
    (Cathedral, Church, Chapel, Synagogue, Temple, Mosque, Theatre/Theater, Hotel, Library,
    Hall, Hospital, School, College, Stadium, Arena…); else the general kind (landmarks,
    buildings and places with no kind word). A kind with fewer than four questions in the
    world borrows from the general kind;
  - nearest first within that kind, by ground distance from the building, with no distance
    cap (a median of about 400 m to the third nearest in New York for the general kind; a
    museum or a church may reach further, which is fine);
  - skipping a candidate that shares a distinctive word with the answer (3 World Trade Center
    is not offered against One World Trade Center, whose blanks would then make it a coin
    toss), and one whose distinctive words appear in the question's blanked text in any
    language (a text that says "across from One Madison" would rule One Madison out).
  A question that cannot get three decoys is left out.
- **Output.** One file per interface language, `quiz.<locale>.json`:
  ```ts
  // { questions: { id: string; decoys: [string, string, string]; parts: string[] }[] }
  //   id, decoys: sight ids (sights.json); parts: the text cut into pieces, the odd ones
  //   (1, 3, …) blanked. parts.join("") is the text as sights.<locale>.json has it.
  ```
  The step prints how many questions each language has and how many were left out, and why.
  A flag (`--list` or similar) prints every blanked text so a person can read them through.
- **Versioning and deploy.** `stamp.ts` already hashes every JSON in the folder, so the quiz
  files ride `?v=<manifest.indexes>`. `deploy/deploy.sh <world> --index` must upload
  `quiz*.json` with the other indexes, and `check` must find them for a world whose viewer has
  the game.

### API: answers and tallies

- **A table**, one row per answer:
  ```prisma
  model QuizAnswer {
    id        String   @id @default(uuid()) @db.Uuid
    /// The tab's visit (as the funnel's): not a person, gone when the tab closes.
    visitId   String   @map("visit_id") @db.Uuid
    world     String
    /// The building asked about: a sight id from the world's sights.json.
    sightId   String   @map("sight_id")
    /// The sight id the visitor picked; right when it equals sightId.
    choice    String
    locale    String?
    createdAt DateTime @default(now()) @map("created_at")

    @@unique([visitId, world, sightId])
    @@index([world, sightId])
    @@map("quiz_answers")
  }
  ```
- **One public mutation**, throttled like `trackFunnelStep` (`@Public()`, `GqlThrottlerGuard`,
  a per-address limit per minute):
  ```graphql
  input AnswerQuizInput { visitId: ID  world: String!  sightId: String!  choice: String!  locale: String }
  type QuizPick { choice: String!  count: Int! }
  type QuizTally { answers: Int!  picks: [QuizPick!]! }
  type Mutation { answerQuiz(input: AnswerQuizInput!): QuizTally! }
  ```
  It records the answer, then answers with the building's tally, this answer included. A visit
  answers a building once: answering it again records nothing (`skipDuplicates`) and still
  returns the tally. Without a `visitId` (storage blocked, an admin on their own site, a
  browser driven by a program: wherever `currentVisit()` is null) nothing is recorded and the
  tally comes back all the same. Validation: `visitId` a UUID, `world` the funnel's
  `WORLD_PATTERN`, `sightId` and `choice` a short sight-id pattern (ids look like `b19j7udl`,
  `bridge:brooklyn bridge`, `statue:0`), `locale` one of the three.
- **Right or wrong is the choice itself**: right when `choice === sightId`. The API keeps no
  copy of the questions and does not need one.
- **The tally is read over the four names on offer.** `picks` lists every name ever picked for
  the building; the viewer takes the four it shows, and both the shares and the people line
  are counted over those four only. So if a later pipeline run changes a building's decoys
  (a new article, a new sight, tuned word lists), picks of a name no longer offered simply
  drop out, and the shares on the card always add up to 100%. No schema change is needed for
  it.
- The root `CLAUDE.md`'s API contract and `tinyworlds-api/CLAUDE.md` document it. Deploy the
  API before the viewer, as for every growth of the contract.

### Viewer

- **A world opts in** with `World.quiz: true` (it needs `sights`); `tinynyc` does.
- **The sign** (`components/map/quiz-banner.tsx` or similar): under `ExploreBanner`, in the
  same `sign` style, arriving with the map's other signs, hidden while the search box is in use
  (like the other-places banner). On a narrow screen it stays in the same column, clear of the
  tools.
- **Nothing of the game loads before it starts**: `quiz.<locale>.json` is fetched on the first
  tap of the sign (and again for a new language); `sights.json` is already there or on its way.
- **Picking the building**: at random from the language's questions, never one this browser
  has played before; the ids played are remembered in `localStorage` (per world, read and
  written inside try/catch; without storage, only for the tab). When all have been played, the
  list starts over.
- **The round on the map**: a new engine call holds one sight lit for the round
  (`engine.holdSight(id | null)` or similar). While it holds:
  - the spotlight draws that sight as it does a pinned one, and no other sight lights up under
    the pointer or a tap;
  - its name sign is not shown;
  - panning it off screen does not let it go (`keepInView` leaves the held sight alone).
  The map flies to the building (jumps, with reduced motion) at a zoom where it reads clearly,
  framed in the part of the screen the card leaves free. The visitor can pan and zoom during
  the round. The search stays usable.
- **The card** (`components/map/quiz-card.tsx` or similar), in the `sign` style of the mockup:
  - a header with the game's name in the pixel face, the running score, and a close button;
  - a question line that follows the building's family: "Which building is this?", "Which
    station…?", "Which bridge…?", "Which museum…?";
  - the text, each blank drawn as a bar of one fixed width, so the length of a name gives
    nothing away; under it, small, that it comes from Wikipedia with the name hidden;
  - the four names in a random order, keyed A–D; on a keyboard, A–D and 1–4 pick one.
  After the pick:
  - at once: the verdict ("Right!" / "Not quite. It's the Flatiron Building."), the right name
    in the accent, the visitor's pick marked; the blanks become the words they hid, in the
    accent; the building's name goes up on it as a plain name sign (the card already holds the
    rest); a link to the article ("Wikipedia ↗", new tab);
  - when the tally arrives: each name's share of all answers, as a bar behind it and a
    percentage; a line saying how many people have answered this building ("You're the first
    to answer this one" when it is one);
  - "Next building →" (focused) and "Stop".
  On a wide screen the card stands on the right, clear of the tool column; on a phone it is a
  sheet at the bottom and the building is framed above it.
- **The answer goes out with plain `fetch`**, like the funnel's steps, not Apollo Client (only
  the donate sign and the admin pages download Apollo). If the API is not configured, fails or
  is slow, the round still ends normally; only the shares and the people line are left out.
- **Stop, the close button or Esc** end the game: the card goes, the hold is released, the map
  stays where it is, the score is forgotten.
- **Every new word** (sign, card, verdicts, question lines, the people line with its plural
  forms) goes in all three dictionaries.
- **Analytics**: starting the game is a site event (`siteEvent("quiz_start", { world })`, like
  `explore_more`); the answers themselves are the API's.

### Data and API contracts

The root `CLAUDE.md` gains `quiz.<locale>.json` in the data contract and `answerQuiz` in the
API contract, and its "The API exists only for donations" line changes to say it also keeps
the game's answers; the pipeline's, the viewer's and the API's `CLAUDE.md` describe their parts;
`deploy/README.md` mentions the quiz files if it lists the indexes.

## Goals

- Someone exploring New York starts the game from the top-left in one tap, plays as many
  rounds as they like, and stops without losing their place on the map.
- Each answer counts once per visit and building, and every player sees how everyone else did
  on that building.
- People who never play get the map exactly as fast as today.

## Non-goals (this round)

- Other worlds. The mechanism is general; a world gets the game once it has sights with
  articles and opts in.
- Accounts, nicknames, leaderboards, streaks, a score kept between visits.
- Sharing a question or a result.
- An admin view of the answers (the table is there for one later).
- Timers, difficulty levels, hints.
- Buildings without a Wikipedia article.

## Anti-goals

- A question that gives its answer away (the name or part of it left in the text) or rules
  out one of the choices by naming it.
- A wrong answer marked right.
- A slower first load for people who never play.
- A game that needs the API: without it, play goes on, without the tallies.
- Anything that identifies a player: no cookie, no address kept; the tab's visit id only.

## Constraints

- The repository is public: no deployment details in any file.
- No hard-coded interface strings; every new word in en-US, pt-BR and es-ES.
- The pipeline stays deterministic; the tiles and the existing sights files do not change.
- Wikipedia's text is CC BY-SA 4.0. The blanked text is an adaptation: the card says it comes
  from Wikipedia with the name hidden, and links the article once the name is out. About
  already credits Wikipedia in a world with sights.
- The global stack's API rules: code-first GraphQL, `class-validator` inputs, the public
  operation throttled.
- Tests where the logic lives: the blanking and decoy rules (pipeline), the tally and the
  once-per-visit rule (API), picking the next building and the card's states (viewer).

## Known and accepted

- The API cannot tell a real choice from an invented one; a forged answer can skew a
  building's tally a little. The throttle bounds it.
- A visitor can search for the four names to see where they are. That is their game to spoil.
- A sight id comes from the building data (`b<seed>`); a pipeline run on newer data can change
  one, and that building's tally then starts again.
- When a run changes a building's decoys but not its id, the building's past answers keep
  counting where their pick is still on offer (the right name always is), so its share of
  right answers mixes the old question with the new one.
- Most pt-BR players read the English text (only 99 Portuguese articles).
- A tab that plays a building again after the list starts over is not counted again.

## Left to the builder

- The exact common-word lists, the length threshold and how distance is measured.
- The engine's exact hold API and the flight's zoom and framing.
- The card's exact placement, sizes and motion; the sign's wording within the three
  dictionaries.
- The throttle's limit.
- File layout in each sub-project.
