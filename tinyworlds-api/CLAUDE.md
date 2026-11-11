# tinyworlds-api

NestJS 12 + GraphQL (code-first, Apollo) + Prisma 7 + PostgreSQL. Donations fund new cities: each
city is built once the donations naming it reach a goal (US$30). This API starts a donation at
Stripe, records the ones Stripe says were paid, and serves every city's progress to the viewer.
It also keeps the **donation funnel** (which steps towards a donation each visit reached, and
so how many visits each world had) and shows it to **admins**, who sign in through a link sent
by email; each world's **visits**, and how many are there now, are public, for the front page's
cards. **Donors** sign in the same way, to see the cities they helped build; they are thanked by
mail once Stripe confirms a gift, and told by mail once a city they gave to is built. A donor
may show up to three **links** beside their name: the API reads each page once and keeps small
copies of its pictures. And it
keeps the answers of **Guess the building**, the map's quiz on its famous buildings. Other
visitors have no accounts: what they call is public. ESM throughout (`.js` in import paths).

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
npm run donors:backfill   # in the built image (node dist/benefactors/backfill-cli.js): past donations get their donors from Stripe; run once after deploying (safe to repeat: sessions without an email, or whose lookup failed, are asked again)
npm run donors:backfill:dev   # the same from a checkout, through tsx
npm run cities:announce -- tinysp [tinyrao …]   # in the built image (node dist/benefactors/announce-cli.js): mails the donors of each world's city that it is built, once (deploy/deploy.sh runs it)
npm run cities:announce:dev -- tinysp   # the same from a checkout, through tsx (without SMTP_HOST, the mails go to the log)
```

## Structure

```
src/
├── main.ts http.ts app.module.ts   # global prefix /api, CORS, trust proxy, raw body
├── config/env.ts                   # zod: the environment is validated at startup
├── prisma/                         # PrismaService (pg driver adapter)
├── health/                         # { health }, { uptime }: what a deploy waits on
├── common/                         # rate limit module, GraphQL throttler guard, enum registration
├── mail/
│   ├── mailer.ts mail.module.ts    # MAILER: SMTP (nodemailer), or the log in development; createMailer
│   ├── layout.ts                   # the mails' look: shell (band, card, footer), button, badge, stones,
│   │                               # bar, facts, impact box (a pixel number), code box
│   ├── html.ts format.ts badges.ts # escaping and {placeholders}; dollars and counts per language; badge words
├── auth/
│   ├── auth.service.ts             # sendLink, verify, verifyCode, identityOf: link or code, admins and donors
│   ├── auth.controller.ts dto/     # POST /api/auth/magic-link, /api/auth/verify (REST)
│   ├── jwt.strategy.ts jwt-auth.guard.ts   # the global guard: admins' unless @Public() / @ForDonors()
│   ├── public.decorator.ts for-donors.decorator.ts   # the marks the guard reads
│   ├── current-admin.decorator.ts current-donor.decorator.ts session-secret.ts
│   ├── sign-in-mail.ts             # the sign-in mail (code first, then the button), in three languages
│   └── admin.resolver.ts models/   # { me }
├── quiz/                           # Guess the building: quiz.service.ts (answer, tally), resolver, dto/, models/
├── funnel/
│   ├── funnel.service.ts           # track (a step), report (the funnel over a period)
│   ├── funnel-report.ts            # pure: days of a period in a time zone, rows → report
│   └── funnel.resolver.ts dto/ models/
├── visits/
│   ├── visits.service.ts           # stillHere (a map is open), ofWorlds (visits and live, cached), totalOf
│   └── visits.resolver.ts dto/ models/   # worldVisits, trackPresence: both public
├── benefactors/
│   ├── standing.ts                 # pure: a city's gifts → stones, founders, benefactors
│   ├── wall.ts                     # pure: every city's gifts → the wall (named donors once, unnamed gifts each)
│   ├── display-name.ts             # cleanDisplayName: what a listed name may be
│   ├── benefactors.service.ts      # giftsOf (gifts with names only where shown), cityBenefactors, wall
│   ├── announce.service.ts built-mail.ts   # a built city's donors told, once; the mail
│   ├── announce-cli.ts backfill-cli.ts     # the commands compiled into the image
│   └── benefactors.resolver.ts my-giving.resolver.ts dto/ models/   # the public query; the donor's own
├── links/                          # the links donors show beside their names
│   ├── link-url.ts                 # pure: cleanLinkUrl, isPublicUrl (https, a public host name, no port, no user)
│   ├── public-address.ts           # pure: isPublicAddress (nothing private, local or reserved)
│   ├── safe-fetch.ts               # the guarded GET: public addresses only, every redirect checked, size and time limits
│   ├── page-meta.ts                # pure: a page's head → title, description, picture, icons
│   ├── ico.ts link-images.ts       # an .ico's largest picture; picture and icon drawn again as small WebP (sharp)
│   ├── link-reader.ts              # LINK_READER: url → what a link's card shows (tests replace it)
│   ├── links.service.ts            # mine, add, remove, refresh; shownFor (the lists), forReview, setHidden, imageBytes
│   ├── links.resolver.ts links-admin.resolver.ts dto/ models/   # donors' own; the admins' switch
│   └── link-images.controller.ts   # GET /api/link-images/:id (REST: a page shows it with <img>)
├── cities/
│   ├── city-name.ts                # cleanCityName, citySlug: what makes two spellings one city
│   ├── cities.service.ts           # the public list and its order
│   └── cities.resolver.ts models/
└── donations/
    ├── donations.service.ts        # createCheckout, handleWebhook, record (then the thank-you)
    ├── thanks.service.ts           # the thank-you: who, and what to tell them
    ├── thanks-facts.ts thanks-mail.ts   # pure: a gift's place in its city; the mail
    ├── currency.ts                 # COUNTED_CURRENCY (usd)
    ├── donation-facts.ts           # a Checkout session → what it says about a donation
    ├── return-url.ts               # where a checkout may send the donor back to
    ├── locales.ts                  # en-US / pt-BR / es-ES → Stripe locale, price, wording
    ├── stripe.provider.ts          # the Stripe client: 4.5 s timeout, no retry (tests replace it)
    ├── donations.resolver.ts dto/ models/
    └── stripe-webhook.controller.ts
