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

## Street walk

- New York and Austin use the same walk controls and physics. Each world has one walk data set that either map orientation can open. Set billboard areas in the world's config.
- `src/walk/world.ts` resolves which deck supports each player. On foot, a nearby footway can take over from an overlapping roadway when both decks are level, as on the Brooklyn Bridge's Brooklyn approach. Keep the height tolerance and roadway preference for drivers when changing this logic.
- Motorcycles use the shared road vehicle physics and spawn mix in `src/walk/vehicles.ts`. Keep the model, camera and localized riding prompts in sync when adding vehicle kinds.
- The Brooklyn Bridge's landmark geometry in `src/walk/render/brooklyn-bridge.ts` uses the surveyed tower locations and existing walk cells. Keep its openings aligned with the roadway and promenade.
