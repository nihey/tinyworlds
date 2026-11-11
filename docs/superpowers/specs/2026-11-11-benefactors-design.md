# Benefactors: founders, stones and "your cities"

Date: 2026-11-11 · Status: approved

## Why

Today a donation moves a city's bar and then disappears into a total. The people who paid for a
city have no way to see that they did, and nobody else can see it either. This gives every donor
a lasting, visible place in the cities they helped build, kept quiet unless they ask for it.
The people who funded a city's first US$100 are the ones who got it built, and they get a title
for that.

Mockups (approved): `.superpowers/brainstorm/*/content/benefactors-screens-v7.html` (local, not
committed). Screens: 1 joining in the Donate sign, 2 a city's benefactors, 3 signing in and "your
cities", 3b the code and the mail.

## The concept

### Founding Benefactors and the 100 stones

- A city's goal (`goalCents`, US$100 today) is drawn as **foundation stones**, one per US dollar:
  100 stones. The donations that make up the first US$100 **lay** the stones, in the order the
  payments were recorded (`donations.created_at`, ties by id).
- **This applies to every city**, including those that went on the map without donations (New
  York, Ribeirão Preto, …). Their first US$100 of donations, whenever it arrives, makes their
  founders.
- Everyone whose gift falls (wholly or partly) inside the first US$100 is a **Founding
  Benefactor** of that city. A gift that crosses the line counts: if a city stands at US$80 and
  someone gives US$50, they are a founder (they lay the last 20 stones). The other US$30 goes
  to upkeep.
- Who laid a stone: stone *i* belongs to the donation that pays its last cent (cent
  `i·100 − 1`, counting cents from 0). Every founding gift is at least US$1 (the API and the
  payment links both have that minimum), so it always lays at least one stone.
- **Founding numbers belong to gifts**, in order: the first founding gift is No. 1, the next
  No. 2, and so on. Because they never depend on who chose to be listed, they never shift when
  someone switches a listing. A person's title is the number of their first founding gift:
  "Founding Benefactor No. 3 of São Paulo". How gifts are grouped into rows in public is set
  out under "Grouping" below.
- Two stones have names:
  - **First Stone**: stone 1, laid by founder No. 1.
  - **Keystone**: the last stone (100), laid by the gift that reaches the goal and funds the
    city.
  One person can hold both. Their row then carries both badges.
- **Founders are listed in order, never by amount.** Founding is about being early, so a US$5
  founder sits next to a US$60 one as an equal.
- Only donations that already count towards a city's bar count here: those in USD
  (`COUNTED_CURRENCY`) that name the city.

### Benefactors

- Everyone who gives to a city beyond its first US$100 is a **Benefactor** of it. Their money
  pays for servers and upkeep.
- Benefactor rows are **ranked by how much was given to that city beyond the goal**, most first.
  Ties go to whoever gave first.
- A listed founder appears in the founders list only, even if they give more later. Their full
  giving still shows on their own "your cities" page.
- **No site-wide leaderboard across cities.** It would turn giving into a contest.

### Being listed is optional

- A donation always counts: it lays stones and moves the bar. A name only shows if the donor
  asks for it. A gift that isn't listed shows as "anonymous", in its place.
- The listing switch in the Donate sign **starts off**.
- A person has **one display name**, used wherever their gifts are listed.

### Grouping: what someone paying under another person's email can't do (decided)

Stripe doesn't check the email typed at checkout, so anyone can pay under someone else's
address. Gifts are grouped per person in public, with three guards:

1. **Anonymous gifts never join together in public.** Each unlisted gift is its own
   "anonymous" row, with its own founding number if it's a founding gift. So a gift paid under
   your email can never show, by growing a row, that you had already given to a city.
2. **A checkout can only list its own gift.** The switch in the Donate sign names that one
   gift. Listing or unlisting all of a person's gifts in a city is done on their "your cities"
   page, after signing in.
