# tinyworlds-frontend

The map viewer: a Next.js 16 static export that draws the tiles and indexes written by
`tinyworlds-pipeline` into `public/data/<world>/`. No auth, no server of its own at runtime.
One build is one **target**: a **world** — the cities `tinynyc`, `tinyrao`, `tinyorl`, `tinyfte`
(El Calafate), `tinyvlc` (Valencia), `tinylas` (Las Vegas), `tinylax` (Los Angeles), `tinydal`
(Dallas), `tinycvg` (Cincinnati), `tinypit` (Pittsburgh), `tinyphl` (Philadelphia), `tinycos`
(Colorado Springs), `tinytkf` (Truckee), and three
places that do not exist, `tinywinterfell`,
`tinykingslanding` and `tinywesteros` (the whole known world) — or `home`, the front page that
lists the worlds. The interface speaks the visitor's language (English, Brazilian
Portuguese, Spanish), decided in the browser. Donations are optional: payment links, and, when
`tinyworlds-api` is deployed, a list of cities being funded (GraphQL through Apollo Client).
With the API, every page also reports the steps of the donation funnel, and the front page's
build carries the admin pages (`/admin/`) where signed-in admins read it.

@AGENTS.md

## Commands

```bash
npm run dev          # http://localhost:3000, world tinynyc, data from public/data/tinynyc
NEXT_PUBLIC_WORLD=tinyrao npm run dev
NEXT_PUBLIC_WORLD=home NEXT_PUBLIC_CARDS_BASE=/og npm run dev   # the front page
npm run build        # static export → out/
npm run preview      # serve out/ under NEXT_PUBLIC_BASE_PATH, like production (port 4173)
npm run lint         # eslint + prettier --check      (lint:fix to fix)
npm run typecheck    # next typegen (route types such as LayoutProps) + tsc
npm test             # vitest
npm run email-images # public/email/: the API's mails' pictures (the wordmark, the three badges)
```

### Environment (all inlined at build time)

| Variable                                                      | Default                    | Meaning                                                                                                                   |
| ------------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_WORLD`                                           | `tinynyc`                  | the build target: a world id, or `home` for the front page; anything else fails the build                                 |
| `NEXT_PUBLIC_BASE_PATH`                                       | empty                      | sub-path the build is served under (`/tinyrao`; empty for `home`)                                                         |
| `NEXT_PUBLIC_DATA_BASE`                                       | `<base path>/data/<world>` | URL prefix of the world's data folder (`/tinyrao/data`)                                                                   |
| `NEXT_PUBLIC_SITE_URL`                                        | unset                      | site origin, for share cards; unset = text-only card                                                                      |
| `NEXT_PUBLIC_ANALYTICS_SRC` / `NEXT_PUBLIC_ANALYTICS_SITE_ID` | unset                      | tracker script URL and site id; unset = no analytics                                                                      |
| `NEXT_PUBLIC_GTM_ID`                                          | unset                      | Google Tag Manager container id (`GTM-XXXXXXX`); unset = nothing from Google is loaded                                    |
| `NEXT_PUBLIC_DONATE_URL`                                      | unset                      | payment link (hosted checkout) in English, and the fallback for the other languages                                       |
| `NEXT_PUBLIC_DONATE_URL_PT` / `NEXT_PUBLIC_DONATE_URL_ES`     | unset                      | the same checkout in Portuguese / Spanish                                                                                 |
| `NEXT_PUBLIC_API_URL`                                         | unset                      | GraphQL endpoint of `tinyworlds-api`: a URL or a same-origin path (`/api/graphql`)                                        |
| `NEXT_PUBLIC_HOME_URL`                                        | `/`                        | where the front page is, for the "All cities" link inside a map                                                           |
| `NEXT_PUBLIC_WORLDS_BASE`                                     | empty                      | what the worlds' folders hang from on the front page (`""` → `/tinynyc/`)                                                 |
| `NEXT_PUBLIC_CARDS_BASE`                                      | unset                      | **dev only**: take the front page's card pictures from one folder (`/og`)                                                 |
| `NEXT_PUBLIC_HERO_FILMS`                                      | what is in `public/loops/` | the worlds the front page's hero shows, comma-separated; set by `next.config.ts`, by hand only to try the hero with fewer |

Production builds:

```bash
NEXT_PUBLIC_WORLD=tinyrao NEXT_PUBLIC_BASE_PATH=/tinyrao NEXT_PUBLIC_DATA_BASE=/tinyrao/data \
NEXT_PUBLIC_SITE_URL=https://example.com NEXT_PUBLIC_API_URL=/api/graphql \
NEXT_PUBLIC_DONATE_URL=https://donate.stripe.com/test_example npm run build

