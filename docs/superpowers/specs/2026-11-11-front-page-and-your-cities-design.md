# The front page and "Your cities": more to explore, clearer ways to give

*Design, 2026-11-11. Front page's build only (`NEXT_PUBLIC_WORLD=home`: `/` and `/me/`), plus
a hero film for every world from `tinyworlds-videos`. No API change.*

## Why

The owner wants both pages to send people onward: to **explore more** worlds, or to **donate and
become a city's benefactor**. Today they do neither well:

- `/me/` shows a signed-in address that has not given one sentence ("Nothing here yet") and
  nothing else: a dead end.
- In the front page's ranking, the heart and the little flag on each row carry no words. Nothing
  says that the row donates or that the flag opens the city's benefactors.
- The front page should simply look better.

## What the visitor sees (decided by the owner)

Mockup, confirmed screen by screen: `.superpowers/brainstorm/front-page-and-your-cities/index.html`
(open it from disk; three tabs; purple is notes, not design; dusk only; visit numbers invented).
Where this text and the mockup differ, this text wins.

### 1. "Build the next city": the ranking as stone cards (the owner picked option B)

Used on the front page (in place of today's "City ranking" rows) and on `/me/`.

- **Three steps on top**, each with one of the badges' pixel pictures: *Pick a city* (the most
  funded one is built next), *Give from $1* (every dollar lays a stone, with your name on it if
  you like), *At $30, I build it* (anything above keeps the servers running). They replace the
  two paragraphs the card opens with today.
- **A card per city**: its place (or the check mark for a funded one), its name, "$10 of $30",
  and **its bar made of stones, one per dollar** (the stones of the benefactors' sign: the first
  and the last marked), fifteen to a row. Under the stones one line:
  - nobody gave yet: the First Stone picture and "The First Stone is still unclaimed";
  - collecting: "10 of 30 stones laid · 1 donation";
  - funded or being built: its status in the accent, and its donations.
- **Two labelled buttons** at the card's foot: **Benefactors** (the flag picture and the word;
  only once someone has given) and **Donate** (the heart and the word; always).
- **A city never leaves the ranking.** Today one drops out the moment it is built. It now
  moves to a group of its own at the top, **"Built · funded by their benefactors"**, lit in
  gold: its picture across the top with a "Built" mark, its whole foundation laid, "Funded in
  full", and two buttons, **Benefactors** and **Explore**. No Donate button: giving
  to a built city goes through its benefactors' sign, as today.
  - Which cities: built **and** funded to their goal by donations (Dallas and Cincinnati
    are the first two). A city built while short of its goal stays out, and so do the worlds the
    owner built without funding (New York and the rest): they are the cards above.
  - *Claude's call, after the builder check:* that rule is the whole rule. Every built world
    has a goal and founders for its first US$30, and gifts to a built city still count, so one
    of the owner's own worlds joins the group if its gifts ever reach its goal. That is why the
    card says "Funded in full" and never "built by its benefactors": true either way, with no
    marker to keep in the code.
- The groups in order: Built, then "Funded · in the queue" as today, then the ones still
  collecting.
- **The last card** is an empty lot: "A city that is not here?", "Name any city in the world
  and it joins the ranking", and a Donate button.

### 2. The front page

1. **Links across the top** (Cities, Imagined places, Build the next city, Open source) and
   "Your cities" as a button on the right instead of underlined text.
2. **The hero is a carousel showing every world**: one slide per world, New York first. It moves
   on by itself every few seconds and waits while the pointer is on it; arrows and one dot per
   world choose a slide. The page's sign stays where it is, with the wordmark, the tagline and
   the pitch; under them **the slide's city is a title in the sign** (its wordmark in its own
   colour, then its name), and **the button says only "Explore"**, so the buttons never wrap.
   Beside it, a second button: "Fund the next city".
3. **A strip of numbers** under the hero: cities and worlds, visits so far, exploring right
   now, cities being funded.
4. **Section titles are real titles**, each with a line saying what the section is.
5. **World cards**: the foot has two labelled actions, "Explore" and "Benefactors" (today: an
   arrow, and a button laid over the picture). Hovering lights the card in that world's colour.
6. **"Which city should I build next?"**: a tile fills the empty slot at the end of the cities'
   grid, with the three leading cities' bars, a "Fund a city" button and a link to the ranking.
