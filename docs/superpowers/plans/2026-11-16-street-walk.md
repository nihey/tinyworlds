# Street Walk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All of New York at street level, on foot, at the wheel and in the water, entered by dropping a little person onto the map: a pipeline `walk` step that cuts the city into 200 m squares, and a walk mode in the viewer that streams them into a three.js scene with traffic, people, boats, crashes, life and the wasted screen.

**Architecture:** The pipeline reads the scene it already builds (volumes, ground, lines, trees, cables) and Overture's `segment.parquet` (streets, sidewalks, bridges, overpasses, tunnels), solves the heights of elevated ways, and writes one gzipped binary file per 200 m square plus `walk/walk.json`. The viewer's walk mode is pure simulation modules (surfaces, player, vehicles, traffic, people) tested in vitest, a three.js renderer ported from the spike, and React signs around it; it is imported dynamically, so nothing of it loads until a walk opens.

**Tech Stack:** TypeScript strict, Node 22, npm; pipeline: DuckDB (`@duckdb/node-api`), `polygon-clipping`, vitest; viewer: Next.js 16 static export, React 19, three.js (new dependency, dynamic import only), vitest.

**Spec:** `docs/superpowers/specs/2026-11-16-street-walk-design.md` (read it whole before any task). The spike it cites is in `docs/superpowers/spikes/2026-11-16-street-walk/` (`export.mjs`, `roads.mjs`, `walk.html`, `cars.js`): throwaway code to port behaviour from, never to copy wholesale.

## Global Constraints

