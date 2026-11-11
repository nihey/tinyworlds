# tinyworlds-pipeline

A TypeScript ESM command-line tool that turns open map data into a world's data set for the
viewer: a pyramid of isometric pixel-art tiles plus search and overlay indexes. No server, no
queue; run it by hand when the data or the drawing rules change. One process draws one city,
chosen with `--city` (default `tinynyc`).

| City               | Full run (20 cores) | Output               |
| ------------------ | ------------------- | -------------------- |
| `tinynyc`          | ≈ 5 min             | 0.8 GB, 30,000 files |
| `tinyrao`          | ≈ 2.5 min           | 0.3 GB, 11,000 files |
| `tinyorl`          | ≈ 4 min             | 1.1 GB, 29,000 files |
| `tinyfte`          | seconds             | a few MB             |
| `tinyvlc`          | ≈ 1 min             | 0.2 GB               |
| `tinylas`          | ≈ 1 min             | 0.2 GB               |
| `tinylax`          | ≈ 4 min             | 0.7 GB, 23,000 files |
| `tinydal`          | ≈ 1.5 min (+ wiki)  | 0.3 GB, 10,500 files |
| `tinycvg`          | ≈ 1 min (+ wiki)    | 0.2 GB, 6,300 files  |
| `tinypit`          | ≈ 1 min (+ wiki)    | 0.2 GB, 5,200 files  |
| `tinyphl`          | ≈ 1.5 min (+ wiki)  | 0.1 GB, 5,300 files  |
| `tinycos`          | ≈ 2 min (+ wiki)    | 0.4 GB, 11,700 files |
| `tinytkf`          | ≈ 1 min (+ wiki)    | 0.2 GB, 4,200 files  |
| `tinywinterfell`   | 3 s (no fetch)      | 4 MB, 230 files      |
| `tinykingslanding` | 8 s (no fetch)      | 21 MB, 730 files     |
| `tinywesteros`     | ≈ 2 min (no fetch)  | 0.2 GB, 14,100 files |

## Commands

```bash
npm run all -- --city tinyrao        # fetch → scene → render → index
npm run cli -- --city tinyrao fetch [--force]   # raw data into data/<city>/raw (skips what is there)
npm run cli -- --city tinyrao scene             # raw data → data/<city>/scene (typed arrays in map px)
npm run cli -- --city tinyrao render            # scene → ../tinyworlds-frontend/public/data/<city>
npm run cli -- render --around -73.9857,40.7484,1500   # only redraw near a point
npm run cli -- render --pyramid-only                    # rebuild the coarse levels from level 0
npm run cli -- --city tinyrao index             # places.json, hoods.json, life.json (+ sights.json, sights/)
                                                # and the indexes' version in manifest.json (`indexes`)
npm run cli -- --city tinynyc wiki [--force]    # sights.<locale>.json from Wikipedia (cached)
npm run cli -- --city tinynyc quiz [--list] [--force-views]   # quiz.<locale>.json: Guess the building's questions
npm run cli -- --city tinyrao card              # the share card → ../tinyworlds-frontend/public/og/<city>.jpg
npm run cli -- home-card                        # the front page's share card → …/public/og/tinyworlds.jpg
npm run cli -- preview --at -73.9969,40.7061 --size 1300,800 --zoom 2 --out /tmp/p.png
npm run cli -- --city tinyrao preview --at -47.8093,-21.1752 --size 1500,900 --shrink 4 --out /tmp/p.png
npm test          # vitest
npm run lint      # eslint + prettier --check   (lint:fix to fix)
```

`npm run cli` compiles with `tsc` first; worker threads load the compiled `dist/render/worker.js`.
`preview` is the tool for tuning the look: it renders one rectangle to a PNG in ~100 ms
(`--shrink n` draws n times the area and averages it down, to judge the zoomed-out look).
`TINY_CITY` in the environment is the same as `--city`.

## Stages