7. **The ranking** is section 1 above, titled "Build the next city".
8. **Open source** shrinks to one strip: the sentence, and the GitHub button beside it.

### 3. "Your cities" (`/me/`), signed in

As wide as the front page instead of a narrow column. The wordmark (the way home) top left;
the address and "Sign out" top right.

- **Someone who has not given**: the "Your cities" sign says "No stones laid yet", what will
  show up here once they give, and **the three badges as things to earn** (dimmed, each with a
  line saying how). Beside it, **"Build the next city"** with four stone cards and a link to
  the whole ranking. Below, **"Keep exploring"**: eight worlds as small cards, most visited
  first, and a link to all of them.
- **A donor**: three figures (cities, stones laid, given), then each of their cities with its
  badges and **its stones, theirs lit and the other benefactors' dimmer**; "Give again" on a
  city that is not built yet (collecting, funded or being built: whatever the Donate sign
  offers); the listing switch and "Explore" as today. Beside it, "Build the next
  city" (two cards) and **"Your badges"** (earned ones lit, saying where). Below, the same
  "Keep exploring".

## How it is made (Claude's calls)

Frontend only, plus the hero films. Everything is built from what the pages already fetch:
`cityMilestones` (`useMilestones`), `worldVisits` (`useWorldVisits`), `myGiving`. Follow
`tinyworlds-frontend/CLAUDE.md` throughout (signs, tokens, `useI18n`, named exports).

### Stones without the benefactors' data

The list of cities does not say who laid which stone, and does not need to. Pure, in
`lib/benefactors.ts`, with tests:

- `total = ceil(goalCents / STONE_CENTS)`; `laid = raisedCents >= goalCents ? total :
  floor(raisedCents / STONE_CENTS)` (the rule `stonePreview` already follows: the last stone
  belongs to the gift that reaches the goal).
- A card's stones are laid (accent) or empty; on `/me/` a laid stone is the donor's (`MyCity.stones`,
  1-based numbers) or someone else's (dimmer gold, `#7a5d0c`, the badges' border colour), with a
  two-item legend when both kinds are there.
- Fifteen to a row, first and last marked as `StoneGrid` marks them. Above 60 stones a city
  shows the plain `MilestoneBar` instead. The wall is a `progressbar` with the same values and
  `aria-valuetext` as `MilestoneBar`.
- On `/me/`, a city where the donor laid no stone (they gave after it was funded) shows no wall.

### The stone card and its section

One component for the card and one for the section's body (steps, groups, cards, last card),
shared by the front page and `/me/` (`components/donate/`).