NEXT_PUBLIC_WORLD=home NEXT_PUBLIC_SITE_URL=https://example.com npm run build   # → the site root
```

Analytics (`src/components/analytics.tsx`) is optional and env-driven: no tracker URL, site id
or container id lives in the source. There are two kinds, each loaded only when its variables
are set: a cookieless tracker that takes a `data-site-id` (Rybbit), and a Google Tag Manager
container. Google Analytics is a tag set up inside the container, not in this code, and unlike
the rest of the site it sets cookies, so the container waits for consent (`lib/consent.ts`,
`components/consent/google-tag-manager.tsx`):

- A visitor whose browser is on a European time zone (or hides its zone: none, UTC) is asked
  first, by a sign at the foot of the page, and nothing from Google loads until they say yes.
  Anyone else gets the container at once. A no, from anyone, is kept and honoured everywhere.
  The sign links the privacy policy, which says all of this.
- The answer lives in `localStorage` (`tinyworlds.consent`, shared by every world). "Cookie
  settings" (About in a map, the footers of the front page, the hall of fame, "Your cities"
  and the legal pages, and the privacy policy's own text) puts the question up again; a no then
  also tells the running tags and deletes the `_ga` cookies.
- `loadTagManager` puts Google's consent defaults at the front of the data layer before
  `gtm.js` loads: analytics cookies denied in the EU, EEA, UK and Switzerland by Google's own
  idea of where the visitor is (for anyone the time zone missed), allowed elsewhere, ads denied
  everywhere; then the visitor's yes, then `gtag('js')`.
- The consent store is a `useSyncExternalStore` whose server snapshot is "not ready": nothing
  loads and nothing is asked while the page is prerendered or hydrating.

The map rewrites the URL hash whenever a pan settles; it does so through `writeHash()`
(`src/map/hash.ts`), which calls `History.prototype.replaceState` so trackers that wrap
`history.replaceState` (Tag Manager's history-change trigger and Google Analytics' page-change
measurement among them) do not log each pan as a page view. Never call `history.replaceState`
directly for the hash.

Every data URL goes through `dataUrl()` in `src/map/data.ts`, which prefixes the data base and
appends a version: `?v=<manifest.build>` for the tiles and the minimap (the render's),
`?v=<manifest.indexes>` for the indexes, the sights' texts and their pictures (which change
without a render; `parseManifest` falls back to `build` for a manifest without it). `public/data/` is generated and gitignored: move it out of the way
before `next build` (the export would copy every tile into `out/`); without it the page shows the
"map didn't load" dialog. `public/og/<world>.jpg` (1200×630 share cards, made by the pipeline) is
committed and must stay; so are `public/og/tinyworlds.jpg` (the front page's own share card, the
pipeline's `home-card`), `public/loops/` (the front page's moving pictures, made by
`tinyworlds-videos`: `<world>.mp4`, and a hero film and its still per world, `hero.{mp4,jpg}`
and `hero-<world>.{mp4,jpg}`) and `public/email/`: the pictures
the API's mails show (`tinyworlds-api/CLAUDE.md`, Mails), loaded from the site's root, so the
front page's build serves them. `wordmark.png` (Tiny5's letters, "tiny" paper white and
"worlds" taxi yellow, on the mail band's dark, baked in so a client that recolours the band
cannot leave white on white; 2×) and `founding.png`, `first-stone.png`, `keystone.png`
(the badges' maps of `pixel-art.ts` at 3×, nearest neighbour) are made by
`scripts/email-images.mjs` (`npm run email-images`, Node 22.18+: it imports the `.ts` maps);
run it after changing the art, and commit what it writes.

## Layout

```
src/
├── app/                 # layout (fonts, metadata, theme script, accent), globals.css, and two
│                        # pages: page.map.tsx (a world) and page.home.tsx (the front page);
│                        # admin/page.home.tsx: the admin pages, in the front page's build only;
│                        # lists/leave/page.home.tsx: what a mail's leave link opens;
│                        # hall-of-fame/page.home.tsx and hall-of-fame/[city]/page.home.tsx:
│                        # the hall of fame and a city's own, likewise; terms/page.home.tsx and
│                        # privacy/page.home.tsx: the terms of service and the privacy policy
├── site.ts              # what this build is (world or front page): id, name, home language,
│                        # accent, GITHUB_URL, CONTACT_EMAIL, TERMS_URL, PRIVACY_URL, where the
│                        # worlds and their cards are
├── legal/               # the terms' and the privacy policy's texts, in the three languages
│                        # (terms.ts, privacy.ts; types.ts, parts.ts: their links), the date
│                        # (updated.ts) and the pages' metadata
├── worlds/              # one config per world + index.ts (`WORLDS`, `WORLD`, `IS_HOME`)
├── i18n/                # the interface's words: types.ts (the contract), en.ts, pt-BR.ts,
│                        # es-ES.ts, locale.ts (which language), index.ts (`localeStore`)
├── map/                 # the engine and everything pure: no React in here
│   ├── manifest.ts      # contract types + parseManifest (source of truth: root CLAUDE.md)
│   ├── projection.ts    # lon/lat ↔ map px
│   ├── bitset.ts tiles.ts hash.ts hoods.ts data.ts
│   ├── search.ts search-rules.ts   # matching; per-language abbreviations and number forms
│   ├── engine.ts        # MapEngine
│   ├── life.ts          # ferries and flights
│   ├── sights.ts sight-state.ts   # the buildings that light up, and which one is lit or pinned
│   ├── quiz.ts          # Guess the building's questions (quiz.<locale>.json): parseQuiz
│   └── __tests__/
├── components/map/      # the signs: search (with the way back to the front page), tool
│                        # column, minimap, settings, about, …
├── components/donate/   # the donate sign: city picker, amount picker, live funding bar;
│                        # "Build the next city" (build-next.tsx), a city's card and its
│                        # wall of stones (city-fund-card.tsx, stone-wall.tsx)
├── components/styles.ts # the buttons the front page and "Your cities" share, as class lists
├── components/home/     # the front page: landing.tsx and its pieces (section-head,
│                        # world-card, site-numbers, next-city-tile), moving-picture.tsx
│                        # (a still that comes alive: the hero and the cards),
│                        # benefactor-wall.tsx (everyone who gave: columns down the sides,
│                        # or a strip) and drift.tsx (a list that drifts by)
├── components/benefactors/ # a city's benefactors (panel, sign, stone grid), the badges' pixel
│                        # art, benefactor-link.tsx (one of a benefactor's links) and
│                        # brought-by.tsx (the gold plaque of a city its benefactors brought)
├── components/hall/     # the hall of fame: hall-of-fame.tsx (figures, the cities brought by
│                        # their benefactors, everyone, the other cities), city-hall.tsx (one
│                        # city's), hall-cards.tsx, hall-frame.tsx
├── components/me/       # "Your cities" (/me/): me-app.tsx (signed in or not), me-page.tsx,
│                        # your-cities.tsx, your-links.tsx, badges.tsx, keep-exploring.tsx,
│                        # name-editor.tsx
├── components/sign-in/  # the one sign-in sheet (admins and donors): a link or a 6-digit code
├── components/admin/    # the admin pages: admin-app.tsx (signed in or not),
│                        # funnel-report.tsx (the steps, the cities by visits, the days),
│                        # names.tsx (donors' names and their links: hide and show),
│                        # list-counts.tsx (how many wait on each list: counts only)
├── components/lists/    # the waiting lists: join-sign.tsx (the sign "Tell me" opens),
│                        # tell-me-button.tsx (a city's button and its "N waiting"),
│                        # new-cities-button.tsx, leave-page.tsx (/lists/leave/); their hooks
│                        # are in hooks/: use-lists.ts (the donor's lists, and joining),
│                        # use-join-return.ts (the front page opened from a join's link)
├── components/consent/  # Google Tag Manager behind the cookie question
├── components/legal/    # the legal pages (legal-page.tsx, legal-text.tsx) and the footers'
│                        # links to them (legal-links.tsx)
├── components/ui/       # shadcn/ui
├── hooks/               # useI18n, usePrefs, useTheme, useMilestones, useDocumentLanguage,
│                        # useFunnelVisit, usePresence, useWorldVisits, useWall,
│                        # useAdminSession, useLists, useJoinReturn, …
└── lib/                 # prefs.ts (settings, localStorage "<site>.prefs"), donate.ts (pure
                         # donation logic: links, amounts, the checkout input), city-picker.ts
                         # (pure: what the picker offers, the bar preview, the ranking),
                         # city-catalogue.ts (well-known cities to pick from), donate-api.ts
                         # (Apollo Client; imported lazily), funnel.ts (the visit and the
                         # steps it reports), visits.ts (each world's visits: the cards'
                         # words and order, the map's "still here"), admin.ts (pure: the
                         # session, the funnel's arithmetic), sign-in-api.ts (REST sign-in:
                         # link, code; lazy),
                         # admin-api.ts (the report; lazy), site-events.ts (what the page
                         # analytics hear), consent.ts (who is asked before Google's tags
                         # load, and loading them), links.ts (pure: a benefactor's links as
                         # the API says them, what a link may be), wall.ts (everyone who
                         # gave: the request, its answer, the two sides), hall.ts (the hall
                         # of fame's questions and answers, its cities and figures),
                         # hall-build.ts (the same, asked by the build to bake the pages),
                         # brought-by.ts (pure: which cities their benefactors brought),
                         # lists.ts (pure: a list's key, the join waiting for a sign-in in
                         # localStorage "tinyworlds.join", the leave link's states),
                         # lists-api.ts (myLists, joinList, leaveList, leaveListWithToken; lazy)
```

## Targets: worlds and the front page

- `next.config.ts` makes exactly one of `page.map.tsx` / `page.home.tsx` a page (through
  `pageExtensions`), by `NEXT_PUBLIC_WORLD`. So the front page ships no map engine and a map
  ships no front page. Do not import one from the other.
- **`src/worlds/`** is the registry: `WORLDS` lists every world in the order the front page shows
  them. Adding a world = one file there, one entry in `WORLDS`, a data set and a share card
  (`public/og/<id>.jpg`); the front page, the build check and the tests follow.
- **`src/site.ts`** answers "what is this build" for code that is not about a map (settings,
  language, analytics, donations): `SITE_ID` is the world id or `"home"`. On the front page
  `WORLD` is only a stand-in (the default world) that nothing shows: use `site.ts` there.
- **The front page, top to bottom** (`components/home/landing.tsx`): links to its own sections
  (`#cities`, `#imagined`, `#ranking`, `#open-source`; hidden below `sm`) and "Your cities" as a
  button; the hero; a strip of figures; the benefactors as a strip (only where the screen has
  no room for them beside the page: below); the cities, then the imagined places, as cards; "Build
  the next city" (Donations, below); open source as one strip; the footer. Each section's title
  (`section-head.tsx`) sits on the fog with a line saying what the section is, and carries the
  section's id.
- **A world's card** (`world-card.tsx`) is one link to the world, another build (`/<id>/`): the
  link is the card's name, stretched over the whole card, and the Benefactors button lies over
  it as its sibling, never inside it. Its picture is the world's share card, served from the
  world's own folder: `/<id>/og/<id>.jpg` (a world whose card is not there yet shows its
  wordmark on a plain plate). Its foot says in words what can be done: "Explore", and
  "Benefactors" for a world the API knows a city for. Under the pointer the card lifts and is
  ringed in the world's own colour. `SmallWorldCard` is the same in a few words (picture, name,
  visits), for "Your cities".
- **A city its benefactors brought is praised on its card** (`brought`, from
  `broughtByWorld(milestones)` in `landing.tsx`): a gold bar along the card's top and, under
  its words, the plaque (`BroughtByPlaque`: the founders' pixel flag, "Brought to you by 2
  benefactors, who donated $35", the people and the sum in taxi yellow), which lies over the
  card's link as the Benefactors button does, leads to the city's hall of fame and takes that
  button's place. `broughtBy` (`lib/brought-by.ts`, pure) decides which: a city that is BUILT,
  with its world, whose gifts met its goal; the people are the API's `benefactorCount` (a
  donor once), or the gifts where an older API does not say. The sentence agrees with how many
  they are in each language (`hall.broughtBy`, with `hall.people` inside it).