```
src/
├── cities/            # one definition per city: everything that differs between them
│   ├── types.ts       # the City contract
│   ├── tinynyc.ts (+ .landmarks.ts, .places.ts)
│   ├── tinyrao.ts (+ .places.ts)
│   ├── tinyorl.ts (+ .places.ts)
│   ├── tinyfte.ts (+ .places.ts)   # El Calafate (the id is its airport code)
│   ├── tinyvlc.ts (+ .places.ts)   # Valencia
│   ├── tinylas.ts (+ .places.ts)   # Las Vegas
│   ├── tinylax.ts (+ .places.ts, .areas.ts, .landmarks.ts)   # Los Angeles: County areas, the Hollywood Sign
│   ├── tinydal.ts (+ .places.ts, .landmarks.ts)   # Dallas: Reunion Tower's ball, the Margaret Hunt Hill arch
│   ├── tinycvg.ts (+ .places.ts)   # Cincinnati: the Roebling Bridge's cables, a riverboat on the Ohio
│   ├── tinypit.ts (+ .places.ts)   # Pittsburgh: the Point, three rivers, the city's 90 neighbourhoods
│   ├── tinyphl.ts (+ .places.ts)   # Philadelphia: Penn's grid, the Parkway, the city's neighbourhoods
│   ├── tinycos.ts (+ .places.ts)   # Colorado Springs: parts of town round named points, the Academy, red rocks
│   ├── tinytkf.ts (+ .places.ts)   # Truckee: the depot, Donner Lake, the Pioneer Monument as a statue
│   ├── sections.ts    # a city's published neighbourhoods as outlines, its parts of town as districts;
│   │                  # aroundPoints(): parts of town the data knows only as named points
│   ├── generated.ts   # generatedCity(): a City with no data behind it (see "Generated cities")
│   ├── tinywinterfell.ts, tinykingslanding.ts   # two places that do not exist, laid out by code
│   └── tinywesteros.ts (+ .land.ts, .places.ts)  # a whole imagined world as a toy-scale diorama
├── config.ts          # which city this process draws (CITY) and its directories (DIRS)
├── env.ts             # city-independent settings (tile size, Overture release, user agent)
├── projection.ts      # lon/lat → grid metres (uptown p, crosstown q) → 2:1 map px
├── sources/           # DataSource providers: overture.ts (DuckDB over public S3), nycOpenData.ts,
│                      # ibge.ts (census areas), openBuildings.ts (satellite height raster),
│                      # overtureAreas.ts (localities and neighbourhoods from Overture's divisions,
│                      #   and land use areas that are places of their own: an academy),
│                      # laCounty.ts (Los Angeles County's cities and communities),
│                      # publishedAreas.ts (a GeoJSON of areas a city publishes: Pittsburgh's, Philadelphia's)
├── geom/              # wkb.ts (WKB reader), geojson.ts, utm.ts
├── scene/
│   ├── build.ts       # raw → scene: ground polygons, lines, volumes, trees, cables, fog
│   ├── styles.ts      # footprint + height + class → materials; StyleProfile per building stock
│   ├── fog.ts         # distance-from-the-city grid (where the map ends), built-up detection
│   ├── decks.ts       # where a bridge deck stays up: settled per bridge, not per point
│   ├── truss.ts       # the steel of a cantilever bridge, in elevation: chords, posts, braces
│   ├── heights.ts     # heights read off the raster, with its correction curve
│   ├── kinds.ts       # ground kinds and their paint order (PAINT_RANK), patterns, roofs
│   ├── synthetic.ts   # the builder a generated city draws on; its scene and its index
│   ├── medieval.ts    # pure helpers for generated places: walls, towers, lanes, rows of houses
│   ├── worldkit.ts    # pure helpers for generated worlds: coasts, a land mask, mountains, model kits
│   └── hash.ts store.ts sinks.ts
├── render/
│   ├── palette.ts     # ~80 materials × 6 shades; shading only ever moves along a ramp
│   ├── raster.ts      # scanline polygon fill, no anti-aliasing
│   ├── chunk.ts       # ChunkRenderer: one rectangle of the map
│   ├── ground.ts      # ground kind → textured colour; shorelines; cane fields
│   ├── sprites.ts     # procedural trees (temperate, tropical, subtropical, boreal or montane colours)
│   ├── card.ts        # the 1200 × 630 share card with the pixel wordmark
│   ├── sign.ts        # the wordmark's pixel face and plate: cards, the front page's card, the videos
│   ├── plate.ts       # a picture cut from a world's finished tiles (any world, no scene needed)
│   ├── home-card.ts   # the front page's share card: six cities in leaning slices, from their tiles
│   ├── bin.ts run.ts worker.ts pyramid.ts encode.ts scene.ts
└── index/
    ├── build.ts       # search index, area outlines, ferry routes and flights (from data)
    ├── sights.ts      # which search entries are sights and what they are called; sights.json
    ├── structures.ts  # the structure an entry stands on, found in the scene
    ├── silhouette.ts  # a structure's outline as the map draws it (polygon-clipping)
    ├── write-sights.ts  # the sights pass of `index`
    ├── sprites.ts     # each sight drawn on its own (sights/<hash>.webp)
    ├── stamp.ts       # the indexes' version (a hash of them), written into the manifest
    ├── wiki.ts        # the `wiki` step: each sight's Wikipedia article, cached
    ├── quiz.ts        # Guess the building: blanking a name out of its text, levels, decoy sets
    ├── fame.ts        # how famous a sight is: its article's page views over a year (cached)
    └── write-quiz.ts  # the `quiz` step: quiz.<locale>.json
```

The renderer (`render/`) never imports the city: everything it needs is in the scene (including
`flora`). The scene builder and the index read the city through `CITY`.

## Adding a city