- Card actions call back: Donate opens `DonateDialog` with that city chosen; Benefactors opens
  `BenefactorsSign` for its slug. The last card opens `DonateDialog` with no city chosen, which
  takes the place of today's lone Donate button. Donate buttons keep the `data-rybbit-event=
  "donate_open"` hooks the rows have today.
- `rankCities` gains `built`: status `BUILT` and `raisedCents >= goalCents`, most raised
  first, ties by name (the list already carries built cities; the page was leaving them out).
  A built card has no place number and no Donate: the city's share card as a band across its
  top (`worldCardUrl(worldId)`; no band if it fails to load), a "Built" mark with the keystone
  picture, its name, "$35 raised", every stone laid, "Funded in full" and its
  donations, then Benefactors and Explore (`worldUrl(worldId)`; no Explore without a
  `worldId`). Six show before a "show all" of their own. The short lists (the tile's three
  bars, `/me/`'s cards) stay funded-then-ranked: never a built city.
- Place numbers, the order, "Funded" apart, the "No donations yet" note and "show all" are
  `rankCities`' as today. `RANKING_LIMIT` goes from 10 to 8, so eight cities and the last card
  make three full rows of three.
- Grid: one column on phones, two from `sm`, three from `lg`.
- `{goal}` in the steps is `defaultGoal(...)`, "$1" is `formatUsd(100, locale)`.
- With no list (no API, or it failed) the section is what it is today: `home.nextPitch` and a
  Donate button. While loading: `donate.loading`.

### The hero carousel

- **Slides**: every world of `WORLDS`, in the registry's order (New York first; it does not
  wait for the visit counts). Component in `components/home/`.
- **Pictures**: a share card will not do: its wordmark is painted into the lower left and shows
  from under the sign. Each world gets a **hero film of its own**, made the way today's is
  (`tinyworlds-videos`: the flyover composition with no sign, a small calm lap, 1280 × 720, 12 s,
  and its first frame as the still), framed so that what is worth seeing stays clear of the
  sign's corner. New York's stays `public/loops/hero.{mp4,jpg}` (the showcase film's take copies
  that render by name); every other world's is `public/loops/hero-<world>.{mp4,jpg}`, committed
  like the other loops (eleven of them today, about 10 MB in all). A world needs its tiles in
  `tinyworlds-frontend/public/data/<world>/` before its film can be cut. All twelve are cut.
  Dallas's and Cincinnati's tiles are, at the time of writing, only in the `dallas-cincinnati`
  worktree's `public/data/`: they are linked from there, not copied, once the session that
  rendered them confirms they are the render that is deployed. If they cannot be had, those
  two are left out of the carousel for now (it skips a world without a film) and the hand-over
  says so. `npm run plates` is run naming the worlds.
  - `scripts/worlds.ts` gains a hero framing per world, the three imagined places included.
    They still get no flyover to share: these films are the front page's own pictures, on a
    page that already lists those worlds (the owner asked for every world in the carousel).
  - `npm run plates` writes a hero row per world; `npm run flyovers -- hero` renders them all.
    Each still must be looked at with the sign's box over it before it is committed.
  - `deploy/deploy.sh check` asks for a world's hero film as it asks for its card loop (a
    warning, like the loop's: a world without one is simply left out of the carousel).
- **Playing**: `MovingPicture` gains a way to be told it is not the one showing, so only the
  current slide's loop is fetched and played. Slides cross-fade (about 600 ms). The first still
  loads eagerly, as today; the next slide's still is fetched just before its turn.
- **Moving on**: every 8 s. Not while the pointer is over the hero or focus is inside it, not
  while the page is hidden or the hero is off screen. Never by itself under
  `prefers-reduced-motion` or `Save-Data` (arrows and dots still work; no fade, stills only).
  Choosing a slide by hand stops it for good (decided after the final review: a
  finger has no hover, and what moves by itself must be stoppable): from then on the hero is
  the visitor's, and each world they choose is said to a screen reader.
- **The sign**: wordmark, tagline and pitch as today; a hairline; the slide's `Wordmark` (its
  suffix in its accent) and its city as a one-line title (cut with an ellipsis if ever too
  long, so the sign never changes height); then "Explore" (a link to the slide's world, whose
  accessible name is `home.explore`, "Explore {city}") and "Fund the next city" (a link to
  `#ranking`; only where donations are taken). The picture itself is a link to the same world.