- **The figures under the hero** (`site-numbers.tsx`, with an API): how many worlds (the
  registry's count, at once), every visit they have had and how many are exploring now
  (`siteTotals` over `worldVisits`; the latter only above `LIVE_SHOWN_ABOVE`), and how many
  cities can still be given to (the funded and the ranked of `rankCities`). A figure takes its
  place when its number arrives and is left out if it never does; the strip is as tall from the
  first paint as it will be with all four, so nothing below it moves.
- **Everyone who gave to a city is on the front page, as "Our Benefactors"**
  (`benefactor-wall.tsx`, with an API;
  `useWall` asks `benefactorWall` once, with a plain `fetch`). A plaque each, the largest gifts
  first: a name, the sum in the accent, the cities (each opens that city's benefactors; two
  by name, then "+2 more"), and a named benefactor's links (below). An unnamed gift is
  "Anonymous" with what it gave and where. Last comes an empty lot, "Your name here", which
  opens the donate sign (only where donations are taken).
  - **From 90rem wide** (`WallColumns`): a column fixed down each side of the page, beside its
    64rem column (10.5 to 15.5rem wide, a little into the page's own margin), the wall dealt
    left and right in turn (`wallSides`). A link is a card: its picture, when it has one to
    show, across the plaque, then icon, title and host. Over the left column, "Our
    Benefactors"; over the right one, across the page from it, the way to the hall of fame.
    Both stand level with the page's own links and the plaques begin level with the hero, so
    the columns read as part of the page.
  - **Narrower** (`WallStrip`): "Our Benefactors", what the list is and the way to the hall
    of fame on one line, then one row under the figures, every plaque one height (84 px: a
    name, the sum and cities on one line, the links on one line; the first picture at the
    plaque's side). Its room is there from the first paint, with empty plaques while the list
    is on its way, so the page below does not move; a failed answer leaves the invitation
    alone. Only one of the two is ever in the page (`useMediaQuery`), so no picture is
    fetched twice.
  - **They drift** (`drift.tsx`, `.drift` in `globals.css`) only when there is more than fits:
    the list is then in the page twice, the second copy `inert` and hidden from screen
    readers, and the track moves by exactly one copy (16 px a second up a column, 26 along
    the strip), so the loop has no seam; it comes out of the fog and goes back into it (a
    mask). It stands still under the pointer and while anything in it has the focus, and
    never moves under `prefers-reduced-motion`: there it is one list, scrolled by hand. The
    columns are not scroll containers otherwise, so the wheel over them scrolls the page.
- **"Which city should I build next?"** (`next-city-tile.tsx`, where donations are taken): a
  tile after the cities' cards, in what is left of their last row or in a row of its own
  (`tileSpan` in `lib/home.ts`, at each breakpoint), with the three cities nearest to being
  built (`leading`), a button that opens the donate sign and a link to the ranking. Most
  visitors look at the worlds and never reach the ranking otherwise. While the list is on its
  way three empty bars hold their place.
- **The front page's pictures move** (`components/home/moving-picture.tsx`). Each card plays
  its world's loop (`/loops/<id>.mp4`, 800 × 420, silent, a few hundred kB) over its share card:
  the loop opens on the card's own framing, wordmark included, and drifts round an ellipse back
  to it, so the still hands over to the film unseen and the film loops unseen.
  A loop is fetched only when its picture is on screen (`preload="none"`, an
  `IntersectionObserver`) and is the one being shown (`active`), plays while it stays there,
  and is never fetched under `prefers-reduced-motion` or `Save-Data`; if it is missing or
  cannot play, the still stays. The loops are the front page's own files (`LOOPS_BASE` in
  `site.ts`), unlike the share cards: `deploy/deploy.sh home` is all they need, and a world's
  folder does not carry them.
- **The hero goes round the worlds** (`components/home/hero-carousel.tsx`): a slide for every
  world that has a hero film (`heroSlides`: the registry's order, New York first), the same
  idea at the page's width. A film is a slow lap with no sign on it, `/loops/hero.{mp4,jpg}`
  for New York and `/loops/hero-<id>.{mp4,jpg}` for the others (`worldHero`), framed by
  `tinyworlds-videos` to keep what is worth seeing clear of the page's sign. Which worlds
  have one is what the build finds in `public/loops/` (`next.config.ts` →
  `NEXT_PUBLIC_HERO_FILMS` → `HERO_FILMS`), so a world added without a film is simply not in
  the hero, and with one film listed the hero is a picture and a sign, with no controls.
  - **The sign** stays over the picture's lower left (below `lg` it hangs from the picture's
    bottom edge instead): the wordmark, the tagline, the pitch, then the world being shown
    (its wordmark in its colour, its city on one line, so the sign is as tall whatever the
    world), "Explore" (the link to that world, named "Explore {city}") and, where donations
    are taken, "Fund the next city" (`#ranking`). The buttons share a row from `sm` and stack
    below it: they never wrap.
  - **It moves on by itself** every `SLIDE_MS` (8 s), the new picture fading in over the old
    (`FADE_MS`, the `hero-in` keyframes), only while `mayAdvance` (`lib/home.ts`) says so:
    more than one slide, the hero on screen, the page in view, no pointer on it, no keyboard
    focus in it, and never under `prefers-reduced-motion` or `Save-Data` (then it stands
    still and only the stills are fetched). Choosing a slide stops it for good: the hero is the visitor's from then on, which is
    how a finger (it has no hover) or a screen reader holds it. A tab opened behind another
    is hidden from the start (`watchHidden`), and of an observer's delivery the last word
    is the one believed (`lastSeen`).
  - **Choosing**: a pill at the picture's lower right from `lg`, at its top right below (where
    the sign would cover it): previous, a dot per world (the current one in that world's
    colour; a count instead on a phone, where dots are too small to press), next; the arrow
    keys work inside it. Each slide chosen by hand is said to a screen reader, through a
    polite region that is there from the start; one the timer brought is not.
  - **What is fetched**: the first still at once; each other still a second before its turn
    (`AHEAD_MS`); a film only when its slide is the one showing. Only the current slide and
    the one it is fading in over are in the page.
- **Each card says how visited its world is** (with an API): "41,203 visits" under the card's
  text, and "● 23 exploring now" beside it once more than ten (`LIVE_SHOWN_ABOVE`) have that
  map open (`visitsLine` in `lib/visits.ts`, numbers in the visitor's way of writing them).
  `useWorldVisits` asks `worldVisits` for every world in the registry with a plain `fetch`
  (5 s timeout), at once and then every 30 s while the page is in view; a failed answer leaves
  the last numbers. Each group of cards comes **most visited first** (`byVisits`; ties and
  worlds with no count keep the registry's order), ordered by the **first** answer only: later
  ones change the numbers, never the order, so nothing moves under the pointer. Before that
  answer, and for good without one, the cards keep the registry's order and say nothing; the
  line's height is there from the start (`box-content`: a `min-h` would otherwise swallow the
  line's padding), so the cards do not grow when the numbers come.
- **The front page's share card** is its own picture, `public/og/tinyworlds.jpg`
  (`HOME_CARD_PATH`): six cities in leaning slices under the wordmark, not a world's card.
- Inside a map, the arrow at the left of the search sign (and "All cities" in About) is a plain
  link back to the front page (`NEXT_PUBLIC_HOME_URL`).
- **The invitation to the other places** (`components/map/explore-banner.tsx`): a small sign
  under the search box, "13 more cities and worlds to explore", linking to the front page's
  list (`placesUrl` in `lib/explore.ts`: `/#cities`). Most visitors land on one map and never
  see that there are others. It is **always there**, for everyone: it goes up with the map's
  other signs and cannot be put away. The one moment it is not drawn is while the search box
  is in use (a `:has()` rule in `globals.css`), because the results open over that spot. Its
  little skyline is lit in four other worlds' colours. Analytics hook: `explore_more`.
- **Contact.** `CONTACT_EMAIL` in `site.ts` is the one place the project's address lives: the
  front page's footer shows it (a `mailto:` in a localized sentence), and About in every map has
  a quiet "Contact" link.
- **The terms of service and the privacy policy** (`/terms/`, `/privacy/`): see below. Every
  footer links them (`LegalLinks`), and so do About in every map and the cookie question.
- **Fictional worlds** (`fictional: true` on the `World`: Winterfell, King's Landing, Westeros) are places
  from a story, on a layout invented for the map. The flag does three things: the corner readout
  shows only the zoom (`viewReadout` in `lib/readout.ts`: the coordinates mean nothing) and says
  "fan-made" in the visitor's language instead of crediting map data; About sets the world's
  notes apart as a disclaimer (unofficial, invented layout, not affiliated with the author or
  the series — `worlds.test.ts` checks every fictional world says so in every language and
  never claims open data); and the front page lists them in their own group ("Imagined places")
  after the cities. They are worlds like any other for everything else (share links, search,
  donations), and the donate picker never offers them as cities to fund.
- **Long wordmarks.** `tinykingslanding` is sixteen letters where an airport code makes seven:
  `Wordmark` sets a name longer than ten letters smaller in proportion (`wordmarkScale` in
  `lib/wordmark.ts`), so the search sign, the cards and the splash need no special case.

## Words: languages and worlds

- **The language follows the visitor, at run time.** `resolveLocale` (`i18n/locale.ts`) takes the
  first of `navigator.languages` we speak, by primary subtag (`pt-PT` → `pt-BR`, `es-MX` →
  `es-ES`), else English; the settings panel can override it (`prefs.lang`, default `"auto"`).
- **`useI18n()`** (`hooks/use-i18n.ts`) gives components `{ locale, t, copy }`: `t` is the
  dictionary, `copy` the world's own words in that language. It is a `useSyncExternalStore` whose
  server snapshot is the site's **home language** (`WORLD.homeLocale`: pt-BR for tinyrao, es-ES
  for tinyfte and tinyvlc, en-US for the others), so the static HTML hydrates cleanly
  and then switches. Code outside React
  (errors thrown while loading) uses `activeStrings()`.
- **No hard-coded UI strings in components**: every visible string and aria-label comes from `t`
  (language) or `copy` (city). `Strings` in `types.ts` is the contract, so a key missing from one
  dictionary is a type error; the tests compare keys and placeholders across languages.
- **`src/worlds/<id>.ts`** holds what belongs to a city: wordmark, `homeLocale`, accent, credit
  line, search shorthand, and `copy` — per language: title, description, About text, card text,
  search placeholder, what its outlines are called (`hoodLines`: "Neighbourhood lines" in New
  York, "Subsetores" in Ribeirão Preto) and what a `borough` result is called there ("Borough" /
  "Region"). Every world has its copy in every language.
- **What stays in the home language:** everything baked into the HTML (`<title>`, description,
  Open Graph, `<html lang>`), because crawlers and link previews do not run the page. Once
  running, `useDocumentLanguage` sets `<html lang>` and the title (it re-applies the title when
  the framework writes the baked one back). The manifest's attribution lines and its validation
  messages come as they are: in the language of the data.
- **Search rules** (`map/search-rules.ts`) belong to the **world**, not the interface: they
  follow the language of the map's names. `EN_RULES` turns ordinals and number words into digits;
  `PT_RULES` makes every way of writing a number find the others ("9 de julho", "nove de julho";
  "15", "quinze", "XV"). `ES_RULES` does the same for Spanish and, because Valencia's map names
  its streets in Valencian, makes each language's word find the other's ("calle" ↔ "carrer",
  "plaza del ayuntamiento" → "Plaça de l'Ajuntament", "9 de octubre" → "Nou d'Octubre"); its
  `elision` keeps "d'" and "l'" as words of their own, so the word after the apostrophe can be
  found. A world adds its own shorthand on top (`tinyvlc`: "ruzafa" ↔ "Russafa", "malvarrosa").
  An alternate written `=word` only matches a whole word. Names and queries are always compared
  unaccented.
- **Accent.** `--taxi` / `--taxi-ink` are set on `<html>` from `SITE_ACCENT` (taxi yellow for
  tinynyc and the front page, `#ff7a3d` for tinyrao, `#3ccfc0` for tinyorl, `#b9a2ff` for tinyfte,
  `#ffa62b` for tinyvlc, `#ff4fa3` for tinylas, `#55aaff` for tinylax, `#6ee05a` for tinydal,
  `#a56bff` for tinycvg, `#ffd447` for tinypit, `#5b7cfa` for tinyphl, `#ff6b57` for tinycos, `#45d993` for tinytkf, `#a9c7e8` for tinywinterfell, `#ea5257` for tinykingslanding, `#d9b45a` for
  tinywesteros); the engine and the minimap read the world's value for canvas drawing. Don't
  write the yellow as a literal. `worlds.test.ts` checks the contrast of each pair against its
  ink and against the signs in both themes, which is why King's Landing's red is a shade lighter
  than a flag red.
- A world may ship an empty `hoods.json`: the settings row, the `B` key and the help line then
  disappear.

## Donations

Optional, and never in the way: with nothing configured there is no heart, no dialog, no section.

- **Payment links** (`NEXT_PUBLIC_DONATE_URL`, `_PT`, `_ES`): hosted checkouts where the donor
  sets the amount and may name a city. `paymentLinkFor(locale, siteId)` picks the visitor's
  language (falling back to the default link) and appends `client_reference_id=<site id>` and
  `locale=en|pt-BR|es`. Opens in a new tab.
- **The API** (`NEXT_PUBLIC_API_URL`, `tinyworlds-api`): `cityMilestones` lists the cities being
  funded (each is built when its bar is full) and `createDonationCheckout` opens a checkout for
  `{ city, amountCents, world, locale, returnUrl }`: the city is one being funded, any other
  (≤ 60 chars) or none; `amountCents` is what was chosen here (US$1 to US$10,000, whole
  dollars). The checkout returns to `returnUrl?donated=1|0`; `useDonationReturn` thanks the donor
  and removes the marker.
- **The donate sign** (`components/donate/donate-dialog.tsx`), with the API:
  - `city-picker.tsx`: a searchable combobox (Popover + cmdk `Command`, filtering done by
    `pickerOptions`, not by cmdk). It offers "no city in particular" (the default), the cities
    being funded with their sums, and the rest of `lib/city-catalogue.ts` with the country in
    the visitor's language. A city is offered once; a built one (by the API's word, or because
    it is one of `WORLDS`) never. A search that finds nothing offers what was typed as a new
    city; "Other city…" turns the control into a text field. The catalogue's `alt` spellings
    ("Londres", "Lisboa") only help the search: what is sent is the English `name`, so one city
    does not collect under two names.
  - `amount-picker.tsx`: chips for US$5/10/25/50/100 and a field for any other whole amount.
  - `funding-preview.tsx`: the chosen city's bar with the donation about to be made added to
    it in stripes (`previewBar`), and what that means: it fills the bar, or lands above the
    goal. With no city chosen there is no bar, only a line.
  - `join-block.tsx`: "Put my name on {city}", under the amount chips (API mode, a city chosen
    only). The switch starts off; on, a name field (40 code points, counter) appears and Donate
    stays disabled until `cleanName` finds something. The checkout sends
    `benefactorName: on ? cleanName(name) : null`.
  - It says, in every language: cities with the most funding are built first, and what is given
    beyond a city's goal pays for the servers and keeps the project improving.
- **"Build the next city"** (`components/donate/build-next.tsx`, `rankCities`): the front
  page's ranking, and a short form of it on "Your cities". Three steps say how it works (pick
  a city, give from US$1, at the goal it is built), each under one of the badges' pictures.
  Then every city is a card (`city-fund-card.tsx`) in three groups:
  - **Built**: `BUILT` with `raisedCents >= goalCents`, most raised first. A city never leaves
    the ranking: once built it stays here, lit in the accent, with its share card as a band,
    every stone laid, "Funded in full", and two actions, Benefactors and Explore. No Donate
    (see Benefactors). The rule is the whole rule: one of the worlds built without funding
    joins the group if its gifts ever reach its goal, which is why the card never says
    "built by". Six before a "show all" of their own (`BUILT_LIMIT`).
  - **Funded** (`FUNDED` and `BUILDING`), as before.
  - **Being funded**, numbered, most funded first, eight before "show all"
    (`RANKING_LIMIT`), and last an empty lot, "A city that is not here?", which opens the
    donate sign with no city chosen.
- **A city's card** shows its bar as **its foundation, a stone per dollar** (`StoneWall`,
  `cityStones` in `lib/stones.ts`: `ceil(goal / 100)` stones, `floor(raised / 100)` laid, all
  of them once the goal is reached; fifteen to a row, the first and last marked like the
  benefactors' sign's; one plain bar above 60 stones). Under it: "10 of 30 stones laid ·
  1 donation", the status of a funded city, or "The First Stone is still unclaimed". **Every
  action carries its word**: Donate (opens `<DonateDialog city>`) and, once someone has given,
  Benefactors. With no list (no API, or it failed) the section is one sentence and a Donate
  button. `leading()` is the funded then the best funded, never a built city: what the short
  forms of the ranking show.