prisma/     schema.prisma, migrations/, seed.ts (the script), seed-cities.ts (what it does), seed-data.ts,
            import-funnel.ts (the script), funnel-rows.ts (what a line of its input is)
test/       fake-prisma.ts, fake-stripe.ts, fake-mailer.ts, fake-link-reader.ts, app.e2e-spec.ts, migrations.e2e-spec.ts, global-setup.ts
scripts/    send-webhook.mjs, rybbit-funnel.sql
```

## Contract

Everything is under `/api`, so the site and the API can share a host. GraphQL at
`POST /api/graphql`; REST for four routes only: `POST /api/stripe/webhook` (Stripe needs the
raw body), signing in, `POST /api/auth/magic-link` and `POST /api/auth/verify`, and
`GET /api/link-images/:id` (a link's icon or picture, for `<img>`). `schema.gql`
is the generated record of the schema.

```graphql
enum CityStatus { PROPOSED FUNDED BUILDING BUILT }
type CityMilestone { id: ID!  slug: String!  name: String!  raisedCents: Int!  goalCents: Int!  donations: Int!  status: CityStatus!  worldId: String }
input CreateDonationCheckoutInput { amountCents: Int  city: String  benefactorName: String  world: String!  locale: String!  returnUrl: String!  visitId: ID }
type DonationCheckout { url: String! }
input CityBenefactorsInput { slug: String  world: String }   # exactly one, else BAD_REQUEST
type BenefactorLink { url: String!  title: String!  description: String  icon: String  image: String }   # icon, image: /api/link-images/<id>
type FounderRow { number: Int!  name: String  amountCents: Int!  stones: Int!  firstStone: Boolean!  keystone: Boolean!  links: [BenefactorLink!]! }
type BenefactorRow { rank: Int!  name: String  amountCents: Int!  links: [BenefactorLink!]! }
type CityBenefactors { slug: String!  name: String!  status: CityStatus!  worldId: String  goalCents: Int!  raisedCents: Int!
  stones: [Int]!  founders: [FounderRow!]!  benefactors: [BenefactorRow!]! }
type WallCity { slug: String!  name: String!  worldId: String }
type WallBenefactor { name: String  amountCents: Int!  cities: [WallCity!]!  links: [BenefactorLink!]!  lastGiftAt: DateTime! }

enum FunnelStep { VISIT DONATE_OPENED CHECKOUT_STARTED CHECKOUT_CANCELLED }
input TrackFunnelStepInput { visitId: ID!  step: FunnelStep!  world: String!  locale: String }
input TrackPresenceInput { visitId: ID!  world: String!  locale: String }
input WorldVisitsInput { worlds: [String!]! }                 # 1 to 50 world ids
type WorldVisits { world: String!  visits: Int!  live: Int! }
enum QuizLevel { EASY MEDIUM HARD }
input AnswerQuizInput { visitId: ID  world: String!  sightId: String!  choice: String!  choices: [String!]  level: QuizLevel  locale: String }
type QuizPick { choice: String!  count: Int! }
type QuizTally { answers: Int!  picks: [QuizPick!]! }

# admins only
type Admin { id: ID!  email: String! }
input DonationFunnelInput { from: DateTime!  to: DateTime!  timeZone: String }
type FunnelCounts { visits: Int!  donateOpened: Int!  checkoutStarted: Int!  checkoutCancelled: Int!  donations: Int!  raisedCents: Int! }
type FunnelWorld { world: String  …the same counts }      # null: donations that name no world
type FunnelDay { day: String!  …the same counts }         # "2026-11-10"
type FunnelDonation { id: ID!  createdAt: DateTime!  amountCents: Int!  currency: String!  city: String  world: String  locale: String }
type DonationFunnel { from: DateTime!  to: DateTime!  timeZone: String!  totals: FunnelCounts!  worlds: [FunnelWorld!]!  days: [FunnelDay!]!  recentDonations: [FunnelDonation!]! }

