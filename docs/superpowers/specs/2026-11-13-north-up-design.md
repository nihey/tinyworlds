# North up by default

## Intent

Every world is drawn turned to its street grid (`betaDeg`), so streets run on the 2:1 pixel
diagonals and north lands wherever the grid puts it: 63° right of up in Las Vegas, Los Angeles,
Orlando, Dallas and Colorado Springs, about 70° in Philadelphia, Cincinnati and El Calafate, 30°
in New York, 30° left in Pittsburgh and Valencia, 44° left in Truckee. Visitors read a map with
north up. The owner wants **north up to be the default**, with the possibility, per world, of
turning one back to its street grid.

## Goals

- A world is north up (`manifest.northDeg` 0) unless its city file says otherwise.
- Per world, one setting chooses north up or the street grid; going back is one line.
- Everything that stands at a real place keeps its real orientation on the ground (the
  Hollywood Sign's letters, Reunion Tower's ball, the Margaret Hunt Hill arch, the Statue of
  Liberty, the Pioneer Monument), whichever way the view is turned.
- Every picture of a map (share cards, card loops, hero slides) matches the new tiles.

## Non-goals

- A rotate button for visitors (one orientation per world, chosen when it is drawn).
- Arbitrary view angles (north up or the grid; a bearing of one's own is a small addition later).
- Winterfell and King's Landing: laid out by code in their own grid, with a make-believe north;
  they stay as they are. Westeros is already north up.

## Anti-goals

- Landmarks turning with the view instead of staying put on the ground.
- Rotating finished pictures (blurred pixel art, heights leaning the wrong way).
- A change to the data contract that forces the viewer to change.
- Cards and loops on the front page showing the old orientation next to the new tiles.

## Constraints

- In this 2:1 projection, quarter turns cannot bring a compass grid's north up (they give ±63°,
  ±117°). North up is a view bearing of 45°: a compass grid's streets then run straight across
  and straight up the screen and its buildings show their roof and south wall; a tilted grid
  (Manhattan) gets stair-stepped streets. The owner chose this knowingly.
- Map data is not in git and is uploaded by hand (`deploy/deploy.sh <world> --data`).

## Approaches

- **A. Separate the view from the grid (chosen).** The city keeps its measured street-grid
  bearing and gains a `view` setting, `"north"` by default or `"grid"`. The projection turns to
  the view; what is laid out along the grid is turned from the grid to the view.
- **B. Set every bearing to 45°** and rewrite the grid-laid landmarks in compass terms. Less
  code, but the measured bearings are lost: going back to a grid view means measuring again and
  redoing the landmarks. Rejected: it does not give the per-world choice.
- **C. Rotate the finished tiles in the viewer.** Rejected: blurs the pixel art, heights lean.

## Design

- **City contract** (`tinyworlds-pipeline/src/cities/types.ts`): `betaDeg` is renamed `gridDeg`
  (the street grid's measured bearing, meaning unchanged) and `view?: "north" | "grid"` is
  added, default `"north"`. One helper gives the view's bearing: 45 for north, `gridDeg` for grid.
  The scene's projection (`GEO`) uses it; the manifest's `geo.betaDeg` is that bearing, so the
  data contract and the viewer are unchanged (the compass already reads `northDeg`).
- **Grid-laid things** (`City.statues`): offsets (`dp`, `dq`) and boxes (`hp`, `hq`) stay
  written in the street grid's frame; the scene turns them by (view − grid) about the statue's
  spot, a box becoming a turned rectangle. `huntHillArch` keeps taking the grid bearing.
- **Generated cities**: their layout is in the view's own grid, so `generatedCity()` sets
  `view: "grid"` with `gridDeg` from the spec (Westeros 45, the others 0): nothing moves.
- **Light**: unchanged rule (the sun's compass bearing, 254°, relative to the view).
- **Viewer**: no code change. Each world's About note that says the map is turned to the grid
  and "that is why north does not point up" is rewritten, in the three languages, for north up.
- **Checkpoint**: before re-rendering everything, previews of Las Vegas (compass grid), New
  York (tilted grid) and Pittsburgh, today's beside north up, go to the owner, who may keep any
  world on its grid.
- **Regeneration**, for every real city: `scene`, `render`, `index` (sights and their pictures)
  and `card`, from the raw data already downloaded (no fetch); then the front page's share card,
  and in `tinyworlds-videos` the plates, card loops and hero slides. Framings given in screen
  pixels (a hero's `dx`, `dy`) are checked against the new view.
- **Docs**: the root `CLAUDE.md` (β is the view's bearing; north up by default), the pipeline's
  (`Adding a city`, `Rules of the look`, `Gotchas`), the videos' if a framing rule changes.
- **Tests**: the default view gives `northDeg` 0; a statue box keeps its compass orientation
  whatever the view; generated cities are unchanged.

## Left to the builder

- Wording of the About notes in the three languages.
- Where the regenerated data lives while it waits for upload (the worktree's own
  `tinyworlds-frontend/public/data/`, with the raw downloads linked in from the main checkout).