1. `src/cities/<id>.ts` implementing `City` (see `types.ts`; every field is documented there), and
   an entry in `src/cities/index.ts`. The decisions that matter:
   - `origin`, `betaDeg` (the street grid's bearing: measure it, don't guess) and `bbox`;
   - `limits`: polygons that are "the city" (`geojson`), or the built-up part of an Overture
     division (`built-up`) for a municipality that is mostly farmland, or of the whole bounding
     box (`built-up` with no division) for a metropolis that ignores its municipal limits. A park
     too big to have buildings near its middle fades into a hole in the map: name it in
     `parks` (Los Angeles' Griffith Park);
   - `heights.raster`: `true` where buildings have no mapped heights (add `openBuildings` to
     `sources`, after `overture`); `heights.floorsFirst` where the mapped heights are a model's
     estimates that read tall buildings low (Colorado Springs: twelve floors at 22 m): the floors,
     where mapped and taller, decide;
   - `style`: a `StyleProfile` from `scene/styles.ts` (`NEW_YORK`, `PAULISTA`, `FLORIDA`,
     `MEDITERRANEAN`, `PATAGONIA`, `MOJAVE`, `SOCAL`, `TEXAS`, `OHIO_RIVER`, `SIERRA`, or a new
     one), and `flora`, the trees' colours (`montane`: Truckee's pines and firs, with no snow on
     them, unlike `boreal`'s);
   - `search.namedBuildings`: which named buildings are listed and light up. New York's default
     (110 m and a few civic classes) leaves a smaller city with a dozen; Dallas lists from 60 m,
     Cincinnati from 40 m, both with churches, civic buildings and campuses; Truckee, a town of
     one- and two-storey buildings, from 5 m, with its schools, hospital and post office; `skip`
     leaves out names that say nothing ("Building 4");
   - the water: a river inside the land polygons needs `riverBridges` for its bridges to rise
     (the Ohio); a "reservoir" that is grass most of the year goes in `ground.dryWater` (the
     Trinity's floodway);
   - `ground`: how the data's land classes read locally (cane fields, dry steppe, market gardens);
   - `heightFixes` / `heightCaps`: the few places where the mapped heights are plainly wrong
     (look at the tallest buildings in a preview before trusting them);
   - `areas()`: the districts (context lines) and the outlined areas, from whatever the city
     publishes. Where Overture's neighbourhoods are thin or wrong, download the city's own
     (`publishedAreas`) and let `sectioned()` (`sections.ts`) file them under the parts of town
     locals name (Pittsburgh's Downtown, North Side, Oakland; Philadelphia's Center City,
     University City): those become the districts, so a context line says "Downtown", not
     "Pittsburgh", and the quiz's areas are a dozen, not one. The towns beside the city stay
     districts of their own. Where nobody publishes outlines but the data names the parts of
     town as points (Colorado Springs' Downtown, Old North End, Westside: Overture's macrohoods),
     `aroundPoints()` makes each the ground nearer its point than any other, out to a radius,
     listed after the city so it wins over it; a land use area that is a place of its own (the
     Air Force Academy) becomes a district through `overtureAreas({ landUse })`;
   - `curated`: take coordinates from the data, not from memory.
2. `npm run all -- --city <id>` and `npm run cli -- --city <id> card`.
3. The viewer's side: see `tinyworlds-frontend/CLAUDE.md` ("Worlds").

After changing shared code, check New York has not moved: render a few `preview`s before and
after and `cmp` them (they should be byte-identical unless the change was meant to show).

## Generated cities (`scene/synthetic.ts`, `scene/medieval.ts`)

A city with a `synthetic` function has no data at all: `fetch` finds nothing to do, `scene` and
`index` call the function instead of reading Overture, and `render` and `card` cannot tell the
difference. `generatedCity()` in `cities/generated.ts` fills in the rest of the `City` contract
(origin 0/0, `betaDeg` 0 unless the spec gives one, `k` 2, no sources), so a generator is one file:

```ts
export const tinywinterfell = generatedCity({
  id, title, accent, flora, attribution,
  start: { p, q, scale }, card: { p, q, shrink }, fog: { start, end },
  generate(b: SyntheticBuilder) { … },
});
```

Everything is in the grid's metres: `p` runs up and to the right on screen, `q` down and to the
right, so the viewer stands at the +q, −p corner. Rings and paths are flat `[p0, q0, p1, q1, …]`.
For `preview --at`, a point is `lon = q / 111194.93`, `lat = p / 111194.93`.

| Builder call                                       | Draws                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| `ground(kind, ring \| [outer, ...holes])`          | a ground polygon (water is the default: start with `G.Land`)        |
| `line(kind, width, path, overWater?)`              | a road, stream or quay with a true width                            |
| `volume(corners, height, base, look)`              | an extruded footprint from `base` to `height` metres, roof included |
| `prism(p, q, radius, sides, height, base, look)`   | a regular prism: towers, columns, tents                             |
| `tree(p, q)`                                       | one tree sprite                                                     |
| `limits(ring)`                                     | what counts as the place: the fog is measured from it               |
| `place({ n, t, p, q, b?, r, s? })`                 | a search result                                                     |
| `hood(name, district, ring)` / `route(name, path)` | an outlined area (also searchable) / a route a boat sails           |

A `Look` says exactly how a volume is drawn (`wall`, `roof`, `glass`, `pattern`, `roofShape`,
`roofH`): nothing is guessed from a style profile.

`medieval.ts` is what such places are made of, and knows nothing of either city: geometry
(`rect`, `disc`, `blob`, `inset`, `ribbon`, `chaikin`, `wander`, `pointAlong`), an `Occupancy`
grid so nothing is built on anything else, `curtain` (a wall round a ring with towers and
gatehouses; returns where the gates ended up and which way is out), `tower`, `wallPiece`,
`steps`, `growLanes` (lanes grown off streets, generation by generation, until the allowed
ground is full), `lineWithHouses` (plots stepped off along a street, richer or poorer by a
wealth map) and `standingTree`.

- **Deterministic.** The generator runs once for the scene and again for the index, and must draw
  the same place both times: every choice is a hash (`rand`, `mix`, `pick`), never `Math.random`.
  `cities/generated.test.ts` checks it.
- **Hills are volumes.** The map is flat, so a rock or a terrace is a wide, low volume and what
  stands on it has a `base` (`tower`, `wallPiece` and `curtain` take one). The ground under a
  terrace does not show: its floor is the roof colour, patches of paving or grass are thin slabs
  on top, and trees up there are `standingTree`s, not sprites.
- **Paint order still rules the ground.** A base wash must be a low-ranked kind (`G.Snow`,
  `G.Meadow`) or everything painted after it disappears under it.
- These are fan work on invented layouts: only names are borrowed, no map is followed, and
  `attribution` says so. Keep it that way.

## Generated worlds (`scene/worldkit.ts`, `cities/tinywesteros*.ts`)

`tinywesteros` is not a place but a world: Westeros from beyond the Wall to Dorne, Essos from
Braavos to Asshai, the islands and seas between, on one map of 82,000 × 32,000 px. Three things
set it apart from the two generated cities.

- **Toy scale.** About four units ("metres") to a kilometre, so the continents are small, and
  every place is a model far bigger than it should be: a castle is ~100 units across, a great
  city ~400, a mountain a pyramid ~150 wide. Forests are the renderer's own scattered trees,
  which at this scale read as texture. Think of pieces on a war table.
- **North is up.** `betaDeg: 45` (a `generatedCity` option) turns the grid 45° from the compass,
  so `manifest.northDeg` is 0. The layout is written in world coordinates, `e` east and `n`
  north, and converted with `toPQ(e, n)`: `p = (e + n)/√2`, `q = (e − n)/√2` (`toEN` goes back,
  `pathPQ` does a flat path). Models are still built along the grid, where boxes draw best, so
  they stand at 45° to the compass. For `preview --at`: `lon = e / 111195.08`,
  `lat = n / 111195.08`.
- **A stretched sketch.** The view halves everything north–south, so a continent drawn square
  looks squat. The geography is sketched in steps of `EAST` = 80 units eastward and `NORTH` = 125
  northward (`tinywesteros.land.ts`): King's Landing is at 0, 0, the Wall at 76 north. Sizes of
  models stay in plain units.

The data is in two files and the assembly in a third:

| File                     | Holds                                                                         |
| ------------------------ | ----------------------------------------------------------------------------- |
| `tinywesteros.land.ts`   | coasts (a few dozen named corners each), islands, lakes, rivers, ranges,      |
|                          | ground colours (`BIOMES`), regions, roads, sea lanes, names of seas and capes |
| `tinywesteros.places.ts` | every place: name, kit, position in the sketch, region, rank, style           |
| `tinywesteros.ts`        | styles per region, the builders of the places that have their own, the order  |

How a run goes (`generate`): coasts are roughened and rasterised into a `LandMask` (lakes and
rivers taken out again); every place is `settle`d onto dry ground near its sketch position; then
ground, roads, places, the Wall, mountains, hamlets and camps, names. It throws if a place ends
up in the water or two places overlap, naming them: fix the sketch.

`worldkit.ts` is what it is made of, and knows nothing of Westeros:

| Helper                                     | Does                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `roughen(points, seed, opts)`              | midpoint displacement: a few corners become a coast. Keeps the     |
|                                            | corners it is given, and a segment roughens the same from either   |
|                                            | end, so two outlines sharing an edge still share it                |
| `sketch`, `isle`                           | sketch steps → units; a wobbly island ring                         |
| `LandMask`, `settle`, `nearestWater`       | where the land is; move a disc off the water; which way the sea is |
| `nearestOnPath`                            | the point of a river nearest a place and the way it runs there     |
| `range(b, path, opts)`, `peak`             | a mountain range: rows of pyramids, capped above a height          |
| `grove`                                    | trees one by one (for woods on snow, where none are scattered)     |
| `castle`, `holdfast`, `ruin`, `camp`       | the small kits; `castle` takes `double`, `moat`, `sides`, `base`   |
| `city(b, p, q, radius, style, seed, opts)` | walls, gates, a landmark (keep, sept, dome, pyramid, tower), a     |
|                                            | citadel, piers towards the water, houses; `open` for no walls      |
| `wallRing`, `houses`, `harbour`, `ship`    | the parts of those, for places built by hand                       |
| `round`, `keep`, `hall`, `block`, `dome`,  | single pieces: a round tower, a keep, a house, a box, a dome, a    |
| `ziggurat`, `crag`, `bigTree`              | stepped pyramid, a rock to stand a castle on, a tree as volumes    |

A `Style` (`stone`, `tower`, `cone`, `roof`, house `walls` and `roofs`, `floor`, `flat`) is what
a region builds with; `STYLES` in `tinywesteros.ts` has one per region.

To add a place: a row in `tinywesteros.places.ts` with one of the kits (`castle`, `greatcastle`,
`holdfast`, `tower`, `ruin`, `village`, `town`, `port`, `city`, `portcity`, `pyramid`, `camp`,
`weirwood`). For a model of its own, give it the kit `special`, add a builder under its name to
`SPECIALS` and its radius to `SPECIAL` (`fixed` if it must stay exactly where sketched: on a
river, an islet, the Wall).

- **Regions are hoods.** A `Region` is a ring made of stretches of coast between named corners
  (`"wall-e>vale-n"`) and inland corners; borders are roughened pairwise so neighbours meet.
- **Snow is painted under grass** (`PAINT_RANK`), so the snow patches of the North are holes in
  the one grass polygon. Holes must not overlap: even-odd fill turns an overlap back to grass.
- **Earth and steppe get a quay wall where they meet water** (the renderer only knows natural
  banks for green kinds, sand and rock). Keep them off the coast (a band of `G.Sand` or
  `G.Scrub`, which paint over them) and give rivers through them `banks: true`.
- **No ground shows on a paved floor.** A garden inside a castle is `bigTree`s; lava and the
  sand of an arena are thin slabs.
- **A preview is one picture**: `sharp` refuses more than 268 million px, so `--shrink 12` with
  `--size 1500,900` is about the widest view (the share card uses `shrink: 18`).
- The geography is sketched from nothing but the commonly known arrangement of the world and
  roughened by code. Do not trace a map, official or fan-made, into it.

## Sights: what lights up under the pointer (`index/sights.ts`, `index/wiki.ts`)

A city with `sights` (New York, Dallas, Cincinnati, Pittsburgh, Philadelphia, Colorado Springs, Truckee) gets `sights.json` from `index` and `sights.<locale>.json` from
`wiki` (see the root `CLAUDE.md` for both files). A **sight** is one structure on the map that
one or more search entries point at.

- **Which entries.** Curated ones only when flagged `sight: true` (one building, stadium,
  statue or bridge; never an area: Times Square, Wall Street, Rockefeller Center, the airports
  stay unflagged); every named building from the building data; the points of interest, except
  the categories that are areas (`college_university`, `airport`, `zoo`, `amusement_park`); rail
  and subway stations. Streets, hoods, boroughs and parks never.
- **Finding the structure** (`makeFinder`): a bridge by its roads' names (the scene's
  `owners.json`; a name inside "Ed Koch Queensboro Bridge Upper Level" counts), plus the pieces
  filed under the other roads' names the city lists for it (`sights.bridges`: the Manhattan
  Bridge's towers stand under "Canal Street (lower level)", the Williamsburg's under "BMT Jamaica
  Line") that lie within 40 m of its own pieces' extent (a bridge with no piece under its own
  name, Pittsburgh's Smithfield Street Bridge filed under "Smithfield Street", is those pieces
  within 220 m of its point); the statue within
  30 m, a stadium's stands from a point anywhere in its grounds (`land_use` class `stadium`), a
  building entry's own building by its seed, else the building whose footprint holds the point,
  within 4 m. A building is all the volumes with its seed (`hashString` of its id, which its parts
  share) within 300 m. An entry on nothing is no sight.
