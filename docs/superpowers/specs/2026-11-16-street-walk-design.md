# Street walk: New York at street level, on foot, at the wheel and in the water

*Design, 2026-11-16, approved by the owner the same day ("go ahead and implement this"). World:
`tinynyc` first; any world can switch it on later.*

## Why

The owner wants a street-level view inside the New York map: "the street view should feel like a
game, where the user is able to walk in the streets, think of a first person experience of
walking the city", entered "like street view, with a person with an option to be dropped in a
street." A throwaway spike around Times Square (a 2.8 km square) proved the look and the play:
the map's own pixel art standing up in 3D, traffic on the real streets, cars to get into, drive
and crash, people on the sidewalks. The owner liked it ("this looks nice") and asked for the
whole city, built for real, with its bridges, overpasses and water.

## How we got here (the owner's decisions, in order)

1. **Not Google Street View.** Its terms forbid storing, converting or feeding its imagery to
   AI, so it can only be shown as it is. Rejected.
2. **Photos from Mapillary** (CC BY-SA 4.0), turned into pixel art by AI, chosen over the map
   alone.
3. **Three ways were offered**: A, photo hops between panoramas; B, a free-walking 3D city built
   from the map's own scene; C, B plus Times Square's fronts painted from the photos. The owner
   chose **C**, "but for some cities we may need to use B": B is the base everywhere, C adds
   photo fronts where there are photos.
4. **No people in the photos**: the photo fronts must have the people (and cars) taken out.
5. **"Walk freely should actually be the way"**: no fence, walk anywhere; the city streams in
   pieces around you, and buildings are solid.
6. **Cars**: "add cars and allow the user to hop into and drive cars in the city."
7. **Crashes, controls, people, more cars, jumping**: "add the possibility of crashing the car
   and displacing other cars, also make it possible to remap the controls and use the same keys
   as GTA, also add pedestrians and make some different kinds of cars too, some of which are
   faster"; "also the possibility of jumping"; the upside-down trees fixed.
8. **The entire city, built for real**: offered a throwaway stretch of the spike to all of New
   York or a real build in the pipeline and the viewer, the owner said "build it for real."
9. **Like Street View, with bridges, overpasses and water**: "Make an experience like street
   view, with a person with an option to be dropped in a street, also, can you make bridges and
   overpasses work, it would be nicer to have them, also make sure water can be accessed by
   boats and user can swim, but cars sink in water." Bridges and overpasses, offered as a later
   stage, come into the first release.
10. **You can die**: "Make a wasted screen when the user falls or dies, he also respawns within
    the same area."

## What the visitor gets (decided by the owner)

- **Dropped into a street like Street View**: a little person on the map, put down on a street,
  opens the walk there.
- **First person, anywhere in the five boroughs**, on foot. No fence: the city loads in squares
  around you as you go. Buildings are solid; trees stand the right way up.
- **The map's look, in 3D**: every building with its real footprint and height, in the map's
  palette, with the map's window patterns; streets, plazas, parks and water from the same data.
- **Bridges and overpasses that work**: you can walk and drive over the river bridges and along
  the elevated highways, and under them.
- **Water**: you can swim; boats can be taken out on the water; a car that goes into the water
  sinks.
- **Traffic on the real streets**, the right way down one-way streets, stopping at lights.
- **Any car is yours**: walk up to a parked car or one stopped in traffic and get in; drive it
  anywhere you could walk.
- **Crashes**: cars are solid, push and spin each other, parked cars get shoved, traffic gets
  knocked out of its lane; damage builds up to a burnt-out wreck.
- **Many kinds of car, some much faster**: sedans, taxis, SUVs, hatchbacks, pickups, limousines,
  police cars (generic, no markings), box trucks, buses, muscle cars, sports cars, supercars.
- **People** walking the sidewalks and crosswalks.
- **Jumping.**
- **Life on screen**: a bar that always shows how much life you have left.
- **You can die, and you come back nearby**: a fall or a death brings up the wasted screen,
  then you are back on your feet in the same area.
- **GTA's keys by default, every key remappable.**
- **Two stages**: (1) all of New York, with its bridges, overpasses and water; (2) Times Square's
  photo fronts. Each ships on its own.

## Proposed in the conversation and not contradicted (Claude's calls; the owner may change them)