type Query {
  health: String!  uptime: Int!  cityMilestones: [CityMilestone!]!      # public; uptime: seconds since the process started
  cityBenefactors(input: CityBenefactorsInput!): CityBenefactors        # public; null: unknown or hidden city
  benefactorWall: [WallBenefactor!]!                                    # public; everyone who gave to a city, at most 200
  worldVisits(input: WorldVisitsInput!): [WorldVisits!]!                # public; the worlds asked, in that order
  me: Admin!  donationFunnel(input: DonationFunnelInput!): DonationFunnel!   # admins
  myGiving: MyGiving!  myLinks: MyLinks!                                # donors
  benefactorNames: [BenefactorName!]!                                   # admins
}
type Mutation {
  createDonationCheckout(input: CreateDonationCheckoutInput!): DonationCheckout!   # public
  trackFunnelStep(input: TrackFunnelStepInput!): Boolean!                          # public
  trackPresence(input: TrackPresenceInput!): Boolean!                              # public
  answerQuiz(input: AnswerQuizInput!): QuizTally!                                  # public
  setListing(input: SetListingInput!): Boolean!                                    # donors
  setDisplayName(input: SetDisplayNameInput!): String!                             # donors
  addLink(input: AddLinkInput!): MyLink!                                           # donors; reads the page
  refreshLink(input: LinkIdInput!): MyLink!                                        # donors; reads it again
  removeLink(input: LinkIdInput!): Boolean!                                        # donors
  setNameHidden(input: SetNameHiddenInput!): Boolean!                              # admins
  setLinksHidden(input: SetLinksHiddenInput!): Boolean!                            # admins
}

# admins: names to review
type BenefactorName { donorId: ID!  name: String!  hidden: Boolean!  cities: [String!]!  lastGiftAt: DateTime!
  links: [BenefactorLink!]!  linksHidden: Boolean! }  # donors with a name and a listed gift, newest first, at most 100; every link, with its picture
input SetNameHiddenInput { donorId: ID!  hidden: Boolean! }   # hides the name on every list (its links with it); stones and numbers stay
input SetLinksHiddenInput { donorId: ID!  hidden: Boolean! }  # hides the links on every list; the name stays

# donors only (a donor's session; an admin's is FORBIDDEN)
type MyCity { slug: String!  name: String!  status: CityStatus!  worldId: String  goalCents: Int!  raisedCents: Int!
  givenCents: Int!  founderNumber: Int  stones: [Int!]!  firstStone: Boolean!  keystone: Boolean!  listed: Boolean! }
type MyGiving { displayName: String  cities: [MyCity!]!  projectCents: Int! }   # cities: latest gift first
input SetListingInput { city: String!  listed: Boolean! }   # city by slug; every gift of the donor's there; true needs a name
input SetDisplayNameInput { name: String! }                 # cleaned (cleanDisplayName), BAD_REQUEST if nothing is left; answers it
type MyLink { id: ID!  url: String!  title: String!  description: String  icon: String  image: String }   # image: always, when the page has one
type MyLinks { links: [MyLink!]!  max: Int!  givenCents: Int!  picturesFromCents: Int!  hidden: Boolean! }   # in the order added
input AddLinkInput { url: String! }                         # cleaned (cleanLinkUrl); BAD_REQUEST: not a public https page, not given yet, there already, or three
input LinkIdInput { id: ID! }                               # one of the donor's own links
```

**Admins' unless marked.** `JwtAuthGuard` is global (`AuthModule`): every resolver and route
needs an admin's session in `Authorization: Bearer …` unless it carries `@Public()` (anyone) or
`@ForDonors()` (a donor's session), on the method or its class, the method's mark first. A new
operation is therefore closed to all but admins until someone opens it. Without a session the
answer is `UNAUTHENTICATED`; with a session of the other kind it is `FORBIDDEN`, never an answer.
`@CurrentAdmin()` and `@CurrentDonor()` give a resolver the signed-in `{ id, email }` (and
refuse the other kind, should one ever reach them).

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

## Benefactors (`benefactors/`)

A **stone** is US$1 (`STONE_CENTS`); a city has `ceil(goal / 100)` of them. Gifts in `usd` are laid
end to end in the order given (`created_at`, then id); the stone at dollar i belongs to the gift
that pays its last cent. A gift that starts before the goal is a **founding** gift and gets the
next founding number (the one crossing the line keeps its whole amount); later gifts are
**benefactors**, ranked by what each gave. `cityStanding` (pure) does this; `cityBenefactors`
only reads the city (never a hidden one) and its gifts.

Three guards on grouping: only a named gift joins others (an unnamed gift is always its own row);
a donor's founding gifts share their first row; a named founder is not listed again among the
benefactors.

`donors` holds one row per lower-case email (`display_name`, `name_hidden`, `last_login_at`);
`donations.donor_id` ties a gift to it (null when Stripe gave no usable address) and
`donations.listed` says the donor asked to be named for that gift. A name is shown only when the
gift is listed, the donor has a name, and `name_hidden` is false; an admin hides one
on the admin page (`setNameHidden`), which changes no stones or numbers. Emails never reach
GraphQL types or logs.

`myGiving` (`@ForDonors()`) reads the signed-in donor's places from the same `cityStanding` as the
public query (`givenCents`, `founderNumber` = smallest of their gifts' numbers, `stones`,
`firstStone`, `keystone`), so the two never disagree; it holds nothing about anyone else.
`setListing` flips `listed` on every gift of the donor's to one city; `setDisplayName` saves the
cleaned name. Both act only on the session's own donor. `names.resolver.ts` (admins, no mark)
lists names and sets `name_hidden`.

`src/benefactors/backfill-cli.ts` (compiled into the image, unlike `prisma/`; calls `backfillDonors`) gives donations that have no donor theirs: it asks
Stripe for each session, reads the address with `donorEmailOf`, upserts the donor and sets
`donor_id`. It never touches `listed` and prints counts only. Running it again is safe: donations that
already have a donor are skipped, but sessions without an email, or whose Stripe lookup failed,
are asked about again on each run.

Hidden cities still appear on their own donors' pages (hiding only keeps a city off the public
list).

**The wall** (`benefactorWall`, public, 60 a minute per address) is everyone who gave to a city
that is shown, as one list for the front page (`wall.ts`, pure): a named donor **once**, their
named gifts added up over every city they are named in (the city they gave most to first),
with their links; every unnamed gift on its own, name `null`, with what it gave and its one
city, as on a city's own list. Largest first, then the latest; at most `WALL_MAX` (200). Gifts
to no city, to a hidden city or in another currency are on no list. An unnamed entry says
nothing of whose it is: a donor named in one city and not in another is two entries.

## Links (`links/`)

A donor who has given (in dollars) may show up to `LINKS_MAX` (3) links beside their name.
`donor_links` holds them (unique on `donor_id, url`), `link_images` the copies of their
pictures, `donors.links_hidden` an admin's switch.

- **What a link may be** (`cleanLinkUrl`): `https://host/path?query`. What people type is met
  halfway ("example.com/me" and "http://…" become https, the fragment is dropped); anything
  that is not a public web page is refused: another scheme, an address (`127.0.0.1`,
  `[::1]`), a port, a user, a bare or private name (`localhost`, `postgres`, `x.local`,
  `x.internal`), more than `URL_MAX` (300) characters.