- **Naming** (`resolveSights`): the curated entry, else the building's own name (as the type
  `building`), else the best-ranked entry. A point of interest never renames a building that
  has a name of its own. When the index drops a building entry as a duplicate of a curated one,
  its seed moves to the curated entry (One World Trade Center's hand-picked point misses its
  footprint by 5 m).
- **The outline** (`silhouette`): every volume's footprint swept from its underside to its top
  (`base` to `top + roofH`, in px), merged and simplified to a pixel, in map px. A spire or a
  dome (`Roof.Pyramid`, `Roof.Dome`) narrows towards the volume's centre as the renderer draws it
  (`piecesOf`: the walls to `top`, then ten steps of the roof, each as wide as the roof at its
  foot), so the Chrysler's outline follows its spire, not a box round it.
- **The picture** (`sprites.ts`, `sights/<hash>.webp`): each sight drawn again on its own, so
  the viewer can show all of it when it lights up, even where a nearer tower hides it in the
  tiles. It is the tile renderer's own drawing of the outline's box with only the sight's volumes
  (`ChunkJob.alone`: everything else transparent) and every volume that shades them
  (`binVolumes`, fed by a `VolumeGrid` so a small box need not look at all 1.4 million), so its
  windows and shadows are the tiles'. Trees, cables and the ground are left out: a tree standing
  in front would leave a hole. A picture over `MAX_SPRITE_PX` is not made. New York's 1,219 come
  to 3 MB in about 8 s; `index` empties `sights/` and draws them all again.
