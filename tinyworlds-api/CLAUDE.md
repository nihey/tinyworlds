# tinyworlds-api

NestJS 12 + GraphQL (code-first, Apollo) + Prisma 7 + PostgreSQL. Donations fund new cities: each
city is built once the donations naming it reach a goal (US$100). This API starts a donation at
Stripe, records the ones Stripe says were paid, and serves every city's progress to the viewer.
It also keeps the **donation funnel** (which steps towards a donation each visit reached, and
so how many visits each world had) and shows it to **admins**, who sign in through a link sent
by email. Visitors have no accounts: what they call is public. ESM throughout (`.js` in import
paths).

## Commands

```bash
docker compose up -d      # local Postgres 17 on port 5434 (this folder's docker-compose.yml)
cp .env.example .env      # placeholders are enough to run locally
npm install               # postinstall generates the Prisma client into src/generated/
npm run db:migrate        # prisma migrate dev
npm run seed              # the starting cities (safe to repeat)
npm run start:dev         # http://localhost:4000/api/graphql (GraphiQL outside production)
npm run lint              # eslint (+ prettier); lint:fix to fix
npm run typecheck
npm test                  # unit tests: no database, no network
npm run test:e2e          # boots the app on database tinyworlds_test (needs the compose Postgres)
                          # E2E_DATABASE_URL=postgresql://… npm run test:e2e   # on another database
npm run webhook:send -- --amount 40 --city "São Paulo"   # a signed webhook, without Stripe
npm run funnel:import < funnel.ndjson   # funnel steps from somewhere else (history; safe to repeat)
```

## Structure

```
src/
├── main.ts http.ts app.module.ts   # global prefix /api, CORS, trust proxy, raw body
├── config/env.ts                   # zod: the environment is validated at startup
├── prisma/                         # PrismaService (pg driver adapter)
├── health/                         # { health }
├── common/                         # rate limit module, GraphQL throttler guard, enum registration
├── auth/
│   ├── auth.service.ts             # sendLink, verify, adminOf: sign-in by emailed link
│   ├── auth.controller.ts dto/     # POST /api/auth/magic-link, /api/auth/verify (REST)
│   ├── jwt.strategy.ts jwt-auth.guard.ts   # the global guard: private unless @Public()
│   ├── public.decorator.ts current-admin.decorator.ts session-secret.ts
│   ├── mailer.ts sign-in-mail.ts   # SMTP (nodemailer), or the log in development; the mail's words
│   └── admin.resolver.ts models/   # { me }
├── funnel/
│   ├── funnel.service.ts           # track (a step), report (the funnel over a period)
│   ├── funnel-report.ts            # pure: days of a period in a time zone, rows → report
│   └── funnel.resolver.ts dto/ models/
├── cities/
│   ├── city-name.ts                # cleanCityName, citySlug: what makes two spellings one city
│   ├── cities.service.ts           # the public list and its order
│   └── cities.resolver.ts models/
└── donations/
    ├── donations.service.ts        # createCheckout, handleWebhook, record
    ├── donation-facts.ts           # a Checkout session → what it says about a donation
    ├── return-url.ts               # where a checkout may send the donor back to
    ├── locales.ts                  # en-US / pt-BR / es-ES → Stripe locale, price, wording
    ├── stripe.provider.ts          # the Stripe client: 4.5 s timeout, no retry (tests replace it)
    ├── donations.resolver.ts dto/ models/
    └── stripe-webhook.controller.ts
prisma/     schema.prisma, migrations/, seed.ts (the script), seed-cities.ts (what it does), seed-data.ts,
            import-funnel.ts (the script), funnel-rows.ts (what a line of its input is)
test/       fake-prisma.ts, fake-stripe.ts, fake-mailer.ts, app.e2e-spec.ts, global-setup.ts
scripts/    send-webhook.mjs, rybbit-funnel.sql
```

## Contract

Everything is under `/api`, so the site and the API can share a host. GraphQL at
`POST /api/graphql`; REST for three routes only: `POST /api/stripe/webhook` (Stripe needs the
raw body) and signing in, `POST /api/auth/magic-link` and `POST /api/auth/verify`. `schema.gql`
is the generated record of the schema.

