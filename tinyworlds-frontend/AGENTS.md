<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Front page

- “Build the next city” keeps one draggable row per funding group, with native touch scrolling and manual navigation. Search all three with the donation picker’s city spellings, preserve the full funding rank on filtered cards, and keep the action to name a city beside the search.

- Keep the first hero still eager and high priority. The carousel keeps the current slide visible until the requested still has decoded or its fallback is ready.
- `MovingPicture` only starts a loop once its still has settled and at least 40% of its active frame is visible. Respect reduced motion and Save-Data.
- Home entrance animations live in `src/app/globals.css`. The world grids animate each card once near the viewport, with visible static content available before hydration.
- Benefactor plaques use shared link previews. Keep the artwork proportional and pair it with the title and destination in one anchor. The narrow wall uses native horizontal scrolling.
- List the GTA-inspired maps under Imagined places. Each world keeps its own route and localized card copy, with the shared attribution in `src/worlds/gta.ts`.

## Hall of Fame

- Keep both leaderboards in descending order by total donated, with ranks following the visual reading order. A city's leaderboard includes founders and later benefactors in the same list.
- Show founding badges beside the city where they were earned, with localized descriptions available on hover, keyboard focus, and tap. Keep anonymous gifts independent of named entries.

## City lighting

- Every world uses the six-minute clock and sRGB lookup tables in `src/map/daylight.ts`. Sample page elapsed time so both map orientations and Street Walk stay in phase. Settings also offers fixed daylight, fixed night and system appearance. With reduced motion, Cycle follows system appearance.
- Apply the map LUT to the tiles, sprites and edge fog. Keep navigation and marks legible. Street Walk shares the LUT uniforms across streamed cells, vehicles and effects. Grade surfaces before fog and the wasted sequence. Keep the reflection classification pass in its original palette.
- The overhead map extracts small window panes from its existing tile artwork in a worker. Full-detail tiles use the glass palette, and compressed zoom levels also check for surrounding wall bands. Keep lamp selection in map coordinates, fade it with the shared lamp strength, and count masks against the tile cache. Street Walk uses its building seed, bay and floor for its room lights.

## City weather

- Real maps default to the public `cityWeather(world)` GraphQL query. Poll while visible in Live mode, share the report with Street Walk, and keep the weather choice in the existing per-world preferences. Imagined worlds use their configured sky or clear skies.
- Apply the weather tint before the day/night curve. Keep signs and marks above the map weather layer. Street Walk shares fog distance across scenery, vehicles and effects, and excludes precipitation from reflections. Reduced motion keeps the atmosphere and omits falling particles.

## Map benefactors

- Real built cities show a small plaque above the map credits using live `cityBenefactors` data. Cycle through the city's publicly named donors in Hall of Fame order, one at a time with their public links. A city without public names shows a support invitation.
- Give visitors next and pause controls. While the plaque is hovered or focused, the benefactor dialog is open, or the tab is hidden, hold the current benefactor. Under reduced motion use manual navigation.
- The displayed name opens the benefactors sign. The invitation opens Donate with the city selected, and the public-name switch explains the carousel spot for a real built city.
- Keep the plaque clear of the minimap and hide it during walker drags, Street Walk, and the narrow quiz sheet. Hide it when the API has no matching built city or the request fails.

## Street walk

- The five GTA-inspired worlds use the shared walk controls, with one data set in each world's own view and speeds in miles per hour.
- Every real city uses the shared walk controls and physics. Each city has one walk data set that either map orientation can open. Show speeds in miles per hour for U.S. cities and kilometres per hour elsewhere. Worlds with animated billboards define their locations in the world config.
- While the walker is dragged, `src/map/walker.ts` dims the baked tiles and draws the nearby building footprints, parks, plazas, walkable routes and snapped landing point. The preview reuses loaded walk cells and clears when the drag ends.
- `src/walk/world.ts` resolves which deck supports each player. On foot, a nearby footway can take over from an overlapping roadway when both decks are level, as on the Brooklyn Bridge's Brooklyn approach. Keep the height tolerance and roadway preference for drivers when changing this logic.
- Motorcycles use the shared road vehicle physics and spawn mix in `src/walk/vehicles.ts`, with speed-limited steering and a dedicated chase camera. Hard impacts and landings throw the rider off and take life. Keep ordinary nudges rideable.
- Keep the touch HUD and action buttons within the safe-area insets and clear of the minimap. Capture movement and camera fingers independently and release held input on pointer cancellation.
- Critical damage ignites road vehicles for eight seconds before they explode. Leaving keeps the fuse running, and sinking clears it. The blast knocks down pedestrians and damages the player and nearby vehicles, with damage falling off from the hull. Any road vehicle wrecked by the blast starts its own fuse.
- Punching on foot uses the center of the view and the world's collision geometry. The original fist overlay follows the simulated swing and respects reduced motion. Keep saved keybindings intact when adding controls.
- Street Walk synthesizes its impact sounds in `src/walk/sound.ts` and uses the existing Sound switch. Vehicle hits on pedestrians get a thud scaled by speed and proximity, punches get an impact on contact, and actual player health loss triggers the hurt cue once per simulation step.
- The Golden Gate Bridge uses the map palette’s red ramp for its main cables and suspenders. Keep the cable kinds in sync with the pipeline when changing their rendering.
- The Brooklyn Bridge's landmark geometry in `src/walk/render/brooklyn-bridge.ts` uses the surveyed tower locations and existing walk cells. Keep its openings aligned with the roadway and promenade.

## Guess the Building

- Enable landmark highlights and the quiz in every real city's viewer. Both map orientations use their own sight and localized quiz indexes.
- Cite Wikipedia excerpts and label original landmark clues with their own source links. Reveal the source link after the player answers.
