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

Where any of this is hosted is deliberately not recorded in this repository. The script reads
it from `deploy/.env` (gitignored; see `.env.example`):

| Variable | Meaning |
|---|---|
| `DEPLOY_HOST` | ssh target of the server |
| `DEPLOY_DIR` | directory on the server; holds `site/` and `nginx.conf` |
| `DEPLOY_URL` | public origin of the site, no trailing slash; baked into the build as `NEXT_PUBLIC_SITE_URL` so share-card URLs are absolute |
| `API_URL` | where the viewer finds the API's GraphQL endpoint (`/api/graphql` when the proxy routes it on the same origin); empty = no milestones |
| `ANALYTICS_SRC`, `ANALYTICS_SITE_ID` | optional page analytics: tracker script URL and site id, baked into the build |
| `DONATE_URL`, `DONATE_URL_PT`, `DONATE_URL_ES` | optional donation links (hosted payment pages) by interface language; `DONATE_URL` is English and the fallback when the API is unreachable |

## Server setup (once)

Any host that can run containers works.

**Site**

- run `nginx:alpine` with two read-only bind mounts:
  `$DEPLOY_DIR/site` → `/usr/share/nginx/html` and
  `$DEPLOY_DIR/nginx.conf` → `/etc/nginx/conf.d/default.conf`;
- put TLS and the domain in front of port 80 with whatever the host already uses (a reverse
  proxy such as Traefik or Caddy).

The front page is `site/index.html`; each world is a folder beside it (`site/tinynyc/`,
`site/tinyrao/`). `nginx.conf` matches worlds by pattern, so adding one needs no configuration
change.

**API**

- a PostgreSQL 17 database reachable only from the API;
- the image built from `tinyworlds-api/Dockerfile` (build context `tinyworlds-api`), which runs
  `prisma migrate deploy` and then the server on port 4000; its environment is listed in
  `tinyworlds-api/.env.example` (database URL, Stripe keys and price ids, allowed origins;
  and, for the admin pages, who may sign in, a secret for their sessions and the mail server
  that sends their sign-in links);
- route `https://<site>/api/` to it on the same host name as the site (a path rule on the
  reverse proxy, no prefix stripping: the API serves under `/api`), so the browser needs no CORS;
- in Stripe, a webhook endpoint for `https://<site>/api/stripe/webhook` sending
  `checkout.session.completed` and `checkout.session.async_payment_succeeded`; its signing
  secret is `STRIPE_WEBHOOK_SECRET`;
- once, after the first start: `npm run seed` in the container (the built cities and a few
  proposals).

## Updating

```bash
deploy/deploy.sh tinynyc             # after re-rendering: site + data
deploy/deploy.sh tinyrao --no-data   # after a frontend change
deploy/deploy.sh tinynyc --index     # site + places/hoods/life JSON, not the tiles
deploy/deploy.sh tinyrao --data      # data only, no build
deploy/deploy.sh home                # the front page
```

Data files are requested with `?v=<manifest.build>` and cached as immutable; `manifest.json` is
always revalidated, and it is copied last so a new build is only announced once its tiles are up.
`deploy.sh` also copies `nginx.conf` (in place, because it is a single-file bind mount); after
changing it, reload nginx in the container (`nginx -s reload`).

The API is redeployed by rebuilding its image from the repository; its migrations run when the
container starts. When a change touches both, **deploy the API first**, then the viewers: a
viewer may send a field an older API does not know.

The admin pages are part of the front page (`/admin/`), so `deploy/deploy.sh home` publishes
them; the funnel's reporting is in every viewer, so each world needs its own
`deploy/deploy.sh <world> --no-data` to start counting its visits.
