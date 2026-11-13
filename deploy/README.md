# Deployment

Two things run in production:

- **The site**: static files behind a stock `nginx` container. No build step on the server and
  nothing to restart: `deploy.sh` builds a viewer locally and rsyncs it, with that world's
  tiles, into a directory the container serves. The tiles are too large (≈ 0.8 GB and 30,000
  files for New York) to live in git or in an image, which is why they are copied rather than
  baked in.
- **The API** (`tinyworlds-api`): one container built from its `Dockerfile`, with a PostgreSQL
  database beside it. It serves the donation milestones and keeps the donation funnel for the
  admin pages; the maps work without it.

**A push to `main` deploys itself** (`.github/workflows/deploy.yml`, below): the API when
`tinyworlds-api/` changed, then every viewer when `tinyworlds-frontend/` or `deploy/` did. Only
the map data (tiles and indexes, which are not in git) still goes up by hand.

Where any of this is hosted is deliberately not recorded in this repository. The script reads
it from `deploy/.env` (gitignored; see `.env.example`), and GitHub Actions from the `production`
environment's secrets:

| Variable | Meaning |
|---|---|
| `DEPLOY_HOST` | ssh target of the server: the upload user (below) |
| `DEPLOY_DIR` | directory on the server that holds `site/`, `nginx.conf` and `deployed/`, as the ssh target sees it: `.` for the upload user, whose key is held to that directory |
| `DEPLOY_URL` | public origin of the site, no trailing slash; baked into the build as `NEXT_PUBLIC_SITE_URL` so share-card URLs are absolute |
| `API_URL` | where the viewer finds the API's GraphQL endpoint (`/api/graphql` when the proxy routes it on the same origin); empty = no milestones |
| `ANALYTICS_SRC`, `ANALYTICS_SITE_ID` | optional page analytics: tracker script URL and site id, baked into the build |
| `GTM_ID` | optional Google Tag Manager container id (`GTM-XXXXXXX`), baked into the build as `NEXT_PUBLIC_GTM_ID`; Google Analytics is a tag inside the container |
| `DONATE_URL`, `DONATE_URL_PT`, `DONATE_URL_ES` | optional donation links (hosted payment pages) by interface language; `DONATE_URL` is English and the fallback when the API is unreachable |
| `API_DEPLOY_WEBHOOK` | the API application's deploy webhook (Dokploy: the application's Deployments tab, "Webhook URL"): `release` redeploys the API through it |
| `SITE_DEPLOY_WEBHOOK` | the same for the site's nginx application: redeployed (a fresh container reads the config) when `nginx.conf` changed; without it the script says to reload nginx by hand |
| `ANNOUNCE_HOST` | optional: an ssh target whose key may run nothing but `deploy/announce-command.sh`, its forced command (below); after a world is deployed, its city's donors are told it is built through it. What GitHub Actions uses |
| `API_SERVICE` | optional, without `ANNOUNCE_HOST`: the API's container on `DEPLOY_HOST`, by its name or by the name of the Swarm service whose task runs it, reached with a shell (so not with the upload user); after a world is deployed, its city's donors are told it is built (see below). Neither set = no announcement |

## Server setup (once)

Any host that can run containers works.

**Site**

- run `nginx:alpine` with two read-only bind mounts:
  `$DEPLOY_DIR/site` → `/usr/share/nginx/html` and
  `$DEPLOY_DIR/nginx.conf` → `/etc/nginx/conf.d/default.conf`;
- put TLS and the domain in front of port 80 with whatever the host already uses (a reverse
  proxy such as Traefik or Caddy);
- an upload user that owns `$DEPLOY_DIR/site`, `nginx.conf` and `deployed/`, and whose keys may
  only run rsync inside that directory, with `rrsync` (shipped with rsync). In its
  `~/.ssh/authorized_keys` (owned by root), one line per key: GitHub Actions' own, and yours:

  ```
  command="/usr/bin/rrsync -no-lock /srv/tinyworlds",restrict ssh-ed25519 AAAA… tinyworlds-ci
  ```

  `-no-lock` lets the uploads run side by side; paths are then relative to that directory
  (`DEPLOY_DIR=.`). `deploy.sh` uploads with rsync alone, so this key is all the uploads need,
  and one that leaks can do no more than replace the site's files. (Announcing a built city
  takes a key of its own, below.)

The front page is `site/index.html`; each world is a folder beside it (`site/tinynyc/`,
`site/tinyrao/`). `nginx.conf` matches worlds by pattern, so adding one needs no configuration
change. An address with nothing behind it is answered with the front page's `site/404.html`
(`error_page`, status 404), which reads the address and offers what it can; a missing tile,
index or script keeps nginx's plain 404.

**API**

