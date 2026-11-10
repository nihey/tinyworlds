# tinyworlds-frontend

The map viewer: a Next.js 16 static export that draws the tiles and indexes written by
`tinyworlds-pipeline` into `public/data/<world>/`. No auth, no server of its own at runtime.
One build is one **target**: a **world** (city) — `tinynyc`, `tinyrao`, `tinyorl`, `tinyfte`
(El Calafate), `tinyvlc` (Valencia) — or `home`, the front page that lists the worlds. The interface speaks the visitor's language (English, Brazilian
Portuguese, Spanish), decided in the browser. Donations are optional: payment links, and, when
`tinyworlds-api` is deployed, a list of cities being funded (GraphQL through Apollo Client).

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
```

### Environment (all inlined at build time)

| Variable                                                      | Default                    | Meaning                                                                                   |
| ------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_WORLD`                                           | `tinynyc`                  | the build target: a world id, or `home` for the front page; anything else fails the build |
| `NEXT_PUBLIC_BASE_PATH`                                       | empty                      | sub-path the build is served under (`/tinyrao`; empty for `home`)                         |
| `NEXT_PUBLIC_DATA_BASE`                                       | `<base path>/data/<world>` | URL prefix of the world's data folder (`/tinyrao/data`)                                   |
| `NEXT_PUBLIC_SITE_URL`                                        | unset                      | site origin, for share cards; unset = text-only card                                      |
| `NEXT_PUBLIC_ANALYTICS_SRC` / `NEXT_PUBLIC_ANALYTICS_SITE_ID` | unset                      | tracker script URL and site id; unset = no analytics                                      |
| `NEXT_PUBLIC_DONATE_URL`                                      | unset                      | payment link (hosted checkout) in English, and the fallback for the other languages       |
| `NEXT_PUBLIC_DONATE_URL_PT` / `NEXT_PUBLIC_DONATE_URL_ES`     | unset                      | the same checkout in Portuguese / Spanish                                                 |
| `NEXT_PUBLIC_API_URL`                                         | unset                      | GraphQL endpoint of `tinyworlds-api`: a URL or a same-origin path (`/api/graphql`)        |
| `NEXT_PUBLIC_HOME_URL`                                        | `/`                        | where the front page is, for the "All cities" link inside a map                           |
| `NEXT_PUBLIC_WORLDS_BASE`                                     | empty                      | what the worlds' folders hang from on the front page (`""` → `/tinynyc/`)                 |
| `NEXT_PUBLIC_CARDS_BASE`                                      | unset                      | **dev only**: take the front page's card pictures from one folder (`/og`)                 |

Production builds:

```bash
NEXT_PUBLIC_WORLD=tinyrao NEXT_PUBLIC_BASE_PATH=/tinyrao NEXT_PUBLIC_DATA_BASE=/tinyrao/data \
NEXT_PUBLIC_SITE_URL=https://example.com NEXT_PUBLIC_API_URL=/api/graphql \
NEXT_PUBLIC_DONATE_URL=https://donate.stripe.com/test_example npm run build

NEXT_PUBLIC_WORLD=home NEXT_PUBLIC_SITE_URL=https://example.com npm run build   # → the site root
```

Analytics (`src/components/analytics.tsx`) is optional and env-driven: no tracker URL or site id
lives in the source. The map rewrites the URL hash whenever a pan settles; it does so through
`writeHash()` (`src/map/hash.ts`), which calls `History.prototype.replaceState` so trackers that
wrap `history.replaceState` do not log each pan as a page view. Never call
`history.replaceState` directly for the hash.

Every data URL goes through `dataUrl()` in `src/map/data.ts`, which prefixes the data base and
appends `?v=<manifest.build>`. `public/data/` is generated and gitignored: move it out of the way
before `next build` (the export would copy every tile into `out/`); without it the page shows the
"map didn't load" dialog. `public/og/<world>.jpg` (1200×630 share cards, made by the pipeline) is
committed and must stay.

## Layout