- **The API must never block a donation.** List or checkout failing, or taking over 5 s, drops
  the sign back to the payment link (`donateMode` in `lib/donate.ts` is the whole rule), where
  the amount and the city are set on the checkout page instead.
- `lib/donate-api.ts` (Apollo Client 4, core API, no provider) is only ever imported dynamically
  (`useMilestones`, the checkout button), so Apollo is not in the bundle the map starts with.
- The heart in the tool column, the link in About and the front page's ranking all open the
  same sign.
- **What the page analytics hear** (`lib/site-events.ts`): `donate_open`, `donate_checkout`,
  `donate_cancelled`, `donate_complete` (the conversion, with `value` in US$ and `currency`),
  `explore_more` and `quiz_start`, each with `world` (and `city`, `amount` when there are). `siteEvent()` pushes
  every one to Tag Manager's `dataLayer`, where the container sends it on to Google Analytics.
  Rybbit hears the clicks from declarative hooks on the buttons (`data-rybbit-event` with
  `data-rybbit-prop-world`, `-city`, `-amount`), so `siteEvent(…, { rybbit: true })` is only for
  the two returns from the checkout, which no click marks. What the donor chose rides to the
  checkout and back in session storage (`tinyworlds.checkout`); only an API checkout returns
  here, so a payment-link donation is not a `donate_complete` (the API still knows it from
  Stripe). Every message carries all its keys, `undefined` when absent, because the data layer
  keeps the last value of a key it is not told again.
