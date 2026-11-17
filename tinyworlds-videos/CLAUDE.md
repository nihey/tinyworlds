# tinyworlds-videos

The moving pictures, made with [HyperFrames](https://hyperframes.heygen.com) (HTML rendered to
video, frame by frame): the loops the front page plays in its hero and its cards, a flyover of
each city to share, the showcase film, a tour of tinywesteros for the people who know its
places, and the recap film (what the project has done, and the invitation to fund the next city). One rule holds everywhere: **a picture of a map is cut from the real tiles or filmed
from the real viewer**. Nothing is redrawn.

Five HyperFrames projects (`loop/`, `flyover/`, `film/`, `westeros/`, `recap/`: each an `index.html`, its
`compositions/` and `assets/`) and the TypeScript scripts that feed and render them.

## Commands

```bash
npm run plates [-- tinynyc …]   # cut the map plates and wordmark sheets from the tiles → */assets/plates/, */batch/
npm run loops [-- tinylax …]    # render the card loops (every one, or the worlds named) → ../tinyworlds-frontend/public/loops/<world>.mp4 (committed)
npm run flyovers [-- hero [world …]|cities]   # the heroes → …/public/loops/hero.{mp4,jpg}, hero-<world>.{mp4,jpg} (committed); city flyovers → out/flyovers/
npm run takes -- main [--until 8.4]   # film the New York map for the film (VIEWER_URL, a dev server of the viewer)
npm run takes -- page           # capture the front page for the film (HOME_URL, a dev server of the front page)
ELEVENLABS_API_KEY=… npm run sound [-- --for film|westeros]   # compose a NEW music bed → <film>/assets/music/bed.mp3 (replaces the committed one)
npm run film [-- draft|looks|delivery]   # render the film → out/film/tinyworlds.mp4 (+ a smaller copy to share)
npm run westeros -- stills 0 2.9 12.7    # the Westeros tour: look at its picture at those seconds (VIEWER_URL)
npm run westeros -- take                 # film it from the viewer (NEXT_PUBLIC_WORLD=tinywesteros)
npm run westeros -- render [draft|looks|delivery]   # → out/westeros/tinywesteros.mp4 (+ a smaller copy to post)
ELEVENLABS_API_KEY=… npm run recap -- voice [take]   # the recap's narration, a take or all → recap/assets/voice/ (committed)
npm run recap -- take           # film the Dallas viewer for the recap (VIEWER_URL, a build of tinydal served locally)
npm run recap -- pages          # capture the live front page, ranking and Hall of Fame (SITE_URL or deploy/.env)
npm run recap -- plates         # the history's pictures and signs, from the flyover plates (npm run plates first)
npm run recap -- sfx            # the recap's tracks of ticks (stones, history, letters), from assets/sfx/
npm run recap -- captions       # its subtitles, from the narration's word times → recap/compositions/captions.html
npm run recap -- render [draft|looks|delivery]   # → out/recap/tinyworlds-recap.mp4 (+ a smaller copy to post)
npm run context                 # a look round each world's card framing (out/context/), to choose a drift
npm run probe -- name:lon,lat,scale[,rise][@seconds][+chrome]   # stills of the viewer, to choose a take's framings
npm run lint | lint:fix | typecheck
npx hyperframes check --json    # inside a project: lint, runtime, layout, contrast, sound
npx hyperframes preview         # inside a project: the Studio preview, where the timeline can be edited by hand
```

Everything reads the worlds' data where the pipeline writes it
(`../tinyworlds-frontend/public/data/<world>/`), so a world needs its tiles before it can have a
loop. `ffmpeg` and Chrome must be installed (`CHROME_PATH`, default `/usr/bin/google-chrome`).

What is committed: the scripts, the compositions, `*/assets/fonts/`, and each film's music bed
(`*/assets/music/bed.mp3`): a film is timed to the very bed it was made with, and composing it
again gives a different one. What is not (all reproducible): plates and batch rows, takes, the
sound effects, `out/`, renders.

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
├── worlds.ts        # per world: which way its card loop sets off, its flyover's framing, its hero's
├── plates.ts loops.ts flyovers.ts takes.ts sound.ts film.ts context.ts probe.ts
├── westeros.ts      # the tour of tinywesteros: its stops, its take, its render
├── recap.ts         # the recap film: its narration, its Dallas take, its page captures, its render
loop/                # 1200 × 630, 10 s: a card loop (variables: plate, sign, dir)
flyover/             # 1920 × 1080, 12 s: a city flyover, and a world's hero (variables: plate, sign, a, b)
film/                # 1920 × 1080, 31 s: the showcase film (SPEC.md, REVIEW.md)
westeros/            # 1920 × 1080, 35 s: the tour of tinywesteros (SPEC.md, REVIEW.md)
recap/               # 1920 × 1080, 57.6 s: the recap film, narrated (STORYLINES.md, SPEC.md, REVIEW.md)
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
  fan-made places stay out of what is made to promote the project.
- **A hero for every world** (`HEROES` in `worlds.ts`): the front page's hero goes round the
  worlds, so each has a film of its own for it. A flyover with no sign, on a smaller lap
  (`a`, `b`), from as far as its `shrink` says and moved by `dx`, `dy` (px of the picture) so
  that what is worth seeing stands clear of the page's sign: of the 2 : 1 the page shows of
  it, the sign covers from 2 % to 46 % across and 32 % to 96 % down. New York's is called
  `hero` (the showcase film's take copies it by that name), the others `hero-<world>`
  (`heroName`). The fan-made places have one too: these are the front page's own pictures, on
  a page that already lists those worlds, and they are shared nowhere, so the rule above
  still holds. **Look at each framing before rendering**: `npm run plates -- <world>` cuts
  `flyover/assets/plates/<name>.png`, whose middle is the picture. Then
  `npm run flyovers -- hero <world>` renders that world's alone (1280 × 720, with its first
  frame as the still).
