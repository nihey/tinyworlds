# tinyworlds-videos

The moving pictures, made with [HyperFrames](https://hyperframes.heygen.com) (HTML rendered to
video, frame by frame): the loops the front page plays in its hero and its cards, a flyover of
each city to share, and the showcase film. One rule holds everywhere: **a picture of a map is
cut from the real tiles or filmed from the real viewer**. Nothing is redrawn.

Three HyperFrames projects (`loop/`, `flyover/`, `film/`: each an `index.html`, its
`compositions/` and `assets/`) and the TypeScript scripts that feed and render them.

## Commands

```bash
npm run plates [-- tinynyc …]   # cut the map plates and wordmark sheets from the tiles → */assets/plates/, */batch/
npm run loops                   # render every card loop → ../tinyworlds-frontend/public/loops/<world>.mp4 (committed)
npm run flyovers [-- hero|cities]   # the hero → …/public/loops/hero.{mp4,jpg} (committed); city flyovers → out/flyovers/
npm run takes -- main [--until 8.4]   # film the New York map for the film (VIEWER_URL, a dev server of the viewer)
npm run takes -- page           # capture the front page for the film (HOME_URL, a dev server of the front page)
ELEVENLABS_API_KEY=… npm run sound   # compose the film's music bed → film/assets/music/bed.mp3
npm run film [-- draft|looks|delivery]   # render the film → out/film/tinyworlds.mp4 (+ a smaller copy to share)
npm run context                 # a look round each world's card framing (out/context/), to choose a drift
npm run probe -- name:lon,lat,scale[,rise][@seconds][+chrome]   # stills of the viewer, to choose a take's framings
npm run lint | lint:fix | typecheck
npx hyperframes check --json    # inside a project: lint, runtime, layout, contrast, sound
npx hyperframes preview         # inside a project: the Studio preview, where the timeline can be edited by hand
```

Everything reads the worlds' data where the pipeline writes it
(`../tinyworlds-frontend/public/data/<world>/`), so a world needs its tiles before it can have a
loop. `ffmpeg` and Chrome must be installed (`CHROME_PATH`, default `/usr/bin/google-chrome`).

What is committed: the scripts, the compositions, `film/assets/fonts/`. What is not (all
reproducible): plates and batch rows, takes, the music and the effects, `out/`, renders.

## Layout

```
scripts/
├── lib/world.ts     # a world as the videos see it: manifest, card framing, accent, lon/lat → map px,
│                    # cutPlate (the pipeline's own cutter, render/plate.ts, on this world's tiles)
├── lib/drift.ts     # the measures of a loop's lap: the plates are cut to them, the compositions move by them
├── lib/film.ts      # filming the viewer frame by frame: its clock is ours (see below)
├── lib/boroughs.ts  # a world's large divisions as districts: each one its neighbourhoods merged
├── lib/site.ts      # the site's address, from SITE_URL or the gitignored deploy/.env: never from a tracked file
├── lib/run.ts       # run a command; encode a render for the web
├── worlds.ts        # per world: which way its card loop sets off, its flyover's framing; the hero's
├── plates.ts loops.ts flyovers.ts takes.ts sound.ts film.ts context.ts probe.ts
loop/                # 1200 × 630, 10 s: a card loop (variables: plate, sign, dir)
flyover/             # 1920 × 1080, 12 s: a city flyover, and the hero (variables: plate, sign, a, b)
film/                # 1920 × 1080, 31 s: the showcase film (SPEC.md, REVIEW.md)
```

It imports from the pipeline's source (`../tinyworlds-pipeline/src/`: the cities' card
framings, the projection, `render/sign.ts`, `render/plate.ts`), so a loop's sign is drawn by the
same code as the share card's.

## Loops and flyovers

- **A lap, not a pan.** The view goes round an ellipse and comes back to where it began, at
  constant speed (each tween is one arc of a sine), so the last frame hands over to the first
  and nothing gives the loop point away.
