# tinyworlds-api

NestJS 12 + GraphQL (code-first, Apollo) + Prisma 7 + PostgreSQL. Donations fund new cities: each
city is built once the donations naming it reach a goal (US$100). This API starts a donation at
Stripe, records the ones Stripe says were paid, and serves every city's progress to the viewer.
There is no auth: every operation is public. ESM throughout (`.js` in import paths).

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
npm run webhook:send -- --amount 40 --city "São Paulo"   # a signed webhook, without Stripe
```

## Structure

```
src/
├── main.ts http.ts app.module.ts   # global prefix /api, CORS, trust proxy, raw body
├── config/env.ts                   # zod: the environment is validated at startup
├── prisma/                         # PrismaService (pg driver adapter)
├── health/                         # { health }
├── common/                         # rate limit module, GraphQL throttler guard, enum registration
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
prisma/     schema.prisma, migrations/, seed.ts (the script), seed-cities.ts (what it does), seed-data.ts
test/       fake-prisma.ts, fake-stripe.ts, app.e2e-spec.ts, global-setup.ts
scripts/    send-webhook.mjs
```

## Contract

Everything is under `/api`, so the site and the API can share a host. GraphQL at
`POST /api/graphql`; one REST route, `POST /api/stripe/webhook` (the exception GraphQL-only
allows: Stripe needs the raw body). `schema.gql` is the generated record of the schema.

```graphql
enum CityStatus { PROPOSED FUNDED BUILDING BUILT }
type CityMilestone { id: ID!  slug: String!  name: String!  raisedCents: Int!  goalCents: Int!  donations: Int!  status: CityStatus!  worldId: String }
type Query { health: String!  cityMilestones: [CityMilestone!]! }
input CreateDonationCheckoutInput { amountCents: Int  city: String  world: String!  locale: String!  returnUrl: String! }
type DonationCheckout { url: String! }
type Mutation { createDonationCheckout(input: CreateDonationCheckoutInput!): DonationCheckout! }
```

- `cityMilestones`: hidden cities left out; cities still to be built first (most raised first,
  ties by name), built ones last.
- `createDonationCheckout`: `city` is free text up to 60 characters (an existing name or a new
  one; omit for none), `world` matches `/^[a-z0-9]{3,20}$/`, `locale` is `en-US | pt-BR | es-ES`,
  `returnUrl` is a page on one of `ALLOWED_ORIGINS` with no query or hash. It opens a Stripe
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

There is no admin API. Changes to a city are SQL (or `npx prisma studio`):

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
| `ALLOWED_ORIGINS` | required | comma-separated origins of the site: the CORS allow-list and where a checkout may return to |
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

- Unit tests (`src/**/*.spec.ts`) build the service by hand over `test/fake-prisma.ts` (two
  arrays with unique columns and rollback) and `test/fake-stripe.ts` (records the sessions asked
  for and the prices looked up; `price_en` belongs to `prod_en`). Webhook deliveries are
  signed for real with `stripe.webhooks.generateTestHeaderString` and a placeholder secret, so
  the signature check is the real one. No test talks to Stripe.
- `npm run test:e2e` boots the whole app with the fake Stripe on its own database
  (`tinyworlds_test`, created on the compose Postgres if missing), and goes through HTTP: the
  global prefix, validation, the raw-body webhook, throttling by forwarded address, CORS. The
  checkout limit is per address and the tests share a minute: a test that starts several
  checkouts sets its own `x-forwarded-for`.
- By hand, without Stripe: `npm run webhook:send` posts a signed `checkout.session.completed` to
  the local API using `STRIPE_WEBHOOK_SECRET` from `.env`. `--id` fixes the session id (send it
  twice to see a replay change nothing), `--link` shapes it like a payment link's session,
  `--currency brl`, `--status unpaid` and `--app other` show what is ignored.
- Trying the mutation by hand needs a real Stripe test key and price ids in `.env`: with the
  placeholders Stripe refuses the call and the API answers 503.
