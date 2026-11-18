<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Front page

- Keep the first hero still eager and high priority. The carousel keeps the current slide visible until the requested still has decoded or its fallback is ready.
- `MovingPicture` only starts a loop once its still has settled and at least 40% of its active frame is visible. Respect reduced motion and Save-Data.
- Home entrance animations live in `src/app/globals.css`. The world grids animate each card once near the viewport, with visible static content available before hydration.
- Benefactor plaques use shared link previews. Keep the artwork proportional and pair it with the title and destination in one anchor. The narrow wall uses native horizontal scrolling.
- List the GTA-inspired maps under Imagined places. Each world keeps its own route and localized card copy, with the shared attribution in `src/worlds/gta.ts`.

## Hall of Fame

- Keep both leaderboards in descending order by total donated, with ranks following the visual reading order. A city's leaderboard includes founders and later benefactors in the same list.
- Show founding badges beside the city where they were earned, with localized descriptions available on hover, keyboard focus, and tap. Keep anonymous gifts independent of named entries.

## Map benefactors

- Real built cities show a small plaque above the map credits using live `cityBenefactors` data. Cycle through the city's publicly named donors in Hall of Fame order, one at a time with their public links. A city without public names shows a support invitation.
- Give visitors next and pause controls. While the plaque is hovered or focused, the benefactor dialog is open, or the tab is hidden, hold the current benefactor. Under reduced motion use manual navigation.
- The displayed name opens the benefactors sign. The invitation opens Donate with the city selected, and the public-name switch explains the carousel spot for a real built city.
- Keep the plaque clear of the minimap and hide it during walker drags, Street Walk, and the narrow quiz sheet. Hide it when the API has no matching built city or the request fails.

## Street walk

- The five GTA-inspired worlds use the shared walk controls, with one data set in each world's own view and speeds in miles per hour.
- New York, Austin, San Francisco and Milwaukee use the same walk controls and physics. Each world has one walk data set that either map orientation can open. Worlds with animated billboards define their locations in the world config.
- While the walker is dragged, `src/map/walker.ts` dims the baked tiles and draws the nearby building footprints, parks, plazas, walkable routes and snapped landing point. The preview reuses loaded walk cells and clears when the drag ends.
- `src/walk/world.ts` resolves which deck supports each player. On foot, a nearby footway can take over from an overlapping roadway when both decks are level, as on the Brooklyn Bridge's Brooklyn approach. Keep the height tolerance and roadway preference for drivers when changing this logic.
- Motorcycles use the shared road vehicle physics and spawn mix in `src/walk/vehicles.ts`, with speed-limited steering and a dedicated chase camera. Hard impacts and landings throw the rider off and take life. Keep ordinary nudges rideable.
- Keep the touch HUD and action buttons within the safe-area insets and clear of the minimap. Capture movement and camera fingers independently and release held input on pointer cancellation.
- Critical damage ignites road vehicles for eight seconds before they explode. Leaving keeps the fuse running, and sinking clears it. The blast knocks down pedestrians and damages the player and nearby vehicles, with damage falling off from the hull. Any road vehicle wrecked by the blast starts its own fuse.
- Punching on foot uses the center of the view and the world's collision geometry. The original fist overlay follows the simulated swing and respects reduced motion. Keep saved keybindings intact when adding controls.
- The Golden Gate Bridge uses the map palette’s red ramp for its main cables and suspenders. Keep the cable kinds in sync with the pipeline when changing their rendering.
- The Brooklyn Bridge's landmark geometry in `src/walk/render/brooklyn-bridge.ts` uses the surveyed tower locations and existing walk cells. Keep its openings aligned with the roadway and promenade.