- **The scene keeps the owners** of what is not a building (`owners.json` beside it): a bridge's
  decks, piers, towers and cantilever steel under its roads' name, each statue's pieces.
- **Wikipedia** (`wiki`): the English article whose title matches the sight's name (normalised:
  case, accents, punctuation, a leading "The", a trailing "(…)") among those within 300 m of its
  point (an exact title first, then the nearest; a station takes "<name> station", or its bare
  name only when that says station, terminal, center or hub; a title closed with a span of years,
  "(1978–2016)", is the building that stood there before, never a match), then its Portuguese
  and Spanish versions through the language links; for each, the summary's opening, whole
  sentences up to 220 characters. A doubtful match is none. Every answer is cached in
  `data/<city>/raw/wikipedia/` (a missing page as `null`), so a rerun asks nothing; `--force`
  asks again. Requests go one at a time, 200 ms apart (a 429 waits for `Retry-After`, else 2 s
  doubling, and asks again), with `WIKI_USER_AGENT` (the project's public page; no person). `sights.wikipedia` in the city forces a title by sight
  name, or `null` for none, for the misses and the wrong ones.

## Guess the building (`index/quiz.ts`, `index/write-quiz.ts`)

The `quiz` step (run by `all` after `wiki`, where a city has sights) writes `quiz.<locale>.json`
(root `CLAUDE.md`): one question per sight with an English article, in the three languages.
Offline and deterministic; `--list` prints every blanked text, to read them through after a
change to the rules below.

- **Blanking** (`blankName`): the sight's name and its article's title (a trailing "(…)"
  dropped) as whole phrases with a leading article; then each of their _distinctive_ words
  wherever else it stands, possessive included; then a run of the name's own words that mixes a
  place word with another ("the Bronx Museum" of The Bronx Museum of the Arts); then the name's
  initials in capitals ("(MoMA)", "(SNFL)", "(MoMI)"). Accent- and case-blind, whole words. A
  word is distinctive unless it is common (`COMMON_WORDS`: articles, prepositions, numbers,
  what buildings are, in the three languages) or a place word of the city
  (`sights.placeWords`, and the sights' context lines): "New York" stays in "in New York City".
  A name with nothing but place and common words counts its place words ("Brooklyn" in the
  Brooklyn Bridge). Blanks that only spaces or dashes part become one. A text with fewer than
  `MIN_LEFT` (60) characters left is not asked in that language. After changing these rules,
  read `--list` through: no question may show its own name, its initials or a decoy's name.
- **Aliases.** The short or former names an opening gives that would give a building away
  ("the Met", "One WTC", "Freedom Tower") are listed per city (`sights.aliases`, by lower-case
  sight name) and blanked like its name. Find new ones by reading `--list` for "known as",
  "referred to as", "conhecido como", "conocido como".
- **One question per article.** Two sights on one article ("Avenue J", "Avenue J station") are
  one question, so a right answer can never be graded wrong. A building's own area is part of
  its name (the Statue of Liberty's "Liberty", on Liberty Island): its context line's words are
  not place words in its own question.
- **Decoys** (`pickDecoys`): three other questions' sights of the same kind, nearest first. The
  kind (`kindOf`) is the type for stations and bridges; else what the English opening says it
  is after "is a" (museum, library, venue: theatres and concert halls, worship, hotel, school,
  stadium); else a kind word in the name; else general. A kind with fewer than four borrows the
  nearest general ones. Never one sharing a distinctive word with the answer, one the
  question's text names, two names that differ only by common words ("Carnegie Hall", "Carnegie
  Hall Tower"), or an address the text's own address rules out ("712 Fifth Avenue" beside "at
  721 Fifth Avenue"; ordinals and numbers read alike). Chosen once for all languages.
- **Difficulty, borough and kind.** A player chooses a difficulty, a borough and a kind
  (`2026-11-11-quiz-choices-design.md`), so each question also carries:
  - `level` (1 easy, 2 medium, 3 hard: the easiest difficulty it is in), by how much its English
    article is read over the last twelve complete months (`fame.ts`, Wikimedia's pageviews API
    through the `wiki` cache; the window is kept in `raw/wikipedia/pageviews-window.json`, so a
    rerun asks nothing; `--force-views` asks again as of today): the most read quarter easy, up
    to three fifths medium (levels are cumulative: hard asks everything);
  - `group` (`buildings`, `museums`, `landmarks`, `stations`, from the kind; statues and
    memorials are a `monument` kind, a landmark) and `area` (its borough, when its context line is
    one of the `borough` places in `places.json`);
  - `sets`: per difficulty it is in, wrong answers for each **scope** a choice narrows them to
    (`all`, `area`: the answer's borough, `group`: its kind, `both`), a scope left out when equal
    to `all`. Candidates are that difficulty's questions; hard orders them by kind then distance,
    medium by kind then closeness in fame, easy by closeness in fame (with the kind free, other
    groups first, one per group among the groups with at least `SPREAD_GROUP` (8) candidates, so
    two famous stations are not in every round). A scope too small borrows from the difficulty
    (keeping the kind before the borough), then from anyone. `decoys` stays hard's `all` set,
    for older pages; `pickDecoys` is the older single-set rule, kept for its tests.
- New York: 393 questions (easy 99, medium 137, hard 157); 389 asked in English and
  Portuguese, 384 in Spanish; about 35 narrowed sets per difficulty borrow (the count includes
  the borough sets of questions with no borough, which are never played). On easy no wrong
  name is in more than about a fifth of a choice's rounds (`--list`, and a count over
  `quiz.en-US.json`, show it).
- Cincinnati: 67 questions (easy 17, medium 24, hard 26), Dallas: 63 (easy 16, medium 22, hard
  25). Their context lines are neighbourhoods ("Downtown", "Over-the-Rhine"), so a question's
  area is the district it stands in (`sights.areaByDistrict`), among all the city's districts
  (Covington's middle is off the map, so it is no `borough` place). Pittsburgh: 104 questions
  (easy 26, medium 37, hard 41), Philadelphia: 105 (easy 27, medium 36, hard 42); their
  districts are the parts of town (`sectioned`), so a question's area is Downtown or Oakland,
  Center City or University City. Colorado Springs: 60 (easy 15, medium 21, hard 24), its areas
  the parts of town round Overture's points, Manitou Springs and the Air Force Academy. Most of
  its articles are on buildings the data names otherwise or not at all (historic houses,
  churches): they were found by listing every article with coordinates in the box (the
  `geosearch` API), matching each to the footprint at its point, and curating those.
- Truckee: 6 questions (easy 2, medium 2, hard 2; 5 asked in each language, Truckee station's
  opening being all name), from 8 of its 41 sights on 6 articles: too few for a game, so its
  viewer has `sights` and no `quiz`. The files are written all the same.
- **Wikipedia's requests can fail in bulk** ("fetch failed"): failures are not cached, so run
  `wiki` again until it reports none failed.

## How a tile is drawn (`render/chunk.ts`)

1. **Ground kinds.** Every ground pixel gets a kind (water, pavement, park, road…). Polygons are
   painted in kind order; roads are stroked with true metre widths.
2. **Heights.** Footprints are stamped into a height map, then swept left to right losing
   `SUN_DROP` px per px: afterwards each pixel holds how high the shadow stands there.
3. **Volumes.** Walls and roofs go into a height buffer. In this projection the visible surface
   at a pixel is the highest one along its line of sight, so `H >= hb[i]` is the whole depth test.
   Window patterns are integer px in wall-local coordinates, which is what keeps them crisp.
4. **Finish.** Ground textures, cast shadows (ground, roofs and sun-facing walls), outlines and
   roof lips from the object/height buffers, then the fog's dithered edge.

Rendering is done in blocks of 4×4 tiles on worker threads that share the scene through
`SharedArrayBuffer`s. Each block is binned with what it needs: volumes that show in it, volumes
whose shadows reach it, and margins for both.

## Rules of the look

- No anti-aliasing and no colour outside the palette at level 0. Coarser levels are averaged.
- Light comes from the upper left (sun bearing 254°): left walls lit, right walls shaded, shadows
  fall straight to the right.
- The view is aligned to the city's street grid (`betaDeg`: Manhattan's avenues at 28.9°,
  Ribeirão Preto's central grid at 38.97°, Orlando's compass grid at −0.5°, the Los Angeles
  basin's at −0.1°, measured over 3,000 km of streets; Dallas' compass grid at 0.2°, a quarter
  of its 3,200 km of streets, rather than Uptown's at 45.3°, which would stand every freeway on
  end; Cincinnati's downtown, Over-the-Rhine and Covington at −11.1°, so the view looks across
  the river at the skyline; Pittsburgh at 61°, the Golden Triangle's second grid and the whole
  box's strongest bearing, so the view looks from Mount Washington across the Monongahela at
  the Point; Philadelphia's grid at −8.1°, so City Hall stands at the hub and the Parkway leads
  the eye up to the Art Museum; Colorado Springs' downtown and Old North End at 2.3°, General
  Palmer's grid, rather than the section-line roads' 0°; Truckee's downtown at 71.1°, the grid
  that follows the railroad, 14% of the core's streets, rather than the compass grid that peaks
  over the whole box (0.3°, 6%: Donner Pass Road, the lake shore, Glenshire), so the view looks
  across the river and the tracks at Commercial Row with north near the top) so its streets are exact 2:1 lines. Measure it as the peak of the
  streets' bearings modulo 90°, weighted by length.
- Everything is deterministic: variation comes from hashes of ids and positions, never `Math.random`.
- Bridge decks rise with distance from the shore (`deckHeight` in `scene/build.ts`); towers come
  from the data; pairs of equal-height towers get cables.
- A deck only comes down where its bridge ends. Pieces that meet end to end are one bridge, and
  `holdDecks` (`scene/decks.ts`) keeps it up over land it merely passes: between two crossings it
  stays at the lower of their crests (the Queensboro over Roosevelt Island, the Throgs Neck over
  its point, a tower's footing). A ramp down to that land still lets it land there. It never
  lowers a deck, so a bridge over one stretch of water is drawn as before.
- Two towers of one height carry cables; **three or more of one height in a row are a cantilever
  bridge** (the Queensboro), and nothing in a city's file says so. Its towers become masonry piers
  up to the deck with a pair of pointed steel posts above, braced across; a truss stands each side
  of the roadway (`cantileverTruss` in `scene/truss.ts`: the top chord sweeps down from every
  tower top, anchor arms reach past the outer towers); and its deck runs level through the steel,
  0.36 of the way up the towers, coming down by ramps to where the bridge ends (a step outside the
  steel stands at its share of the way from the ground to the steel, `distanceAlong`).
- Trusses are drawn like cables, as 3D lines (`cab` in the scene): kinds 0 and 1 are a main cable
  and a suspender, bare steel a pixel across; 2 and 3 are a truss chord and a lesser member,
  painted and two pixels across, so a truss still reads from afar.
- A building with parts is drawn as its parts alone, since they normally tile it. The exception
  is a **grandstand or stadium whose parts cover less than half of it**: the parts stand on the
  stands, so both are drawn (Citi Field's bowl, where only the Home Run Apple is a part; Las
  Vegas' Thomas & Mack Center; Valencia's Roig Arena). Pieces of its outline that the parts do
  cover are left to the parts: Dodger Stadium's outline is the grandstand and the two outfield
  pavilions, and only the pavilions have parts.
- **Unnamed stands take the name of the stadium grounds** they stand in (`class = stadium` land
  use), so `landmarks` and `heightFixes` can reach them: that is how Citi Field gets its brick
  and green seats and Yankee Stadium its limestone. A part that only borrows that name keeps a
  height of its own: Dodger Stadium's height fix is for its stands (mapped two metres tall), not
  its pavilions.
- **Statues** (`City.statues`) are what is not a building and so not in the data: stacked
  prisms (`r`: the Statue of Liberty) or boxes (`hp`, `hq`: the letters of the Hollywood Sign,
  set from a pixel face in `tinylax.landmarks.ts`), in patina, gold or white. Dallas has two:
  the lower half of Reunion Tower's ball, stepped in under the dome the data draws, and the
  Margaret Hunt Hill Bridge's arch, boxes stepped along the bridge (`huntHillArch` turns the
  bridge's bearing into the grid's, so it follows `betaDeg`).
- **Towers mapped as buildings.** Cincinnati's Roebling Bridge has detailed towers in the
  building data, not bridge supports, so nothing would string cables between them: the city
  names the span in `suspensions` (the two tower tops, the cables' height, how far out they are
  anchored), and the scene strings it like the data's. For it to light up as one bridge, the
  building's name goes in `sights.bridges` with the roads' other names: a building of a name
  listed there is filed under it in `owners.json`.
- **Boats the data has no route for** (`boats`: Cincinnati's riverboat on the Ohio) sail like
  the ferries, there and back; the route is drawn down the middle of the water by hand.
- New ground kinds go at the **end** of `G` too and get their place in the paint order from
  `PAINT_RANK` (`G.Snow`, `G.Meadow`, `G.Cobble`, `G.DirtRoad` and `G.RedRock`, Colorado
  Springs' sandstone through `ground.land`, were added this way), so scenes
  already on disk keep their meaning.
- New palette ramps go at the **end** of `RAMP_DEFS`: a ramp's id is its position, and scenes
  store ids.

## Heights without a survey (`scene/heights.ts`)

New York's buildings come with heights. Ribeirão Preto's do not (459 of 360,000), so there:
mapped height → mapped floors × `heights.storey` → the Google Open Buildings 2.5D raster. The
raster is read as the median inside the footprint and corrected with a curve fitted against the
~4,000 buildings whose floors are mapped (it reads 5.5 m for one storey and saturates near
95 m). Refit the curve for another city before trusting it there.

The raster covers the Global South, not the United States. There Overture's buildings often
carry Microsoft's machine-learned heights instead (`sources` names "Microsoft ML Buildings" for
the height): Truckee's 87% are all of that kind, estimates from imagery, none surveyed, and its
About notes say so.

Colorado Springs' buildings nearly all come with a height, but an estimated one that reads tall
buildings low (a dozen floors at 22 m, a six-storey dormitory at 3 m): `heights.floorsFirst`
lets the mapped floors decide where they say taller, and `heightFixes` set the landmarks that
have no floors mapped (the Academy's halls, the Broadmoor).

## Data

| Source                              | What                                                                          | Licence                                             |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Overture Maps (`OVERTURE_RELEASE`)  | buildings, land, water, land use and cover, roads, rails, places, divisions   | ODbL / CDLA (includes © OpenStreetMap contributors) |
| NYC Open Data                       | borough boundaries, 2020 NTAs, 2015 street tree census                        | public domain                                       |
| Google Open Buildings 2.5D Temporal | building heights estimated from satellite imagery (4 m raster), for `tinyrao` | CC BY 4.0                                           |
| IBGE, Censo 2022                    | Ribeirão Preto's planning sub-sectors ("bairros" layer)                       | open, attribution                                   |
| Los Angeles County Enterprise GIS   | Countywide Statistical Areas: cities, LA's communities, unincorporated areas  | open, attribution                                   |
| City of Pittsburgh (WPRDC)          | Pittsburgh's 90 neighbourhoods                                                | CC BY                                               |
| Abaca Labs (OpenDataPhilly)         | Philadelphia's 159 neighbourhoods                                             | CC BY 4.0                                           |
| Wikipedia (en, pt, es)              | the openings of the sights' articles, and their links (`wiki`)                | CC BY-SA 4.0                                        |

`data/` (raw downloads and scenes, per city) is gitignored and reproducible.

## Gotchas

- DuckDB: filtering local Parquet on the `bbox` struct column crashes this DuckDB build; filter on
  `ST_X(ST_Centroid(geometry))` instead.
- Changing `k`, the origin or `betaDeg` moves every pixel: re-run `scene`, `render` and `index`.
  Share links survive because the viewer's URL hash is in lon/lat.
- Colour indices are `Uint16` (more than 256 palette entries).
- Overture's land cover comes at several generalisation levels stacked on each other: only
  `cartography.min_zoom >= 8` is used.
- A ground polygon can be far larger than the map (100 km² of cropland): whether to keep it is
  decided from its bounding box (`nearRing`), not from its first vertex.
- Street trees in Ribeirão Preto and Orlando are planted by rule (`trees.street`), not
  surveyed; New York's come from the census.
- Overture's primary name of a division is sometimes in another script; `overtureAreas` prefers
  the English common name. Which division subtypes are districts and which are outlines differs
  by country (Valencia's districts are "macrohoods"): set them per city. A city larger than
  `maxArea` (0.05 square degrees, so no county counts as a town) needs it raised (Dallas). In
  Dallas the "neighbourhoods" are mostly improvement districts and the zoo's exhibits: its
  `areas()` renames or drops them, and `search.skip` keeps them (and points of interest that are not what they say) out of the search.
- Overture's land comes in one-degree tiles, fetched when they meet the box. A city that runs
  past its box keeps its fog's margin (up to `fog.end`, 1.9 km) outside it: if that margin
  crosses a degree line the box does not, the next tile is missing and the margin is drawn as
  water. Philadelphia's box reaches past 40° north for this.
- A city with no building parts gets an empty `building_part.parquet` whose geometry column has
  lost its type: the scene builder skips the parts pass when the file has no rows.
- Never insert a ground kind in the middle of `G`: it renumbers the ones after it and every
  scene on disk would have to be rebuilt. Append it and rank it (see "Rules of the look").
- A generated world whose limits are a rectangle on screen sets `framed: true`: the renderer then
  cuts it off at that rectangle (`scene.clip`) instead of letting the fog notch the straight edge.