- Never put a real payment link, key or API host in the repository: they come from the
  environment at build time.

## The donation funnel and the admin pages

With `NEXT_PUBLIC_API_URL` set, the site tells the API which steps towards a donation each
visit reached; `tinyworlds-api/CLAUDE.md` has the whole picture.

- **A visit** (`lib/funnel.ts`) is one tab's stay on the site: a UUID made here
  (`crypto.randomUUID`) and kept in the tab's `sessionStorage` (`tinyworlds.visit`), shared by
  the front page and every world because they are one origin. No cookie, nothing kept between
  visits, and no visit at all where storage is blocked.
- **What a page reports**, through `trackStep(step, SITE_ID, locale)`: `VISIT` when it opens
  (`useFunnelVisit`, in the map and on the front page; this is also what each city's visits are
  counted from), `DONATE_OPENED` when the donate sign opens, `CHECKOUT_CANCELLED` when the
  checkout sends the donor back with `?donated=0`, and `CHECKOUT_STARTED` only for the plain
  payment link: with the API, the checkout carries the visit (`checkoutInput(…, currentVisit())`)
  and the API notes the step itself.
- **It never costs a visitor anything.** A plain `fetch` with `keepalive` (not Apollo: the map
  does not download Apollo to say it was opened), never awaited, every failure swallowed, each
  step said once per page.
- **An open map says it is still there** (`usePresence`, in the map only): `trackPresence`
  every 30 s while the page is in view (`everyWhileShown` in `lib/visits.ts`: nothing while it
  is hidden, once on coming back if a beat was missed), for the same visit and with the same
  exceptions as the steps. That keeps the visit's `last_seen_at` fresh: what "exploring now"
  counts, and how long a visit stayed.
- **Not counted:** a browser where an admin is signed in (their own visits would only blur the
  numbers) and one driven by a program (`navigator.webdriver`).
- **The admin pages** are `src/app/admin/page.home.tsx`: a route of the front page's build
  only (`/admin/`; a world's build answers 404 there), `noindex`, and linked from nowhere
  except the front page's footer **when an admin is signed in**. To anyone else it is a sign-in
  form: an address, a button, then the link in the mail (`/admin/#token=…`) or the 6-digit code that came with it, typed on the page (`SignIn`, shared with the donor page; a spam-folder warning and a 60 s "send again"). `AdminApp` takes the
  token out of the address at once and trades it for a session (`lib/sign-in-api.ts`, REST), kept
  in `localStorage` (`tinyworlds.admin`; `hooks/use-admin-session.ts` is its store) and sent as
  `Authorization: Bearer …`. A session the API no longer knows signs the page out.
- **The report** (`components/admin/funnel-report.tsx`, numbers from `donationFunnel`): the
  four steps, each bar the share of the step before that went on; the maps ranked by visits,
  with the front page set apart; visits per day, days counted in the admin's own time zone,
  with a table behind it; the latest donations. One period for everything (7, 30, 90 days,
  12 months: whole local days, `rangeOf`). One colour marks everything (`--taxi`), bars are
  thin, and every figure a bar stands for is written beside it or in the table.
- **"Waiting to hear"** (`components/admin/list-counts.tsx`, `listCounts` through
  `fetchListCounts`, parsed by `parseListCounts`): a table under the names, a row per city
  (most waited for first) and a "New cities" row. Counts only, never an address; it loads on
  its own, and a failed load says so (with a retry) rather than showing a table that claims
  nobody waits.
- There is nothing secret in the page itself: the numbers come from the API, which gives them
  to signed-in admins alone. Who the admins are is the API's `ADMIN_EMAILS`.

## Benefactors

Optional like the rest of the donations: everything here needs `NEXT_PUBLIC_API_URL`.

- **Where the sign opens.** `BenefactorsSign` (a city's founders, benefactors and stone grid, from
  `cityBenefactors`) opens from the front page (a world's card, a city's card in the ranking),
  from "Your cities" and, in a map,
  from About (`BenefactorsPanel`, drawn only for a city the API knows and that is built). The
  panel is mounted only while open, so each opening fetches afresh. A card offers it only for
  worlds the API lists a city for.
- **Built cities reach the Donate sign only through it.** The picker never offers a built city
  (nothing to fund); the benefactors' sign has a button that closes that sign and opens
  Donate with the city chosen (one sign at a time).
- **The join block** (`components/donate/join-block.tsx`) is "Put my name on {city}": off by
  default, a name field (40 code points, `cleanName`) when on, and Donate disabled until a name
  is left, saying why in a hint under the field (`donate.join.needsName`, tied to the field and the button with `aria-describedby`). The checkout carries `benefactorName`, null when off. The email's existing name is kept.
- **Badges are SVG pixel maps** (`benefactors/pixel-art.ts`: one character per pixel, a palette
  with fixed colours; `pixel-badge.tsx` draws one `<rect>` per pixel at a whole-number scale), so
  they stay crisp at any size and need no image files. Founding, first stone and keystone.
  Titles and the founder label are in the i18n dictionaries. Mails cannot draw SVG: they show
  PNGs made from the same maps (`public/email/`).
- **"Your cities"** (`/me/`, below) is where a donor sees their own badges, their own stones
  in each city's foundation and the listing switch; **`/admin/`** can hide a name (`components/admin/names.tsx`: `benefactorNames`,
  `setNameHidden`; it acts at once, since it is reversible, and is loaded apart from the funnel).
- **A benefactor's links** (`benefactors/benefactor-link.tsx`, `lib/links.ts`): up to three
  pages a named donor points to, each with what the API read of it (title, description, the
  site's icon, the page's picture). They show under the name in a city's sign (`look="row"`:
  a small picture in the icon's place) and on the front page's plaques (`look="card"`), never
  on an unnamed row (the parsers drop them there, whatever the answer says). A link opens in
  a new tab and is a **dofollow link**, `rel="dofollow noopener"` (`LINK_REL`, in
  `lib/links.ts`): never `nofollow`, `sponsored` or `ugc`, because the benefactors are told
  that search engines follow their links. Search engines read nothing into `dofollow` itself
  (a link without `nofollow` is followed): it is written out so the promise shows in the
  page's source. Do not add one of the others without changing what the mail and the hall of
  fame say. Icons sit on a
  white tile, since many are dark marks drawn for a light browser tab. **Nothing is loaded
  from a linked site**: `icon` and `image` are paths on the API (`/api/link-images/<id>`),
  `assetUrl` puts the API's origin (`apiOrigin`: `NEXT_PUBLIC_API_URL` may be a path) in
  front and refuses anything that is not such a path, and a link whose address is not https
  is not shown at all. The picture is there only when the API sends it (the donor has given
  US$10 in all). On `/admin/`, each name comes with its links, pictures and all, and a second
  switch hides the links alone (`setLinksHidden`).