- a PostgreSQL 17 database reachable only from the API;
- the image built from `tinyworlds-api/Dockerfile` (build context `tinyworlds-api`), which runs
  `prisma migrate deploy`, the seed (`npm run seed`: safe to repeat) and then the server on
  port 4000; its environment is listed in
  `tinyworlds-api/.env.example` (database URL, Stripe keys and price ids, allowed origins;
  who may sign in to the admin pages, a secret for the sessions, the mail server that sends the
  sign-in links and the donors' mails, and `SITE_URL`, the site's origin those mails link to);
- route `https://<site>/api/` to it on the same host name as the site (a path rule on the
  reverse proxy, no prefix stripping: the API serves under `/api`), so the browser needs no CORS;
- in Stripe, a webhook endpoint for `https://<site>/api/stripe/webhook` sending
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`; its signing
  secret is `STRIPE_WEBHOOK_SECRET`;
- automatic deploys enabled on the application (Dokploy: on, so its deploy webhook answers),
  and that webhook's URL kept as `API_DEPLOY_WEBHOOK`.

## On every push to main

`.github/workflows/deploy.yml` runs `deploy/deploy.sh release` on GitHub Actions for every push
to `main`, once a day (to catch up with a run that failed), and by hand from the Actions tab
(*Run workflow*, with *everything* to redeploy all of it). The daily run passes `--fresh-home`:
when nothing else is to deploy it still builds and uploads the front page, whose hall of fame
is baked in from what the API says at that moment, so a name or a link added since is in the
pages' HTML within a day (it is on the pages themselves at once: they ask the API when they
open). `release`:

1. reads which commits the server's API and viewers came from (`$DEPLOY_DIR/deployed/api`,
   `deployed/viewers`), and refuses if either is not in the commit being released (an older run
   must not put older code back);
2. if `tinyworlds-api/` changed since (Markdown aside), redeploys the API through
   `API_DEPLOY_WEBHOOK` and waits for the new one: the API's `{ uptime }` must come from a
   process started after the deploy was asked for. Its migrations and seed run as it starts;
3. if `tinyworlds-frontend/` or `deploy/` changed since, runs `deploy.sh all --no-data`, which
   checks every world against the data **on the server**, builds them all, uploads them and
   announces the newly built cities (`ANNOUNCE_HOST`, below; a warning at worst);
4. records each part's commit once it is up. A part that failed keeps its old commit, so the
   next run tries it again; the API is deployed before the viewers, which may count on it.

Runs never overlap (a newer push waits for the one running). The workflow's secrets live in the
repository's `production` environment, which only `main` may use: `DEPLOY_SSH_KEY` (the upload
user's key for GitHub), `DEPLOY_KNOWN_HOSTS` (the server's line for `~/.ssh/known_hosts`),
`DEPLOY_HOST`, and every other variable above but `DEPLOY_DIR` (`.` in the workflow) and
`API_SERVICE` (the workflow has no shell on the server: it announces through `ANNOUNCE_HOST`,
and without it says so and skips). The logs
are public: GitHub masks the secrets in them, and the workflow masks the host names inside them.

What still takes a hand: map data (`deploy/deploy.sh <world> --data` or `--index` after a
render: it is not in git), the API's environment (in the host's panel), and one-off scripts in
the API container.

## By hand

```bash
deploy/deploy.sh release             # what the workflow runs: main's API and viewers, where the server is behind
deploy/deploy.sh all --no-data       # after a frontend change: every world, then the front page
deploy/deploy.sh all --no-data --serial      # the same, one build and one upload at a time
deploy/deploy.sh all --no-data --parallel=5  # the same, 5 at a time (default 3)
deploy/deploy.sh check               # only the checks `all` starts with