- **The page is read once**, when the link is saved (`addLink`), and again only when the donor
  asks (`refreshLink`); both are limited to `READS_PER_MINUTE` (10) per address. `LinkReader`
  (`link-reader.ts`) asks for the page, reads its head (`readPageMeta`: Open Graph's title,
  description and picture first, then Twitter's, then the page's own; the icons, the most
  promising first, `/favicon.ico` last), then its picture and the first icon that can be
  drawn, all before one deadline (`READ_MS`, 9 s). It never throws: a page that is away, or
  that will not talk to a program, is `reached: false` and the link is kept under its own
  name ("example.com/ana"), often still with its site's icon. A refresh of a page that does
  not answer changes nothing (a 503, "The page did not answer"). Texts are cleaned
  (`cleanText`: NFC, control and invisible characters out, 80 and 200 code points).
- **Fetching a stranger's address safely** (`safe-fetch.ts`; the API runs beside its database).
  Only `isPublicUrl` addresses are asked (https, default port, a public host name, no user),
  **every redirect included** (three at most); the connection is made through `guardedLookup`,
  which hands the socket the host's addresses only when **all** of them are public
  (`isPublicAddress`: no loopback, private, shared, link-local (the metadata service),
  documentation, multicast or reserved range, nor the IPv6 ranges that carry an IPv4 address),
  so a name cannot be public when checked and private when connected to. No more than it was
  told is read, counted unpacked (a page is cut at 600 kB, a picture over 5 MB or an icon over
  500 kB refused), and it gives up at the deadline. Nothing of anyone's goes out: no cookie, a
  generic user agent.
- **Pictures are drawn again here** (`link-images.ts`, sharp): the page's picture cut to a share
  card's shape (480 × 252, never enlarged; under 120 × 60 is not a picture), the icon within
  64 px (an `.ico` through `ico.ts`, which the image library does not read), both WebP with
  nothing of the source but its pixels. A source of more than 25 million pixels is refused
  unread. So what the site shows is never a file a linked page sent, and a visitor's browser
  never asks a linked site for anything.
- **`GET /api/link-images/:id`** (public) serves one: `image/webp`, `nosniff`, and
  `Cache-Control: public, max-age=31536000, immutable`, because an id's bytes never change: a
  new reading makes new rows, so new ids (404 for the old ones). GraphQL names an image by
  that path (`icon`, `image`); the site puts the API's origin in front.
- **Where they show** (`shownFor`, read by `cityBenefactors` and the wall): on a row that is
  named, which the caller decides (`standing.ts` rows carry `donorId` for this, never exposed);
  so never beside an unnamed gift, and not under a name an admin hid. None for a donor whose
  `links_hidden` is set. A link's `image` is there only once the donor has given
  `PICTURES_FROM_CENTS` (US$10) **in all** (every gift in dollars, to a city or not); `myLinks`
  gives the donor's own page every picture, with `givenCents` and `picturesFromCents` to say
  what is missing. Links go up at once, as names do; `benefactorNames` shows admins every link
  with its picture, hidden or not, and `setLinksHidden` takes a donor's links off every list.

## Signing in, for admins and donors (`auth/`)

There are no passwords. Two kinds of account sign in (`Purpose`: `admin | donor`), sharing the
links, the codes and every limit below, never an account: an address that is both has one of
each, and each gets its own links.

