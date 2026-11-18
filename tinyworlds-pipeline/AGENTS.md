# Map pipeline

See [CLAUDE.md](CLAUDE.md) for build and preview commands.

Bridge tower openings use mapped footprints and deck heights. Brooklyn's Gothic arches are in `src/scene/brooklyn-arches.ts`, the steel suspension profiles are in `src/scene/suspension-tower.ts`, and Cincinnati's round masonry crowns are in `src/scene/roebling-tower.ts`. Rebuild the north-up and street-grid scenes, tiles, and sight indexes together when changing this geometry.

Austin combines Overture with the City of Austin's Neighborhood Reporting Areas. Build both orientations and the localized sights and quiz for each. Generate the shared Street Walk from the north-up scene and package it with the north-up manifest.

The five GTA-inspired worlds define original coastlines, street grids and landmarks in `src/cities/tinygta*.ts`, `tinyvicecity.ts` and `tinysanandreas.ts`. The shared `metro.ts` generator draws deterministic streets and buildings. Build the scene, tiles, search indexes, share card and Street Walk for each world using the standard generated-city commands. Street Walk uses the authored scene and its bridge decks.

Keep each generated metro's material colors in its city definition. Changes to the color overrides or building forms need new tiles, share cards and Street Walk data.