```
src/
├── app/                 # layout (fonts, metadata, theme script, accent), globals.css, and two
│                        # pages: page.map.tsx (a world) and page.home.tsx (the front page)
├── site.ts              # what this build is (world or front page): id, name, home language,
│                        # accent, GITHUB_URL, where the worlds and their cards are
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
│   └── __tests__/
├── components/map/      # the signs: search (with the way back to the front page), tool
│                        # column, minimap, settings, about, …
├── components/donate/   # the donate sign: city picker, amount picker, live funding bar;
│                        # and the city progress bar the front page's ranking uses
├── components/home/     # the front page
├── components/ui/       # shadcn/ui
├── hooks/               # useI18n, usePrefs, useTheme, useMilestones, useDocumentLanguage, …
└── lib/                 # prefs.ts (settings, localStorage "<site>.prefs"), donate.ts (pure
                         # donation logic: links, amounts, the checkout input), city-picker.ts
                         # (pure: what the picker offers, the bar preview, the ranking),
                         # city-catalogue.ts (well-known cities to pick from), donate-api.ts
                         # (Apollo Client; imported lazily)
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
- The front page's cards are plain `<a href="/<id>/">` (another build) with the world's share
  card as picture, served from the world's own folder: `/<id>/og/<id>.jpg`. A world whose card
  is not there yet shows its wordmark on a plain plate instead.
- Inside a map, the arrow at the left of the search sign (and "All cities" in About) is a plain
  link back to the front page (`NEXT_PUBLIC_HOME_URL`).

## Words: languages and worlds

- **The language follows the visitor, at run time.** `resolveLocale` (`i18n/locale.ts`) takes the
  first of `navigator.languages` we speak, by primary subtag (`pt-PT` → `pt-BR`, `es-MX` →
  `es-ES`), else English; the settings panel can override it (`prefs.lang`, default `"auto"`).
- **`useI18n()`** (`hooks/use-i18n.ts`) gives components `{ locale, t, copy }`: `t` is the
  dictionary, `copy` the world's own words in that language. It is a `useSyncExternalStore` whose
  server snapshot is the site's **home language** (`WORLD.homeLocale`: en-US for tinynyc and
  tinyorl, pt-BR for tinyrao, es-ES for tinyfte and tinyvlc), so the static HTML hydrates cleanly
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
  `#ffa62b` for tinyvlc); the engine and the minimap read the world's value for canvas drawing. Don't write the yellow as a literal. `worlds.test.ts` checks the
  contrast of each pair.
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
  - It says, in every language: cities with the most funding are built first, and what is given
    beyond a city's goal pays for the servers and keeps the project improving.
- **The front page's ranking** (`rankCities`): the cities that reached their goal ("Funded":
  `FUNDED` and `BUILDING`) apart, then the ones still collecting, numbered, most funded first,
  ten before "show all". A row opens the donate sign with that city chosen
  (`<DonateDialog city>`).
- **The API must never block a donation.** List or checkout failing, or taking over 5 s, drops
  the sign back to the payment link (`donateMode` in `lib/donate.ts` is the whole rule), where
  the amount and the city are set on the checkout page instead.
- `lib/donate-api.ts` (Apollo Client 4, core API, no provider) is only ever imported dynamically
  (`useMilestones`, the checkout button), so Apollo is not in the bundle the map starts with.
- The heart in the tool column, the link in About and the front page's ranking all open the
  same sign. Analytics hooks are declarative: `data-rybbit-event="donate_open" |
"donate_checkout"` with `data-rybbit-prop-world` (and `-city`, `-amount`).
- Never put a real payment link, key or API host in the repository: they come from the
  environment at build time.

## The engine (`src/map/engine.ts`)

`MapEngine` is a plain class that owns two canvases and the view. React never re-renders per
frame: components call methods and subscribe with `engine.on("view" | "settle" | "hood", fn)`.
`requestAnimationFrame` only runs while something is moving, fading or animated.

- **Tiles canvas** (`.map-tiles`): the pixel-art tiles, then _scene layers_. Sits under the
  tilt-shift blur and the dusk tint.
- **Marks canvas** (`.map-marks`): neighbourhood lines, name plates, the search pin. Above the
  blur, always sharp.
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