3. **A checkout can't change a name that's already set.** If the address has no display name
   yet, the checkout's name becomes it. If it has one, the checkout's name is ignored and the
   gift is listed under the existing name. Changing a name is done on the "your cities" page.

A person's **listed** gifts in a city show as **one row**: under the number of their first
founding gift in the founders list, or with their total beyond the goal among the benefactors.
Accepted remaining risk: someone who knows your email and pays US$1 under it, with the switch
on, could see their gift join your named row, and so learn which public name is yours.
Gifts paid under your email by someone else also show on your own page. You can unlist them
there.

## What people see

Everything is drawn in the site's existing sign style (black enamel, taxi yellow, Archivo plus
Tiny5 for pixel type). All words go through the i18n dictionaries in en-US, pt-BR and es-ES.
Suggested titles: pt-BR *Benfeitor Fundador / Pedra Fundamental / Pedra-Chave / Benfeitor*;
es-ES *Benefactor Fundador / Primera Piedra / Piedra Clave / Benefactor*.

### Pixel-art badges

Three badges, drawn as pixel art at whole-pixel scale (crisp edges), each in a small frame with
a 1px stepped pixel border and its label in Tiny5. They are small enough to sit on the same
line as a name without making the row taller:

- **Founding**: a gold swallowtail flag planted on a grey stone, with the founder's number
  ("⚑ 03") or, where there's room, "FOUNDER NO. 3".
- **First Stone**: a gold isometric block with a "1" carved in its side and a sparkle above it.
- **Keystone**: a gold wedge at the top of a grey stone arch.

The pixel maps in the mockup (`ART` in its script) are the starting point. In the product they
should become SVGs or a small React component, not images.

### 1 · Joining, in the Donate sign

- When a city is chosen and the gift would fall inside its first US$100, a line under the
  funding bar says which stones the gift would lay and that it makes the donor a Founding
  Benefactor ("You'd lay stones 63–82 of São Paulo's 100 …"). This is a preview from the
  current standing. The real stones are assigned when the payment is recorded.
- A block **"Put my name on <city>"** with a switch (off by default) and, when it's on, a name
  field (1–40 characters, counter shown). A short note explains that the donor counts as
  "anonymous" if it's off, and that they can sign in later with the email they give Stripe to
  change it. Per guard 3, if the address already has a name, that name is the one shown. The
  sign can't know this in advance, so the note says the name can be changed later on "your
  cities".
- With no city chosen (a gift to the project as a whole), the block isn't shown.
- In payment-link mode (the API is unreachable), nothing new is shown.

**Built cities (decided).** People can give to an already-built city **only through "Become a
benefactor of <city>"** on that city's benefactors sign (in About inside its map, and on the
front page). That opens the Donate sign with the built city already chosen. Instead of "already
built", the sign shows the city's stones (if fewer than 100 are laid) or says the gift goes to
its upkeep. The rest of the sign is unchanged, and the donor can still switch to another city.
Everywhere else stays as it is today: the picker's search still doesn't offer built cities, the
heart inside a map still opens with no city chosen, and the default still funds cities to build
next.

### 2 · A city's benefactors

A sign for one city:

- Its status, a 10×10 grid of stones filled as they're laid (named founders' runs in alternating
  golds, anonymous runs in grey, empty stones dim, the First Stone and Keystone marked), and a
  legend using the badge icons.
- **Founding Benefactors**: one row each, all the same height, showing the Founding badge with
  the number, the name or "anonymous", the First Stone or Keystone badge when they hold it, and
  on the right the amount they gave as founder (US$) with their stones underneath. Rows of
  First Stone and Keystone holders get a faint gold strip. Long lists collapse the middle
  ("4 more, 2 anonymous", with the total) but always show the First Stone and the Keystone.
- **Benefactors**: rank, name or "anonymous", total given beyond the goal.
- A button **"Become a benefactor of <city>"** opens the Donate sign with the city chosen.

Where it opens:

- **Front page:** from each city in the ranking. Today the whole row opens the Donate sign, so
  the row needs a second action for "benefactors". How to fit it is up to the builder. Built
  cities aren't in the ranking, so the built worlds' cards need a way to open it as well.