## The terms of service and the privacy policy (`/terms/`, `/privacy/`)

Two routes of the front page's build (`app/terms/page.home.tsx`, `app/privacy/page.home.tsx`),
for everyone, search engines included, each with its own title, description and canonical
address (`legal/metadata.ts`). `TERMS_URL` and `PRIVACY_URL` (`site.ts`) address them from
either build, like `HALL_URL`.

- **The texts are not in the dictionaries.** They are long, and every map downloads the
  dictionaries: `legal/terms.ts` and `legal/privacy.ts` hold them in the three languages, and
  each page hands its own to `LegalPage` as props, so a page's script carries one text and no
  map carries either. Only the links' words and the page's frame are in `t.legal`. A page's
  heading is the same as its link's words (a test checks).
- **Shape.** A text (`LegalDoc`) is a title, a description, a few lines that sum it up ("In
  short"), then sections with a fixed `id` each (the anchor, the same in every language:
  `/privacy/#donating`), each of paragraphs and lists; a list's point may set a few words
  apart (`{ term, text }`). Links are written `[words](target)`, a target being one of
  `LINK_TARGETS` (`legal/parts.ts`: this site's pages, the cookie settings, the licences and
  Stripe's and Google's policies), and `{email}` is `CONTACT_EMAIL`. `legal.test.ts` checks
  that every language has the same sections, blocks and points with the same links in the
  same places, and that nothing is left unmade.
- **The page** (`components/legal/legal-page.tsx`): the wordmark home, the title and "Last
  updated" on the fog (`LEGAL_UPDATED`, `legal/updated.ts`, written in the visitor's
  language), the text on one long sign with "In short" first and the sections numbered in
  Tiny5, the list of sections down the side from `lg` (sticky), and a footer. It asks nothing
  of the API.
- **The privacy policy says what the code does**: the visit and its steps, the presence beat,
  the quiz's answers, Rybbit and Google Analytics behind the cookie question, what the
  browser keeps, what a donation, a donor, a link and a sign-in store, and where it goes.
  **Change it with any change to what the site or the API collects, keeps or sends
  elsewhere** (the lists' addresses and mails, and the join kept in `localStorage` while a
  sign-in link is on its way, are covered in `/privacy/#lists`), move `LEGAL_UPDATED`, and tell donors by email when the change matters to
  them (both texts promise this). The commitments in the terms (refunds within 30 days, a
  city that cannot be built offered elsewhere or refunded) are the owner's to change, not
  the code's.

## The hall of fame (`/hall-of-fame/`)

Two routes of the front page's build (`page.home.tsx`, like `/me/` and `/admin/`), for
everyone, search engines included: no `noindex`, each with its own title, description and
canonical address.