- The repository is public: no domain, host, IP, server path, key or token in any tracked file; docs use `example.com`. Check `git diff --cached` before every commit.
- No hard-coded interface strings in the viewer: every visible string and aria-label from `t.walk` (en-US, pt-BR, es-ES). No emojis anywhere.
- Nothing of the walk loads until a walk opens: three.js and `src/walk/**` are reached only through dynamic `import()`. The map's own bundle must not grow by more than the person button and the hash parser.
- The map does not change: tiles, their look and their files stay byte-identical (`preview` before and after, `cmp`).
- The pipeline stays deterministic: hashes (`mix`, `hashString` in `scene/hash.ts`), never `Math.random`. The browser's simulation may use `Math.random`.
- localStorage only behind try/catch; key `tinyworlds.walk.controls.v1` for the bindings, nothing else new kept.
- The walk sends nothing anywhere (no API call), except the page-analytics hook `walk_start`.
- Never `history.replaceState` directly: `writeHash()` / `replaceUrl()` (`src/map/hash.ts`).
- Viewer code is Next.js 16: read the relevant guide in `tinyworlds-frontend/node_modules/next/dist/docs/` before writing a page or component (`tinyworlds-frontend/AGENTS.md`).
- World space everywhere in the walk: metres east (`e`) and north (`n`) of the projection origin `geo.lon0/lat0`: `e = (lon − lon0)·π/180·R·cos(lat0)`, `n = (lat − lat0)·π/180·R`, `R = 6371008.8`. Heights `z` in metres above the land (0). Map px → (e, n) at ground: `p+q = X/k`, `q−p = 2Y/k`, `e = p·sinβ + q·cosβ`, `n = p·cosβ − q·sinβ` (`export.mjs`'s `en`); px heights ÷ `kz`. Use the **scene's** `meta.geo` (New York's is β 45), never the city file's `betaDeg`.
- Square (cell) `(i, j)` covers `e ∈ [200i, 200i+200)`, `n ∈ [200j, 200j+200)`.
- Commit after each task with a conventional message (`feat(pipeline): …`, `feat(viewer): …`), ending with the session attribution line from the conversation.
- Heavy runs (the whole city's `walk`) go to the owner's build machine, not the laptop (the controller knows which and how; it is not named in tracked files).
- Numbers the spec fixes, used verbatim below: walk 4.5 m/s, sprint 11, jump 5.2 m/s up, gravity 13 m/s², step up 0.3 m on foot / 1.15 m landing from a jump / 0.5 m for a car, swim 1.6 (3 sprinting), water surface −0.6 m, fog 140–560 m, load within 3 squares and unload beyond 4.5, pixel size 3 (1–6), lights cycle 34 s (13 green, 3 yellow, phases half a cycle apart), traffic ~70 within 320 m (spawn beyond 170, gone beyond 380), people ~150 within 170 m, restitution 0.25, damage (impact − 3)·0.022/toughness, glass cracks from 35%, smoke from 55%, fire 9 s at 100%, life 100, regen 2/s after 5 s, fall hurt from 4 m and lethal at 15 m, a hit on foot (closing − 2)·9, wreck fire within 5 m 40–80, getting in within 2.4 m, getting out under ~9 mph (4 m/s), sinking over ~4 s, ramps ≤ 8% (12% links), clearance ≥ 4.5 m, overland deck level × 6.5 m.

## Review Focus

1. **No WebGL** (old phone, blocked GPU): opening a walk says so in a sign and stays on the map; nothing throws. Test in Task 15 (`walk-view` falls back when `getContext("webgl2")` and `"webgl"` are null).
2. **Dropping the person where there is no street** (the harbour, Central Park's middle, outside the city, a square with no data): it snaps to the nearest street or sidewalk within 150 m, else the map says "No street here" and no walk opens. Test in Task 12 (`snapDrop` returns null far from any way; returns the deck when dropped on a bridge).
3. **A square that fails to load** (404, offline, a bad file) while walking: that square stays a wall in the fog, is asked again after 10 s, and the game goes on. Test in Task 6 (`decodeCell` throws `WalkDataError` on a truncated file; `WalkWorld.inData` is false for a square never added).
4. **A long frame** (the tab hidden for a minute, a breakpoint, a slow phone): the simulation clamps `dt` to 0.1 s and steps at most 0.02 s at a time, so nothing tunnels through a wall or falls through a deck. Test in Task 8 (`stepFoot` with dt 5 against a wall 1 m away never passes it) and Task 9 (a car at 80 m/s against a building).
5. **Storage blocked or bindings corrupted** (private window, a hand-edited value): the defaults, no exception, and the menu still works for the visit. Test in Task 7.

---

## File Structure

```
tinyworlds-pipeline/src/walk/
├── grid.ts          # CELL, lonLatToEN, mapToEN, cellOf, cellKey, the Geo type
├── format.ts        # encodeCell: named typed arrays → gzipped binary square
├── cut.ts           # the scene → per-square volumes, ground (clipped), ways (clipped), trees, cables
├── clip.ts          # rectangle clipping: polygons (Sutherland–Hodgman per ring, quadtree), polylines
├── mask.ts          # a square's land/water mask from its ground polygons, in paint order
├── segments.ts      # segment.parquet → Segment[] (one DuckDB read)
├── pieces.ts        # segments → pieces between connectors, densified, with per-vertex rules
├── heights.ts       # the elevated-way height solver (pure)
├── network.ts       # pieces + heights → nodes, streets, walks, elevated ways, tunnels, lights
├── moorings.ts      # boats tied along piers
└── build.ts         # the `walk` step: everything into walk/cells/*.bin, walk/walk.json, manifest.walk

tinyworlds-frontend/src/walk/            # no React, no `@/` imports in format.ts (the pipeline's test imports it)
├── format.ts        # inflate, decodeCell, WalkDataError
├── walk-index.ts    # parseWalkIndex, cellExists
├── geo.ts           # CELL, lonLatToEN, enToLonLat, cellOf
├── cell.ts          # readCell: arrays → WalkCell (metres, typed records)
├── world.ts         # WalkWorld: loaded squares, surfaces, water, walls, parapets
├── controls.ts      # actions, default (GTA) bindings, rebind, load/save, key labels
├── health.ts        # life, damage rules, regen
├── player.ts        # on foot, jumping, swimming, falling
├── wasted.ts        # the wasted sequence's timing
├── spawn.ts         # where you come to
├── drop.ts          # snapping a dropped person to a street
├── vehicles.ts      # car and boat kinds, arcade physics, damage, sinking
├── collide.ts       # boxes: SAT overlap, impulses
├── lights.ts        # the signal cycle
├── traffic.ts       # RoadNet, lanes, routing, Traffic (AI), parked cars, tunnels
├── people.ts        # Crowd: pedestrians
├── sound.ts         # WebAudio: horn, crash, boom, splash
├── game.ts          # WalkGame: the loop, input, cameras, events, state for the signs
└── render/
    ├── palette.ts materials.ts       # the map's palette as shaders (ported from walk.html)
    ├── cell-mesh.ts deck-mesh.ts     # a square's meshes; elevated structures
    ├── models.ts particles.ts        # cars, boats, people, you; sparks, smoke, fire, bubbles, foam
    └── view.ts                       # WalkView: renderer, camera, sky and fog, streaming, pixel size
tinyworlds-frontend/src/components/walk/
├── walk-screen.tsx  # mounts the game (dynamic import), pointer lock, keys, layout half
├── walk-hud.tsx     # the corner sign: life bar, car damage, speed, name, hint, messages; red edges
├── wasted-overlay.tsx
├── controls-menu.tsx
├── touch-pad.tsx
└── walk-person.tsx  # the person in the tool column: drag, tap-then-tap, the W key
tinyworlds-frontend/src/map/walker.ts    # scene layer: you and your view cone on the map; drop highlight
```

Tests sit beside the pipeline's files (`*.test.ts`) and in `tinyworlds-frontend/src/walk/__tests__/`.

## Data contract (Task 1 adds it to the root `CLAUDE.md`)

```
data/<world>/walk/
├── walk.json             # the index below
└── cells/<i>_<j>.bin     # one square, gzip of the payload below
```

`walk.json`:

```ts
interface WalkIndex {
  v: 1;
  cell: number;                       // 200
  i0: number; j0: number; cols: number; rows: number;
  cells: string;                      // base64 bitset, bit (i−i0) + (j−j0)·cols, LSB-first: the file exists
  geo: { lon0: number; lat0: number; betaDeg: number; k: number; kz: number };   // the scene's
  gridDeg: number;                    // the street grid's bearing for paving (the city file's betaDeg: 28.9)
  sunDeg: number;                     // 254
  palette: { names: string[]; rgb: number[] };   // RAMP_COUNT × 6 shades × 3 bytes, buildPalette().rgb
  paintRank: number[];                // PAINT_RANK, per ground kind
  tunnels: { name: string; a: [number, number, number]; b: [number, number, number] | null; length: number }[];
                                      // portals [e, n, heading into the tunnel (rad, from north, clockwise)];
                                      // b null: the other end is off the map (closed by a barrier)
}
```

A square's payload: `u32` header length, the header as UTF-8 JSON `{ v: 1, i, j, arrays: [[name, type, length], …] }` (type `u8 i8 u16 i16 u32 i32 f32`), zero padding to a multiple of 4, then each array in header order, each starting at a multiple of 4, little-endian. An absent array is empty. **Local dm**: `i16` decimetres from the square's south-west corner. **World dm**: `i32` decimetres from the origin.

| Array | Type | One per | Meaning |
|---|---|---|---|
| `vol.rings` | u16 | volume | rings (outer first) |
| `vol.verts` | u16 | ring | vertices |
| `vol.xy` | i16 | vertex ×2 | local dm (a volume is filed under its centre's square) |
| `vol.base` `vol.top` `vol.roofH` | u16 | volume | dm |
| `vol.roofShape` `vol.wall` `vol.roof` `vol.glass` `vol.pattern` `vol.flags` | u8 | volume | as the scene |
| `vol.seed` | u32 | volume | as the scene |
| `cab.verts` `cab.kind` | u16, u8 | cable | filed under its middle vertex's square |
| `cab.xyz` | i32 | vertex ×3 | world dm |
| `gnd.kind` | u8 | polygon | ground kind |
| `gnd.order` | u32 | polygon | the scene's index (ties in paint rank paint in this order) |
| `gnd.rings` `gnd.verts` `gnd.xy` | u16, u16, i16 | | clipped to the square, local dm |
| `way.kind` `way.width` `way.order` `way.verts` | u8, u16 dm, u32, u16 | way | the scene's ground lines without the bridge flag |
| `way.xy` | i16 | vertex ×2 | clipped to the square grown by 30 m, local dm |
| `tree.xy` `tree.kind` | i16 ×2, u8 | tree | |
| `mask` | u8 | 1 or 1251 | `[0]`: 0 all land, 1 all water, 2 mixed, then 1250 bytes: 100 × 100 cells of 2 m from the south-west, bit `x + 100y` LSB-first, 1 = water |
| `shore` | u8 | 0 or 10000 | for a square with any water: per 2 m cell (as the mask), the distance to the nearest land in 2 m steps, 0 on land, capped at 255, measured over the whole city (across squares); absent for an all-land square |
| `node.id` | u32 | node | city-wide; every node an edge of this square ends at |
| `node.xyz` | i32 | ×3 | world dm |
| `node.flags` | u8 | | bit0 lights, bit1 tunnel portal |
| `node.bearing` | u8 | | its widest street's bearing, 0–255 → 0–π (the lights' "along" phase) |
| `st.a` `st.b` | u32 | street edge | node ids |
| `st.cls` | u8 | | 0 motorway, 1 trunk, 2 primary, 3 secondary, 4 tertiary, 5 residential, 6 unclassified |
| `st.flags` | u8 | | bit0 link, bit1 one-way a→b, bit2 one-way b→a, bit3 elevated somewhere |
| `st.width` `st.verts` | u16 dm, u16 | | |
| `st.xyz` | i32 | ×3 | world dm |
| `wk.a` `wk.b` `wk.flags` `wk.verts` `wk.xyz` | u32, u32, u8, u16, i32 ×3 | walking edge | flags: bit0 crosswalk, bit1 crosses with the "along" phase, bit2 with "across", bit3 elevated |
| `elev.kind` `elev.width` `elev.verts` | u8, u16 dm, u16 | elevated way | kind 0 road, 1 footway, 2 rail |
| `elev.xyz` | i32 | ×3 | the deck's surface, world dm |
| `elev.own` | u8 | vertex | 1: the walk builds the deck here (slab, parapets, columns); 0: the map's deck volume is there |
| `moor.xy` `moor.heading` `moor.kind` | i32 ×2, u8, u8 | boat | heading 0–255 → 0–2π; kind 0 speedboat, 1 motorboat |

Streets, walks and elevated ways are filed under **every** square they touch (with the nodes they end at), so a node's ways are all known once its own square is in. `manifest.walk`: a hash (12 hex) of `walk.json` and every square, appended as `?v=` to them.

---

### Task 0: The branch and the worktree

**Files:** none of the product. Moves `docs/superpowers/specs/2026-11-16-street-walk-design.md`, `docs/superpowers/spikes/2026-11-16-street-walk/` and this plan into the worktree.

- [ ] **Step 1:** `git worktree add .claude/worktrees/street-walk -b street-walk main` from the repo root (the main checkout is on `recap-film` with unrelated uncommitted work: leave it alone).
- [ ] **Step 2:** Move the design doc, the spike folder and this plan from the main checkout into the same paths in the worktree. Grep the spike for local paths, user names and tokens: nothing may match but the scrubbed `new URL(…)` paths.
- [ ] **Step 3:** In the worktree: `npm ci` in `tinyworlds-pipeline` and `tinyworlds-frontend`; symlink the gitignored data: `tinyworlds-pipeline/data → <main>/tinyworlds-pipeline/data`, `tinyworlds-frontend/public/data → <main>/tinyworlds-frontend/public/data`.
- [ ] **Step 4:** `npm test` in both projects passes (the baseline).
- [ ] **Step 5:** Commit `docs: the street walk's design, spike and plan`.

---

### Task 1: The square format, both ends

**Files:**
- Create: `tinyworlds-pipeline/src/walk/grid.ts`, `tinyworlds-pipeline/src/walk/format.ts`, `tinyworlds-pipeline/src/walk/format.test.ts`, `tinyworlds-pipeline/src/walk/grid.test.ts`
- Create: `tinyworlds-frontend/src/walk/format.ts`, `tinyworlds-frontend/src/walk/geo.ts`, `tinyworlds-frontend/src/walk/walk-index.ts`, `tinyworlds-frontend/src/walk/__tests__/format.test.ts`, `…/__tests__/walk-index.test.ts`
- Modify: `CLAUDE.md` (root): the data contract above, under "Data contract", with `walk?: string` in the `Manifest` interface.

**Interfaces:**
- Produces (pipeline): `CELL = 200`; `type Geo = { lon0; lat0; betaDeg; k; kz }`; `lonLatToEN(geo, lon, lat): [number, number]`; `mapToEN(geo, X, Y): [number, number]`; `cellOf(e, n): [number, number]`; `cellKey(i, j): string`; `type CellArrays = Record<string, Uint8Array | Int8Array | Uint16Array | Int16Array | Uint32Array | Int32Array | Float32Array>`; `encodeCell(i, j, arrays: CellArrays): Buffer` (gzip level 9).
- Produces (viewer): `inflate(bytes: Uint8Array): Promise<Uint8Array>` (gzip magic `1f 8b` → `DecompressionStream("gzip")`, else as is: a server may already have undone it); `decodeCell(raw: Uint8Array): { i: number; j: number; arrays: Partial<CellArrays> }`; `class WalkDataError extends Error`; `CELL`, `lonLatToEN`, `enToLonLat(geo, e, n): [lon, lat]`, `cellOf`; `parseWalkIndex(json: unknown): WalkIndex` (throws `WalkDataError`), `cellExists(ix, i, j): boolean`, the `WalkIndex` type as in the contract.

- [ ] **Step 1: failing tests.** Pipeline `format.test.ts`: `"a square round-trips through the viewer's decoder"`: encode `{ "vol.xy": Int16Array [−5, 7, 1999, −3000], "vol.seed": Uint32Array [4294967295], "mask": Uint8Array [1] }` at (−3, 12), gunzip with `zlib`, `decodeCell` (imported from `../../../tinyworlds-frontend/src/walk/format.ts`) gives `i −3, j 12` and equal arrays, each array's byte offset a multiple of 4. `grid.test.ts`: `mapToEN` inverts the projection used by `src/projection.ts` at ground (a lon/lat → map px → EN equals `lonLatToEN` within 1 cm, New York's geo); `cellOf(−0.1, 199.9)` is `[−1, 0]`. Viewer `format.test.ts`: truncated payload and a header naming an unknown type throw `WalkDataError`; `inflate` of gzip and of plain bytes. `walk-index.test.ts`: a valid index parses; `cellExists` reads bit `(i−i0)+(j−j0)·cols` LSB-first and is false outside the grid; a missing `palette` throws.
- [ ] **Step 2:** run them: `npm test -- walk` in each project, FAIL (modules missing).
- [ ] **Step 3:** implement. The viewer's `format.ts` imports nothing (the pipeline's test reaches it by relative path).
- [ ] **Step 4:** tests pass; `npm run lint` and `tsc` clean in both.
- [ ] **Step 5:** commit `feat(walk): the square format, written by the pipeline and read by the viewer`.

---

### Task 2: Cutting the scene into squares

**Files:**
- Create: `tinyworlds-pipeline/src/walk/clip.ts`, `cut.ts`, `mask.ts` and their tests.

**Interfaces:**
- Consumes: Task 1's `grid.ts`, `format.ts`; the scene through `readScene(dir)` (`scene/store.ts`); `G`, `PAINT_RANK`, `isWater` (`scene/kinds.ts`); `L_BRIDGE` (`scene/build.ts`, line flag 1: import the constant, do not repeat it).
- Produces:
  - `clipRing(ring: number[], box: Box): number[]` (Sutherland–Hodgman, flat e,n), `clipPolygon(rings: number[][], box): number[][]` (each ring alone; rings left with < 3 vertices dropped), `splitByCells(rings, i0, i1, j0, j1): Map<string, number[][]>` (quadtree: halve the box along its longer side, clip to each half, recurse to single squares; a ring wholly inside a half is passed down unclipped), `clipPolyline(pts: number[], box): number[][]` (Liang–Barsky per segment, joined into runs). `type Box = { e0; n0; e1; n1 }`.
  - `cutScene(scene: { arrays; meta }, geo: Geo, keep?: (i, j) => boolean): Map<string, SceneSquare>` with `interface SceneSquare { i; j; vol: …; gnd: …; way: …; tree: …; cab: … }` holding plain JS arrays ready for the encoder (Task 5 turns them into typed arrays with `squareArrays(sq): CellArrays`, also exported here).
  - `maskOf(polys: { kind: number; order: number; rings: number[][] }[], i, j, paintRank: Float32Array): Uint8Array` (the `mask` array: start water; paint each polygon in (rank, order) order, even-odd, at the 2 m cells' centres; water kinds (`isWater`) paint water, all others land).
- Rules (from `export.mjs`, made whole-city): volumes filed by their centre (`vol.center`); ground polygons split with `splitByCells` (polygon-clipping is far too slow for the harbour's polygon across thousands of squares); lines with `L_BRIDGE` left out (they become elevated ways, Task 4), the rest clipped to each square they touch grown by 30 m; trees by position; cables by their middle vertex, `cab.xyz` converted from map px (`x, y` are map px at ground, the third value px of height) to world dm.

- [ ] **Step 1: failing tests.** `clip.test.ts`: `"a ring across four squares comes back as four pieces whose areas sum to the ring's"`; `"a ring with a hole keeps the hole in the square it falls in"`; `"a ring inside one square is returned unchanged"`; `clipPolyline` of a line crossing a box twice gives two runs whose ends lie on the box. `mask.test.ts`: no polygons → `[1]` (all water); one land polygon covering the square → `[0]`; land with a lake polygon (kind `G.Lake`) in its west half → mode 2 and bit (10, 50) water, (90, 50) land; a pier (kind `G.Pier`) painted over water is land; ties in rank paint in `order`. `cut.test.ts` on a hand-made scene (two volumes, one ground polygon spanning two squares, one bridge line, one plain line, one tree, one cable): volumes land in their centres' squares with heights ÷ kz; the bridge line is in no square; the plain line is in both squares it crosses; coordinates are local dm.
- [ ] **Step 2:** run, FAIL.
- [ ] **Step 3:** implement.
- [ ] **Step 4:** tests pass, lint clean.
- [ ] **Step 5:** commit `feat(pipeline): cut the scene into the walk's squares, with land and water`.

---

### Task 3: Streets, sidewalks and their pieces

**Files:**
- Create: `tinyworlds-pipeline/src/walk/segments.ts`, `pieces.ts`, `pieces.test.ts`.

**Interfaces:**
- Produces:
  - `interface Rule { between?: [number, number]; value?: number; values?: string[] }`; `interface AccessRule { access_type: string; between?: [number, number]; when?: { heading?: string; mode?: unknown; using?: unknown; during?: unknown; vehicle?: unknown } }`.
  - `interface Segment { id: string; subtype: "road" | "rail"; cls: string; subclass: string | null; name: string; width: number | null; flags: Rule[]; levels: Rule[]; access: AccessRule[]; connectors: { id: string; at: number }[]; pts: number[] }` (pts flat e,n).
  - `readSegments(file: string, geo: Geo): Promise<Segment[]>`: one DuckDB query over the whole file (no `bbox` filter: it crashes this DuckDB build); `subtype` road (classes below and the walking classes) and rail; `width` only when 2–60.
  - `CAR_CLASSES = ["motorway", "trunk", "primary", "secondary", "tertiary", "residential", "unclassified"]`, `CAR_SPEED = [22, 18, 12, 12, 10, 8.5, 8]` (m/s; links × 0.7, applied by the viewer), `CAR_WIDTH = [14, 13, 17, 14, 12, 10, 10]` (links × 0.6), `WALK_CLASSES = ["footway", "pedestrian", "living_street", "path"]`.
  - `oneWayOf(access: AccessRule[]): 0 | 1 | -1 | null` (1 only a→b, −1 only b→a, 0 two-way, `null` closed: denied to everyone without `when`). The rule is the spec's: `denied`, no `between`, a `heading`, no `mode`, `using`, `during`, `vehicle`; heading `"backward"` → 1, `"forward"` → −1 (as `roads.mjs`).
  - `interface Piece { kind: "street" | "walk" | "rail"; seg: number; a: string; b: string; cls: number; link: boolean; ow: 0 | 1 | -1; width: number; crosswalk: boolean; name: string; pts: number[]; bridge: boolean[]; level: number[]; tunnel: boolean }`.
  - `piecesOf(segments: Segment[]): Piece[]`: each segment cut between consecutive connectors (pieces under 0.5 m dropped), densified so vertices are at most 10 m apart; per vertex `bridge` and `level` from the rules at its fraction along the segment; `tunnel` when the piece's middle is under a tunnel flag or a negative level; walking pieces flagged indoor, covered or under construction dropped; closed streets dropped; abandoned or disused rails dropped.

- [ ] **Step 1: failing tests** (`pieces.test.ts`, segments made by hand): `oneWayOf` cases (heading backward → 1; with `mode` → 0; with `between` → 0; denied with no `when` → null); a 300 m street with connectors at 0, 0.5, 1 → two pieces, vertices ≤ 10 m apart, `a`/`b` the connector ids; a bridge flag between 0.2 and 0.8 marks exactly the vertices in that span; a level rule `value: 1` likewise; a piece whose middle is under `is_tunnel` is `tunnel`; a `footway` with subclass `crosswalk` is a walk piece with `crosswalk: true`; `is_indoor` footways are gone.
- [ ] **Step 2:** FAIL. **Step 3:** implement (`readSegments` has no unit test; Task 5's run proves it). **Step 4:** PASS, lint. **Step 5:** commit `feat(pipeline): the walk's streets and sidewalks from Overture's segments`.

---

### Task 4: Bridges, overpasses, tunnels and the network

**Files:**
- Create: `tinyworlds-pipeline/src/walk/heights.ts`, `heights.test.ts`, `network.ts`, `network.test.ts`.

**Interfaces:**
- Consumes: Task 3's `Piece`.
- Produces:
  - `solveHeights(pieces: Piece[], deckAt: (e: number, n: number) => number | null, opts?: { slope?: number; linkSlope?: number }): Float32Array[]` (z per vertex per piece). The graph: consecutive vertices of a piece joined by their distance; pieces' end vertices joined where they share a connector id (`a`/`b`). Targets: a `bridge` or `level > 0` vertex where `deckAt` gives a height takes that height (the map's deck over water); else `max(level, 1) × 6.5`; any other vertex 0. Then a max-propagation (a max-heap, highest first): `z(v) = max(target(v), z(u) − s·d(u, v))` over neighbours, `s` 0.08, 0.12 where either piece is a link. Tunnel pieces are not in the graph. Then clearance: wherever an elevated vertex (z > 0.5) lies over another piece of lower z crossing within the two half-widths, its target becomes at least `z_under + 4.5 + 1` (slab); solve again; at most three rounds.
  - `deckAt` for the real city is Task 5's (`deckAtFromScene`): the top (÷ kz) of a scene volume with `F_FLOATING` and `Roof.Deck` whose footprint holds the point, else null.
  - `buildNetwork(pieces: Piece[], z: Float32Array[], deckAt): Network` with `interface Network { nodes: Map<string, { id: number; e; n; z; flags; bearing }>; streets: { a; b; cls; flags; width; pts: number[] /* e,n,z */ }[]; walks: { a; b; flags; pts }[]; elevated: { kind: 0 | 1 | 2; width; pts: number[]; own: Uint8Array }[]; tunnels: WalkIndex["tunnels"] }`. Node ids: 0.. in first-seen order of connector ids (deterministic: pieces in segment order). Lights: a node where 3 or more street edges meet, not all motorway or trunk, at z 0; `bearing` of its widest street edge, mod π. A crosswalk walking edge with an end within 25 m of a lights node crosses with "along" (bit1) when its direction is within 45° of that node's bearing, else "across" (bit2). Elevated: every piece with a vertex above 0.3 m (roads kind 0, walks 1, rails 2), `own` 1 where `deckAt` is null. Tunnels: tunnel street pieces chained through shared connectors; a chain's portals are its ends that meet a non-tunnel piece; `length` the chain's length; `b` null when the chain has one portal.

- [ ] **Step 1: failing tests** (`heights.test.ts`): `"a level-1 overpass 400 m long comes down to the ground at both ends"`: two 300 m ground streets either side, middle vertices 6.5, slopes everywhere ≤ 0.08 + 1e-6, the far ground vertices 0; `"a short overpass borrows the next street for its ramp"`: a 60 m level-1 piece between ground streets → its middle at 6.5 and the ground streets lifted near it, slope ≤ 0.08; `"a bridge over water stands at the map's deck"`: `deckAt` 41 over a span → those vertices 41; `"a link ramps at 12%"`; `"a street passing under an overpass keeps 4.5 m clear"`: a ground street at z 0 crossing a level-1 piece whose solved z would be 3 → raised to ≥ 5.5 there; `"a crossing street not joined to the ramp is not lifted"`. `network.test.ts`: four streets meeting at a node → lights with the widest street's bearing; two motorways and a trunk → none; a crosswalk along that bearing near it → bit1; a one-way piece → flags bit1; a tunnel chain with two portals → one tunnel with both ends; with one portal → `b` null; node ids are the same on two runs.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS, lint. **Step 5:** commit `feat(pipeline): bridges and overpasses at their heights, tunnels and traffic lights`.

---

### Task 5: The `walk` step

**Files:**
- Create: `tinyworlds-pipeline/src/walk/moorings.ts`, `moorings.test.ts`, `build.ts`, `build.test.ts`.
- Modify: `tinyworlds-pipeline/src/cli.ts` (command `walk`, `all` runs it last when `CITY.walk`), `tinyworlds-pipeline/src/cities/types.ts` (`walk?: boolean`, documented), `tinyworlds-pipeline/src/cities/tinynyc.ts` (`walk: true`), `tinyworlds-pipeline/CLAUDE.md` (the command, a "Street walk" section, the table's New York row with the walk's time and size), root `CLAUDE.md` ("How the pieces fit": the street walk, a few lines).

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `mooringsOf(piers: number[][][] /* pier polygons' rings, e,n */, isWater: (e, n) => boolean): { e; n; heading; kind }[]`: a pier gets boats when `mix(pierIndex, 77) % 3 === 0`; along each of its outer ring's edges, every 12 m, a boat 2.5 m out on the water side (water 3 m out, pier 1 m in), heading along the edge; kind speedboat when `mix(pierIndex, k) % 3 === 0`, else motorboat.
  - `deckAtFromScene(scene, geo): (e, n) => number | null` (a 25 m grid over the floating deck volumes).
  - `shoreDistances(masks: Map<string, Uint8Array>): Map<string, Uint8Array>`: the `shore` array of every square with water, a distance transform (chamfer or exact Euclidean, in 2 m steps) over the whole city's mask, so distances run across squares; a missing square counts as land (the map's edge).
  - `buildWalk(opts?: { out?: string; around?: { lon: number; lat: number; radius: number } }): Promise<void>`: reads the scene (`DIRS.scene`), `raw/segment.parquet`, cuts, masks, solves, files streets, walks, elevated ways and moorings under every square they touch, writes `walk/cells/<i>_<j>.bin` for every square inside the map (a square exists when the scene's fog distance at its centre is under `fog.end`, or it holds anything), `walk/walk.json`, and `manifest.walk` (a SHA-256 over the sorted file names and contents, 12 hex; the manifest left alone when absent, like `stampIndexes`). With `around`, only the squares within the radius are written and the others left as they are, and the hash is still over every file. Logs counts, total size, the largest square.
  - CLI: `npm run cli -- --city tinynyc walk [--out <dir>] [--around lon,lat,metres]`.

- [ ] **Step 1: failing tests.** `shore.test.ts` (or in `build.test.ts`): two squares side by side, the west all land, the east all water: the east square's `shore` grows by 1 per cell eastwards from 1 at its west edge; an all-water square with no land within 510 m is all 255; an all-land square has none. `moorings.test.ts`: a 100 × 20 m pier in water with an index that passes the hash gets boats 12 m apart on its water sides, all on water, headings along the edges; a pier that fails the hash gets none. `build.test.ts`: on a tiny scene written to a temp dir with `writeScene` and a hand-made segments list (inject `readSegments` through an option `segments?: Segment[]` of `buildWalk`, test-only), `walk.json` parses with the viewer's `parseWalkIndex`, every bit set has its file, a square round-trips through `decodeCell`, and two runs give the same `manifest.walk`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; `npm run lint`.
- [ ] **Step 5: the real run, small.** `npm run cli -- --city tinynyc walk --around -73.9857,40.7580,600` locally (Times Square): it finishes; Midtown's squares exist; print one square's counts.
- [ ] **Step 6: the real run, whole city, on the build machine.** Copy the worktree's pipeline (source, `node_modules` excluded) and `data/tinynyc/{scene,raw/segment.parquet}` there, `npm ci`, run `walk` with `--max-old-space-size=24000`, copy `walk/` back into `tinyworlds-frontend/public/data/tinynyc/` and set `manifest.walk` locally (run `walk`'s stamp, or copy the hash). Record the time, files and size in the pipeline's `CLAUDE.md`. Targets: at most ~120 MB in all; the 49 squares round Times Square at most ~3 MB together. Over target: report the per-array totals and shrink (fewer ground vertices by simplifying to 0.5 m, dropping volumes under 2 m², …) before going on.
- [ ] **Step 7:** commit `feat(pipeline): the walk step: New York in 200 m squares`.

---

### Task 6: The viewer's world: squares, surfaces, water, walls

**Files:**
- Create: `tinyworlds-frontend/src/walk/cell.ts`, `world.ts`, `__tests__/cell.test.ts`, `__tests__/world.test.ts`, `__tests__/fixtures.ts` (builders of small `WalkCell`s by hand, shared by later tests).

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `interface WalkCell { i; j; key: string; volumes: Volume[]; ground: GroundPoly[]; ways: GroundWay[]; trees: Float32Array /* e, n, kind */; cables: Cable[]; mask: { mode: 0 | 1 | 2; bits: Uint8Array | null }; nodes: RoadNode[]; streets: StreetEdge[]; walks: WalkEdge[]; elevated: ElevatedWay[]; moorings: Mooring[] }` with, in world metres: `Volume { rings: Float32Array[]; base; top; roofH; roofShape; wall; roof; glass; pattern; flags; seed; box: [e0, n0, e1, n1] }`, `GroundPoly { kind; order; rings: Float32Array[] }`, `GroundWay { kind; width; order; pts: Float32Array }`, `Cable { kind; pts: Float32Array /* e,n,z */ }`, `RoadNode { id; e; n; z; lights: boolean; portal: boolean; bearing: number /* rad */ }`, `StreetEdge { key: string /* "a-b" */; a; b; cls; link; ow: 0 | 1 | -1; elevated; width; pts: Float32Array /* e,n,z */; length }`, `WalkEdge { key; a; b; crosswalk; phase: 0 | 1 | 2; elevated; pts; length }`, `ElevatedWay { kind; width; pts: Float32Array; own: Uint8Array }`, `Mooring { e; n; heading; kind: "speedboat" | "motorboat" }`.
  - `readCell(decoded: ReturnType<typeof decodeCell>): WalkCell`.
  - `interface Surface { z: number; kind: "ground" | "water" | "deck" | "roof" }`.
  - `class WalkWorld { constructor(index: WalkIndex); add(cell: WalkCell): void; remove(key: string): void; has(i, j): boolean; cells(): Iterable<WalkCell>; inData(e, n): boolean; isWater(e, n): boolean; surfaceUnder(e, n, fromZ: number, reach: number): Surface; blocked(e, n, radius, zFeet, height): boolean; slide(e0, n0, e1, n1, radius, zFeet, height): [number, number]; parapets(e, n, radius): { e0; n0; e1; n1; z }[]; roofs: ((e, n) => number | null) | null }` — `surfaceUnder` returns the highest of ground 0 (land) or water −0.6, any elevated way whose strip (half-width) holds the point at its interpolated z, and `roofs(e, n)` (set by the game: car roofs, for you on foot), among those at most `fromZ + reach`. Walls: volume footprints with `base ≤ zFeet + height` and `top > zFeet + 0.05` (so you walk under a bridge's deck volume), found through a 20 m grid per square that also holds neighbours' volumes whose box reaches in; outside the data (`!inData`) is a wall. `parapets`: both edges of every elevated way, 1 m high, open where two elevated ways meet.

- [ ] **Step 1: failing tests.** `cell.test.ts`: a square encoded by hand (bytes built in the test with the contract's layout) reads back with local dm turned into world metres, `vol.base` ÷ 10, `node.bearing` 128 → π/2·… (128/255·π), `st.flags` bits. `world.test.ts`: standing on land → z 0, `ground`; over a mixed mask's water bit → −0.6, `water`; under a deck 7 m up with reach 0.3 → ground, on it from z 6.9 → deck at 7; a deck ramp interpolates z; inside a volume's footprint → blocked; under a floating volume at base 6 → not blocked at zFeet 0 height 1.8; `slide` along a wall keeps the motion parallel to it; outside every square → blocked and `inData` false; a square removed → its walls gone.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS, lint, `npm run typecheck`. **Step 5:** commit `feat(viewer): the walk's squares, surfaces and walls`.

---

### Task 7: The walk's words and the controls

**Files:**
- Modify: `tinyworlds-frontend/src/i18n/types.ts`, `en.ts`, `pt-BR.ts`, `es-ES.ts` (the whole `walk` group, every later task's strings included), `src/worlds/types.ts` (`walk?: boolean`, `units?: "imperial"` documented: mph where imperial, km/h otherwise), `src/worlds/tinynyc.ts` (`walk: true`, `units: "imperial"`).
- Create: `tinyworlds-frontend/src/walk/controls.ts`, `__tests__/controls.test.ts`.

**Interfaces:**
- Produces:
  - `type ActionId = "forward" | "back" | "left" | "right" | "turnLeft" | "turnRight" | "sprint" | "jump" | "enter" | "accelerate" | "brake" | "steerLeft" | "steerRight" | "handbrake" | "horn" | "exit" | "camera" | "lookBehind" | "map" | "menu" | "pixelDown" | "pixelUp"`; `type Group = "foot" | "drive" | "any"`; `ACTIONS: readonly { id: ActionId; group: Group }[]` in the menu's order; `type Bindings = Record<ActionId, [string | null, string | null]>` (`KeyboardEvent.code`s).
  - `defaultBindings(): Bindings`: forward KeyW/ArrowUp, back KeyS/ArrowDown, left KeyA, right KeyD, turnLeft ArrowLeft, turnRight ArrowRight, sprint ShiftLeft/ShiftRight, jump Space, enter KeyF; accelerate KeyW/ArrowUp, brake KeyS/ArrowDown, steerLeft KeyA/ArrowLeft, steerRight KeyD/ArrowRight, handbrake Space, horn KeyE, exit KeyF, camera KeyV, lookBehind KeyC; map KeyM, menu KeyP, pixelDown BracketLeft, pixelUp BracketRight.
  - `rebind(b, id, slot: 0 | 1, code: string): Bindings` (new object; the code leaves every other action of the same group and of `any`; given to an `any` action, it leaves every action).
  - `loadBindings(storage: Pick<Storage, "getItem"> | null): Bindings`, `saveBindings(storage: Pick<Storage, "setItem"> | null, b): void` (key `tinyworlds.walk.controls.v1`, JSON; anything unreadable → defaults; unknown actions dropped, missing filled from the defaults; every access in try/catch).
  - `actionsOf(b, code, group: "foot" | "drive"): ActionId[]` (that group's and `any`'s).
  - `keyLabel(code: string, keys: Strings["walk"]["keys"]): string` (`KeyW` → "W", `Digit4` → "4", `ShiftLeft` → keys.leftShift, …).
  - `Strings["walk"]` (`types.ts`), at least: `person`, `personHint` ("Drag me onto a street"), `dropHere`, `tapMap`, `noStreet`, `loading`, `failed`, `noWebgl`, `back`, `controls`, `resetControls`, `pressKey`, `unbound`, `groups: { foot; drive; any }`, `actions: Record<ActionId, string>`, `keys: { space; leftShift; rightShift; leftCtrl; rightCtrl; leftAlt; rightAlt; up; down; left; right; enter; tab; backspace; capsLock }`, `hints: { foot; swim; drive; sail }` (templates with `{forward}` `{jump}` `{enter}` `{map}` `{menu}` … filled from the current keys), `getIn` ("{key} get in the {vehicle}"), `vehicles: Record<CarKind | BoatKind, string>`, `speed: { mph; kmh }` ("{n} mph"), `life`, `lifeLabel` ("Life {n} of {max}"), `damage`, `wrecked`, `messages: { slowDown; noRoom; tunnelClosed; sinking; edge }`, `wasted` ("WASTED"; pt-BR "DETONADO", es-ES "ACABADO"), `wastedSaid` (screen reader), `pixel`, `sound`, `clickToLook`, `mapGoThere`, `touch: { jump; enter; exit; horn; camera; brake }`. The `vehicles` keys are Task 9's kinds: hatchback, sedan, taxi, suv, pickup, limousine, police, muscle, sports, supercar, boxTruck, bus, speedboat, motorboat, ferry.

- [ ] **Step 1: failing tests** (`controls.test.ts`): defaults as listed; `rebind(defaults, "jump", 0, "KeyE")` takes KeyE from nothing on foot but leaves `horn` (driving) its KeyE; `rebind(…, "map", 0, "KeyW")` takes KeyW from forward and accelerate; `loadBindings` with `getItem` throwing, with `"{"`, with `{ "jump": ["KeyJ", null], "fly": ["KeyX", null] }` (jump changed, fly dropped, the rest defaults); `saveBindings` with `setItem` throwing does not throw; `actionsOf(defaults, "Space", "drive")` is `["handbrake"]`; `keyLabel("ShiftLeft", en.walk.keys)` is the dictionary's. The i18n tests already compare keys and placeholders across languages: they must pass with the new group.
- [ ] **Step 2:** FAIL. **Step 3:** implement and write all three dictionaries (natural pt-BR and es-ES, not word for word). **Step 4:** PASS, lint, typecheck. **Step 5:** commit `feat(viewer): the walk's words in three languages, and its controls`.

---

### Task 8: You: on foot, jumping, swimming, life, the wasted screen's timing, coming to

**Files:**
- Create: `tinyworlds-frontend/src/walk/health.ts`, `player.ts`, `wasted.ts`, `spawn.ts`, tests for each.

**Interfaces:**
- Consumes: `WalkWorld`, `Surface` (Task 6), fixtures.
- Produces:
  - `health.ts`: `LIFE_MAX = 100`, `REGEN = 2`, `REGEN_AFTER = 5`; `fallDamage(drop: number, into: Surface["kind"]): number` (water 0; `clamp((drop − 4) / 11, 0, 1) × 100`); `hitDamage(closing: number): number` (`max(0, (closing − 2) × 9)`); `fireDamage(distance: number): number` (0 beyond 5 m, `80 − 8·distance` within); `regen(life, sinceHurt, dt): number`.
  - `player.ts`: `interface Player { e; n; z; vz; yaw; pitch; mode: "foot" | "swim" | "drive" | "down"; life: number; sinceHurt: number; airFrom: number | null; bob: number }`; `interface FootInput { forward: number; strafe: number; turn: number; sprint: boolean; jump: boolean }` (−1…1); `newPlayer(e, n, z, yaw): Player`; `stepFoot(p: Player, input: FootInput, world: Pick<WalkWorld, "surfaceUnder" | "slide" | "isWater" | "inData">, dt: number): FootEvents` with `interface FootEvents { hurt: number; landed: Surface["kind"] | null; splashed: boolean }`. Constants exported: `WALK = 4.5`, `SPRINT = 11`, `JUMP = 5.2`, `GRAVITY = 13`, `STEP_UP = 0.3`, `JUMP_REACH = 1.15`, `SWIM = 1.6`, `SWIM_SPRINT = 3`, `RADIUS = 0.35`, `HEIGHT = 1.8`, `EYE = 1.62`, `SWIM_EYE = 0.25`, `TURN = 2.2` rad/s. `dt` clamped to 0.1 and stepped in ≤ 0.02 s pieces. In the water: no jump; pushing against a shore whose land is within 0.8 m above the water climbs out.
  - `wasted.ts`: `WASTED = { slowFor: 1.5, slowRate: 0.25, wordAt: 1.2, holdFor: 2.5, fadeFor: 0.6 }`; `wastedAt(t: number, reduced: boolean): { timeRate: number; grey: number; lift: number; word: number; skippable: boolean; done: boolean }` (reduced: rate 1, lift 0, the word and the fade only).
  - `spawn.ts`: `comeTo(world: WalkWorld, e, n, random: () => number): { e; n; yaw } | null`: a point on a sidewalk (`WalkEdge`, not a crosswalk, not elevated) 20–60 m from (e, n), on land, not in a wall, more than 2 m from any street's strip, facing along the sidewalk; none within 60 m: widen to 200 m; none: null.

- [ ] **Step 1: failing tests.** `health.test.ts`: `fallDamage(3.9, "ground") = 0`, `(15, "ground") = 100`, `(30, "water") = 0`; `hitDamage(13.41) ≥ 100` (30 mph); `hitDamage(2) = 0`; `fireDamage(0) = 80`, `(5) = 40`, `(5.1) = 0`; `regen` waits 5 s then 2/s, capped at 100. `player.test.ts`: walking forward 1 s moves 4.5 m along the yaw; sprint 11; a jump from flat ground lands after ~0.8 s; a jump lands on a 1.1 m roof (`roofs`), not on a 1.3 m one; stepping off a 10 m deck hurts by `fallDamage(10)`; walking into water sets `mode "swim"` with z at −0.6 and speed 1.6; pushing against a 0.6 m quay climbs out; `"a long frame never passes a wall"`: dt 5 toward a wall 1 m away leaves you on your side. `wasted.test.ts`: at t 0.5 `timeRate 0.25`; the word reaches 1 by `wordAt + 0.3`; skippable only after the word is up; `done` at the end; reduced: `timeRate 1`, `lift 0`. `spawn.test.ts`: from a point mid-street the result is on a sidewalk 20–60 m away and not in a wall; a world with only a street gives null.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(viewer): walking, jumping, swimming, life and coming to`.

---

### Task 9: Cars and boats

**Files:**
- Create: `tinyworlds-frontend/src/walk/vehicles.ts`, `collide.ts`, tests for both.

**Interfaces:**
- Consumes: `WalkWorld` (surfaces, walls, parapets, water).
- Produces:
  - `type CarKind = "hatchback" | "sedan" | "taxi" | "suv" | "pickup" | "limousine" | "police" | "muscle" | "sports" | "supercar" | "boxTruck" | "bus"`; `type BoatKind = "speedboat" | "motorboat" | "ferry"`; `CARS: Record<CarKind, { vmax; mass; accel; grip; tough; length; width; height }>` with vmax 40, 42, 40, 38, 40, 40, 52, 60, 64, 82, 28, 24 and mass 1100, 1500, 1600, 2100, 2300, 2600, 1800, 1650, 1350, 1400, 5500, 12000 (in that order), `tough` 2 for the box truck, 3 for the bus, else 1, muscle's grip the loosest; `BOATS: Record<BoatKind, { vmax; mass; length; width }>` with vmax 28, 14, 9; `TRAFFIC_MIX` (weights for traffic and parking: sedans and taxis most, supercars rarest).
  - `interface Vehicle { id: number; kind: CarKind | BoatKind; boat: boolean; e; n; z; vz; yaw; v: number; vs: number; w: number; damage: number; state: "parked" | "traffic" | "loose" | "driven" | "wrecked" | "sinking" | "sunk"; fire: number; sink: number; stopFor: number; color: number; heave: number; roll: number }`.
  - `interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }`.
  - `stepCar(v, input: DriveInput | null, world, dt): VehicleEvents` and `stepBoat(v, input, world, dt, t): VehicleEvents` with `interface VehicleEvents { impact: number; fell: number; sank: boolean; wrecked: boolean }`. Arcade handling as the spike's `cars.js` (throttle, braking then reverse, steering that tightens with speed, the handbrake lets the back slide, grip per car); gravity and step-up 0.5 m onto surfaces; buildings and parapets stop a car, which slides along them (impact = the speed into the wall); a car whose middle is over water (`isWater` and no deck under it) starts sinking: floats 1 s, under over 4 s, then `sunk`. Boats: thrust and reverse, a rudder that needs way on, a loose stern, drag, swell (`heave`, `roll`, none under reduced motion: a `calm` flag in the world options), anything not water stops them; a wrecked boat sinks.
  - `applyDamage(v, impact: number, otherMass?: number): boolean` (`(impact − 3) × 0.022 / tough`, the lighter of two taking more by the mass ratio; ≥ 1: wrecked, fire for 9 s); `accelFactor(v)` (damage costs acceleration).
  - `collide.ts`: `interface Body { e; n; yaw; hl; hw; mass; ve; vn; w }`; `overlap(a: Body, b: Body): { depth; ne; nn; pe; pn } | null` (separating axes over both boxes' axes); `resolve(a, b, hit, restitution = 0.25): number` (pushes apart by mass, applies the impulse at the contact point, spins both; returns the closing speed along the normal). `bodyOf(v: Vehicle): Body` and `applyBody(v, b)`.

- [ ] **Step 1: failing tests.** `collide.test.ts`: two unit boxes 1.5 apart don't overlap, 0.9 apart do with depth 0.1 along e; rotated 45° cases; equal masses meeting head-on at 10 m/s each end with closing speed ≤ 0.25 × 20 apart and the returned impact 20; the heavier moves less. `vehicles.test.ts`: full throttle on flat ground reaches near `vmax` and no more (supercar 82, bus 24); braking from 20 m/s stops then reverses; `"a car at 80 m/s into a building stops at its wall"` (never inside); impact 3 does no damage; a 30 m/s wall hit wrecks a hatchback, half-wrecks a bus; a car pushed over water sinks and is `sunk` after ~5 s; a boat on land does not move forward; a boat with no way on does not turn.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(viewer): cars and boats: handling, crashes, damage, sinking`.

---

### Task 10: Traffic, lights, parked cars, tunnels

**Files:**
- Create: `tinyworlds-frontend/src/walk/lights.ts`, `traffic.ts`, tests for both.

**Interfaces:**
- Consumes: `WalkCell`'s `nodes`, `streets`; `Vehicle`, `stepCar`, `CARS`, `TRAFFIC_MIX`; `WalkWorld`; `WalkIndex["tunnels"]`.
- Produces:
  - `lights.ts`: `CYCLE = 34`, `GREEN = 13`, `YELLOW = 3`; `signal(t: number, phase: 0 | 1): "green" | "yellow" | "red"` (phase 0 green on [0, 13), yellow [13, 16), red [16, 34); phase 1 the same 17 s later); `greenLeft(t, phase): number`.
  - `class RoadNet { add(cell: WalkCell): void; remove(key: string): void; edge(key): StreetEdge | undefined; outOf(nodeId: number, from?: string): StreetEdge[]; lanes(edge: StreetEdge, forward: boolean): number[] /* lateral offsets, m, right of the centreline */ }`. Lanes: `max(1, floor(width / 3.3))` lanes in all; a one-way street's lanes centred, a two-way street's lanes for each way right of the middle.
  - `parkedOn(edge: StreetEdge, world: WalkWorld): { e; n; yaw; kind: CarKind; color: number }[]`: deterministic from `edge.key` (an FNV hash, not `Math.random`), both kerbs where the street is at least 9 m wide and not elevated, a spot every 6.5 m, two in three filled, facing the traffic beside them; one overlapping a wall or water dropped.
  - `class Traffic { constructor(net: RoadNet, world: WalkWorld, tunnels, random: () => number); budget: number /* 70 */; step(dt: number, t: number, focus: { e; n }, others: Vehicle[]): void; cars: Vehicle[] }`: spawns out of sight beyond 170 m and within 320 m, drops beyond 380 m; follows lanes, turns along a curve between lanes (straight three times as likely as each turn; the right lane for a right turn), keeps a gap of `2 + 1.2·v` metres from whatever is ahead on its path (cars, you, people: `others` and a `blockers` list the game sets), slows for turns, stops at red and at yellow unless it cannot stop; two waiting on each other: the older goes; stuck 10 s behind something still: squeezes past (no collisions until clear); a hit traffic car stops 2.5 s, or goes `loose` above 2.2 m/s; a car reaching a tunnel portal disappears and comes out of the other portal after `length / speed` seconds; a closed tunnel takes it away.
  - `starterCar(world, near: { e; n }): Vehicle | null`: the red supercar parked on the nearest kerb.

- [ ] **Step 1: failing tests.** `lights.test.ts`: `signal(0,0)` green, `(13.5,0)` yellow, `(20,0)` red, `(17,1)` green, `greenLeft(10, 0) = 3`. `traffic.test.ts` (a fixture grid of four streets): two-way lanes are right of the middle, one-way centred; `parkedOn` is the same twice, none on a 7 m street, none on an elevated edge; a car approaching a red light stops before the node; one at yellow 2 m from the line goes through; a car behind a stopped car keeps its gap; nothing spawns within 170 m; a car reaching a portal reappears at the other after `length / speed`.
- [ ] **Step 2:** FAIL. **Step 3:** implement (port the spike's `cars.js` traffic). **Step 4:** PASS. **Step 5:** commit `feat(viewer): traffic on the real streets, lights, parked cars and tunnels`.

---

### Task 11: People

**Files:**
- Create: `tinyworlds-frontend/src/walk/people.ts`, `__tests__/people.test.ts`.

**Interfaces:**
- Consumes: `WalkCell.walks`, `lights.ts`, `Vehicle`, `WalkWorld`.
- Produces: `interface Person { e; n; z; yaw; state: "walking" | "waiting" | "dodging" | "down" | "running" | "swimming"; downFor: number; runFor: number; look: { skin; hair; top; bottom: number /* palette ramp ids */ }; phase: number }`; `class Crowd { constructor(world: WalkWorld, random); budget: number /* 150 */; people: Person[]; step(dt, t, focus: { e; n }, vehicles: Vehicle[]): CrowdEvents; scare(e, n, radius): void; knock(p: Person, from: { ve; vn }): void }`. Within 170 m, on walking edges (elevated walkways too), a little to one side of the line; at a crosswalk with lights they wait until their phase is green with at least 4 s left, one in sixteen does not; a car over 6 m/s coming at someone within 11 m makes them jump aside three times in four; a car that touches them knocks them down (`down` 3.5–5.5 s, then up and on); knocked into the water they swim to the nearest shore and climb out; a scare (horn, crash, knock, wreck) makes those within reach run for 5–8 s; nobody goes into the water by themselves; nobody dies.

- [ ] **Step 1: failing tests**: people only stand on walking edges; one at a red crosswalk waits (and with `random` returning < 1/16 does not); a car at 10 m/s heading at someone 8 m away makes them dodge (random 0.1) or not (random 0.9); a touch knocks down and they get up within 5.5 s; one put in the water ends on land; `scare` sets `running`.
- [ ] **Step 2:** FAIL. **Step 3:** implement (port from `cars.js`). **Step 4:** PASS. **Step 5:** commit `feat(viewer): people on the sidewalks and crosswalks`.

---

### Task 12: Dropping the person: snapping and the walk link

**Files:**
- Create: `tinyworlds-frontend/src/walk/drop.ts`, `__tests__/drop.test.ts`.
- Modify: `tinyworlds-frontend/src/map/hash.ts`, `src/map/__tests__/hash.test.ts`.

**Interfaces:**
- Produces: `snapDrop(cells: Iterable<WalkCell>, e, n): { e; n; z; yaw } | null` (the nearest point on a sidewalk, else a street's kerb side, within 150 m; on an elevated way when the point lies within its strip, at its z; facing along the way); `interface WalkLink { lat: number; lon: number; heading: number }`; `parseWalkHash(hash: string): WalkLink | null` for `#walk=<lat>,<lon>,<heading degrees>`; `formatWalkHash(v): string` (5 decimals, heading rounded to a degree). `parseHash` keeps returning null for a walk link (the map then starts as usual and the walk opens over it).

- [ ] **Step 1: failing tests**: snapping to the nearer of two sidewalks, the yaw along it; dropped on a bridge's strip → its z; 200 m from anything → null; `parseWalkHash("#walk=40.758,-73.9855,90")`, bad numbers → null, `formatWalkHash` round trip; `parseHash` of a walk link is null and of `#40.7,-73.9,2` unchanged.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(viewer): dropping the person on a street, and walk links`.

---

### Task 13: The scene in three.js

**Files:**
- Modify: `tinyworlds-frontend/package.json` (`three`, `@types/three`; npm's current release).
- Create: `tinyworlds-frontend/src/walk/render/palette.ts`, `materials.ts`, `cell-mesh.ts`, `deck-mesh.ts`, `view.ts`, `__tests__/deck-mesh.test.ts`.

**Interfaces:**
- Consumes: `WalkIndex` (palette, paintRank, gridDeg, sunDeg), `WalkCell`, `WalkWorld`; the spike's `walk.html` (shaders `HASH`, `FOG`, walls, roofs, ground, water, trees; `buildCell`, `triangulate`, the paint table `KIND`).
- Produces:
  - `makePalette(ix: WalkIndex): { rgb(ramp: number, shade: number): [number, number, number]; texture: THREE.DataTexture; ramp(name: string): number }`.
  - `buildCellMeshes(cell: WalkCell, ctx: MeshContext): THREE.Group` (buildings with the map's window patterns, one texel per map pixel (`1/kz` m), wall tone from the sun bearing, far walls settling on their average; ground in paint rank order with patterns; ways; trees as upright billboards; cables as thin lines; water as an opaque shimmering plane at −0.6 under land; the shore edge: quay stone along paved land and piers, a bank elsewhere).
  - `deckGeometry(way: ElevatedWay, under: (e, n) => boolean /* a street or water below */): { slab; parapets; columns: [e, n][] }`: a 1 m slab under `own` stretches, a 1 m parapet each side wherever the way is elevated, columns every ~30 m over land that never stand where `under` is true; lane lines carried up.
  - `class WalkView { constructor(canvas: HTMLCanvasElement, ix: WalkIndex, load: (i, j) => Promise<WalkCell>); world: WalkWorld; setPixel(n: number): void; setCamera(e, n, z, yaw, pitch, fov): void; update(dt): void /* streaming, at most one square meshed a frame */; render(): void; scene: THREE.Scene; dispose(): void }`: renders at `1/pixel` resolution and scales up without smoothing; sky and fog 140–560 m; squares within 3 load (6 at a time, nearest first), beyond 4.5 unload (and leave `world`); a failed square is asked again after 10 s; the edge of the data is a wall in the fog.

- [ ] **Step 1: failing test** (`deck-mesh.test.ts`): a 120 m `own` way over land gets columns ~30 m apart, none where `under` is true; parapets on both sides; no slab where `own` is 0.
- [ ] **Step 2:** FAIL. **Step 3:** implement; port the spike's look faithfully (trees upright: sample `texture2D(map, vUv)`).
- [ ] **Step 4:** PASS. A dev page is Task 15's; here, check with a throwaway script page in the scratchpad that loads Times Square's squares from the Task 5 run and renders a still: compare it with the spike's screenshot (`/tmp/claude-chrome-screenshots-gWJX1d/screenshot-1794852485560-3.jpg`).
- [ ] **Step 5:** commit `feat(viewer): the walk's scene: buildings, ground, bridges and water in the map's palette`.

---

### Task 14: Models, particles, sound and the game loop

**Files:**
- Create: `tinyworlds-frontend/src/walk/render/models.ts`, `render/particles.ts`, `sound.ts`, `game.ts`, `__tests__/game.test.ts`.

**Interfaces:**
- Consumes: everything from Tasks 6–13.
- Produces:
  - `models.ts`: instanced, palette-shaded models of every `CarKind` (boxes and tapered boxes, lights, glass, tyres; taxi yellow with a roof sign; police white with a blue band and a flashing bar, no words or crest; muscle stripes; sports spoiler; supercar wedge; pickup open bed; wrecks black) and `BoatKind` (the Staten Island ferry long and orange), people with swinging arms and legs, and you (the people's model in clothes of your own).
  - `particles.ts`: dithered points for sparks, glass, smoke (grey, black for a wreck), fire, bubbles, foam and wake.
  - `sound.ts`: `class WalkSound { constructor(); enabled: boolean; horn(on: boolean): void; crash(strength: number): void; boom(): void; splash(): void; dispose(): void }` (WebAudio, made on the first key or tap).
  - `game.ts`: `interface WalkState { mode: Player["mode"] | "boat"; life: number; vehicle: { kind; speed: number; damage: number; wrecked: boolean; boat: boolean } | null; near: { kind } | null; message: keyof Strings["walk"]["messages"] | null; hurt: number /* 0–1 flash */; wasted: ReturnType<typeof wastedAt> | null; camera: "chase" | "wheel" }`; `class WalkGame { constructor(opts: { view: WalkView; ix: WalkIndex; life: LifeRoutes /* life.json ferries */; start: { e; n; yaw }; bindings: Bindings; reduced: boolean; sound: WalkSound; units: "imperial" | "metric" }); subscribe(fn: (s: WalkState) => void): () => void; keyDown(code: string): ActionId[]; keyUp(code: string): void; look(dx: number, dy: number): void; stick(x: number, y: number): void; press(action: ActionId, down: boolean): void; setBindings(b): void; teleport(e, n): void; position(): { e; n; yaw }; start(): void; stop(): void; dispose(): void; skipWasted(): void }`. The loop: clamp `dt`, step you, the vehicle you drive, loose cars, traffic, people, boats (ferries sail the `life.json` routes there and back, waiting a little at each end), collisions (cars, boats, you, people), damage and life (what hurts as the spec's calls), wrecks and fires, sinking, the wasted sequence (slow time, grey, the camera lifting over you lying in the street, the word, then `comeTo` and full life, on foot, the vehicle left where it was), getting in (within 2.4 m: a parked, loose, traffic car or a moored boat or one alongside while you swim) and out (under 4 m/s, driver's side if there is room, else the other, the front, the back; on a boat onto a pier or shore within 1.5 m, or into the water); the two cameras (chase: swings back behind 1.4 s after you look round, look behind, comes closer when a wall is in the way, widens with speed except under reduced motion; wheel); `window.walk = { sim(seconds), state }` in development only.

- [ ] **Step 1: failing tests** (`game.test.ts`, the game built over a fixture world with a fake `WalkView` that renders nothing): getting into a parked car within 2.4 m and not at 3 m; getting out at 6 m/s says `slowDown`; driving into water: the car sinks and you come out swimming; a fall of 20 m runs the wasted sequence and you come to on a sidewalk 20–60 m away with life 100 and `mode "foot"`; being hit at 15 m/s on foot is the wasted sequence, at 5 m/s is not (life 73); a car wrecked with you inside is the wasted sequence; life comes back 2/s after 5 s.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS. **Step 5:** commit `feat(viewer): the walk's game loop: driving, sailing, crashing, life and the wasted screen`.

---

### Task 15: The walk on the map

**Files:**
- Create: `tinyworlds-frontend/src/components/walk/walk-screen.tsx`, `walk-hud.tsx`, `wasted-overlay.tsx`, `controls-menu.tsx`, `touch-pad.tsx`, `walk-person.tsx`; `src/map/walker.ts`.
- Modify: `src/components/map/map-app.tsx` (the split layout, the person, the `W` key that picks it up and puts it at the map's centre, the walk link, M and "Back to the map"), `src/components/map/tool-column.tsx` (the person's place), `src/app/globals.css` (`.walk-split`: 7fr 3fr; stacked below 800 px or in portrait), `src/lib/site-events.ts` (`walk_start` with `world`), `src/legal/privacy.ts` (the `your-browser` list: "the keys you chose for the street walk", in the three languages), `src/legal/updated.ts` (`LEGAL_UPDATED` to the day this lands), `tinyworlds-frontend/CLAUDE.md` (a "Street walk" section: how it is entered, the layout, the modules, the keys, what it stores).

**Interfaces:**
- Consumes: everything above; `MapEngine` (`screenToMap`, `getCentre`, `flyTo`, `addSceneLayer`, `invalidate`), `dataUrl()` (`src/map/data.ts`: the walk's files take `?v=<manifest.walk>`), `parseManifest` (add `walk?: string`).
- Produces:
  - `WalkScreen` (`walk-screen.tsx`, the default export of a module only ever reached by `import()`): `{ start: { e; n; yaw }; onExit(at: { lat; lon }): void; onMove(at: { lat; lon; heading }): void }`. It checks WebGL first (`noWebgl` sign and `onExit` if absent), loads `walk.json` (`failed` with a retry), builds `WalkView` and `WalkGame`, takes the keys while it is open (ignored while typing or a dialog is open; the menu takes the next key when rebinding), the mouse through pointer lock (a click on the view asks for it; `clickToLook` until then; Esc lets go), the touch pad on touch screens, and writes `#walk=…` through `writeHash` when you settle.
  - `WalkHud`: the corner sign with the **life bar always** (100, green, amber under 50, red under 25, flashing on a hit, `aria-label` `lifeLabel`), the car's damage bar beside it while driving or "wrecked", the speed in the world's units, the vehicle's name, `getIn` near a vehicle, the hint built from the current keys, the messages for 2.5 s; the view's edges redden on a hit (not under reduced motion: a plain frame instead).
  - `WastedOverlay`: the word in Tiny5, the palette's paper colour with a one-pixel dark outline, over a dithered vignette, faded by `wastedAt`; said once through a polite live region (`wastedSaid`); a key or tap skips once `skippable`.
  - `ControlsMenu`: a shadcn `Dialog` listing `ACTIONS` by group, two key buttons each (a press then the next key: `rebind`, saved), "Reset to defaults", pixel size and the sound switch.
  - `TouchPad`: a stick on the left half (walks, swims, drives, sails), drag-to-look on the right half, buttons for jump, get in/out, horn, camera and back to the map, from `t.walk.touch`.
  - `WalkPerson` (tool column): drag onto the map (while held, the ways near the pointer light up in the accent through `walker.ts` and the person dangles over the spot; let go: `snapDrop` over the squares under the point, loaded on the way; null → `noStreet`), tap then tap the map on a touch screen, `W` from the keyboard. `siteEvent("walk_start", { world })` when a walk opens.
  - `walker.ts`: `walkerLayer(engine, get: () => { lat; lon; heading } | null): () => void` (the person and a view cone at your place, in the map's pixel style), `dropHighlight(engine, ways: Float32Array[] | null)`.
  - In the split, the map is the same `MapEngine`, following you, a click on it takes you there (`teleport`), the map's other signs give way; "Back to the map" and M leave with the map centred where you are.

- [ ] **Step 1: failing tests** in `src/walk/__tests__/hud.test.ts` for the pure parts the components use: `lifeTone(64) = "ok"`, `(49) = "low"`, `(24) = "critical"`; `speedText(13.41, "imperial", en.walk) = "30 mph"`, metric `"48 km/h"`; `hintText("foot", bindings, en.walk)` names the current keys (rebinding jump to J shows J). Put these in `src/walk/hud-text.ts`.
- [ ] **Step 2:** FAIL. **Step 3:** implement; read the Next.js 16 guide on lazy loading and client components in `node_modules/next/dist/docs/` first.
- [ ] **Step 4:** PASS; `npm run lint`, `npm run typecheck`, `npm test`.
- [ ] **Step 5: in the real viewer.** Build the export (move `public/data` away by absolute path first and back after, as the viewer's `CLAUDE.md` says; memory note `tinyworlds-viewer-local-check`), serve it with New York's data on 127.0.0.1, open it in Chrome and check by hand, with screenshots: the person drops into Times Square; walking, sprinting, jumping onto a car, swimming off a pier, a boat out and back, a taxi driven over the Brooklyn Bridge and along an elevated highway and under it, a crash into traffic, a car driven into the river sinks, a 20 m fall shows the wasted screen and you come to nearby, the life bar always there, the controls menu rebinds and resets, M goes back to the map at your place, a walk link opens the walk; pt-BR and es-ES strings; a phone-sized window (portrait layout, the touch pad); the frame rate with full traffic (target 60 fps on a laptop at pixel size 3). Fix what fails before the commit.
- [ ] **Step 6:** commit `feat(viewer): the street walk: drop the person on the map and walk New York`.

---

### Task 16: Deploy, docs and the whole check

**Files:**
- Modify: `deploy/deploy.sh` (`<world> --walk`: the squares first with `--delete`, then `walk.json`, then the manifest, with the `same_render` check like `--index`; `world_problems`: a world whose file says `walk: true` and has no `walk/walk.json` is incomplete, here and through `mirror_server_data`, which must fetch `walk/walk.json` too), `deploy/README.md`, root `CLAUDE.md` (the walk in "How the pieces fit" if Task 5 left it short, `--walk` in "Running and deploying"), `README.md` (the walk step and `--walk`).

- [ ] **Step 1:** `bash -n deploy/deploy.sh` and `shellcheck deploy/deploy.sh` clean; `deploy/deploy.sh check` passes here (New York has its walk) and fails with a clear line when `walk/walk.json` is moved away.
- [ ] **Step 2: the map did not move.** On `main` and on the branch: `npm run cli -- preview --at -73.9857,40.7580 --size 1300,800 --out <scratch>/a.png` (and at the Brooklyn Bridge, -73.9969,40.7061, and Queensboro, -73.9547,40.7570); `cmp` each pair: identical.
- [ ] **Step 3:** both projects: `npm test`, `npm run lint`, typecheck (`npm run build` in the pipeline, `npm run typecheck` in the viewer). The map's first bundle: compare the JS the map page loads before the walk opens with `main`'s build (`out/_next/static/chunks`, the chunks the map's HTML references): no three.js in them.
- [ ] **Step 4:** a fresh-eyes review of the whole branch (`superpowers:requesting-code-review`).
- [ ] **Step 5:** commit `feat(deploy): send and check the street walk's data`. Do not push or merge: the owner tries the branch locally first (the spec's launch call), and the data goes up (`deploy.sh tinynyc --walk`) before the merge.

---

### Task 17: Water worth looking at (the owner's ask, after the rest)

The owner pointed at a write-up of layered pixel-art water: "make water prettier according to this". Its ideas, re-made for a first-person 3D walk in the map's palette (none of its code: its numbers are a guide, the walk's own shader does the work):

**Files:**
- Modify: `tinyworlds-frontend/src/walk/render/materials.ts` (the water material), `render/cell-mesh.ts` (the shore texture per square, damp ground), `render/view.ts` (the reflection pass, the loop clock), `render/particles.ts` (glints, ripple rings); `src/walk/__tests__/water.test.ts`; `src/walk/water.ts` (the pure tone rules, tested).
- Modify: `tinyworlds-frontend/CLAUDE.md` (the water's layers, a paragraph).

**Interfaces:**
- Consumes: `WalkCell.shore` (Task 5's `shore` array, read by `readCell` as `shore: Uint8Array | null`: add it there), the palette ramps `water`, `waterShallow`, `foam`.
- Produces: `water.ts`: `LOOP = 5` (seconds; every motion a whole number of cycles per loop, so nothing jumps); `depthTone(shoreSteps: number): WaterTone` (deep away from land: within 1 step `waterShallow` lit, under 3 steps the light rim, beyond 7 the deep shade, the base between); `skyTone(tone, grazing: number): WaterTone` (water seen at a grazing angle mirrors the sky: one and two shades lighter past two thresholds of grazing, never on the shallow band); `reflectTone(luma: number, darkCut: number): WaterTone` (three flat tones: below `darkCut` the darkest, below 110 the middle, else the lightest of the deep half of the ramp); `wobble(rowsFromBase: number, t: number, y: number): number` (whole pixels: 0 for the first 3 rows, at most 1 up to 30, at most 2 beyond; 2 cycles per loop); `lapRing(t): 2 | 3` (the lapping line 2 cells out, stepping to 3 and back twice per loop); `type WaterTone = { ramp: "water" | "waterShallow" | "foam"; shade: number }`.
- The look, layer by layer, all picking one palette colour per pixel (no blending anywhere: blending turned the write-up's first try into mush):
  1. **Depth**: the tone from the square's `shore` distance (a per-square `DataTexture`, nearest filtering).
  2. **Sky**: lighter where you see the water at a grazing angle (far water mirrors the sky; at your feet you see into it).
  3. **Reflections**: the buildings, trees, bridges and boats drawn again mirrored about the water plane into a low-resolution target (at the walk's own pixel size, or half of it on a phone), shown only on water, turned into the three flat tones, rows shifted sideways by whole pixels (`wobble`); where two overlap the darker wins; under reduced motion no wobble. A quality switch turns this pass off (automatically when the frame rate drops, and on phones by default if it costs the 30 fps budget).
  4. **The shore**: land within 2 m of the water one shade darker (damp ground, not on piers' decks); the 2 m band of water at the shore in `waterShallow`; light dashes lapping 2 cells out along the shore (stepping to 3 twice a loop), dashes travelling along it, measured from a smoothed shore so every notch does not get its own dash; a broken light line beside and below what stands in the water (bridge piers, piles, boats), never above it.
  5. **The far side is quiet**: where the shore is in shade or far away, no bright lapping (it reads as a neon outline): a dark contact line where the water meets a quay wall, and the quay mirrored dark.
  6. **Life**: glints, short dashes on the sunlit water that grow 1, 3, 5 px and split over 0.6 s, at random places and times (new places every loop), a couple lit at once in view; ripple rings where anything splashes (you, a car going in, a fallen person), five frames of 0.2 s, breaking up as they fade; boats' wakes in foam.

- [ ] **Step 1: failing tests** (`water.test.ts`): `depthTone` by steps (0→shallow, 2→rim, 5→base, 9→deep); `skyTone` lightens at grazing and leaves the shallow band alone; `reflectTone` splits at `darkCut` and 110; `wobble` is 0 for rows 0–2, |·| ≤ 1 for rows 3–29, ≤ 2 after, and the same at `t` and `t + LOOP`; `lapRing` takes both values over a loop and is the same at `t` and `t + LOOP`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS; in the real viewer, look at the East River from the Brooklyn Bridge's promenade, the Hudson from a pier and the Central Park reservoir, with screenshots before and after; check the frame rate with the reflection pass on and off.
- [ ] **Step 5:** commit `feat(viewer): layered water: depth, sky, reflections, lapping shores and glints`.