- **A card loop opens on its share card.** Same centre, same `shrink`, the wordmark plate drawn
  by the pipeline's `sign.ts` at the card's own place: the front page swaps the still for the
  film without anyone seeing it. The ellipse lies to one side of that framing (`dir` in
  `worlds.ts`: to the right for a world whose card sits at the left edge of its map).
- **Plates are finer than the picture** (`density` in `lib/drift.ts`) and drawn small, which
  keeps a slow move over pixel art from shimmering.
- **A flyover** laps round a framing of its own (`worlds.ts`), with a larger sign that carries
  the site's address under the wordmark when one is known. Only real cities have one: the
  fan-made places stay out of what is made to promote the project. **The hero** is New York's
  flyover with no sign, on a smaller lap, reframed to keep Manhattan clear of the page's sign.
- A new world: `npm run plates -- <id> && npm run loops`. To give it a flyover, add its
  framing to `worlds.ts`.
- The one lint warning these projects keep (`nested_structure_needs_subcomposition`) is on
  purpose: a batch render sets only the root's variables, so the plate lives in the root.

## The film

`film/SPEC.md` is its brief (the shots, by time); `film/REVIEW.md` what was checked.

- **`takes -- main` films the real viewer.** `lib/film.ts` takes over the page's clock before
  any of its code runs (`requestAnimationFrame`, `performance.now`, `Date.now`), advances it
  one frame at a time, waits for the tiles each frame asked for (`tinyworld.inflight`), and
  saves the frame. So the map's own motion (a flight to a search result, the ferries, a tile
  fading in) is exact, and the search is really typed into the viewer's own sign. The camera
  is the engine's (`jumpTo`, `flyToMap`). The viewer's signs are hidden and shown through one
  CSS variable; its credit line always shows. `MAP_CLOCK_START` is set so that a ferry is
  coming in to Liberty Island's slip while the camera is there: found with `npm run probe`.
- **The five boroughs are drawn by the viewer.** The site outlines neighbourhoods; for the
  line "All five boroughs" the take hands the engine five districts instead (`lib/boroughs.ts`:
  hoods.json merged by borough, named where places.json puts each borough) through its own
  `setHoods`, turns its district lines on, and puts the pointer on the newest so the engine
  lights it. The lines and name plates are the viewer's own drawing; the shapes are the film's.
- **The way out is written by the second** (`through` in `lib/film.ts`: octaves of zoom at
  given times, joined by a curve that never overshoots), so the opening can linger where there
  is most to see. `npm run takes -- main --until 8.4` films only the start, to `main-part.mp4`.
- **`takes -- page` captures the real front page** as one still at twice its size, with where
  its pictures are (`page.json`); the film lays the real loops over them.
- Start the dev servers yourself, one at a time (Next allows one per folder):
  `NEXT_PUBLIC_WORLD=tinynyc NEXT_PUBLIC_DONATE_URL=https://example.com/donate npm run dev`,
  then `NEXT_PUBLIC_WORLD=home NEXT_PUBLIC_CARDS_BASE=/og npm run dev`.
- **The moments are the music's** (`AT` in `takes.ts`, the same numbers in the compositions):
  120 BPM, the first beat at 0.04 s. A new bed means new moments, a new take.
- **Sound.** The bed is composed by ElevenLabs Music (`sound.ts`); the effects are eight files
  of the HyperFrames media library (`click`, `click-soft`, `typing`, `whoosh`, `whoosh-short`,
  `riser`, `impact-bass-1`, `pop`) copied into `film/assets/sfx/`. Neither is committed.
- **The address** on the end card is the `address` variable, given by `npm run film` from
  `SITE_URL` or `deploy/.env`. The source says `example.com`.

## Gotchas

- A function defined inside `page.evaluate(() => …)` is compiled by tsx with a helper the page
  does not have (`__name is not defined`): pass such code as a string (see `takes.ts`).
- sharp composites after it resizes, whatever order they are written in: flatten to a buffer first.
- `hyperframes check` and `render` want `index.html` at the project's root; one composition per project.
- An `<audio>` with no `data-duration` is taken to play to the end of the film.
