# tinyworlds-pipeline

A TypeScript ESM command-line tool that turns open map data into a world's data set for the
viewer: a pyramid of isometric pixel-art tiles plus search and overlay indexes. No server, no
queue; run it by hand when the data or the drawing rules change. One process draws one city,
chosen with `--city` (default `tinynyc`).

| City      | Full run (20 cores) | Output               |
| --------- | ------------------- | -------------------- |
| `tinynyc` | ≈ 5 min             | 0.8 GB, 30,000 files |
| `tinyrao` | ≈ 2.5 min           | 0.3 GB, 11,000 files |
| `tinyorl` | ≈ 4 min             | 1.1 GB, 29,000 files |
| `tinyfte` | seconds             | a few MB             |
| `tinyvlc` | ≈ 1 min             | 0.2 GB               |

## Commands

```bash
npm run all -- --city tinyrao        # fetch → scene → render → index
npm run cli -- --city tinyrao fetch [--force]   # raw data into data/<city>/raw (skips what is there)
npm run cli -- --city tinyrao scene             # raw data → data/<city>/scene (typed arrays in map px)
npm run cli -- --city tinyrao render            # scene → ../tinyworlds-frontend/public/data/<city>
npm run cli -- render --around -73.9857,40.7484,1500   # only redraw near a point
npm run cli -- render --pyramid-only                    # rebuild the coarse levels from level 0
npm run cli -- --city tinyrao index             # places.json, hoods.json, life.json
npm run cli -- --city tinyrao card              # the share card → ../tinyworlds-frontend/public/og/<city>.jpg
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
│   └── tinyvlc.ts (+ .places.ts)   # Valencia
├── config.ts          # which city this process draws (CITY) and its directories (DIRS)
├── env.ts             # city-independent settings (tile size, Overture release, user agent)
├── projection.ts      # lon/lat → grid metres (uptown p, crosstown q) → 2:1 map px
├── sources/           # DataSource providers: overture.ts (DuckDB over public S3), nycOpenData.ts,
│                      # ibge.ts (census areas), openBuildings.ts (satellite height raster),
│                      # overtureAreas.ts (localities and neighbourhoods from Overture's divisions)
├── geom/              # wkb.ts (WKB reader), geojson.ts, utm.ts
├── scene/
│   ├── build.ts       # raw → scene: ground polygons, lines, volumes, trees, cables, fog
│   ├── styles.ts      # footprint + height + class → materials; StyleProfile per building stock
│   ├── fog.ts         # distance-from-the-city grid (where the map ends), built-up detection
│   ├── heights.ts     # heights read off the raster, with its correction curve
│   ├── kinds.ts       # ground kinds (their numeric order is the paint order), patterns, roofs
│   └── hash.ts store.ts
├── render/
│   ├── palette.ts     # ~80 materials × 6 shades; shading only ever moves along a ramp
│   ├── raster.ts      # scanline polygon fill, no anti-aliasing
│   ├── chunk.ts       # ChunkRenderer: one rectangle of the map
│   ├── ground.ts      # ground kind → textured colour; shorelines; cane fields
│   ├── sprites.ts     # procedural trees (temperate or tropical colours)
│   ├── card.ts        # the 1200 × 630 share card with the pixel wordmark
│   ├── bin.ts run.ts worker.ts pyramid.ts encode.ts scene.ts
└── index/build.ts     # search index, area outlines, ferry routes and flights
```

The renderer (`render/`) never imports the city: everything it needs is in the scene (including
`flora`). The scene builder and the index read the city through `CITY`.

## Adding a city

1. `src/cities/<id>.ts` implementing `City` (see `types.ts`; every field is documented there), and
   an entry in `src/cities/index.ts`. The decisions that matter:
   - `origin`, `betaDeg` (the street grid's bearing: measure it, don't guess) and `bbox`;
   - `limits`: polygons that are "the city" (`geojson`), or the built-up part of an Overture
     division (`built-up`) for a municipality that is mostly farmland, or of the whole bounding
     box (`built-up` with no division) for a metropolis that ignores its municipal limits;
   - `heights.raster`: `true` where buildings have no mapped heights (add `openBuildings` to
     `sources`, after `overture`);
   - `style`: a `StyleProfile` from `scene/styles.ts` (`NEW_YORK`, `PAULISTA`, `FLORIDA`,
     `MEDITERRANEAN`, `PATAGONIA`, or a new one);
   - `ground`: how the data's land classes read locally (cane fields, dry steppe, market gardens);
   - `heightFixes` / `heightCaps`: the few places where the mapped heights are plainly wrong
     (look at the tallest buildings in a preview before trusting them);
   - `areas()`: the districts (context lines) and the outlined areas, from whatever the city
     publishes;
   - `curated`: take coordinates from the data, not from memory.
2. `npm run all -- --city <id>` and `npm run cli -- --city <id> card`.
3. The viewer's side: see `tinyworlds-frontend/CLAUDE.md` ("Worlds").

After changing shared code, check New York has not moved: render a few `preview`s before and
after and `cmp` them (they should be byte-identical unless the change was meant to show).

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
  Ribeirão Preto's central grid at 38.97°, Orlando's compass grid at −0.5°) so its streets are
  exact 2:1 lines.
- Everything is deterministic: variation comes from hashes of ids and positions, never `Math.random`.
- Bridge decks rise with distance from the shore (`deckHeight` in `scene/build.ts`); towers come
  from the data; pairs of equal-height towers get cables.
- New palette ramps go at the **end** of `RAMP_DEFS`: a ramp's id is its position, and scenes
  store ids.

## Heights without a survey (`scene/heights.ts`)

New York's buildings come with heights. Ribeirão Preto's do not (459 of 360,000), so there:
mapped height → mapped floors × `heights.storey` → the Google Open Buildings 2.5D raster. The
raster is read as the median inside the footprint and corrected with a curve fitted against the
~4,000 buildings whose floors are mapped (it reads 5.5 m for one storey and saturates near
95 m). Refit the curve for another city before trusting it there.

## Data

| Source                              | What                                                                          | Licence                                             |
| ----------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Overture Maps (`OVERTURE_RELEASE`)  | buildings, land, water, land use and cover, roads, rails, places, divisions   | ODbL / CDLA (includes © OpenStreetMap contributors) |
| NYC Open Data                       | borough boundaries, 2020 NTAs, 2015 street tree census                        | public domain                                       |
| Google Open Buildings 2.5D Temporal | building heights estimated from satellite imagery (4 m raster), for `tinyrao` | CC BY 4.0                                           |
| IBGE, Censo 2022                    | Ribeirão Preto's planning sub-sectors ("bairros" layer)                       | open, attribution                                   |

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
  by country (Valencia's districts are "macrohoods"): set them per city.
- A city with no building parts gets an empty `building_part.parquet` whose geometry column has
  lost its type: the scene builder skips the parts pass when the file has no rows.
- Adding a ground kind renumbers the ones after it: rebuild every city's scene afterwards.