- ~~**Split screen**: the walk large, the map beside it (below it on a phone or in portrait)
  following you, with your position and which way you face; a click on the map takes you there.~~
  Changed by the owner after launch: "Instead of the map being on the right side make a mini map
  in the bottom left side with just the streets just like it works on GTA." The walk now takes
  the whole screen, with a minimap of the streets in its bottom-left corner (Layout, below).
- **Mouse and keyboard** with pointer lock; **on a touch screen** a thumb stick on the left half
  and drag-to-look on the right half, with buttons for what keys do.
- **Daytime only.** Signs and billboards are generic: no real brands anywhere.

## Calls made after the review (Claude's; the owner may change them)

- **Launch**: no hidden period. The owner tries the branch locally before it is merged; once
  merged and deployed, the person is on the New York map for everyone. So `walk` is one flag on
  a world, and its data is required whenever the flag is on.
- **Two keys beyond GTA's**, so everything works without a mouse: on foot the **left and right
  arrows turn** (W/A/S/D still walk and step aside; the up and down arrows walk), and **M goes
  back to the map** from anywhere (Esc is the browser's while the pointer is locked). Both are
  in the controls menu like the rest, and "Reset to defaults" restores them too.
- **Tunnels**: a tunnel with both ends on the map takes you through: you drive (or walk) into
  the portal, the screen goes dark for as long as the tunnel would take at your speed, and you
  come out of the other portal; traffic does the same. A tunnel with an end off the map (the
  Holland and Lincoln tunnels to New Jersey) is closed by a barrier at its portal.
- **Health and dying** (replacing an earlier "falling never hurts"): you have health, which
  comes back by itself (2 a second, after 5 s with nothing hurting you). What hurts: landing on
  land from a fall (from about 4 m up; about 15 m is the end of you; water never hurts); a car or
  boat hitting you on foot ((closing speed − 2 m/s) × 9, so a car at 30 mph is the end of you;
  a hit you survive knocks you over for a moment, like the people in the street); being inside
  your car when it is wrecked (the end of you); a wreck catching fire within 5 m of you on foot
  (40 to 80, nearer is worse). A car that falls takes damage as from a hit at the speed it
  lands. No drowning.
- **The wasted screen, in the site's own style** (the owner: "you can use a different style
  then"): the word **"WASTED"** (pt-BR "DETONADO", es-ES "ACABADO"), never in GTA's lettering,
  colours or band: time slows to a quarter for 1.5 s, the colours drain to the palette's greys,
  the camera lifts away from you lying in the street (your figure: the people's model in clothes
  of your own), and the word comes up in Tiny5, the site's pixel lettering, in the palette's
  paper colour with a one-pixel dark outline, over a dithered vignette (no flat band). After
  2.5 s it fades (a key or a tap skips ahead once the word is up) and you **come to nearby**:
  standing on a sidewalk 20 to 60 m from where you went down, at ground level, out of the water
  and the traffic, facing along the street, at full health, on foot. What you were driving stays
  where it ended up. People in the street never die: they fall over and get up.

## Goals

- All of New York walkable, drivable and swimmable, streaming, on an ordinary laptop and a
  recent phone.
- Built into the pipeline and the viewer like the other features: generated offline, served as
  static files, deployed with the world's data, in the three interface languages.
- Any world can switch it on with a flag, given its data (worlds with photos later get C, the
  rest B).

## Non-goals

Night and lights; losing anything when you go down (no hospital, no money, no cost);
interiors; the subway and trains (elevated train lines stand as structures,
with no trains on them); weather; diving under the water; multiplayer; missions, a wanted level
or police that chase; saving progress; gamepads; music; car radio; riding a ferry as a
passenger (you take its wheel, like any vehicle).

## Anti-goals (would make it a failure even if it works)

- **A copy of GTA or of Street View.** GTA's keys and its kind of play are fine; its name, look,
  HUD art, characters and sounds are not. Dropping a figure on the map is a common pattern;
  Google's yellow figure and its look are not ours to copy: our person is drawn in the map's own
  pixel style. Nowhere does the site say "GTA" or "Street View" (the controls menu says "Reset
  to defaults").
- **Gore.** A person hit by a car falls over and gets up again; you go down and come
  to nearby. No blood, no bodies, no drowning.
- **Real brands or real people.** No logos on signs, cars or boats, no faces from photos.
- **The map changing.** The tiles, their look and their files stay exactly as they are; a New
  York `preview` is byte-identical before and after. (Where the walk raises an overpass the map
  draws flat, the walk and the map simply differ.)
- **Collecting anything new about visitors.** The walk sends nothing; key bindings stay in the
  browser.
- **A heavy map for people who never walk.** Nothing of the walk (three.js, its data) loads
  until a walk is opened; the person on the map is a small drawing.

## Constraints

- The repository is public: no hosts, paths of the server, keys or tokens in tracked files. The
  Mapillary token (stage 2) lives in the pipeline's gitignored environment.
- Static: the pipeline writes the walk's data into `public/data/<world>/walk/`; the viewer needs
  nothing else. No server code.
- Every visible string in the three dictionaries (en-US, pt-BR, es-ES), car, boat and key names
  included. No emojis.
- Attribution: streets, sidewalks and bridges come from Overture, already credited; stage 2 adds
  Mapillary's photos (CC BY-SA 4.0), and the fronts made from them are shared under the same
  licence (ShareAlike).
- The privacy policy says what the browser keeps: the key bindings join that list
  (`/privacy/#your-browser`), and `LEGAL_UPDATED` moves, in the release that brings the walk.
- The pipeline stays deterministic (hashes, never `Math.random`); the live simulation in the
  browser may use randomness.
- npm, Node 22, TypeScript strict, ESLint and Prettier, vitest. Heavy pipeline runs go to the owner's
  build machine, not a laptop. The viewer is Next.js 16: read the guide in
  `node_modules/next/dist/docs/` before writing its code (`tinyworlds-frontend/AGENTS.md`).
- New dependency: **three.js** (the spike used 0.170), imported dynamically by the walk only.

## Approaches

| | Way | Trade-off | |
|---|---|---|---|
| A | Photo hops (Street View style) | Real photos, but fixed points, no free walking, nothing where there are no photos | rejected |
| B | 3D city from the scene | Walk anywhere, every city that has a scene; the look is the map's, not photos | the base |
| C | B plus photo fronts where photos exist | Best of both; photo work per place, by hand | chosen, photos in stage 2 |

And for scale:

| | Way | Trade-off | |
|---|---|---|---|
| 1 | Stretch the spike to all of New York, throwaway | Quick; not deployable; the same work again later | rejected |
| 2 | A pipeline step and a viewer mode, in stages | Slower to the first whole-city walk; deployable, any world | **chosen** |

## Stage 1: all of New York

### One idea under everything: surfaces

Everything stands on a **surface**, and movement asks one question: what is the highest surface
under this point that I can reach from my height (within a step up, or below me to fall to)?

- **Ground**: land at 0 m.
- **Water**: its surface 0.6 m below the land. Swimmers and boats are on it; a car goes through it.
- **Decks and ramps**: the roadways and walkways of bridges and overpasses, at their height
  along them.
- **Roofs of cars** (for you on foot only).

Gravity pulls whatever is above its surface down to it. Steps up: 0.3 m on foot, 1.15 m
landing from a jump, 0.5 m for a car. Walls are buildings' lower parts, deck parapets (for
cars), car bodies (on foot), and for a boat, anything that is not water.

### Pipeline: the `walk` step

`npm run cli -- --city tinynyc walk`, run after `scene` (it reads the scene and the raw
`segment.parquet`), and by `all` for a city whose file says `walk: true`. It writes
`../tinyworlds-frontend/public/data/<city>/walk/` and the walk's version into the manifest.

What it cuts, square by square (**200 m squares** of metres east and north of the projection's
origin, `manifest.geo.lon0/lat0`; the spike's `export.mjs` shows the arithmetic):

- **Volumes**: footprint rings in metres, base, top, roof height and shape, wall, roof and glass
  ramps, pattern, seed, flags; as the scene has them (heights from px with `kz`). River bridges'
  decks, towers and piers are among them, as the map draws them.
- **Cables**: the scene's 3D lines (main cables, suspenders, truss members), so the Brooklyn
  Bridge has its web and the Queensboro its steel.
- **Ground**: every ground polygon clipped to the square, with its kind.
- **Ways at ground level**: the scene's lines (kind, width in metres, path), leaving out the
  pieces flagged as bridges (line flag 1), which become elevated ways (below).
- **Trees**: position and kind.
- **Land and water**: a mask of the square, land (piers included) or water, for where you can
  stand, swim, drive and sail, and the shore's edge drawn between them.
- **Elevated ways** (bridges and overpasses), from `segment.parquet`: every road and footway
  segment flagged `is_bridge` or with a level above 0 along any part of it, as a path with a
  height at each point and its width:
  - over water, the height the map gives that deck (the scene's decks: `deckHeight` and
    `holdDecks` in `scene/build.ts`), so a river bridge stands where the map draws it;
  - over land, its level times 6.5 m (a bridge with no level: 6.5 m), so a highway passes over
    the streets under it;
  - coming down to the ground, or to the way it joins, by ramps no steeper than 8% (12% on
    links); a ramp that cannot fit takes the next way along with it;
  - at least 4.5 m clear over any way it crosses;
  - with what holds it up over land, where the map has nothing: a deck slab under the roadway,
    a parapet each side, columns every ~30 m that never stand in a street below. Elevated rail
    lines are drawn the same way, as structures only.
- **Tunnels**: each tunnel's two portals (where its segments go below ground) and its length;
  whether both ends are on the map.
- **Streets for traffic** (from `segment.parquet`, as the spike's `roads.mjs`):
  - classes `motorway`, `trunk`, `primary`, `secondary`, `tertiary`, `residential`,
    `unclassified`, with speeds 22, 18, 12, 12, 10, 8.5, 8 m/s (`link` subclass × 0.7) and the
    map's default widths where Overture has none;
  - a segment cut into edges at its connectors; nodes are connectors, numbered for the whole
    city so squares join up; an edge's points carry their height (0 on the ground);
  - **one-way** when an access restriction denies everyone along the whole segment for one
    heading (`access_type: denied`, a `heading`, no `mode`, `using`, `during`, `vehicle` or
    `between`); denied to everyone without a heading: left out;
  - tunnel edges are left out; the portals join them up through the tunnel (above);
  - each node: how many ways meet, whether it has lights (three or more, not all motorway or
    trunk, not on a deck), and the bearing of its widest way (the lights' two phases are along it
    and across it).
- **Where people walk**: classes `footway`, `pedestrian`, `living_street`, `path`, as edges
  between connectors with heights (bridge walkways, like the Brooklyn Bridge's promenade,
  included), crosswalks marked (`subclass: crosswalk`), leaving out tunnels, indoor, covered and
  under construction pieces; a crosswalk near lights carries which phase it crosses with.
- **Moorings**: places a boat can be tied up, along the water side of piers (ground kind `Pier`),
  a boat every ~12 m on some of them, placed by hash.

A square holds every street, walking edge and elevated way that touches it, so a node's ways are
all known once its own square is in. The ferries' routes are already in `life.json`.

### Data contract (added to the root `CLAUDE.md`)

```
data/<world>/walk/
├── walk.json        # square size, the grid's extent, which squares exist (a bitset, like
│                    # the tiles'), the projection, the world's sun bearing and paving angle,
│                    # the tunnels
└── cells/<i>_<j>.*  # one square: volumes, cables, ground, ways, elevated ways, trees,
                     # land and water, streets, walks, moorings
```

`manifest.walk`: a hash of the walk's files, appended as `?v=` to them like `indexes`. The file
format (JSON or a compact binary) is the builder's; the targets are below.

**Size.** New York has 1,386,538 volumes, 89 times the spike's 15,577; the spike's JSON came to
about 240 bytes a volume, so plain JSON would be ~330 MB. Targets: the whole city at most
~120 MB on the server; a first stand in Midtown downloads at most ~3 MB.

### Viewer: the walk mode

A world switches it on with `walk: true` in `src/worlds/<id>.ts`, like `sights` and `quiz`.

**The person on the map, and getting in.** A small person in the map's pixel style (not
Google's figure) stands in the tool column. Drag it onto the map: while it is held, the ways you
can be put down on light up in the accent and the person dangles over the spot; let go and the
walk opens there, on the nearest street or sidewalk (on a bridge's deck if dropped on one),
facing along it. On a touch screen: tap the person, then tap the map. From the keyboard: a key
picks the person up and puts it down at the map's centre (the builder picks the key among the
map's free ones). A link can open the walk directly, at a place and heading (the hash grows a
walk form; the map's plain `#lat,lon,scale` keeps working). "Back to the map" (and M) leaves the
walk with the map at where you are.

**Layout.** The owner's call, after the first release: "Instead of the map being on the right
side make a mini map in the bottom left side with just the streets just like it works on GTA."
So the walk takes the whole screen (it was the walk large and the map beside it at 7:3, stacked
below in portrait or under 800 px wide, with a click on the map taking you there; that is gone).
The viewer's own `MapEngine` stays underneath, hidden and not drawing, for the way back to open at
your place; the map's other signs give way while walking, and its credit stays in a corner. In
the bottom-left corner a small square sign (about 176 px, 128 on a phone) shows just the streets
round you, as a game's radar does: centred on you and turned with you (straight ahead is up),
zoomed out with your speed (about 150 m across on foot, out to about 450 m at 30 m/s), drawn in
pixels from the walk's own squares: the streets at their real width in a light paper tone (the
major ones a touch brighter), the bridges and elevated highways in their own tone over them, the
water in the palette's deep water, the land the sign's dark, you an arrow in the accent, and a
tick on the rim where north is. No labels, no other marks, nothing of GTA's own radar art.

**The scene.** As in the spike (`walk.html`):

- walls in the palette with the map's window patterns, one texel per map pixel (`1/kz` m),
  ported from the tile renderer's own rules so they match; a wall's tone from the sun bearing
  (254°): lit, half, shade; far walls settle on their average colour instead of shimmering;
- ground and roofs in their kind's paint with its pattern (paving grid along the street grid's
  angle, mown stripes, asphalt speckle, a dashed line down streets over 9 m), painted in the
  map's rank order;
- decks, ramps, parapets and columns in concrete and asphalt from the palette, the lane lines
  carried up onto them; cables as thin lines in their steel;
- water as an opaque surface in the map's water colours, hiding whatever is under it, and not
  flat: the owner asked for water "prettier according to" a write-up of layered pixel-art water,
  so it is built in layers, each picking a palette colour per pixel (no blending): darker away
  from the shore, lighter where it mirrors the sky, the city reflected in three flat tones with
  whole-pixel wobble, a shallow band and lapping dashes along the near shores, a quiet dark far
  side, glints and ripple rings, all on one 5 s loop; the shore a low edge (quay stone along paved land and piers, a bank
  elsewhere);
- trees as upright pixel billboards;
- sky and a fog from 140 m to 560 m; squares within 3 load, beyond 4.5 unload;
- rendered at a low resolution and scaled up without smoothing: pixel size 3 by default,
  changeable;
- the edge of the data is a wall in the fog.

**On foot.** Walk 4.5 m/s, sprint 11 m/s, mouse look, a slight head bob. **Jumping**: 6.5 m/s
up, gravity 13 m/s² (the spike's 5.2 suited its lower cars); in the air you land on a car's roof
up to 1.6 m above your feet, so you can climb a sedan, then a truck; you can jump a parapet. **Swimming**: step or fall into the
water and you swim, 1.6 m/s (3 m/s sprinting), your eyes just above the surface, bobbing; you
cannot jump in the water; push against any shore or pier to climb out. **Life** (the owner:
"add life, so that you [know] how much you still have left"): always on screen, on foot, swimming,
driving and sailing, a pixel bar of 100 in the corner sign, in the palette's green, turning amber
under 50 and red under 25, that drains as you are hurt and fills as it comes back (as in the
calls above); the edges of the view redden for a moment when something hurts you, and the bar
flashes. It is labelled for a screen reader ("Life 64 of 100"). While driving, the car's damage
is a second bar beside it.

**Cars.** Getting in: within 2.4 m of a car (parked, loose, or in traffic: a stopped taxi is
yours). Getting out: under ~9 mph, on the driver's side if there is room, else the other side,
the front or the back. Arcade handling: throttle, brakes, reverse, steering that tightens at
speed, a handbrake that lets the back slide, grip per car. Two cameras: chasing behind (it
swings back behind the car 1.4 s after you look round, a key looks behind, it comes closer when
a wall is in the way, the view widens with speed) and at the wheel. **In the water a car
sinks**: once its middle is over the water it drops in, floats a moment and goes under over ~4 s
with bubbles; you come out swimming; a sunk car is gone. Traffic and loose cars pushed in sink
the same way.

| Car | Top speed | Mass | Notes |
|---|---|---|---|
| hatchback | 40 m/s | 1,100 kg | |
| sedan, taxi | 42, 40 | 1,500, 1,600 | taxi yellow with a roof sign |
| SUV | 38 | 2,100 | |
| pickup | 40 | 2,300 | open bed |
| limousine | 40 | 2,600 | |
| police car | 52 | 1,800 | white, blue band, flashing bar, no words or crest |
| muscle car | 60 | 1,650 | loose grip, stripes |
| sports car | 64 | 1,350 | spoiler |
| supercar | 82 | 1,400 | wedge |
| box truck | 28 | 5,500 | takes half the damage |
| bus | 24 | 12,000 | takes a third |

Models are boxes and tapered boxes in the palette, shaded like the walls (top lightest, the
sunlit side lit), with lights, glass and tyres as parts.

**Boats.** Taken like cars: from a pier, or swimming beside one. Handling: thrust and reverse, a
rudder that needs way on, a loose stern, drag; they bob and roll on a gentle swell and leave a
wake of foam. Land, piers and bridge piers stop them (a hard hit hurts); they push each other and
anything floating; a wrecked boat sinks. You can step off onto a pier or shore within 1.5 m, or
into the water.

| Boat | Top speed | Notes |
|---|---|---|
| speedboat | 28 m/s | moored at piers |
| motorboat | 14 m/s | moored at piers |
| ferry | 9 m/s | sails the `life.json` routes there and back, waiting a little at each end; the Staten Island route's boat is the long orange one |

**Traffic** (about 70 cars within 320 m, spawned out of sight beyond 170 m, gone beyond 380 m):
lanes from the street's width (one-way streets centred, two-way to the right of the middle),
turns as smooth curves between lanes, straight on more likely than turning, the right lane for
a right turn; over bridges and along elevated highways at their height. Cars keep a gap from
whatever is on their path ahead (cars, you, people), and slow for turns. **Lights**: a 34 s
cycle, 13 s green, 3 s yellow, the two phases half a cycle apart, all nodes in step; a car stops
at red and at yellow unless too close to stop. Two cars waiting on each other: the older goes;
a car stuck 10 s behind something that is not moving squeezes past. A tunnel takes a car in and
gives it back at the other portal; a closed one takes it away. **Parked cars** along both kerbs
where the street is wide enough, facing the traffic beside them, two in three places filled,
placed from the edge's id (the same every visit); one overlapping a building or the water is
dropped; none on decks. A supercar is parked near where New York's walk first opens.

**Crashes.** Every car and boat is a box. Overlaps are found by separating axes and pushed
apart; an impulse with a little bounce (0.25) spins them by where they touched. A hit traffic car
stops for 2.5 s, or leaves its lane and slides loose if the knock is hard (over 2.2 m/s); a
parked car hit becomes loose. Loose cars slide, spin, slow and come to rest where they end up
(kept while within 700 m), or roll off an edge and fall. Buildings and parapets stop a car,
which slides along them. **Damage** per hit: (impact speed − 3 m/s) × 0.022, divided by the
car's toughness; the lighter car takes more; a fall counts as a hit at the landing speed. From
35% the glass cracks, from 55% the engine smokes, at 100% the car catches fire (9 s), turns black
and smokes black, and will not drive; it is still solid and can be climbed. Damage costs
acceleration. Sparks, glass and a crunch on hits; a dull boom on a wreck.

**People** (about 150 within 170 m): on the walking edges, bridge walkways included, each with
clothes, skin and hair from the palette, arms and legs swinging, a little to one side of the
line so two can pass. At a crosswalk with lights they wait until their phase is green with at
least 4 s left; one in sixteen does not wait. A fast car (over 6 m/s) coming at someone within
11 m makes them jump aside, three times in four; a car that touches them knocks them down; they
get up after 3.5–5.5 s and walk on (one knocked into the water swims to the nearest shore and
climbs out). A horn, a crash, a knock or a wreck nearby makes people run for 5–8 s. People never
go into the water by themselves.

**Sound.** Horn, crash (louder and brighter with the hit), wreck, a splash. Nothing else. A
sound switch in the walk's settings (the builder decides where it lives).

**Controls.** Defaults are GTA V's keyboard (the owner's ask), plus the two keys above. Each
action takes two keys; a key given to one action leaves any other action of the same group (and
of "anywhere") that had it. Changed in a menu (open by its key or a button), kept in
`localStorage` behind try/catch; "Reset to defaults" restores these:

| Group | Action | Keys |
|---|---|---|
| On foot | forward, back | W, S / up, down |
| | step left, step right | A, D |
| | turn left, turn right | left, right |
| | sprint | Left Shift / Right Shift |
| | jump | Space |
| | get in a car or boat | F |
| Driving (cars and boats) | accelerate, brake and reverse, steer left, steer right | W, S, A, D / arrows |
| | handbrake | Space |
| | horn | E |
| | get out | F |
| | change camera | V |
| | look behind | C |
| Anywhere | back to the map | M |
| | controls menu | P |
| | smaller, bigger pixels | [ , ] |

The mouse looks (pointer lock; Esc lets go). On touch: the stick walks, swims, drives or sails,
dragging the right half looks, and buttons do jump, get in and out, horn, camera and back to the
map.

**Signs.** The map's sign style: the hint (built from the current keys), what you can do near a
car or boat ("F get in the taxi"), and while driving the speed (mph in a world whose units say
so, km/h elsewhere: a world field), the vehicle's name, its damage or "wrecked", and the keys.
Messages ("Slow down to get out", "No room to get out here") show briefly. The wasted
screen's word is in the dictionaries like everything else.

**Budgets.** 60 fps on a mid laptop at pixel size 3 with the full traffic and crowd (the spike
ran at 46–52 fps in a throttled, automated Chrome tab); on phones at least 30 fps, with fewer
cars and people and a larger pixel size if needed. The builder may lower the counts or the
pixel size automatically when the frame rate drops.

**Accessibility.** Under `prefers-reduced-motion`: no head bob, no swimming bob, no camera shake,
no widening view, no swell on boats; the wasted screen keeps its word and fades, without
the slow motion and the lifting camera. The word is also said to a screen reader. Everything works from the keyboard (turning included);
buttons and signs are labelled; M or "Back to the map" is always one press away.

### Deploy

The walk's folder goes up with the world's data, and must be sendable on its own
(`deploy.sh <world>` with a walk-only option like `--index`, so 0.8 GB of tiles are not sent
again). `manifest.json` goes last, as always. `deploy.sh check` treats the walk's data as
required for a world with `walk: true`. As always, the data goes up before the merge that turns
the flag on.

### Privacy, terms, attribution

- `/privacy/#your-browser`: "the keys you chose for the street walk" joins the list, in the
  three languages; `LEGAL_UPDATED` moves. Nothing else changes: the walk sends nothing.
- About: no new credit in stage 1 (Overture is already there).
- A page analytics hook when a walk starts (`walk_start`, like `quiz_start`).

### Documentation

The root `CLAUDE.md` (data contract, the walk in "How the pieces fit"), the pipeline's (the
step), the viewer's (the walk mode), `README.md`.

## Stage 2: Times Square's photo fronts (outline; its own design)

From the spike's tests: Times Square has 40 sequences of 360° photos on Mapillary; the 2022
daytime ones (CartographDots, 5,760 px) cover the square, the one night walk only a block.
Codex's image generation turned a photo into real pixel art, keeping the composition and making
brands generic; palette filters alone did not. The step: fetch the daytime photos (the token in
the pipeline's environment), match each building's walls to the photos that face them, have the
AI paint each wall as palette pixel art without people or cars and with generic signs, check by
eye, and ship the fronts as textures in the walk's data for the walls they belong to (other
walls stay B). Credit Mapillary and its contributors in About (CC BY-SA 4.0) and share the
fronts under CC BY-SA.

## Left to the builder

The data format and the square files' encoding; how volumes larger than a square are found for
collision; the land and water mask's resolution; how elevated ways' heights are solved where
pieces meet (within the rules above); how a walk link is written; the key that picks up the
person, and where the walk's settings live; the touch buttons' layout; code layout in both
projects (the spike's two files become modules: data loading, meshes, surfaces and movement,
controls, physics, traffic, people, boats, particles, sound); whether parked cars and moorings
are filled in the pipeline or the viewer (either way the same every visit); automatic quality.

## The spike (reference)

`docs/superpowers/spikes/2026-11-16-street-walk/`: `export.mjs` (the squares), `roads.mjs`
(streets and walking edges from Overture), `walk.html` (the scene, walking, controls, the map
beside), `cars.js` (cars, traffic, crashes, people, particles, sound), and the photo tests'
`fetch.py` and `cube.py`. Throwaway code to read, not to keep: the real build ports what it
does. Bridges, water, swimming, boats and the person on the map were not in the spike.
