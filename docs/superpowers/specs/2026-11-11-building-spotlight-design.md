# Building spotlight: highlight a famous building and say what it is

*Design, 2026-11-11. World: `tinynyc` first.*

## Why

On the New York map the famous buildings are there but hard to pick out of a dense city, and
nothing on the map says what they are. The owner wants a building under the pointer to stand
out at once, with its name and a line or two about it, and a way to read more.

## What the visitor sees (decided by the owner)

- **Spotlight.** Resting the mouse on a building that can be found in the search dims the
  rest of the map; the building keeps its full colour inside a thin taxi-yellow contour that
  follows its whole drawn shape, from the ground to the top of its spire. (Chosen from three
  mockups: outline only, spotlight, yellow wash. Mockup B in `.superpowers/brainstorm/`.)
- **A sign beside it**, in the style of the map's other signs (black enamel, paper-white
  lettering, the world's accent):
  - a kicker: the place type and its context line, e.g. `LANDMARK · MANHATTAN`;
  - the name, as the search shows it;
  - the opening of the building's **Wikipedia** article in the visitor's language (one or two
    sentences);
  - a link to that article ("Read on Wikipedia ↗", in the visitor's language), opening in a
    new tab.
- A building with no matching article shows the kicker and the name only.
- **Every building that can be found in the search** behaves this way. Things in the search
  that stand up from the map count too: the Statue of Liberty, the stadiums, the bridges.
  Streets, neighbourhoods, boroughs, parks and points with no structure (subway entrances)
  do not light up.
- **Clicking pins the sign.** Hovering shows it and it goes when the pointer leaves the
  building; a click on the building keeps the spotlight and the sign up (with a close button)
  until a click elsewhere, the close button or Esc. This is what makes the link reachable.
- **On a phone**, which has no hover, a tap on a building does what a click does; a tap
  elsewhere lets it go.
- **Language.** The sign's words come from the interface's dictionaries (English, Brazilian
  Portuguese, Spanish). The description is the article in the visitor's language; when that
  language has no article, the English one is used, and the link goes to it.
- **New York first**, built so that any city can switch it on later.

## How it is made (Claude's calls, approved as a whole by the owner)

### Pipeline: a new step that finds the sights and their articles

- A **sight** is one structure on the map that one or more search entries point at. Several
  entries on one building ("Metropolitan Museum of Art", "The Met") make one sight; its other
  names stay searchable as they are.
- **Only entries that name a structure** become sights (Claude's call, from "buildings" in the
  owner's request). Areas and complexes never do, even when their point happens to land on a
  building: Wall Street, Times Square, Hudson Yards, Rockefeller Center, Lincoln Center,
  Roosevelt Island, Ellis Island, the airports, the universities, Coney Island. Streets,
  neighbourhoods, boroughs and parks are out by type. The curated list in the city file says
  which of its entries are structures (a flag on the entry), so an area typed `landmark` or
  `place` is never mistaken for one.
- **Business listings count** (the owner's decision). About 1,365 structures light up in New
  York; some 840 of them are in the search only through a point of interest from Overture's
  places (rank 34): lounges at JFK, shops and studios, names in other scripts, the odd
  misplaced entry. They light up with that name, as the search shows it.
- **Naming.** A sight is named by its curated entry if it has one, else by the building's own
  name in the building data, else by its best-ranked entry; among equals (several listings in
  one unnamed building), deterministically by the index's own order. A point of interest never
  renames a building that has a name of its own (One World Trade Center stays itself even
  though "America's Response Monument" sits inside its footprint; "Union Station, Washington
  DC", misplaced onto 555TEN, does not rename it).
- **Finding the structure.** An entry's point must fall inside the footprint, or within a
  small tolerance (a few metres, never enough to reach a neighbour). Then:
  - a **building**: that volume and every volume of the same building. Hint: in the scene, a
    building and all its parts share `vol.seed` (`hashString` of the building id), so "same
    seed, overlapping or touching footprints" finds the whole building;
  - a **stadium**: a point inside a stadium's grounds (land use `stadium`) lights its stands,
    i.e. the grandstand and stadium buildings in those grounds (the Yankee Stadium and Citi
    Field points sit on the field, 45–51 m from the stands);
  - the **Statue of Liberty**: the statue's prisms (`CITY.statues`) with the pedestal building
    under them;
  - a **bridge**: its deck pieces and towers, grouped by the road segments' names
    (`Brooklyn Bridge`), not by seed (every deck piece has its own). Bridges are the hardest
    part and may come last.
  An entry whose point lands on nothing becomes no sight (most subway stations).
- **The shape** of a sight is its **silhouette as drawn**: the union of every piece's footprint
  swept from its base to its top (`rise(h)` upwards), plus roofs, spires and domes as the
  renderer draws them, simplified to a few px. It is computed from the same scene the tiles
  are drawn from (heights after `heightFixes`, caps and fallbacks), so it matches the tiles.
- **Wikipedia.** For each sight, find its English article: search near the sight's ground
  point (Wikipedia's geosearch, a radius of a few hundred metres) for an article whose title
  matches the sight's name (normalised: case, accents, punctuation, a leading "The"). From
  the English article follow the language links to Portuguese and Spanish. For each language
  keep the title, the URL and the summary's opening (cut at a sentence end, about 220
  characters at most).
  - **No match is better than a wrong match.** When the name does not clearly match, keep no
    article. A city file can force or forbid a match by name
    (`wikipedia: { "Citi Field": "Citi_Field", "Some Place": null }`) for the misses.
  - The step is **offline and cached**: responses go to `data/<city>/raw/wikipedia/`, so a
    rebuild is deterministic and does not call Wikipedia again; `fetch --force` refreshes.
  - Requests are polite: sequential or a couple at a time, a descriptive `User-Agent` with the
    public repository's URL (Wikimedia asks for one), no personal address. With the listings
    included that is several thousand requests on the first run (one geosearch per sight, then
    language links and summaries for the matches), so the cache must survive interruptions and
    resume where it stopped.
- Runs as part of `npm run all` (and as its own command), after `scene` and `index`. A city
  opts in; generated worlds never do.

### Data contract: two new files in `data/<world>/`

- `sights.json`: `{ sights: { id, n, t, b?, lon, lat, rings, front, anchor }[] }`. `rings` is
  the silhouette as rings of **map px** (flat `[x0, y0, x1, y1, …]`, even-odd), not lon/lat: it
  includes height, so it is screen geometry, not geodata (a deliberate exception to "geodata
  stays in lon/lat"). `front` is the largest ground y of its footprints (the nearer, the
  larger), `anchor` the `[x, y]` where the sign hangs, `lon`/`lat` the point the article is
  searched around. `t` is a place type, or `building` for a sight named by its building's own
  name.
- `sights.<locale>.json` per interface language (`en-US`, `pt-BR`, `es-ES`):
  `{ [id]: { title, url, text, lang } }`, `lang` being the article's language (the English
  fallback says `en`).
- Both are versioned with `?v=<manifest.build>` like every data URL. The root `CLAUDE.md`'s
  data contract documents them. A world without `sights.json` simply has no spotlight.

### Viewer

- `sights.json` is fetched after the map's first paint, the language's text file only on the
  first spotlight (and again when the language changes). Neither may delay the tiles.
- **Hit-testing** like the neighbourhood lines (mouse moves, throttled to a frame): the sight
  whose silhouette contains the pointer; when several overlap (a tall tower behind a low one),
  the one standing nearest the viewer (largest ground Y) wins.
- **Drawing** on the marks canvas (above the tilt-shift blur and the dusk tint): the dimming as
  one fill of the screen with the silhouette cut out, then the contour (2 screen px, the world's
  accent). The dim is about 58% of a near-black (`rgb(12 14 16 / .58)` in the mockup).
- **The sign** is a React component positioned beside `top`, kept on screen, using the
  existing place-type labels for the kicker. New strings ("Read on Wikipedia", "Close") go in
  all three dictionaries.
- The building spotlight takes precedence over the neighbourhood-line hover where both apply.
  Taps keep their double-tap zoom.
- **About** credits Wikipedia (CC BY-SA 4.0) for the descriptions, in the visitor's language,
  in a world that has sights.

## Goals

- Any searchable New York building, stadium, monument or bridge stands out under the pointer
  and says what it is, in the visitor's language, with a link to read more.
- The map loads as fast as today.

## Non-goals (this round)

- Other cities (the mechanism is general; only `tinynyc` opts in now).
- Highlighting buildings that are not in the search.
- Spotlighting a building when it is chosen from the search results.
- Pictures from Wikipedia, or descriptions written by hand.
- Keyboard navigation between buildings.

## Anti-goals

- A wrong article shown with confidence: no description beats a wrong one.
- Calling Wikipedia from the visitor's browser.
- A heavier first load or a slower first paint.
- A highlight that flickers while the mouse crosses a cluster of towers.

## Constraints

- The repository is public: no deployment details in any file.
- No hard-coded interface strings in the viewer; every new word in en, pt-BR and es-ES.
- The pipeline stays deterministic; existing tiles do not change.
- Wikipedia's text is CC BY-SA 4.0: shown as written, linked to its article, credited in About.
- Documentation: the pipeline's and the viewer's `CLAUDE.md` and the root data contract.

## Known and accepted

- The silhouette is the building's whole shape, so where a nearer, lower building stands in
  front of it, the spotlight lights that part of the nearer building too (visible in the
  chosen mockup).

## Left to the builder

- The exact matching rules and thresholds, as long as they lean towards no match.
- How the silhouette is unioned and simplified, and its precision.
- The sign's exact placement rules, fade timings and the dim's final strength.
- How a bridge is tied to its search entry.
- File layout inside the pipeline (a new `src/index/sights.ts` or similar) and the viewer
  (`src/map/sights.ts`, `components/map/sight-sign.tsx`).
