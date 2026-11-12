# tinyworlds

Whole cities, pocket-sized: each one drawn as an isometric pixel-art map you can pan, zoom and
search, every building at its height.

| tinynyc · New York | tinyrao · Ribeirão Preto | tinyorl · Orlando |
| --- | --- | --- |
| ![Central Park and the blocks around it](tinyworlds-frontend/public/og/tinynyc.jpg) | ![Downtown Ribeirão Preto](tinyworlds-frontend/public/og/tinyrao.jpg) | ![Downtown Orlando and Lake Eola](tinyworlds-frontend/public/og/tinyorl.jpg) |

| tinyfte · El Calafate | tinyvlc · Valencia | tinylas · Las Vegas |
| --- | --- | --- |
| ![El Calafate on Lago Argentino](tinyworlds-frontend/public/og/tinyfte.jpg) | ![The City of Arts and Sciences](tinyworlds-frontend/public/og/tinyvlc.jpg) | ![The Las Vegas Strip](tinyworlds-frontend/public/og/tinylas.jpg) |

| tinylax · Los Angeles | tinydal · Dallas | tinycvg · Cincinnati |
| --- | --- | --- |
| ![Downtown Los Angeles](tinyworlds-frontend/public/og/tinylax.jpg) | ![Downtown Dallas and Reunion Tower](tinyworlds-frontend/public/og/tinydal.jpg) | ![Downtown Cincinnati over the Ohio](tinyworlds-frontend/public/og/tinycvg.jpg) |

| tinypit · Pittsburgh | tinyphl · Philadelphia | tinycos · Colorado Springs |
| --- | --- | --- |
| ![Downtown Pittsburgh and its rivers](tinyworlds-frontend/public/og/tinypit.jpg) | ![Center City Philadelphia](tinyworlds-frontend/public/og/tinyphl.jpg) | ![Downtown Colorado Springs](tinyworlds-frontend/public/og/tinycos.jpg) |