- **Controls**: a pill at the picture's lower right from `lg`: previous, one dot per world (the
  current one wider and in that world's accent), next; each a button with a name ("Previous",
  "Next", "Show {city}"). Below `lg` the sign hangs over the picture's lower edge, so the pill
  sits where the sign cannot cover it (the picture's top right). The arrows are comfortable
  touch targets.

### The rest of the front page

- **Top links**: plain anchors to `#cities`, `#imagined`, `#ranking`, `#open-source` (the ids
  stay: a map's "more cities" banner links to `/#cities`); hidden below `sm`, where only the
  "Your cities" button shows. "Build the next city" only where donations are taken; "Your
  cities" only with an API, as today.
- **Numbers strip** (a sign; only with an API): worlds = the registry's count, at once; visits
  = the sum of `worldVisits`; exploring now = the sum of `live`, shown only above
  `LIVE_SHOWN_ABOVE` like a card's; cities being funded = `funded + ranked` of `rankCities`.
  A figure appears when its number arrives and is left out if it never does; the strip's height
  is there from the start. The sums are a pure helper in `lib/visits.ts`, with tests. Numbers
  in the visitor's own format.
- **World card**: picture, name, text and visits line as today; then, under a hairline,
  "Explore" with the arrow (the arrow leaves the title's row) and the Benefactors button, for
  the worlds that have one today. The card stays one link to the world, and the Benefactors
  button stays its sibling, never inside it. Hover: a ring in `world.accent.color`.
- **"Which city next?" tile**: last in the Cities grid only, spanning what is left of the last
  row (the whole row when the row is full), at each breakpoint. A sign like the others, set
  apart by a dashed outline inside it, so it reads in the day theme too. Kicker "NEXT UP" in the
  pixel face, the title, "Each one takes about {goal}. The most funded is built first.", "Fund
  a city" (opens `DonateDialog`, no city chosen) and "See the ranking" (`#ranking`). The first
  three of funded-then-ranked as `MilestoneBar`s, beside the text when the tile is wide, under
  it when it is one column. Only where donations are taken; the bars only with a list.
- **Open source**: one sign, the sentence with "Open source." leading it in bold, the GitHub
  button beside it (under it on phones). Its heading stays for assistive technology.
- **Day theme**: what sits on the fog (top links, section titles and their lines) uses the ink
  the page's headings use today, with the `dusk:` twin; everything else is a sign.

### "Your cities"

- `MeApp` keeps its sign-in logic; the signed-in page widens to `max-w-5xl`. The address and
  "Sign out" move from the sign's header to the top row.
- Two columns from `lg` (giving 5 : 7 the cities to fund when nothing was given, 7 : 5 when
  something was), one below. "Keep exploring" under both, full width, four cards a row from
  `lg`, two below.
- **Nothing given** is `cities.length === 0`. Gifts to the project alone (`projectCents > 0`)
  keep that layout and add today's project line.
- **A donor's city**: a thumbnail of its share card when it is built (`worldCardUrl`; dropped if
  it fails to load), name, badges and the meta line as today, the wall, then the listing row as
  today. "Give again" (opens `DonateDialog` with the city) for a city that is not `BUILT`.
- **"Your badges"**: founding lit when any city has a `founderNumber`, First Stone and Keystone
  when any city has them; each says where ("· Los Angeles", or "· 3 cities" beyond two). Pure
  helper with tests.
- **"Build the next city" here**: the section's cards without the steps: the first four of
  funded-then-ranked (two in one column for a donor), and "See all {n} cities, or name your own"
  to the front page's `#ranking`. With no list: `home.nextPitch` and a Donate button.
- **"Keep exploring"**: the first eight of all worlds by `byVisits` (cities and imagined
  together), as small cards (picture with its loop, name, visits), and "All {n} on the front
  page" to `/#cities`.
- The page mounts `DonateDialog` and `BenefactorsSign` (one sign at a time, as on the front
  page) and calls `useDonationReturn`, since a checkout started here comes back here.

### Words

Every new string goes into `i18n/types.ts` and the three dictionaries. English as in the mockup
and above; Portuguese and Spanish written by the builder in the register the dictionaries
already have. The front page's section lines:

- Cities: "Real places, drawn by code from open data."
- Imagined places: "Fan-made maps of places from stories, on layouts invented for them."
- Build the next city: "Pick the city you want next, or name your own."
- Keep exploring (on `/me/`): "Most visited first."

### Docs and checks

`tinyworlds-frontend/CLAUDE.md` (the front page, Donations' ranking, "Your cities"),
`tinyworlds-videos/CLAUDE.md` (a hero film per world), the root `CLAUDE.md` ("The front page
moves", and "Adding a world": a hero framing and `npm run flyovers -- hero`). Lint, typecheck
and tests pass in every project touched; both pages are looked at in a browser, day and dusk,
phone and desktop widths, before the work is called done.

## Not in this

- The API, the Donate sign, the benefactors' sign, the admin pages and the maps.
- **The sign-in sheet**: someone not signed in at `/me/` sees it as it is today (it is shared
  with the admin pages).
- New analytics events.
- Showing a gift on `/me/` the instant the donor is back from the checkout: it appears when the
  payment has been recorded, as today.

## What would make it a failure

- An action that is only an icon again, for Donate or Benefactors.
- Donating depending on the API: every fallback of today stays.
- A slower first paint: no loop fetched before its slide shows, nothing fetched for motion
  under `prefers-reduced-motion` or `Save-Data`, no layout moving when numbers arrive.
- A picture of a map that was not cut from the real tiles.
- A visible string that is not in the three dictionaries.

## Left to the builder

Component and file names, exact sizes and spacing (the mockup is the guide, not a
specification), the words in Portuguese and Spanish, how `MovingPicture` learns it is not the
slide showing, swipe on touch (welcome, not required), and each world's hero framing.