- **`/hall-of-fame/`** (`components/hall/hall-of-fame.tsx`): the title, then three figures on
  a sign with the gold bar (`HallFigures`, `hallTotals`: everything given to the cities,
  everyone on the wall, the cities built with their gifts); "Built by benefactors", a gallery
  of the cities their benefactors brought to the map (`BuiltCityCard`: the city's picture,
  name, plaque and first names; the card leads to its hall, "Explore" over it to the map);
  "Our Benefactors", everyone on the wall as cards, ranked from the largest gift
  (`PersonCard`: place, name, sum, the cities, each a link to that city's hall, and their
  links with pictures); then "More cities": a tile for every other city someone gave to
  (`CityTile`: how many are in its hall, where it stands with a bar while it is funded, the
  first names). `hallCities` gives each city its people (the API's count when it says, else
  the wall's entries) and its `broughtBy`. Last, "Fund a city" and what the links are.
- **`/hall-of-fame/<slug>/`** (`components/hall/city-hall.tsx`): a built city's picture
  (beside the words on a wide screen, kept to its right side so the frame does not cut
  through its wordmark: `MovingPicture`'s `focus`, above them on a narrow one), for a city its
  benefactors brought their plaque in place of "raised of goal", the city's foundation (the
  sign's `StoneGrid` and legend), "Become a benefactor" and "Explore" for a built one, then
  its founders (`FounderCard`: number, badges, stones, sum, links) and its benefactors
  (`BenefactorCard`), all of them, as cards.
- **Cards are set in columns** (`CARDS`: one, two, three, each filled from the top), because
  a card with pictures is several times as tall as one without: a grid of rows leaves holes.
- **The pages are baked** (`lib/hall-build.ts`): each is an async page that asks the API when
  the build runs (`hallAtBuild`, `cityAtBuild`; `buildEndpoint`: `NEXT_PUBLIC_API_URL`, on
  `NEXT_PUBLIC_SITE_URL` when it is a path) and hands what it got to its client component as
  `initial`, so the names and the links are in the HTML for anything that reads a page
  without running it. Asked afresh by every build, never kept from the last. Once open, the
  page asks again (`fetchHall`, `fetchCityHall`, plain `fetch`) and shows what is true now;
  when the API is away, what was baked stays. **The build never fails for it**: no API, or
  one that does not answer, is a page with nothing baked in. `deploy.sh release
--fresh-home` (the daily run) builds the front page again so that what is baked is a day
  old at most.
- **Which cities have a page**: `generateStaticParams` makes one for every city the API
  lists whose slug is plain (a-z, 0-9, "-"); with no API to ask it still makes one
  (`new-york`), so the route exists. A city with another kind of slug (a name in another
  script), or named since the build, has none: `hallCityUrl` (`site.ts`) addresses the first
  as `/hall-of-fame/?city=<slug>` and the web server redirects the second there
  (`deploy/nginx.conf`); `HallOfFame`, asked for a city that way (`cityAsked`), is that
  city's hall.
- **Where it is linked from**: the front page's links across the top and over its
  benefactors, a city's benefactors sign ("{city}'s Hall of Fame", from a map too:
  `HALL_URL`), and the mail that tells donors they are in it.
- `HallFrame` is what both pages stand in: the wordmark home, "Your cities", the language,
  title and theme, the visit, and the donate sign.

## The waiting lists (front page, `/me/`, `/lists/leave/`)

Anyone may ask to hear when a city is built, or when any new one is (root `CLAUDE.md`, the
lists' bullet). Only with an API (`withApi`); `lib/lists.ts` is the pure part, `lib/lists-api.ts`
(Apollo, lazy) the calls, `useLists` (`hooks/use-lists.ts`) the donor's lists.

- **On the front page**: each city being funded (the "Build the next city" tile and the
  ranking's cards, `CityFundCard`) has a **"Tell me"** button (`TellMeButton`; "You'll be told"
  once on the list, and pressing it leaves: its label for screen readers starts with those
  words, `leaveAria`; a donor of the city is told without a list, and the button says so) and shows **"N waiting"** (`waiting` of `cityMilestones`). The tile (`NextCityTile`)
  also has **"Tell me when new cities are built"** (`NewCitiesButton`).
- **The join sign** (`JoinSign`): a signed-in donor joins at once; anyone else is asked for an
  address and confirms it with the sign-in link or code (`SignIn purpose="donor"`, the list
  carried in `magic-link`'s `list`, so the link joins server side wherever it is opened).
  Its body says what the list sends (`joinWords(…).body`: one mail for a city, one per new
  city for new cities). When the sign opens, `savePendingJoin` keeps which list, and when, in
  localStorage (`tinyworlds.join`); closed before a link was asked for that list
  (`pendingKeptOnClose`), it forgets it (`dropPendingJoin`), so a link asked for on another
  device never joins a list this browser only looked at.
- **The front page opened from the link** (`hooks/use-join-return.ts`): the token leaves the
  address, `verifyLink` trades it, and `takePendingJoin` (ignored after an hour) reads the
  join waiting here. `joinReturnOf` says what shows: with a join waiting, the sign on that
  list, on its last step when the link signed the visitor in, else asking again with why (the
  `notice`, `linkNoticeOf`: expired or used, too many tries, no answer), a new link one press
  away; with none (the link was opened on another device, and the API joined the list
  itself), a toast: "You're signed in. Your lists are on Your cities." (never a promise of a
  welcome mail: that goes once per person, only on a join), with a way to Your cities, and
  the buttons show the lists; or, when the link failed, why.
- **"Your lists"** on `/me/` and **`/lists/leave/`**: below.
- **The admins' counts**: "The donation funnel and the admin pages" above.

## "Your cities" (`/me/`)

The donor's own page, `src/app/me/page.home.tsx`: front page's build only, `noindex`, like
`/admin/`. `MeApp` mirrors `AdminApp` (token out of the hash, `verifyLink(token, "donor")`,
session in `donorStore`, "unauthorized" → back to sign-in with the `ended` notice) and shows
`SignIn purpose="donor"` to anyone else, as it always did. Signed in, the page is `MePage`
(`components/me/me-page.tsx`), as wide as the front page, and **it always has somewhere to go**:

- **The giving** (`YourCities`, from `useGiving`: `myGiving` through `lib/benefactors-api.ts`, a
  per-session Apollo client, `fetchGiving` / `setListing` / `setDisplayName`).
  - _Nothing given_ (`cities.length === 0`; gifts to the project alone count as this, with the
    project line): "No stones laid yet", what will stand here, and the three badges as things
    to earn (`BadgesToEarn`), dimmed, each with how.
  - _A donor_: three figures (cities, stones laid, given: `givingSummary`), then a card per
    city: a thumbnail of its share card once it is built, its badges, the meta line (given,
    stones, to go or status), **its foundation with the donor's own stones lit** among the
    others' (`StoneWall` with `mine`; a legend when both kinds are there; no wall for a city
    where they laid none, having given once it was funded), "Give again" unless it is built,
    the listing switch and the explore link. Turning a listing on with no name opens
    `NameEditor` first. Then the project line.
- **Under it, for a donor: "Your links"** (`YourLinks`, from the `myLinks` asked with the
  giving; `giving.links`, null if the API said nothing of them). A field takes an address as
  people type it ("yoursite.com"); `cleanLinkUrl` (the API's rule, mirrored) and the links
  already there are checked before anything is sent, then `addLink` has the API read the page
  ("Reading the page…", a few seconds) and the link appears with what was found. Each link
  has "Read again" (`refreshLink`; a page that does not answer leaves it as it was, and says
  so) and "Remove". The section says what shows: that links go where the name goes (when the
  donor is named nowhere, `namedSomewhere`), that an admin hid them, and whether their
  pictures show ("Give $4 more and your links show their pictures too", `centsToPictures`;
  until then a link's picture is dimmed here, with "Shown from $10 given").
- **Beside it** (from `lg`; under it below): "Build the next city" in short (`BuildNextShort`:
  the funded and the best funded as stone cards, four in two columns for someone who has not
  given, two in one for a donor, and a link to the whole ranking on the front page,
  `RANKING_PATH`), and for a donor **their badges** (`YourBadges`: `earnedBadges`, each lit
  where earned and saying where, `earnedWhere`: a city, two, or "3 cities").
- **Under both**: "Keep exploring" (`KeepExploring`): the eight most visited worlds, cities and
  imagined places together, as `SmallWorldCard`s, and a link to all of them (`CITIES_PATH`).
- The page owns the donate sign and the benefactors' sign (one at a time, as the front page
  does) and calls `useDonationReturn`: a checkout started here comes back here.
- **"Your lists"** (`me/your-lists.tsx`, above "Your links"): the cities the donor waits to hear
  about (with the ranking's words) and "New cities", each with Leave; with none, the "new cities"
  button. Nothing shows until `useLists().lists` is known. The "Build the next city" cards get
  "Tell me" too; being signed in, the page needs no join sign.
- **`/lists/leave/`** (`app/lists/leave/page.home.tsx`, `lists/leave-page.tsx`, noindex, the
  front page's build only): a mail's leave link, `#t=<token>`. The token is read once and taken
  out of the address at once (`replaceUrl`), `leaveWithToken` leaves, and `leaveState` says
  whether it did (`left`, `left-all`, `bad` for a token that is not ours, `failed` for an API
  that did not answer, which can be retried). "Leave all lists" and "Join again" (the join sign
  for new cities, `RANKING_PATH` for a city) follow.

Linked from the front page's header, About in every map (`ME_URL`) and the thank-you toast;
links show only with an API.

## The engine (`src/map/engine.ts`)

`MapEngine` is a plain class that owns two canvases and the view. React never re-renders per
frame: components call methods and subscribe with `engine.on("view" | "settle" | "hood", fn)`.
`requestAnimationFrame` only runs while something is moving, fading or animated.

- **Tiles canvas** (`.map-tiles`): the pixel-art tiles, then _scene layers_. Sits under the
  tilt-shift blur and the dusk tint.
- **Marks canvas** (`.map-marks`): neighbourhood lines, name plates, the building spotlight, the
  search pin. Above the blur, always sharp.
- View = centre in map px + `scale` (CSS px per map px). `scale ≥ 1` draws level 0 with smoothing
  off (chunky pixels, up to `manifest.maxScale`); below 1 it draws level
  `floor(log2(1 / (scale · min(dpr, 2))))` smoothed.
- Loading: nearest to the centre first, 6 at once, stale downloads aborted, LRU cache sized to the
  screen, 180 ms fade-in. While a tile loads its children or a coarser ancestor stand in; the
  coarsest level is preloaded and pinned.

Sprites ("life on the map") go in a scene layer. The context arrives in **map space** (1 unit =
1 native map px, smoothing off), so a sprite drawn at a projected point lines up with the tiles at
every zoom:

```ts
const off = engine.addSceneLayer((ctx, view, timeMs) => {
  const p = engine.projection.toMap(lon, lat); // cull with view.left/top/right/bottom
  ctx.drawImage(sprite, Math.round(p.x - 8), Math.round(p.y - 12));
});
engine.setLife(false); // the settings switch: layers stop being called
```

`src/map/life.ts` is the one scene layer so far, driven by `data/life.json`: ferries sailing its
`ferries` routes (there and back, with a wake) and its optional `flights`:

```ts
flights?: {
  kind: "helicopter" | "plane";
  path: number[];   // flat [lon, lat, altMetres, ...]
  loop: boolean;    // true: closed circuit, forever. false: start → end, hidden for `pause`, again
  speed?: number;   // ground m/s; default 60 (helicopter), 75 (plane)
  pause?: number;   // seconds; default 20
}[]
```

A flight is drawn `alt · geo.kz` px above its ground point, its shadow on the ground `rise / 1.05`
px to the right, and altitude is interpolated along the path, so a plane can come down onto a
runway. It only animates things that are never hidden behind a building, because the viewer has
no depth information: no cars.

Layers are called every frame while life is on; with `prefers-reduced-motion` they are called
once per redraw with `timeMs = 0`. The live engine is also on `window.tinyworld` for the console.

### The building spotlight (`map/sights.ts`, `map/sight-state.ts`, `components/map/sight-sign.tsx`)

In a world with `sights: true` (New York, Dallas, Cincinnati, Pittsburgh, Philadelphia, Colorado Springs, Truckee), a building found in the search
lights up under the mouse: the rest of the map dims (`rgba(12, 14, 16, 0.58)` over the marks canvas, the building's
outline cut out), a 2 px line of the accent runs round it, and a sign beside its top says what
it is (type · context line, name), the opening of its Wikipedia article and "Read on Wikipedia".

- **Data.** `sights.json` (outlines in map px) is asked for once the map has settled (or after
  1.5 s), never before; `sights.<locale>.json` the first time a building lights up, and again
  when the language changes. A world without `sights` never asks; a missing file is no spotlight
  and no error (`loadSights`, `loadSightTexts`: a 404 is "none").
- **Hit-testing** (`sightAt`): the outline holding the pointer, even-odd; of two, the one whose
  footprint stands nearer the viewer (`front`). Throttled to a frame, like the neighbourhood
  hover, which it beats where both apply. The cursor is a pointer over a sight (`over-sight`).
- **No flicker.** Crossing the street between two towers does not flash the whole map: a sight
  stays lit for `HOLD_MS` (150 ms) after the pointer leaves it for open ground, another sight
  takes over at once, and the spotlight fades in over 120 ms when it comes on from nothing (not
  under `prefers-reduced-motion`). The mouse leaving the map lets go at once.
- **Pinning** (`sight-state.ts`, pure): a click (or a tap: a finger has no hover) pins the
  building, so the sign takes the pointer and its link can be reached; a click elsewhere, the
  sign's close button or Esc lets it go; a second click on it too. Double-tap zoom is unchanged.
  The pinned sign is a labelled group, not a dialog, so the map's keys keep working.
- **The whole building.** The tiles are flat, so a lower tower in front still hides the lit one;
  each sight's picture (`sprite` in `sights.json`: the pipeline draws it alone, nothing in front)
  goes over the tiles on the tiles canvas, under the dim's cut-out, placed and smoothed exactly
  like a tile so it lines up and takes the blur and the dusk like the map. It is fetched the
  first time the sight lights up (`fileUrl`), fades in with the spotlight (or as it arrives),
  and the last few stay, up to `PICTURE_BUDGET` px (`picturesToDrop`). A sight without one, or
  whose picture fails, lights up as before.
- **Out of view, out of the spotlight.** Once the view leaves a lit building wholly behind (a
  drag, the wheel, the keys, a flight from the search or the minimap), it lets go, pinned or
  hovered (`keepInView`, checked each frame against the outline's box, `sightInView`): the map
  is never left dimmed with nothing lit on screen, and its sign goes with it.
- **The sign** (`SightSign`) is placed through a ref on every `view` event (`placeSign`: right of
  the anchor, or left where there is no room; out of the way of the map's own signs at the top,
  the search, the banner and the tools, by moving left of a column or below a sign that spans
  the screen; always whole on screen); `signContent` builds what it says. A finger's tap also
  ends any hover a mouse left behind (`tap`), and a mouse leaving the map always ends its own. The article's text carries its own `lang` (English stands in where the visitor's
  language has none). About credits Wikipedia (CC BY-SA 4.0) in the visitor's language.
- The outline is the whole building, so a lower one standing in front of it lights up where it
  overlaps: the viewer has no depth information.

### Guess the building (`hooks/use-quiz.ts`, `components/map/quiz-*.tsx`, `lib/quiz*.ts`)

In a world with `quiz: true` (New York, Dallas, Cincinnati, Pittsburgh, Philadelphia, Colorado Springs; it needs `sights`, and
Truckee's, with six Wikipedia articles among them, are too few for a game), a sign under
"more cities and worlds" (`QuizBanner`, class `quiz-invite`) opens the game once the buildings are in. The card
first asks what to play (`choosing`): a difficulty (easy, medium, hard), a borough or all
(the areas the questions have, most first; the row is named by the world's `borough` word) and
a kind or all (buildings, museums, landmarks, stations), and says how many buildings that makes
("Only N" from 10 down). A chip that would leave none is struck out (`chipCounts`); a choice
emptied by another change lets go of the kind, then the borough (`fixChoice`). The choice is
remembered (`<world>.quiz.choice`; easy, all, all the first time). A game is every matching
building once, in a random order, those played before last (`gameOrder`): a building is lit,
its Wikipedia opening shown with the name blanked, the visitor picks its name out of four, and
sees how everyone else answered on that difficulty. The header shows the choice and "round r
of N · k right", with a gear back to choosing; after the last building the card says how many
were right (`finished`) and offers Play again, Change and Stop. Stop, the close button or Esc
end it with the map where it was.

- **Data.** `quiz.<locale>.json` (`loadQuiz`, `parseQuiz` in `map/quiz.ts`) is fetched when the
  game opens, and again per language; nothing of the game loads before. A question carries its
  `level` (cumulative: easy's are also medium's and hard's), `group`, `area` and its wrong
  answers per difficulty and scope (`sets`); a round takes `setFor(question, choice)`: the set
  for the game's difficulty and how the choice narrows it (`area`, `group`, `both`), else that
  difficulty's `all`, else `decoys` (an older file without sets plays every difficulty with
  those). A question whose building or any wrong name is not in `sights.json` is never asked.
- **The round** (`useQuiz`): the game's queue gives the building (the played list,
  `localStorage` `<world>.quiz.played` behind try/catch, only orders the next game), `choicesFor`
  shuffles the four names, and the engine holds the building lit
  (`engine.holdSight(id)`: the spotlight of a pinned sight, no other lights up, Esc and the view
  moving do not let it go; `hold` in `sight-state.ts`) and flies to it (`roundView`: the
  building in the part of the screen the card leaves free, landing on scale 1 when near). Its
  name sign stays hidden until the answer; then it goes up as a plain name (`SightSign`, not
  pinned). The visitor can pan, zoom and search meanwhile.
- **The card** (`QuizCard`, class `quiz-card`, a labelled group like the pinned sign): on the
  right from 56rem, left of the tools; below that a sheet at the foot of the screen (between
  640 and 896 px a card on the right would cover the search), and the flight frames the
  building above it. Blanks are bars
  of one width (a name's length gives nothing away), with "From Wikipedia, with the name
  hidden" under the text (CC BY-SA: it is changed), "From Wikipedia" once it is whole. The question follows the building's type
  (`questionKind`: station, bridge, museum, else building). After the pick: the verdict, the
  text whole with the name lit, the right name in the accent and the visitor's marked, and once
  the API answers, each name's share and how many have answered, counted over the four names
  shown (`tallyShares`); "Next building", "Stop" and the article's link.
- **Keys** (`quizKey` in `lib/quiz.ts`, taken in `map-app.tsx` before the map's own): A–D or
  1–4 pick, Enter or N go on (Enter only when no button or link has the focus: Stop, the close
  button and the article's link keep theirs), Enter starts from the choosing step and plays
  again at the end (the same rule), Esc stops; a key held down repeats nothing. Outside a
  round (choosing, the end) the map's buildings light up under the pointer as usual.
- **The answer** goes out with plain `fetch` (`sendAnswer` in `lib/quiz-api.ts`: the visit from
  `currentVisit()`, so admins and programs are not counted, the four names offered, which are
  all the API counts, and the game's `level`, which the API tallies apart), never Apollo. No API, an error or
  no answer within 5 s is no tally: the round ends without the shares (`quizReducer` keeps a
  tally only for the building it was asked for). Analytics hook: `quiz_start`.
- **Small rules.** The questions' file is given 10 s (`AbortSignal.timeout`), then the card says
  there is nothing to play. Play again right after a language change uses the questions the
  game started with (`questionsToPlay`). The last round's button reads "See your score"
  (`isLastRound`). "You're the first" is said only of the visitor's own counted answer
  (`peopleNote`: an admin's browser is not counted). A polite live region tells a screen
  reader the verdict, then the score (`liveLine`).

## Design

Every panel is a black enamel "sign" (`sign` utility) with paper-white lettering and the world's
accent (the `taxi` token: taxi yellow in New York) for whatever is on; buttons are round `bullet`s. Signs are dark in **both** themes, so shadcn's
`dark:` variant is always on (see the `@custom-variant` at the top of `globals.css`). The theme
setting (Auto / Day / Dusk) only changes the fog behind the map and tints the map: it is the
`dusk` class on `<html>`, set before paint by the script in `layout.tsx` and kept in sync by
`useTheme`. Fonts: Archivo (UI) and Tiny5 (the wordmark), via `next/font/google`.

Tokens live in `:root` in `globals.css` (`--fog`, `--sign`, `--paper`, `--taxi`, …) and are
exposed to Tailwind as `bg-sign`, `text-paper-dim`, `bg-taxi`, etc.

## Conventions and gotchas

- Named exports, `@/` imports, no browser-native modals (shadcn `Dialog`), settings in
  localStorage always behind try/catch.
- Change the address bar only through `writeHash()` / `replaceUrl()` (`map/hash.ts`).
- Before `next build`, move `public/data` away by **absolute** path and move it back the same
  way (a cleanup that relies on the working directory will leave it stranded).
- State that changes every frame is written to the DOM through a ref (see `credit-strip.tsx`),
  not through React state.
- Write `backdrop-filter` **without** the `-webkit-` twin: the CSS pipeline adds the prefix, and
  when both are written it keeps only the prefixed one (Chrome then shows no blur).
- A Radix tooltip and popover on the same button both set `data-state`; style open buttons with
  `aria-expanded` / `aria-pressed` instead.
- Keyboard shortcuts are in `map-app.tsx` and are ignored while typing or while a dialog or the
  settings panel is open.
