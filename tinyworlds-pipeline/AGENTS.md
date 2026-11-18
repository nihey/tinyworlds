# Map pipeline

See [CLAUDE.md](CLAUDE.md) for build and preview commands.

Enable Street Walk in every real city's pipeline and viewer configs. Generate one data set per city from its north-up scene and Overture segments. Both map orientations use the north-up manifest's walk version.

Generate sight outlines, localized landmark descriptions and Guess the Building questions for both orientations of every real city. Where Wikipedia coverage is sparse, attach original localized clues and source URLs to the curated landmarks.

Bridge tower openings use mapped footprints and deck heights. Brooklyn's Gothic arches are in `src/scene/brooklyn-arches.ts`, the steel suspension profiles are in `src/scene/suspension-tower.ts`, and Cincinnati's round masonry crowns are in `src/scene/roebling-tower.ts`. Rebuild the north-up and street-grid scenes, tiles, and sight indexes together when changing this geometry.

Austin combines Overture with the City of Austin's Neighborhood Reporting Areas. Build both orientations and the localized sights and quiz for each. Generate the shared Street Walk from the north-up scene and package it with the north-up manifest.

San Francisco and Milwaukee use their city-published neighborhood outlines and the north-up scene for Street Walk. Build both map orientations, localized sights and quizzes, and the shared walk data. San Francisco's terrain is flat in both map views and Street Walk. Its long main suspension cables are filed in local walk cells so they load from either bridge approach. Limit ground cutting to the walk window so water polygons extending beyond the map do not slow generation.

Bethlehem uses the city's municipal boundary and historic district outlines. Its five simplified SteelStacks blast furnaces share an authored model across both map orientations and the north-up Street Walk. Rebuild both views and their sight indexes when changing the landmark.

The five GTA-inspired worlds define original coastlines, street grids and landmarks in `src/cities/tinygta*.ts`, `tinyvicecity.ts` and `tinysanandreas.ts`. The shared `metro.ts` generator draws deterministic streets and buildings. Build the scene, tiles, search indexes, share card and Street Walk for each world using the standard generated-city commands. Street Walk uses the authored scene and its bridge decks.

Keep each generated metro's material colors in its city definition. Changes to the color overrides or building forms need new tiles, share cards and Street Walk data.
