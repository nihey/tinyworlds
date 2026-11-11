---
name: build-city
description: Use when a tinyworlds city has been funded (its donations reached the goal) or the user asks to build, add or ship a new city or world on the map, from choosing its id to telling its donors it is built.
---

# Building a city

## Overview

A funded city becomes a world: a pipeline city drawn from open data, a viewer, the API's seed
marking it `BUILT`, its card loop and hero film, docs. Merging to `main` deploys all of it and
mails the city's donors that it is built. **A city is built only with sights that light up, their
Wikipedia openings and Guess the building, all checked in a browser.** The one exception is a
town whose map has too few articles for a game (Truckee: six): sights on, `quiz` off, said so in
`worlds.test.ts` and to the user. The steps below follow the
repo's own docs (root `CLAUDE.md` "Adding a world", `tinyworlds-pipeline/CLAUDE.md` "Adding a
city", `tinyworlds-frontend/CLAUDE.md`, `tinyworlds-videos/CLAUDE.md`). Read those sections; this
skill is the order, the commands and what went wrong before.

Scripts (run from the checkout's root; each says its usage at the top):

| Script | Does |
| --- | --- |
| `bash .claude/skills/build-city/scripts/funded.sh` | the live ranking, FUNDED first |
| `node .claude/skills/build-city/scripts/bearing.mjs <pipelineDir> <id> w s e n` | the street grid's peak bearings in a box (after `fetch`) |
| `node .claude/skills/build-city/scripts/q.mjs <pipelineDir> "<sql>"` | one DuckDB query; `{raw:<id>}` is the city's raw folder |
| `node .claude/skills/build-city/scripts/articles.mjs <pipelineDir> <id> w s e n` | every Wikipedia article located in the box, with the footprint at its point |
| `bash .claude/skills/build-city/scripts/viewer-check.sh <id> "<lat>,<lon>,<scale>" x y <out> [port]` | builds the viewer, serves it (port 4185 unless given: one per parallel worker), hovers a sight, plays a quiz round; screenshots and the texts shown (`--live` checks the deployed site) |

## 1. Which cities, which ids

1. `funded.sh`. Every FUNDED row is to be built, unless the user names others.
2. **Id**: `tiny` + the city's IATA airport code, lower case (`tinycvg`, `tinypit`, `tinyfte`).
   Make sure it is not taken (`tinyworlds-pipeline/src/cities/index.ts`).
3. **Slug and name**: the seed line uses the proposal's slug exactly (`truckee-ca`), so the
   city is promoted in place and keeps its donations, and a name that slugs to it ("Truckee,
   CA": `seed-data.spec.ts` checks). The seed never changes an existing row's name: the site and
   the donors' mail ("colorado springs is built") show what the first donor typed. When that is
   not how the city is written, rename the row in production with the SQL in
   `tinyworlds-api/CLAUDE.md` before the merge, with the user's OK.
4. Work in a worktree off `origin/main`, never in the main checkout (other sessions have work
   there). One with `node_modules` in all four sub-projects saves the installs (`npm ci` each
   otherwise; hard links with `cp -al` skip the API's `postinstall`: run `npx prisma generate`
   there before its tests). Copy the gitignored `deploy/.env` in (for `funded.sh` and shipping).

## 2. The pipeline city (most of the work)

Start from the nearest existing city and copy its file, its `.places.ts` and its test:
`tinypit`/`tinyphl` (US city, its own published neighbourhoods, sights), `tinycvg`/`tinydal` (US
city, Overture's areas, sights), `tinyfte` (small town, raster heights), `tinylas` (desert).

1. Rough `origin`, `bbox`, the template's settings; register it in `src/cities/index.ts`;
   `npm run cli -- --city <id> fetch` (1–2 min). Note how the box meets whole degrees (Gotchas).
2. **Bearing**: `bearing.mjs` on the whole box, the core and three or four neighbourhoods. When
   they disagree, `preview` both and take the city's classic view (Cincinnati looks across the
   river at its skyline; Dallas kept the majority grid). Never guess it.
3. **Heights**: count footprints with a height (`q.mjs`, `building.parquet`). Few: `heights.raster`
   and `openBuildings` (Google's raster covers the global south, not the US). Many: in the US
   they are mostly Microsoft's estimates from imagery, not surveys; compare them with
   `num_floors` per floor count, and estimates that read twelve floors as 22 m want
   `heights.floorsFirst`. The About notes in the viewer must say truthfully what the heights are.
4. **Areas**: read Overture's division names for the box. Thin or wrong: the city's own
   neighbourhood GeoJSON (`publishedAreas`), grouped into the parts of town locals name
   (`sectioned`), so context lines and quiz areas are "Downtown", not the city's name. Credit the
   source in `attribution` and the pipeline's Data table. A layer with no licence is not usable
   (the repo is public). No outlines anywhere: Overture's division *points* (`division.parquet`,
   macrohoods) as parts of town with `aroundPoints()`; a base or campus that is a place of its
   own as a district through `overtureAreas({ landUse })`.
5. **Sights**: `search.namedBuildings` (a city 20–60 m, a small town 5 m, plus church, civic,
   public, government, university, college, library: the 110 m default leaves a dozen; `skip`
   for names like "Building 4"), `sights.placeWords`, `areaByDistrict` when context lines are neighbourhoods.
   `curated`: every place people look for, `sight: true` only on one structure (a building,
   stadium, statue, bridge; never a square or campus), its point from the data
   (`ST_PointOnSurface` of the footprint in `building.parquet`, a stadium anywhere in its
   `land_use` grounds), never from memory. Then `articles.mjs`: an article whose point is inside
   or a few metres from a footprint is a sight to curate under the article's name (Colorado
   Springs went from 22 questions to 61 this way); the name differs from the title:
   `sights.wikipedia`. Under about fifteen questions there is no game worth playing: leave
   `quiz` off in the viewer (the exception in the Overview).
6. `npm run all -- --city <id>` (fetch → scene → render → index → wiki → quiz). Read the scene
   log: `0 deck pieces` on a river city whose river is a polygon, the suspension spans. A
   changed `bbox` needs `fetch --force`: fetch keeps the files it has.
7. **Look**: `npm run cli -- --city <id> preview --at <lon>,<lat> --size 1500,900 --zoom 2 --out
   <scratch>/p.png` and Read the PNG: downtown, each landmark (colour, glass, height), the
   stadiums, the bridges, every edge of the map (`--shrink 6`), the overview
   (`public/data/<id>/overview.webp`). Fix with `landmarks`, `heightFixes`, `heightCaps`;
   ground the city is known for (red sandstone) with `ground.land`/`landCover`/`landUse`;
   `render --around <lon>,<lat>,<m>` redraws a patch.
8. **Wiki and quiz**: rerun `wiki` until it reports none failed. `quiz --list` and read every
   question: no name, initials, former name or decoy shown (`sights.aliases`; grep the texts for
   "known as|formerly|originally|conhecid|conocid"). Misses and wrong matches:
   `sights.wikipedia`. Aim for every famous structure lit and in the quiz.
9. `npm run cli -- --city <id> card`, Read `../tinyworlds-frontend/public/og/<id>.jpg`: the hero
   landmark clear of the wordmark at the lower left. Settle it now: the loop is cut to it.
10. `src/cities/<id>.test.ts` (the template's); `npm test`, `npm run lint`.

## 3. The rest

- **Viewer** (`tinyworlds-frontend`): `src/worlds/<id>.ts` (the template's, all three languages,
  accent readable on the signs), its entry in `src/worlds/index.ts`, the lists in
  `worlds/__tests__/worlds.test.ts`, `lib/__tests__/site.test.ts` (its names in every language)
  and `city-picker.test.ts` (no longer offered, under every name a donor might type);
  `city-catalogue.ts` if the city is in it. A style or flora no city has yet (a mountain town's
  wood and metal roofs, its pines) is a new `StyleProfile` / flora, shared code: check it.
- **API**: a line in `tinyworlds-api/prisma/seed-data.ts` `BUILT` (the proposal's slug, a name
  that slugs to it, the world id).
- **Videos** (`tinyworlds-videos`, after the card): `SHOTS` and `HEROES` entries in
  `scripts/worlds.ts`, `npm run plates -- <id> && npm run loops -- <id>`, look at the hero plate
  (`flyover/assets/plates/hero-<id>.png`), `npm run flyovers -- hero <id>`. Card, plates, loop
  and hero are cut from the tiles: render again near them, make them again.
- **Docs**: root `CLAUDE.md` (worlds table, the quiz's city list), `README.md` (card table and a
  bullet), `tinyworlds-pipeline/CLAUDE.md` (run-time table, file tree, the bearings in "Rules of
  the look", Data table, quiz counts), `tinyworlds-frontend/CLAUDE.md` (worlds line, accents),
  `tinyworlds-api/CLAUDE.md` (the seed's city list).

## 4. Check, then ship

1. Tests, lint and typecheck in every sub-project touched; `deploy/deploy.sh check` (it checks
   every world: in a worktree that holds only the new worlds' data, read their lines; the others
   say "no map data"). Changed shared pipeline code: an existing city's `preview`s and scene
   byte-identical before and after (any city whose raw data is in the worktree will do: build
   `origin/main`'s pipeline in a scratch folder from `git archive`, link `node_modules` and
   `data` in, preview the same spots with both).
2. `viewer-check.sh` on each new world, hovering a landmark: Read all four screenshots; the
   printed sign has the article's text, the quiz card a blanked text and four names; no errors.
3. `deploy/deploy.sh <id> --data` for each world, **before** the merge (the deploy refuses a
   registry world with no data on the server).
4. Commit (`git diff --cached` holds no host, path, id or key: the repo is public), push, PR.
5. **Ask the user before merging.** The merge deploys the API and every viewer and mails every
   donor of the cities; it cannot be unsent.
6. After the merge: `gh run watch` the Deploy run; its announce lines name each city and the
   mails sent. `viewer-check.sh --live` each world; `curl` its `data/sights.<locale>.json` and
   `data/quiz.<locale>.json` in all three locales. Report what was sent.

## Gotchas (each cost a rebuild before)

| Symptom | Fix |
| --- | --- |
| A river city's bridges lie flat; scene says `0 deck pieces` | a river drawn as a polygon inside the land: `riverBridges: true`, `scene` again (a river that is only a line has no decks to raise) |
| A grassy floodway drawn as a lake | its name in `ground.dryWater` |
| A band of water along one edge | Overture's land comes in 1° tiles: the box plus the fog's margin (`fog.end`) crosses a degree line the box does not; push the box past it |
| No cables on a famous suspension bridge | towers mapped as a building: `suspensions`, and `sights.bridges` lists the building's name |
| A famous bridge does not light up | a curated `t: "bridge"` entry with `sight: true`; pieces filed under its road's name go in `sights.bridges` |
| The city itself missing from the areas | `overtureAreas` drops areas over `maxArea` (0.05 deg²): raise it |
| Neighbourhoods that are improvement districts, zoo exhibits, umbrellas over their parts | rename or drop them in `areas()`, keep them out with `search.skip` |
| Every context line says the city's name; quiz areas empty | `sectioned` parts of town, `areaByDistrict: true` |
| A district whose middle is off the map has no borough place | a curated place for it |
| A park in `limits.parks` does nothing | names must match `land_use` names exactly: look them up with `q.mjs` |
| A tower in the wrong glass or a landmark in default colours | `landmarks`, keyed by its lower-case name in the data |
| A curated sight lights the wrong building, or none | its point is outside the footprint, or its `b` differs from the building entry's (the dedupe key includes it) |
| A sight renamed by a curated entry lost its article | `sights.wikipedia` with the title |
| One building in the data twice | point both names at one article with `sights.wikipedia` |
| `wiki`: dozens of "fetch failed", the famous ones | failures are not cached: run it again until none failed |
| A stadium's seats in a strange colour | its `roof` is the seats seen from above |
| A curated place "is off the map, left out" (index log) | it stands in a park or grounds the fog dissolves: the land use area's name in `limits.parks` |
| A curated place outside `bbox`, or a campus cut in half | the box's edge runs through it: widen the box, `fetch --force` (fetch skips files already there) |
| Towers a few metres tall, every height off | estimated heights: `heights.floorsFirst`, `heightFixes` for the landmarks without floors |
| Few sights with an article | `articles.mjs`, then curate what stands on a footprint |
| `next dev` fails with EMFILE | use `viewer-check.sh` |
| Blank viewer screenshot | the hash is `#lat,lon,scale`: latitude first |
| Shell exits 144 after `pkill -f` | the pattern matched its own shell: kill by pid or port |
| `npm run cli` fails for both cities at once | it compiles the whole project: one broken city file stops every run in that checkout |

## Working in parallel

Two cities go faster as two vertical slices: each in its own worktree and branch off the same
commit (a half-edited city file breaks the other's `tsc`), merged into one PR at the end; the
shared lists (registries, tests, docs tables) are the only conflicts. Raw data, scenes and
tiles are per worktree (`data/`, `public/data/` are gitignored): upload each world's data from
the worktree that built it.