- A new world: `npm run plates -- <id> && npm run loops -- <id>` (naming it renders its loop
  alone; the others' committed loops stay as they are). Give it a hero framing in `HEROES`
  and `npm run flyovers -- hero <id>`; without one it is simply not in the front page's hero.
  To give it a flyover to share, add that framing to `SHOTS`.
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
  `riser`, `impact-bass-1`, `pop`) copied into `film/assets/sfx/`. The bed is committed (the
  moments above are its beats); the effects are not.
- **The address** on the end card is the `address` variable, given by `npm run film` from
  `SITE_URL` or `deploy/.env`. The source says `example.com`.

## The tour of tinywesteros

`westeros/SPEC.md` is its brief. One continuous take of the real viewer (`scripts/westeros.ts`),
made for fan communities: people who know the places.

- **A place a bar.** `STOPS` lists the places in the order of the journey (the Wall,
  Winterfell, King's Landing, the Seven Kingdoms, Braavos, Valyria, Meereen, Asshai); each gets
  a bar of the music (3 s), 1.4 s of it on the way there. The way is `flight` in `lib/film.ts`:
  up until the whole trip is about a screen wide, across, and down, at an even pace on screen.
  Then out to the whole map, set high so the end card has the band under it.
- **The kingdoms are named by the viewer.** On that stop, and at the end, the take turns the
  viewer's own region lines on (`setHoodLines`): the outlines and the name plates are the
  map's, not the film's. The film adds one name per place, on a sign in the site's manner.
- **Look before filming**: `npm run westeros -- stills <seconds…>` writes the take's picture at
  those moments to `out/westeros/stills/`. A take is 1,050 frames and several minutes.
- **The music follows no grid.** The bed is asked for at 80 BPM and does not keep it, so two
  moments are set by measuring it instead: the film starts where the music's first drum is
  (`data-media-start`), and the region lines wait for the band's entrance (`regions` on the
  stop). The bed is committed for that reason; a new one means measuring again.
- **Fan-made, and it says so.** The rule that fan-made places stay out of what promotes the
  project still holds for the flyovers and the showcase film. This one is the other way round:
  a picture of the fan-made map for the fans of its world, with "A fan-made map. Not affiliated
  with George R. R. Martin or HBO." on its end card, an original score that imitates no one's,
  and no claim to be official anywhere. The address is the `address` variable, as in the film.

## The recap

`recap/SPEC.md` is its brief ("Thirty stones": the other two storylines are in
`recap/STORYLINES.md`). Narrated, with subtitles, unlike the other films.

- **The voice is the clock.** `recap -- voice` asks ElevenLabs for each take of the script
  (`VOICE_TAKES`: one request per take, so each sounds like one reading), with each character's
  time, and cuts it into a file per line, numbered on across the takes
  (`assets/voice/line-NN.wav`, `lines.json`: each word's time inside its line). Name a take to
  record only it: the film is timed to the others. `PLACES` says where each line is said;
  `index.html` places the lines' `<audio>` at the same seconds, and `recap -- captions` writes
  the subtitles (`compositions/captions.html`) from the same word times: Tiny5 on the site's
  black enamel, the spoken word in taxi yellow, up to five words a group (`BREAKS` where a
  phrase wants splitting by hand). The takes are committed, like a music bed. The key is never
  in a file here.
- **The history of the map** (`compositions/history.html`): the thirteen real cities in the
  order they went up (`HISTORY`, the viewer's registry order), a beat or two each on the bed's
  bars. Each is its hero framing, cut from the tiles by `npm run plates` and made lighter by
  `recap -- plates` (with its flyover sign, the pipeline's own, cut off its sheet); those built
  by their benefactors carry their real plaque, captured from their card (`recap -- pages`).
  A new city: add it to `HISTORY`, give it a beat in the composition, and cut its plates.
- **Only the stone wall is rebuilt** (`compositions/stones.html`, from the site's `StoneWall`):
  Dallas's thirty stones, laid at the times `STONE_TIMES` in `recap.ts` also gives the ticks.
  The real walls are the ranking's: London's empty one ends the film.
- **The take** (`recap -- take`) is the showcase film's way of filming (`lib/film.ts`) on a
  static build of tinydal (`NEXT_PUBLIC_WORLD=tinydal NEXT_PUBLIC_BASE_PATH=/tinydal
NEXT_PUBLIC_DATA_BASE=/tinydal/data`, built in a copy of the frontend as `deploy.sh` does,
  `data` linked in, served with `python3 -m http.server`). Its pointer is a pixel-art arrow
  drawn into the page (it follows the real mouse), and the page's `Math.random` is seeded so
  the game's first building is always the same. Its moments are `TAKE_AT`, in film seconds.
- **The pages are the live site's** (`recap -- pages`): only the site's own host is fetched,
  and a program's browser is never counted as a visit. Each capture comes with its pictures'
  places (`*.json`), which the cities' shot uses to play the real loops (copied from the front
  page's `public/loops/` into `recap/assets/loops/`, not committed) over the cards.
- **Names on screen** are the site's public ones (the opening's two gifts are the `stones`
  composition's variables `first` and `second`).

## Gotchas

- A function defined inside `page.evaluate(() => …)` is compiled by tsx with a helper the page
  does not have (`__name is not defined`): pass such code as a string (see `takes.ts`).
- sharp composites after it resizes, whatever order they are written in: flatten to a buffer first.
- `hyperframes check` and `render` want `index.html` at the project's root; one composition per project.
- An `<audio>` with no `data-duration` is taken to play to the end of the film.