- **An admin** is an address on `ADMIN_EMAILS`, a list in the environment (so no address is in
  the repository, and taking one off the list ends its sessions at once: the JWT strategy asks
  on every request). An `admins` row is made the first time an address on the list asks for a
  link; it is the account (its id is the session's subject, `last_login_at` its last sign-in).
- **A donor** is any address that asks, given or not: its `donors` row is made the first time
  it asks for a link as a donor, or by the webhook when it gives (see Benefactors), whichever
  comes first; gifts made with the address are its own either way. If the donor step fails, the webhook still records the
  donation (unlisted, no donor; the backfill fills it in later) and logs the failure without the address. Signing in sets its `last_login_at`.

`magic_links` belong to one account: `admin_id` or `donor_id`, exactly one of them (the check
`magic_links_one_owner`, in the migration since Prisma has no checks).

1. `POST /api/auth/magic-link { email, returnUrl, locale?, purpose? }` (`purpose` defaults to
   `admin`) → `202 { sent: true }`, whoever asks. It mails a link to `returnUrl#token=…` to
   any address asked as a donor, and only to an admin's address asked as an admin; `returnUrl` must be a plain page of `ALLOWED_ORIGINS` (the site's `/admin/`, or the
   page a donor asked from). The mail goes out after the answer (`setImmediate`), so neither
   the answer nor its timing tells an admin's address from any other (nor, since anyone may
   sign in as one, says who has given). One link
   a minute per account (`LINK_EVERY_MS`), five requests a minute per address.
2. The mail carries the link and a **6-digit code** (`CODE_DIGITS`; in the subject, `482 913`).
   The token is 32 random bytes; only its SHA-256 is stored (`magic_links`). The code is never
   stored either: only `HMAC-SHA256(JWT_SECRET, tokenHash:code)` (`hashCode`), compared with
   `timingSafeEqual`. Link and code are good for 15 minutes (`LINK_MINUTES`) and **once
   between them**: either is spent in a single `UPDATE … WHERE used_at IS NULL`, so two tries
   cannot both sign in, and using one spends the other. The token travels in the URL's hash,
   which reaches neither a web server's log nor the page analytics.
3. `POST /api/auth/verify { token }` or `{ email, code, purpose? }` → `{ accessToken,
   expiresAt, admin { id, email } }` for an admin, `{ accessToken, expiresAt, donor { id,
   email } }` for a donor, or 401. A token's link knows whose it is; a code is looked up
   among the links of the account of that `purpose` (default `admin`), so a donor's code asked
   as an admin's is refused. The code may be typed "482 913" or "482-913"
   (`normalizeCode`). A wrong code counts against the account's newest live link
   (`attempts`); at `CODE_TRIES` (5) the link is spent. A wrong code, an unknown address and a
   bad link all answer the same 401, and a refused code try never returns before
   `REFUSAL_FLOOR_MS` (300; injected as `REFUSAL_FLOOR`) has passed, so timing does not tell an
   admin's or a donor's address from another. An account gets `CODE_TRIES_PER_DAY` (20) tries
   per rolling 24 hours across all its links (the sum of their `attempts`, by `admin_id` or
   `donor_id`; past it a code is refused without being compared, the token still works;
   parallel requests may overshoot it by a few). So that expiry cannot reset it, links are
   kept for a day after they are made, expired or not, and cleared by age when the account
   next asks for one.

**Sessions** are JWTs (HS256, `JWT_SECRET`, 7 days: `SESSION_DAYS`) that the site keeps in
local storage, with the payload `{ sub, kind }`: the account's id and `admin | donor`. A token
without `kind` was signed before donors could sign in and is an admin's. `JwtStrategy` turns
the payload into a `SessionIdentity { kind, id, email }` through `identityOf` on every request
(an admin only while on `ADMIN_EMAILS`, a donor while the row is there); an unknown kind is
`UNAUTHENTICATED`.

The mail is sent through SMTP (`SMTP_*`, `MAIL_FROM`; nodemailer), in the language it was asked
in, with words for an admin or for a donor (`sign-in-mail.ts`, in the look of the other mails:
the code first, then the button). With no mail server configured
the message is written to the log instead, which is how signing in works in development; in
production that never happens (a link is a key), and the environment check refuses to start
without `JWT_SECRET`, `SMTP_HOST` and `MAIL_FROM`, admins or not, because donors sign in
whenever there are donations. Elsewhere, without `JWT_SECRET`, sessions are signed with a
secret made up at start (they end with the process). Logs name an account by its id, never by
its address, and never carry a code.

To let someone in as an admin: add their address to `ADMIN_EMAILS` and restart. To see who has
signed in: `SELECT email, last_login_at FROM admins;` (or `donors`).

## Guess the building (`quiz/`)

The site's quiz on the map's famous buildings: the questions are the site's own files
(`quiz.<locale>.json`, made by the pipeline), and the right name of a building is the building
itself, so this API keeps no copy of them. It keeps the answers and tallies them.

- `quiz_answers`: one row per answer, unique on `(visit_id, world, sight_id, level)`: a visit
  (the funnel's tab id) answers a building once per difficulty (`QuizLevel`: `EASY`, `MEDIUM`,
  `HARD`; each offers other wrong answers); answering again keeps the first. Answers sent
  without a level, and all those from before levels (migration `20261111230000_quiz_level`),
  are `HARD`. Tallies are per level. `choice` is the
  sight id picked; `locale` the interface language.