| tinytkf · Truckee | tinywinterfell | tinykingslanding |
| --- | --- | --- |
| ![Downtown Truckee, the railroad and the river](tinyworlds-frontend/public/og/tinytkf.jpg) | ![Winterfell](tinyworlds-frontend/public/og/tinywinterfell.jpg) | ![King's Landing](tinyworlds-frontend/public/og/tinykingslanding.jpg) |

| tinywesteros |
| --- |
| ![Westeros and Essos](tinyworlds-frontend/public/og/tinywesteros.jpg) |

Nothing is drawn by hand and no image model is involved. The maps are rendered procedurally from
open data by a software rasterizer written for the purpose: building footprints and heights,
streets, parks, water and trees go in; a pyramid of pixel-art tiles comes out. A full city takes
a few minutes to render on a desktop machine.

- **tinynyc**: all five boroughs, 1.37 million buildings at their surveyed heights, the 2015
  street-tree census, bridges with raised decks and cables, ferries on their real routes.
- **tinyrao**: Ribeirão Preto (São Paulo, Brazil). Almost no building there has a mapped height,
  so heights are read from a satellite-derived raster and calibrated against the buildings whose
  floors are mapped; around the city, the cane fields.
- **tinyorl**: Orlando, Florida: everything built up from Walt Disney World to Winter Park, with
  downtown and Lake Eola, the lakes, the airport and the resorts.
- **tinyfte**: El Calafate, Patagonia: the town on the shore of Lago Argentino, Laguna Nimez and
  the steppe around it.
- **tinyvlc**: Valencia, Spain: the old town, the Turia gardens, the City of Arts and Sciences,
  the port and the beaches, with the city's street trees one by one.
- **tinylas**: Las Vegas: the Strip and its resorts, downtown, the airport and the desert valley.
- **tinylax**: Los Angeles: the basin from Santa Monica and Venice to Boyle Heights, downtown's
  towers, Hollywood with its sign, Griffith Park, the stadiums and LAX, 960,000 buildings at
  their surveyed heights.
- **tinydal**: Dallas: downtown's towers and Reunion Tower, Dealey Plaza, the Arts District,
  Deep Ellum and Fair Park, the Trinity's floodway under the Margaret Hunt Hill Bridge's arch,
  Uptown, the Park Cities and Love Field.
- **tinycvg**: Cincinnati: downtown and Over-the-Rhine in the basin, the riverfront's stadiums,
  the Roebling Suspension Bridge and the other bridges over the Ohio, Union Terminal, the hills
  of Mount Adams and Clifton, and Covington and Newport across the river.
- **tinypit**: Pittsburgh: the Golden Triangle and Point State Park, where the Allegheny and the
  Monongahela make the Ohio, the bridges over all three rivers, the North Shore's ballpark and
  stadium, the Strip District, the South Side under Mount Washington and its inclines, and
  Oakland with the Cathedral of Learning.
- **tinyphl**: Philadelphia: Center City between the Delaware and the Schuylkill, City Hall and
  its towers, Independence Hall and Old City, the Parkway up to the Art Museum, Boathouse Row,
  University City, and South Philadelphia's rowhouses down to the stadiums, with the Ben Franklin
  Bridge over the Delaware.
- **tinycos**: Colorado Springs: downtown on General Palmer's grid and the Olympic & Paralympic
  Museum, Colorado College and the Old North End, Old Colorado City and Manitou Springs, the red
  sandstone of the Garden of the Gods, the Broadmoor round its lake, and the Air Force Academy
  with its Cadet Chapel.
- **tinytkf**: Truckee, California: the old railroad town's Commercial Row facing the depot
  across the tracks, the Truckee River, Donner Lake and the Pioneer Monument in Donner Memorial
  State Park, Tahoe Donner's houses in the pines, Glenshire, and the airport in Martis Valley.

New York, Dallas, Cincinnati, Pittsburgh, Philadelphia and Colorado Springs light up their famous
buildings under the pointer, with a line from Wikipedia, and play "Guess the building" with them.
Truckee lights up its own (Commercial Row's hotels, the old jail, the depot, the Pioneer
Monument), but too few of them are on Wikipedia for the game.

Three more are imagined places, generated by code with no map data at all, as a fan-made tribute:
**tinywinterfell**, **tinykingslanding** and **tinywesteros**, the whole known world from beyond
the Wall to Asshai as one toy-scale diorama (unofficial; places from *A Song of Ice and Fire*
© George R. R. Martin).

## Layout

| Path | What |
|------|------|
| `tinyworlds-pipeline/` | TypeScript CLI: downloads the data, builds the scene, renders the tiles and indexes |
| `tinyworlds-frontend/` | Next.js 16 static site: the map viewer (one build per city) and the front page |
| `tinyworlds-api/` | NestJS + GraphQL + Prisma: donations, per-city funding milestones, each world's visits, the donation funnel for admins, benefactors and the links they show, and the mails to donors |
| `tinyworlds-videos/` | HyperFrames: the front page's loops, city flyovers, the showcase film and a tour of tinywesteros, all from the real tiles and viewer |
| `deploy/` | nginx config and the deploy script (which also tells a newly built city's donors) |

## Setup

Requires Node 22+ and npm. About 1.5 GB of disk per large city for raw data, scene and tiles.

```bash
# 1. make a map (≈ 5 minutes for New York, ≈ 2.5 for Ribeirão Preto, after the downloads)
cd tinyworlds-pipeline
npm install
npm run all -- --city tinynyc     # fetch → scene → render → index, into ../tinyworlds-frontend/public/data/tinynyc

# 2. look at it
cd ../tinyworlds-frontend
npm install
NEXT_PUBLIC_WORLD=tinynyc npm run dev      # http://localhost:3000
```

The API is only needed for the donation milestones, the visits on the front page's cards and
the admin pages (the donation funnel and each city's visits, at `/admin/` of the front page):

```bash
cd tinyworlds-api
npm install
cp .env.example .env               # fill in Stripe test keys
docker compose up -d               # local Postgres
npx prisma migrate deploy && npm run seed
npm run start:dev                  # http://localhost:4000/api/graphql
```

To sign in to the admin pages locally, put an address in `ADMIN_EMAILS` and a secret in
`JWT_SECRET` (`.env`), ask for a link at `/admin/`, and copy it (or its code) from the API's
log: without a mail server that is where the mail goes. Donors sign in the same way, with an
address that has a recorded donation; their page is `/me/` of the front page ("Your cities").
In production the API always needs `JWT_SECRET`,
`SMTP_HOST` and `MAIL_FROM`, admins or not, because donors sign in too.

Donors also get two mails from the API: a thank-you once Stripe confirms their gift, and, once a
city they gave to is built, word that it is on the map (sent when `deploy/deploy.sh` deploys
the world, once per city: set `API_SERVICE` in `deploy/.env`). Their links and pictures point at
`SITE_URL` (default: the first of `ALLOWED_ORIGINS`); the pictures are the front page's own
files in `tinyworlds-frontend/public/email/`. Locally, with no mail server, the mails are written
to the API's log.

Deploying the mails the first time, in this order: the front page (`deploy/deploy.sh home`), so
`/email/*.png` are there before the first thank-you goes out; then the API (its migration counts
every city already on the map as announced, so their donors are not mailed now); then the
worlds, as usual.

Deploying the benefactors feature, in this order: check the production env (`JWT_SECRET` of at
least 32 characters, `SMTP_HOST`, `MAIL_FROM`), deploy the API, run `npm run donors:backfill` once
in the API container (it runs `node dist/benefactors/backfill-cli.js`: it gives past donations
their donors from Stripe, safe to run again), then deploy the viewers. Rolling the API back past
the `sign_in_codes` migration breaks admin sign-in (the old code inserts links without
`code_hash`): roll the database back too, or roll forward.

Benefactors' links (up to three beside a donor's name, and everyone who gave on the front page)
need nothing set: the API's migration adds their tables, and a push to main deploys the API
before the viewers, as the new queries want. The API reads each linked page itself, so its
container must be able to reach the internet (as it already does for Stripe and the mail
server); the pictures it keeps are in its database. Admins review and hide links on `/admin/`.

The hall of fame (`/hall-of-fame/`, and a page per city under it) is part of the front page's
build and needs nothing set either: it is baked from the API when the front page is built, and
the daily deploy run builds it again. Its links say `rel="dofollow"`, never `nofollow`. Telling
the donors they are in it is done by hand, once, in the API's container, after both are
deployed: `npm run hall:announce` says who would be told and sends nothing,
`npm run hall:announce -- --test-to you@example.com` sends you one to look at, and
`npm run hall:announce -- --send` mails each donor once.

The owner's own note to donors works the same way (`npm run owner:note`, then `-- --test-to`,
then `-- --send`, which also reaches whoever has given since the last run): a thank-you from
the owner, with their WhatsApp. It needs `OWNER_NAME`, `OWNER_MAIL_FROM` and `OWNER_WHATSAPP`
in the API's environment, and says so when one is missing.

Or `./dev.sh [world]` for all three in tmux.

### Environment

No secrets are needed to render or view a map. Each sub-project has a `.env.example`; the main
variables:

| Variable | Where | Default | Meaning |
|----------|-------|---------|---------|
| `TINY_CITY` / `--city` | pipeline | `tinynyc` | which city to draw |
| `OVERTURE_RELEASE` | pipeline | `2026-10-21.0` | Overture Maps release to read |
| `NEXT_PUBLIC_WORLD` | frontend | `tinynyc` | which world to build, or `home` for the front page |
| `NEXT_PUBLIC_BASE_PATH` | frontend | empty | sub-path the build is served under (`/tinynyc`) |
| `NEXT_PUBLIC_API_URL` | frontend | unset | the API's GraphQL endpoint; unset = no milestones |
| `DATABASE_URL`, `STRIPE_*` | api | — | see `tinyworlds-api/.env.example` |
| `ADMIN_EMAILS` | api | empty | who may sign in to the admin pages |
| `JWT_SECRET`, `SMTP_*`, `MAIL_FROM` | api | empty | the sessions' secret and the mail server that sends the mails (sign-in links, thank-yous, a city is built); `JWT_SECRET`, `SMTP_HOST` and `MAIL_FROM` are required in production |
| `SITE_URL` | api | first of `ALLOWED_ORIGINS` | the site's origin, for every link and picture in a mail |
| `OWNER_NAME`, `OWNER_MAIL_FROM`, `OWNER_WHATSAPP` | api | empty | the site's owner, for the note they send each donor once (`npm run owner:note`): how they sign, the address it comes from, their WhatsApp number with its country code |
| `ANNOUNCE_HOST`, `API_SERVICE` | deploy | empty | how `deploy.sh` announces a built city: an ssh target whose key may only announce, or the API's container (or Swarm service) on the server, reached with a shell |

## Adding a city

A city is one definition file in the pipeline (`src/cities/<id>.ts`: where it is, which way its
street grid runs, what counts as its limits, what its buildings look like) and one in the viewer
(`src/worlds/<id>.ts`: its name and words). See the `CLAUDE.md` in each sub-project.

Cities get built as donations reach US$30 for them, the most funded first; you can also open a
pull request with one.

## Deploy

The site is static files behind a stock nginx; the API is one container. Every push to `main`
deploys itself (GitHub Actions: the API when it changed, then every viewer); the map data, which
is not in git, goes up by hand:

```bash
cp deploy/.env.example deploy/.env    # where your server is; never committed
deploy/deploy.sh tinynyc --data       # a world's tiles and indexes, after rendering it
deploy/deploy.sh tinynyc              # build for /tinynyc, rsync the site and the tiles
deploy/deploy.sh release              # what the workflow runs: main, where the server is behind
```

See [deploy/README.md](deploy/README.md).

## Contact

Questions, ideas, a city you want to see: me@nihey.org

## Credits

Map data © OpenStreetMap contributors and the Overture Maps Foundation. New York: boundaries,
neighbourhoods and street trees from NYC Open Data. Ribeirão Preto: building heights from Google
Open Buildings 2.5D Temporal (CC BY 4.0), planning sub-sectors from IBGE (Censo 2022). Los
Angeles: cities and communities from Los Angeles County's Countywide Statistical Areas
(Enterprise GIS).

The idea of a city redrawn tile by tile as isometric pixel art comes from
[tinyrj](https://tinyrj.com/) and isometric.nyc; this is an independent, procedural take on it.

## Licence

Code: [MIT](LICENSE). The rendered tiles are produced from open data and carry its attribution
requirements (see Credits). The films' music (`tinyworlds-videos/*/assets/music/`) was composed
with ElevenLabs Music for these films and is not part of the MIT-licensed code.