```graphql
enum CityStatus { PROPOSED FUNDED BUILDING BUILT }
type CityMilestone { id: ID!  slug: String!  name: String!  raisedCents: Int!  goalCents: Int!  donations: Int!  status: CityStatus!  worldId: String }
input CreateDonationCheckoutInput { amountCents: Int  city: String  benefactorName: String  world: String!  locale: String!  returnUrl: String!  visitId: ID }
type DonationCheckout { url: String! }

enum FunnelStep { VISIT DONATE_OPENED CHECKOUT_STARTED CHECKOUT_CANCELLED }
input TrackFunnelStepInput { visitId: ID!  step: FunnelStep!  world: String!  locale: String }

# admins only
type Admin { id: ID!  email: String! }
input DonationFunnelInput { from: DateTime!  to: DateTime!  timeZone: String }
type FunnelCounts { visits: Int!  donateOpened: Int!  checkoutStarted: Int!  checkoutCancelled: Int!  donations: Int!  raisedCents: Int! }
type FunnelWorld { world: String  …the same counts }      # null: donations that name no world
type FunnelDay { day: String!  …the same counts }         # "2026-11-10"
type FunnelDonation { id: ID!  createdAt: DateTime!  amountCents: Int!  currency: String!  city: String  world: String  locale: String }
type DonationFunnel { from: DateTime!  to: DateTime!  timeZone: String!  totals: FunnelCounts!  worlds: [FunnelWorld!]!  days: [FunnelDay!]!  recentDonations: [FunnelDonation!]! }

type Query {
  health: String!  cityMilestones: [CityMilestone!]!                    # public
  me: Admin!  donationFunnel(input: DonationFunnelInput!): DonationFunnel!   # admins
}
type Mutation {
  createDonationCheckout(input: CreateDonationCheckoutInput!): DonationCheckout!   # public
  trackFunnelStep(input: TrackFunnelStepInput!): Boolean!                          # public
}
```

**Private unless marked.** `JwtAuthGuard` is global (`AuthModule`): every resolver and route
needs an admin's session in `Authorization: Bearer …` unless it carries `@Public()`. A new
operation is therefore closed until someone opens it; without a session the answer is
`UNAUTHENTICATED`.

- `cityMilestones`: hidden cities left out; cities still to be built first (most raised first,
  ties by name), built ones last.
- `createDonationCheckout`: `city` is free text up to 60 characters (an existing name or a new
  one; omit for none), `world` matches `/^[a-z0-9]{3,20}$/`, `locale` is `en-US | pt-BR | es-ES`,
  `returnUrl` is a page on one of `ALLOWED_ORIGINS` with no query or hash, `visitId` (optional)
  is the visit it was started from (see the funnel below). It opens a Stripe
  Checkout (`mode: payment`, `submit_type: donate`) and answers its URL. Stripe sends the donor
  back to `returnUrl?donated=1`, or `?donated=0` on cancel. Limited to 10 a minute per address.
  A Stripe failure is a 503 (`SERVICE_UNAVAILABLE`), which the site answers by falling back to
  its static payment link.