deploy/deploy.sh tinynyc             # after re-rendering: site + data
deploy/deploy.sh tinyrao --no-data   # one world's code
deploy/deploy.sh tinynyc --index     # site + indexes (places, hoods, life, sights and their pictures, quiz) + manifest, not the tiles
deploy/deploy.sh tinyrao --data      # data only, no build
deploy/deploy.sh home                # the front page
```

**`all`** takes its worlds from the viewer's registry (`tinyworlds-frontend/src/worlds/index.ts`),
so a world added there is deployed with the rest, and one left out is not. Before building
anything it checks every world and lists everything missing: its map data (with `--no-data`,
the manifest, and quiz where it has one, on the server: what the code will be served beside), its share card,
its pipeline city (`tinyworlds-pipeline/src/cities/<id>.ts`), and a mention in `CLAUDE.md`'s
worlds table, `README.md` and `tinyworlds-frontend/CLAUDE.md`. A world without a front-page loop
only gets a note. Then it builds every target, and **uploads only once all of them have
built**: a failing build leaves the whole site as it was, and its log's end is printed. The
worlds go up first and the front page last, since its links lead to them. `all` also takes
`--index` and `--data` (no build: every world's data).

Every build runs in a temporary copy of the frontend beside it (`.deploy-work.*`, removed when
the script ends; `node_modules` is hard-linked, `public/data` left out), so builds can run side
by side and the generated data is never moved out of the way. A build already uses several
cores, so going wider than 3 or 4 at a time stops paying: on a 20-core machine the ten builds
took 108 s one at a time, 85 s two at a time, 74 s three at a time and 82 s four at a time.

Data files are requested with a version and cached as immutable: tiles and the minimap with
`?v=<manifest.build>`, the indexes with `?v=<manifest.indexes>` (a hash of their contents that
the pipeline's `index` and `wiki` write into the manifest). `manifest.json` is always revalidated,
and it is copied last so a new build or a new set of indexes is only announced once its files are
up. `--index` sends the manifest too, so returning visitors get the new indexes; because a
manifest also describes the tiles, it refuses (before sending anything) when the server's
manifest is from another render than the local one: deploy the data first.
A world drawn both ways carries its street-grid view in `grid/` inside its data folder: `--data`
sends it with the rest (its manifest after its tiles, the world's own manifest last), `--index`
sends its indexes first, and the checks fail a world marked `turn: "grid"` whose `grid/` view
is missing, here or (for `--no-data` and the release) on the server.
`deploy.sh` also copies `nginx.conf` (in place, because it is a single-file bind mount); when
its contents changed, it redeploys the site's container through `SITE_DEPLOY_WEBHOOK` (Dokploy
starts the new container before stopping the old one, and rolls back if it fails), or, without
it, says to reload nginx in the container (`nginx -s reload`).

**Building from the right tree.** A build from a tree that does not contain the commit the
server's viewers came from (`deployed/viewers`) is refused before anything is built: it would
put older code back (fetch and rebase first). A build from anything but an unchanged commit of
`origin/main` (a branch, uncommitted changes) still goes up, but clears `deployed/viewers`, so
the next release (the next push, or the daily run) rebuilds every viewer from `main`. `all`
from an unchanged commit of `origin/main` records that commit.

Uploads reach the server through rsync alone, and every file goes into its folder under its own
name: the upload user's `rrsync` cannot rename one on the way. The one command that runs there
is the announcement, through its own forced command.

The API is redeployed by rebuilding its image from the repository (`release` does it through
`API_DEPLOY_WEBHOOK`); its migrations and the seed run when the container starts. When a change
touches both, **deploy the API first**, then the viewers: a viewer may send a field an older API
does not know. `release` keeps that order.

**Announcing a built city.** After uploading a world (`deploy.sh <world>`, and every world of
`all`, so every `release` that deploys the viewers), the script runs the API's announce command
in its container, `node dist/benefactors/announce-cli.js <world>...`, one of two ways:

- **`ANNOUNCE_HOST`** (GitHub Actions): `ssh $ANNOUNCE_HOST <world>...`, with a key whose
  forced command is `deploy/announce-command.sh`, installed on the server as root's
  `/usr/local/bin/tinyworlds-announce`, in the `authorized_keys` of a user that may run docker:

  ```
  command="/usr/local/bin/tinyworlds-announce <api container or service>",restrict ssh-ed25519 AAAA… tinyworlds-ci
  ```

  It reads the world ids from the command asked for, refuses anything that is not one
  (`^[a-z0-9]{3,20}$`), finds the container, and runs only the announce command. The key can
  be the upload key: each user's line gives it its own forced command.
- otherwise **`API_SERVICE`**: `ssh $DEPLOY_HOST docker exec <container> …` in a shell, the
  container being the one named `API_SERVICE` (or running the service of that name); the ssh
  user needs to be able to run `docker`, so not the upload user.

It mails each donor of the world's city that the city is on the map, once per city however
often it runs:
it does nothing for a city announced before, for a world no city has, or for a city the seed has
not marked `BUILT` yet (it says so: run `npm run seed` in the container, then deploy the world
again, or run the command by hand). It prints what happened world by world, with counts, never
addresses. If not one mail went out (the mail server away, say), the city is left unannounced
and the next deploy tries again; if some went out, it counts as announced and the output says it
was partial. A mail server that is away stops the sending at its first failure. A non-zero exit
(a mail that did not go out, no such container, ssh failing) is a warning: the deploy itself is
done.
Without `ANNOUNCE_HOST` or `API_SERVICE` the step is skipped with a note. `all` announces every
world in one call. So, for a new world: deploy the API with the world in its seed (its seed
runs as it starts), then the world; `release` does both, in that order.

**The mails' first deploy**: deploy the front page (`deploy/deploy.sh home`) **before** the API,
so the pictures the mails show (`/email/*.png`, the front page's own files) are there before the
API sends its first thank-you; then the API, then the worlds.

The admin pages are part of the front page (`/admin/`), and so are the mails' pictures
(`/email/`), so `deploy/deploy.sh home` publishes them; the funnel's reporting is in every
viewer, so a change to it needs `deploy/deploy.sh all --no-data`.