- **Inside a built world:** a "Benefactors" section in About, for the city the world shows.
- Fictional worlds have no benefactors: they're never offered as cities to fund.

### 3 · Signing in, and "your cities"

- A **"Your cities"** link in the front page's header, and a quiet one in About in every map,
  leads to a page in the front page's build, next to `/admin/`. The path is the builder's call
  (`/me/` suggested).
- **Signing in:** an email field ("the email you gave at checkout") and "Send me a link".
- **After sending (3b):** "Check your email". The page says a link and a code are on their way
  **if that address has given to tinyworlds**. It must not confirm whether it has (see
  Privacy). A **6-digit code** field (typing or pasting "482913" or "482 913" both work) with a
  "Sign in" button. A **prominent warning to look in the spam or junk folder**, naming the
  sender. "Wrong address? Change it" and "Send again" once the one-minute wait has passed.
- **The mail:** the subject carries the code ("Your tinyworlds code: 482 913"), so it can be
  read from a notification. The body has a "See your cities" button (the magic link) and the
  code in large type, and says that both work once, for 15 minutes. It's in the language the
  page was in. The wordmark is drawn in dark ink, because yellow on white is unreadable.
- **Signed in:** a summary ("3 cities · 32 stones laid · US$47 given"), then one card per city
  the person gave to, showing:
  - their badges (Founder No. n, First Stone, Keystone) or "Benefactor"
  - what they gave there, and their stones (with ranges)
  - where the city stands: the bar while it's being funded, or "Funded, in the queue" /
    "Being built" / "Built", with a link to explore it once built
  - the listing switch for that city, and "Listed as <name> · edit" (the name is the same for
    every city)

  Gifts that named no city are summed in one line for the project as a whole. "Sign out".
- **Coming back from Stripe** (`?donated=1`): the existing thank-you gains a link, "See your
  place in <city>", to the sign-in page. Its exact wording is the builder's call. No automatic
  sign-in.

## How it works

### Who a donor is

- A donor is **the email Stripe collected** at checkout (`customer_details.email`, lower case).
  It is stored from now on: new personal data, kept only for this.
- Recording a donation (the webhook) also finds or creates the donor by that email. If the
  checkout asked for a listing, **that gift** is marked listed, and the donor's name is set
  only if they had none (guards 2 and 3).
- **Existing donations:** a one-off script reads each donation's Checkout session from Stripe
  (by `stripe_session_id`) and fills in its donor. Nobody is listed until they say so, because
  none of them were asked. Payment-link donations get their email the same way, are never
  listed by default, and can be listed after signing in.

### Data (indicative; the builder shapes it)

- A **donor** (or a generalised account, see below): `id`, `email` (unique, lower case),
  `display_name` (nullable), `name_hidden` (set by an admin), timestamps.
- `donations.donor_id` (nullable for donations Stripe gave no email for) and
  `donations.listed` (boolean): **listing belongs to the gift**. The "your cities" switch sets
  it on all the signed-in donor's gifts to that city.
- Founders, stones and ranks are **computed from the donations when asked for**, not stored:
  they stay right if a donation is removed or a goal changes, and a city has few donations.
  This is a pure function (`donations → stones, founders, benefactors`) with thorough unit
  tests: crossing the line, several founding gifts from one person (listed: one row;
  anonymous: one row each), one gift holding both the First Stone and the Keystone, a mix of
  listed and unlisted gifts from one person, non-USD gifts, cities with no donations.
- Numbers can shift if a founding donation is ever removed (a refund done by hand). That's
  accepted.

### Signing in, for donors and admins alike

- Signing in is still REST (`POST /api/auth/magic-link`, `POST /api/auth/verify`), extended so
  the mail carries **both the link and a 6-digit code**, and verify accepts either `{ token }`
  or `{ email, code }`.
- **Who gets a mail:** an address on `ADMIN_EMAILS`, or one that has at least one recorded
  donation. Anyone else gets the same `202` and no mail, with the same timing (the mail is
  still sent in `setImmediate`).