- **The amount.** `amountCents` is optional: US cents, a whole number from 100 to 1000000
  (US$1 to US$10,000; outside that is `BAD_REQUEST` with the reason, and a fraction is refused
  by GraphQL's `Int` as `BAD_USER_INPUT`, HTTP 400). With it, the donor chose the amount on the
  site: the line item is a one-off `price_data` of that amount in `usd` on the **product** of
  that language's price, so the checkout page still names the donation in the donor's language,
  and `amount_cents` goes into the metadata. The product id is asked from Stripe once per
  language (`prices.retrieve`) and kept in memory; a failed lookup is a 503 and is asked again
  next time. Without `amountCents` the line item is the pay-what-you-want price itself and the
  amount is chosen on Stripe's page (what older builds of the site send). Either way the
  webhook records what Stripe says was paid (`amount_total`), never what was asked for.
- Webhook: the signature is verified against `STRIPE_WEBHOOK_SECRET` (400 otherwise). Only
  `checkout.session.completed` and `checkout.session.async_payment_succeeded` with
  `payment_status = paid` **and** `metadata.app = "tinyworlds"` are acted on; everything else is
  answered 200 and ignored, because the Stripe account is shared with other products.

## Admins and signing in (`auth/`)

There are no passwords. **Who is an admin is `ADMIN_EMAILS`**, a list in the environment (so no
address is in the repository, and taking one off the list ends its sessions at once: the JWT
strategy asks on every request). An `admins` row is made the first time an address on the list
asks for a link; it is the account (its id is the session's subject, `last_login_at` its last
sign-in).

1. `POST /api/auth/magic-link { email, returnUrl, locale? }` → `202 { sent: true }`, whoever
   asks. For an admin's address it mails a link to `returnUrl#token=…`; `returnUrl` must be a
   plain page of `ALLOWED_ORIGINS` (the site's `/admin/`). The mail goes out after the answer
   (`setImmediate`), so neither the answer nor its timing tells an admin's address from any
   other. One link a minute per admin (`LINK_EVERY_MS`), five requests a minute per address.
2. The token is 32 random bytes; only its SHA-256 is stored (`magic_links`), it is good for
   15 minutes (`LINK_MINUTES`) and **once**: it is spent in a single `UPDATE … WHERE used_at
   IS NULL`, so two openings cannot both sign in. It travels in the URL's hash, which reaches
   neither a web server's log nor the page analytics.
3. `POST /api/auth/verify { token }` → `{ accessToken, expiresAt, admin { id, email } }`, or
   401. The session is a JWT (HS256, `JWT_SECRET`, 7 days: `SESSION_DAYS`) that the site keeps
   in local storage.

The mail is sent through SMTP (`SMTP_*`, `MAIL_FROM`; nodemailer), in the language the admin
asked in (`sign-in-mail.ts`). With no mail server configured the message is written to the log
instead, which is how signing in works in development; in production that never happens (a
link is a key), and the environment check refuses to start with an admin and no mail server.
With `ADMIN_EMAILS` empty nobody can sign in and none of the settings are needed: sessions are
then signed with a secret made up at start, so no token can be valid.

To let someone in: add their address to `ADMIN_EMAILS` and restart. To see who has signed in:
`SELECT email, last_login_at FROM admins;`.

## The donation funnel (`funnel/`)

Which steps towards a donation each **visit** reached. A visit is one browser tab's stay on the
site, named by a UUID the page makes up and keeps in the tab's session storage: no cookie, no
IP address, no user agent, nothing kept between visits. `funnel_events` holds one row per
visit, step and **world** (`"tinynyc"`, or `"home"` for the front page), unique on those three:
saying a step twice changes nothing.

| Step | Who says it |
| --- | --- |
| `VISIT` | the site, when a page opens (`trackFunnelStep`) |
| `DONATE_OPENED` | the site, when the donate sign opens |
| `CHECKOUT_STARTED` | this API, in `createDonationCheckout` once Stripe has answered a page (with the city and the amount); the site only for the plain payment link |
| `CHECKOUT_CANCELLED` | the site, when Stripe sends the donor back with `?donated=0` |
| paid | not an event: the `donations` row the webhook writes. The checkout's `visitId` travels in the Stripe metadata (`visit_id`) and lands in `donations.visit_id` |

- `trackFunnelStep` is public and limited to 60 a minute per address. A funnel step never
  stands in a donor's way: a failure to record one in `createDonationCheckout` is logged and
  the checkout answered all the same.
- `donationFunnel` (admins) counts a period of at most 366 days: `totals` (a visit counts once
  on the site, however many worlds it saw: `COUNT(DISTINCT visit_id)`), `worlds` (by world, the
  most visited first; this is the ranking of cities by visits), `days` (every day of the
  period, as days fall in `timeZone`) and the latest 25 donations. Donations are counted by
  when they were paid, so `donations` can exceed `checkoutStarted` (a gift through the plain
  payment link starts no checkout here, and names no world: `world: null`).
- The counting is raw SQL (`$queryRaw`, parameters only); `funnel-report.ts` is the pure part.
  The columns are timestamps without a zone, in UTC: the ends of the period are passed as text
  and cast, so the session's time zone never matters.

### History from the page analytics

`npm run funnel:import < file.ndjson` (`prisma/import-funnel.ts`) brings steps in from
elsewhere: one JSON object per line (`visitId`, `step`, `world`, `at` in Unix seconds, and
optionally `locale`, `city`, `amountCents`; see `funnel-rows.ts`). It keeps each visit's step
once, so it is safe to run again. `scripts/rybbit-funnel.sql` makes such a file from a Rybbit
ClickHouse database (page views → `VISIT` by the path's first segment, the site's
`donate_open` / `donate_checkout` events → the next two steps, the visit id derived from the
session id): give it the site id and the moment the site started reporting its own steps
(`--param_until`), so nothing is counted twice. In the container:
`docker exec -i <container> npm run funnel:import < funnel.ndjson`.

## How a donation is recorded (`donations.service.ts`)

Sessions come from two places, and `donation-facts.ts` reads both: the API's own sessions carry
`city`, `world` and `locale` in their metadata; the static payment links the site falls back to
carry the city in a custom field with key `city`, the world as `client_reference_id`, and
`metadata.lang` (`en | pt | es`).

In **one transaction**: skip if the Stripe session id is already there (a replayed event changes
nothing); find the city by slug or create it (`name` as first typed, `goal_cents` from
`CITY_GOAL_CENTS`); insert the donation; add to the city's `raised_cents` and `donation_count`;
turn `PROPOSED` into `FUNDED` when `raised_cents >= goal_cents`. Only `usd` donations move the
bar (the goal is in dollars): others are stored and not counted. A lost race (the same event
twice at once, or two donors naming the same new city at once) surfaces as a unique violation
and is retried. `BUILDING` and `BUILT` are never set by the webhook.

`raised_cents` and `donation_count` are stored, not summed on read; they only change in that
transaction. To audit them:

```sql
SELECT c.slug, c.raised_cents, coalesce(sum(d.amount_cents) FILTER (WHERE d.currency = 'usd'), 0) AS from_donations
FROM cities c LEFT JOIN donations d ON d.city_id = c.id GROUP BY c.id;
```

## Running the list by hand

The admin pages only read (the funnel). Changes to a city are SQL (or `npx prisma studio`):

```sql
UPDATE cities SET status = 'BUILDING' WHERE slug = 'sao-paulo';                     -- work has started
UPDATE cities SET status = 'BUILT', world_id = 'tinysp' WHERE slug = 'sao-paulo';   -- it is on the map: the site links to /tinysp/
UPDATE cities SET hidden = true WHERE slug = 'not-a-city';                          -- a name that should not be shown
UPDATE cities SET name = 'São Paulo' WHERE slug = 'sao-paulo';                      -- fix the spelling the first donor used
```

A donor names a city by paying for it, so a new name appears on the site as soon as its first
donation is paid; `hidden` is the way to take one down. Merging two cities means moving the
donations (`UPDATE donations SET city_id = …`) and adding up the two counters by hand.

`prisma/seed.ts` (`npm run seed`) upserts the starting cities by slug (`seed-cities.ts`): the
built ones (New York, Ribeirão Preto, Orlando; re-asserted as `BUILT` with their `world_id`) and
six suggestions at zero. It never touches a city's name, goal or what it has raised, and never
changes a suggestion that is already there. A built city that donors had already put on the list
as a proposal is therefore promoted in place: it becomes `BUILT` with its world and keeps every
cent and donation. So **adding a world** on this side is one line in `seed-data.ts` and a run of
the seed.

## Environment

Validated at startup (`config/env.ts`); the server does not start with anything missing.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL |
| `STRIPE_SECRET_KEY` | required | creates Checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | required | verifies the webhook's signature |
| `STRIPE_PRICE_EN`, `STRIPE_PRICE_PT`, `STRIPE_PRICE_ES` | required | pay-what-you-want prices (minimum US$1), one per interface language |
| `CITY_GOAL_CENTS` | `10000` | what a new city needs, in US cents; stored on the city when it is created |
| `ALLOWED_ORIGINS` | required | comma-separated origins of the site: the CORS allow-list, where a checkout may return to and where a sign-in link may lead |
| `ADMIN_EMAILS` | empty | comma-separated addresses that may sign in to the admin pages; empty = nobody |
| `JWT_SECRET` | required with an admin | signs the sessions; at least 32 characters |
| `SMTP_HOST`, `MAIL_FROM` | required in production with an admin | the mail server that sends the sign-in links, and the address they come from |
| `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | `587`, none, none | 465 means TLS from the start, anything else STARTTLS |
| `PORT` | `4000` | |
| `NODE_ENV` | `development` | GraphiQL and introspection are off in `production` |

Secrets live in the host's environment, never in the repository. `.env` is gitignored; only
`.env.example` (placeholders) is committed.

## Docker

`Dockerfile` is a two-stage build on `node:22-bookworm-slim`. The container runs as the `node`
user and starts with `npx prisma migrate deploy && node dist/main.js` (single replica: the
migrations run before the server). `npm run seed` works inside the image
(`docker exec <container> npm run seed`). The image has a `HEALTHCHECK` that asks `{ health }`.
In production the schema is kept in memory (the user cannot write `schema.gql`).

## Testing

- Unit tests (`src/**/*.spec.ts`) build the service by hand over `test/fake-prisma.ts` (a few
  arrays with unique columns and rollback), `test/fake-mailer.ts` (keeps the mail, and reads the
  token out of a sign-in link) and `test/fake-stripe.ts` (records the sessions asked
  for and the prices looked up; `price_en` belongs to `prod_en`). Webhook deliveries are
  signed for real with `stripe.webhooks.generateTestHeaderString` and a placeholder secret, so
  the signature check is the real one. No test talks to Stripe.
- `npm run test:e2e` boots the whole app with the fake Stripe on its own database
  (`tinyworlds_test`, created on the compose Postgres if missing), and goes through HTTP: the
  global prefix, validation, the raw-body webhook, throttling by forwarded address, CORS,
  signing in through a mailed link (the mail is kept by the fake mailer) and the funnel's SQL
  on a real database. The admin signs in once for the whole file (one link a minute), so
  `admins` is not emptied between tests. The
  checkout limit is per address and the tests share a minute: a test that starts several
  checkouts sets its own `x-forwarded-for`.
- By hand, without Stripe: `npm run webhook:send` posts a signed `checkout.session.completed` to
  the local API using `STRIPE_WEBHOOK_SECRET` from `.env`. `--id` fixes the session id (send it
  twice to see a replay change nothing), `--link` shapes it like a payment link's session,
  `--currency brl`, `--status unpaid` and `--app other` show what is ignored.
- Trying the mutation by hand needs a real Stripe test key and price ids in `.env`: with the
  placeholders Stripe refuses the call and the API answers 503.