- `answerQuiz` (public, 30 a minute per address: `ANSWERS_PER_MINUTE`) records the answer and
  answers the building's tally, that answer included: `answers` (everyone who answered it) and
  the names picked with their counts, most picked first, then by id. The page sends the names it
  offered (`choices`, up to four, the building and the pick among them, else `BAD_REQUEST`) and
  only those are counted, so what comes back stays small whatever anyone has sent; without
  `choices` (older pages) it gives the `MAX_PICKS` (20) most picked. Without `visitId` (a visit that is not counted: storage
  blocked, an admin's browser) nothing is recorded and the tally is answered all the same.
- Validation: `visitId` a UUID, `world` the funnel's pattern, `sightId` and `choice`
  `SIGHT_ID_PATTERN` (`b19j7udl`, `bridge:brooklyn bridge`, `statue:0`), `level` a `QuizLevel`
  (an unknown one is refused by GraphQL itself), `locale` one of the three. The API cannot tell a real choice from an invented one; the throttle bounds the harm.
- The site shows shares over the four names it offered, so picks of a name a later pipeline run
  stopped offering simply drop out of its card.

## Mails (`mail/`)

Three mails, one look (the site's: a dark band with the pixel wordmark under a taxi-yellow bar,
a white card on paper, yellow pill buttons, the pixel badges, a footer saying why the person got
it), each in en-US, pt-BR and es-ES, each with a plain-text part. `MailModule` provides `MAILER`
(`createMailer`: SMTP, or the log without `SMTP_HOST`/`MAIL_FROM`) to auth, donations and
benefactors. `layout.ts` is the look, as pure functions of tables and inline styles, readable from
320 to 600 px: `shell`, `button(s)`, `badge`, `stonesGrid`, `progressBar`, `facts`, `impactBox`
(a number drawn in Tiny5's pixels out of table cells, so it shows without pictures or fonts) and
`codeBox`. **Every text is escaped** (`html.ts`: `fillHtml` escapes a template and each value
that is not already markup): city names and display names are typed by donors. Each mail is a
pure builder from typed facts to `{ subject, text, html }`: `signInMail`, `thanksMail`,
`builtMail`.

Links and pictures are made from `SITE_URL` (an origin; default: the first of
`ALLOWED_ORIGINS`): `/me/`, `/`, `/<world>/`, the pictures at `/email/wordmark.png`,
`founding.png`, `first-stone.png`, `keystone.png` (the front page's own files,
`tinyworlds-frontend/public/email/`, made by its `npm run email-images`) and a built world's
real share card, `/<world>/og/<world>.jpg`. Every picture has alt text, and the badges' words
are text beside their pictures, so a mail with pictures blocked still reads.

A mail never fails, holds up or undoes a donation, a deploy or a sign-in; it goes only to the
person's own address and names nobody else's; logs name a donation or a donor by id, never by
address.

- **Thank you** (`donations/thanks.service.ts`). After `record()` commits a new donation that
  has a donor, `setImmediate` hands its id to `ThanksService.send`, so the webhook is answered
  first; a replay records nothing and thanks nobody, and a donation whose donor step failed (no
  donor) is not thanked. It goes to the donor's address, in the donation's locale (en-US
  without one). `send` never throws: a failure is logged by the donation's id. What it says
  comes from the same `cityStanding` as the public list (`placeOfGift`, `thanks-facts.ts`: the
  gift's stones, the donor's founding number, badges and listing, and the city's stones and
  bar as they stood once the gift was in) and from `VisitsService.totalOf` (the visits of every
  city's world added up, without `home`: the front page's cards together). Variants: a
  founding gift ("São Paulo is 10 stones closer, because of you.", its stones lit on the grid,
  the bar); the gift that lays the last stone; a gift beyond the goal ("…keeps it running"; for
  a built city, "You keep New York running for its 15,194 explorers"); a gift to no city ("the
  cities to come", no impact box); a gift in another currency (a plain thank-you, no amount, no
  stones). Every variant with a city shows the impact box; listed gifts say under which name,
  an unlisted one invites the donor to add a name on Your cities, and one whose name an admin
  hid says the name is hidden from the city's public list. Above `STONES_DRAWN_MAX` (100)
  stones the grid is left out and the bar stays: each stone is a table cell, and a mail must
  stay well under the ~102 kB at which Gmail cuts it (a 100-stone thank-you is about 35 kB).
- **A city is built** (`benefactors/announce.service.ts`, `announce-cli.ts`). `deploy/deploy.sh`
  runs `node dist/benefactors/announce-cli.js <world>...` in the container after uploading the
  worlds (all of them in one call for `deploy.sh all`); the command reports world by world.
  For an unknown world, a city not `BUILT` (the seed has not run) or one announced before
  (`cities.built_announced_at`), it prints so. Otherwise it reads everything and writes every
  mail first (the donors, their gifts, the standing), then claims the announcement in one
  `UPDATE … WHERE built_announced_at IS NULL` (two runs cannot both send), then mails each
  donor with an address once, whatever the number of their gifts, in the language of their
  latest: the share card, "{city} is on the map, and you built it." (a founder) or "…you helped
  keep it running." (a benefactor), their badges, what they gave and their stones, and who built
  it (the public list's rows). A donor with no gift in dollars is on no list, and the footer
  does not say they are. **A failure never loses the announcement**: a read that fails comes
  before the claim; if anything throws after it, or not one mail went out, the claim is
  released (`UPDATE … WHERE built_announced_at = <its own time>`) and the next run tries again.
  A mail server that is away (`isServerFailure`: `ECONNECTION`, `ETIMEDOUT`, `ESOCKET`, `EAUTH`
  and the like) stops the sending at its first failure instead of waiting on it for every
  donor. Once some mails have gone out the city counts as announced, and the output says it was
  partial, naming the donors not mailed (failed, or not tried) by id; a later run does not mail
  them (to send the whole announcement again: `UPDATE cities SET built_announced_at = NULL
  WHERE …`). It exits 1 when any world fell short, 0 otherwise. The migration that added the
  column counted every city already on the map (`BUILT`, or with a `world_id`) as announced.
  The command builds its services by hand (no Nest container), so tsx can run it too.
- **Sign-in** (`auth/sign-in-mail.ts`): see Signing in. The subject is unchanged ("Your
  tinyworlds code: 482 913"). Its last line says "The code and the button work once, for 15
  minutes. Asked more than once? Use the newest mail.": strictly true (an older mail's code
  stops working once a newer link is asked for; its button keeps working until used or
  expired), and the advice is right either way.

## The donation funnel (`funnel/`)

Which steps towards a donation each **visit** reached. A visit is one browser tab's stay on the
site, named by a UUID the page makes up and keeps in the tab's session storage: no cookie, no
IP address, no user agent, nothing kept between visits. `funnel_events` holds one row per
visit, step and **world** (`"tinynyc"`, or `"home"` for the front page), unique on those three:
saying a step twice changes nothing.

| Step | Who says it |
| --- | --- |
| `VISIT` | the site, when a page opens (`trackFunnelStep`); `last_seen_at` starts at the same moment as `created_at`, and an open map moves it on (`trackPresence`, below) |
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

## Visits (`visits/`)

The front page's cards say how visited each world is. A **visit** is the funnel's `VISIT` row:
one per tab and world, with `created_at` (when it opened) and `last_seen_at` (when the page last
said it was open). Rows from before `last_seen_at` existed, the page analytics' history among
them, have it null: unknown, not "no time at all".

- `trackPresence` (public, 120 a minute per address: `PRESENCE_PER_MINUTE`): a map says it every
  30 s while it is in view. It sets the visit's `last_seen_at` to now, and makes the `VISIT` row
  if its opening never arrived (an upsert on `visit_id, step, world`). It never touches another
  step.
- `worldVisits` (public): for each world asked (1 to 50 ids, `MAX_WORLDS`, each like a world id;
  answered once each, in the order asked, zero for one never visited), `visits` is every `VISIT`
  row of that world and `live` those seen in the last 75 s (`LIVE_MS`). Every world's counts
  are made at once (two `groupBy`, on the indexes `(step, world)` and `(step, last_seen_at)`) and
  kept in memory for 10 s (`CACHE_MS`), so the front pages asking every half minute cost a
  count every 10 s at most; a failed count is not kept.
- Whether a live count is worth showing (more than ten) is the site's call, not the API's.
- What the counts include is what the funnel counts: every tab but an admin's or a program's
  (the site's own rule), and the page analytics' history before the site counted for itself.
  Anyone can post steps, so the counts are only as honest as the address limits make them.

To see how long visits stay: `SELECT world, last_seen_at - created_at FROM funnel_events WHERE
step = 'VISIT' AND last_seen_at IS NOT NULL`.

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

The admin pages read the funnel and hide or show donors' names (`setNameHidden`). Changes to a city are SQL (or `npx prisma studio`):

```sql
UPDATE cities SET status = 'BUILDING' WHERE slug = 'sao-paulo';                     -- work has started
UPDATE cities SET status = 'BUILT', world_id = 'tinysp' WHERE slug = 'sao-paulo';   -- it is on the map: the site links to /tinysp/ (deploying the world then mails its donors)
UPDATE cities SET hidden = true WHERE slug = 'not-a-city';                          -- a name that should not be shown
UPDATE cities SET name = 'São Paulo' WHERE slug = 'sao-paulo';                      -- fix the spelling the first donor used
```

A donor names a city by paying for it, so a new name appears on the site as soon as its first
donation is paid; `hidden` is the way to take one down. Merging two cities means moving the
donations (`UPDATE donations SET city_id = …`) and adding up the two counters by hand.

`prisma/seed.ts` (`npm run seed`) upserts the starting cities by slug (`seed-cities.ts`): the
built ones (every world on the site, from New York to Philadelphia, Colorado Springs and Truckee; re-asserted as
`BUILT` with their `world_id`) and six suggestions at zero. It never touches a city's name, goal or what it has raised, and never
changes a suggestion that is already there. A built city that donors had already put on the list
as a proposal is therefore promoted in place: it becomes `BUILT` with its world and keeps every
cent and donation. So **adding a world** on this side is one line in `seed-data.ts`: the
container runs the seed every time it starts, so deploying it is enough.

## Environment

Validated at startup (`config/env.ts`); the server does not start with anything missing.

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL |
| `STRIPE_SECRET_KEY` | required | creates Checkout sessions |
| `STRIPE_WEBHOOK_SECRET` | required | verifies the webhook's signature |
| `STRIPE_PRICE_EN`, `STRIPE_PRICE_PT`, `STRIPE_PRICE_ES` | required | pay-what-you-want prices (minimum US$1), one per interface language |
| `CITY_GOAL_CENTS` | `3000` | what a new city needs, in US cents; stored on the city when it is created, so changing it leaves the cities already there as they were: move them with a migration, as `20261111180000_city_goal_thirty_dollars` did when the goal went from US$100 to US$30 |
| `ALLOWED_ORIGINS` | required | comma-separated origins of the site: the CORS allow-list, where a checkout may return to and where a sign-in link may lead |
| `ADMIN_EMAILS` | empty | comma-separated addresses that may sign in to the admin pages; empty = nobody |
| `JWT_SECRET` | required in production, and anywhere with an admin | signs the sessions and keys the codes' HMAC; at least 32 characters |
| `SMTP_HOST`, `MAIL_FROM` | required in production | the mail server that sends the mails (sign-in links, thank-yous, a city is built), and the address they come from |
| `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | `587`, none, none | 465 means TLS from the start, anything else STARTTLS |
| `SITE_URL` | the first of `ALLOWED_ORIGINS` | the site's origin, for every link and picture in a mail; in production it (or that first origin) must be https, or the API does not start |
| `PORT` | `4000` | |
| `NODE_ENV` | `development` | GraphiQL and introspection are off in `production` |

Secrets live in the host's environment, never in the repository. `.env` is gitignored; only
`.env.example` (placeholders) is committed.

## Docker

`Dockerfile` is a two-stage build on `node:22-bookworm-slim`. The container runs as the `node`
user and starts with `npx prisma migrate deploy && npm run seed && node dist/main.js` (single
replica: the migrations, then the seed, which is safe to repeat, run before the server). It is
redeployed on every push to main that changes this folder (`deploy/deploy.sh release`, root
`CLAUDE.md`), which then waits for `{ uptime }` to come from the new process before the viewers
go up. `npm run seed` also works by hand inside the image
(`docker exec <container> npm run seed`), and so do `npm run donors:backfill` and
`npm run cities:announce -- <world>...` (the image has
`dist/` and `prisma/` only, so scripts that need `src/` code live in `src/`). Rolling back past the
`sign_in_codes` migration breaks admin sign-in (old code inserts links without `code_hash`): roll
the database back too, or roll forward. The image has a `HEALTHCHECK` that asks `{ health }`.
`sharp` (the links' pictures) comes with its own prebuilt library for the image's platform:
nothing to install in the Dockerfile. Reading a donor's link needs the container to reach the
internet, as Stripe and the mail server already do.
In production the schema is kept in memory (the user cannot write `schema.gql`).

## Testing

- Unit tests (`src/**/*.spec.ts`) build the service by hand over `test/fake-prisma.ts` (a few
  arrays with unique columns and rollback), `test/fake-mailer.ts` (keeps the mail, and reads the
  token out of a sign-in link) and `test/fake-stripe.ts` (records the sessions asked
  for and the prices looked up; `price_en` belongs to `prod_en`). The links' pieces are tested
  on their own: `safe-fetch.spec.ts` against a server it starts on this machine (its `test`
  setting swaps https and the address guard for a rule of the test's, every hop still
  checked), the guard itself with made-up lookups, and the pictures with real ones made by
  sharp. No test asks the internet for a page. The fake mailer keeps every
  mail; `signIns()` are the ones with a sign-in link (`token()` and `code()` read the latest of
  those), since thank-yous go out on their own after a donation. `failWith` fails every mail,
  or the ones a function of the attempt's number picks (`attempts` counts them), which is how
  the announce tests stage a mail server that goes away halfway. Webhook deliveries are
  signed for real with `stripe.webhooks.generateTestHeaderString` and a placeholder secret, so
  the signature check is the real one. No test talks to Stripe.
- `npm run test:e2e` boots the whole app with the fake Stripe on its own database
  (`tinyworlds_test`, created on the compose Postgres if missing), and goes through HTTP: the
  global prefix, validation, the raw-body webhook, throttling by forwarded address, CORS,
  signing in through a mailed link (the mail is kept by the fake mailer), links (their pages
  come from `test/fake-link-reader.ts`: a page in its table answers, any other is away), the
  wall, the funnel's SQL
  and each world's visits on a real database (the visits tests move the API's clock, `Date`
  only, past the counts kept in memory). The admin signs in once for the whole file, so `admins` is not emptied
  between tests; `magic_links` is (with `donors`), so a test may ask for a fresh link. The
  checkout limit is per address and the tests share a minute: a test that starts several
  checkouts sets its own `x-forwarded-for`. The thank-you and the announcement are tested there
  too (`AnnounceService` taken from the app); the visits' counts are kept in memory for 10 s and
  the thank-yous count too, so the visits tests start their clock when they start.
- `test/migrations.e2e-spec.ts` tests migrations that change rows: on a database of its own
  (the e2e one's name + `_migrations`, made and dropped), it applies every migration before the
  one under test, writes rows, applies that one and reads them.
- By hand, without Stripe: `npm run webhook:send` posts a signed `checkout.session.completed` to
  the local API using `STRIPE_WEBHOOK_SECRET` from `.env`. `--id` fixes the session id (send it
  twice to see a replay change nothing), `--link` shapes it like a payment link's session,
  `--currency brl`, `--status unpaid` and `--app other` show what is ignored.
- Trying the mutation by hand needs a real Stripe test key and price ids in `.env`: with the
  placeholders Stripe refuses the call and the API answers 503.