- **The code** is spent together with its link (using either spends both). It's stored only as
  an HMAC under a server secret, not a plain hash, because a 6-digit space is easy to try
  offline. After **5 wrong tries** the link and code are spent, and there are per-address and
  per-IP limits on verify. The existing rules stay: one link a minute per address, 15 minutes,
  single use.
- Whether admins and donors become one account (an admin is an account whose email is on
  `ADMIN_EMAILS`) or stay two kinds that share the link and code machinery is **the builder's
  call**. One account per email is suggested. The admin page and its guard must keep working,
  and admins get the code too.
- The donor's session is a JWT in local storage, like the admin's. Its lifetime is the
  builder's call (the admin session lasts 7 days).

### GraphQL (indicative)

- Public: `cityBenefactors(slug)` → stones (100 slots, each pointing to a founder or empty),
  founders (`number`, `name` or null, `amountCents`, `stones`, `firstStone`, `keystone`),
  benefactors (`rank`, `name` or null, `amountCents`), and the city's standing. Hidden cities
  are refused. **Never an email.** A hidden or unlisted name comes out as null. Throttled like
  the other public queries.
- `createDonationCheckout` gains an optional `benefactorName` (1–40 characters). When present,
  the donor asked to be listed for that city. It travels in the Checkout metadata, and the
  webhook applies it. As the contract already says, deploy the API before the viewers.
- Signed-in donor: `myCities` (the "your cities" data), `setListing(city, listed)` (all their
  gifts to that city), `setDisplayName(name)`. All of these act only on the signed-in donor's
  own rows.
- Admin: a short list of listed names, newest first, with **hide / unhide**. It goes on the
  admin page.

## Privacy (constraints)

- No endpoint, answer, timing or page text may reveal **whether an address has donated**. The
  sign-in answer is the same for everyone, and the page's wording is conditional. For gifts
  paid under someone else's address, see "Grouping" (the one remaining risk is accepted).
- Emails never leave the API. They aren't on public queries, in the admin funnel, or in logs
  (log the donor id instead).
- Names are plain text: trimmed, control characters removed, 1–40 characters, always rendered
  as text (never as a link). Admins can hide a name. Hiding only shows the person as
  "anonymous". It never moves their stones.
- The repository is public: no addresses, sender domains or secrets in tracked files.

## Goals

- Every founder, and every benefactor who asks, is visibly part of their city: in the city's
  benefactors, with their badges, and on their own page.
- Joining takes one switch and a name inside the Donate sign.
- Signing in works with a link or a pasted code, and tells people to look in spam.

## Non-goals

- Accounts with passwords, social sign-in, or profiles beyond a display name.
- A ranking of people across cities.
- Changing how money is taken (Stripe Checkout and the payment links stay as they are) or how
  the funnel works.
- Pre-moderating names. Admins hide afterwards.
- Emails sent on our own initiative (no "thank you" or "you're a founder" mail). The only mail
  is the one a person asks for.

## Anti-goals (fails even if it works)

- Small donors feel ranked below big ones among founders.
- Anyone can find out whether a given person donated.
- A name field becomes a place for spam links or abuse that stays up.
- Sign-in mail goes to spam and people give up without being told to look there.
- A donation is held up, or lost, because of anything here. The webhook must record the
  donation even if the donor or listing step fails.

## Left to the builder

- The exact layout of the second action on the front page's ranking rows.
- The path of "your cities", the session lifetime, and whether admin and donor are one account.
- Table and field names, the HMAC secret's name, and the throttle numbers within the limits
  above.
- The grid's exact colours, and how a long founders list collapses.
- The backfill script's shape. It must be safe to run more than once.
- Documentation: the root `CLAUDE.md` contract, `tinyworlds-api/CLAUDE.md` (signing in,
  donors), `tinyworlds-frontend/CLAUDE.md` (new pages and signs), and `README.md` and
  `.env.example` for any new variable.
