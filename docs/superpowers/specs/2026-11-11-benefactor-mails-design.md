# Benefactor mails: thank you, your city is built, and a better sign-in mail

Date: 2026-11-11 · Status: approved (mockups shown and approved in chat)

## Why

A donor should feel important. Thousands of people explore the cities, about 16,400 visits so
far and 15,194 in New York alone, and they will walk a new city's streets because of the donor.
Today a donor hears nothing from tinyworlds after paying. The only mail is the sign-in one, and
it is plain.

This reverses the earlier design's non-goal ("no mails on our own initiative",
`2026-11-11-benefactors-design.md`). The owner asked for these two mails.

## What gets built

Three mails. They share one look, the site's own: a dark band with the pixel wordmark and a
taxi-yellow top bar, then a white card on a paper (`#f4f2ec`) background, yellow pill buttons,
the pixel badges, and a short footer saying why the person got the mail. All three are written in
en-US, pt-BR and es-ES.

### 1. Thank you (when Stripe confirms the gift)

**When it is sent:** after the webhook records a new paid donation that has a donor email. It
goes to that email, in the donation's locale (en-US if none). It is never sent for a replayed
event. It is sent after the transaction commits, without holding up the webhook (`setImmediate`).
A failure is logged by donation or donor id, never by address, and never undoes the donation.

**What it shows**, by variant:

- **Founding gift** (the gift has a founding number):
  - Subject: "You laid stones {from}–{to} of {city}", or "You laid stone {n} of {city}" for a
    single stone.
  - Heading: "{city} is {k} stones closer, because of you." The text below it reads "Your
    {amount} laid stones {from} to {to} of its {count}. When the last one is in, I build it."
  - The Founding badge with "Founder No. {n}", plus First Stone and/or Keystone when held.
  - The city's stones as a grid. Theirs are lit yellow, earlier ones grey, the rest empty.
  - A progress bar: "{raised} of {goal} · {left} stones to go".
- **Keystone** (the gift completes the goal):
  - Subject: "You laid the last stone of {city}".
  - Heading: "You laid the last stone: {city} is funded."
- **Gift beyond the goal:**
  - Subject: "Thank you for keeping {city} running".
  - Heading for a FUNDED or BUILDING city: "{city} is funded, and your gift keeps it running".
  - Heading for a BUILT city: "You keep {city} running for its {visits} explorers". `{visits}` is
    that world's visit count.
- **No city chosen:**
  - Subject: "Thank you for your gift to tinyworlds".
  - Heading: "Your gift goes to the cities to come."
- **Not in USD:** a plain thank-you naming the city, with no stones and no bar.

**The impact block**, a dark box, appears in every variant except no-city. It shows the total
visits to the cities as a big pixel-styled number, followed by: "visits to the cities on
tinyworlds so far. Once {city} is built, every one of its explorers walks streets you helped
lay." For a built city it reads "…every one of its explorers walks streets you keep open."

The total is the sum of every world's visits, the same numbers the front page's cards show
(`VisitsService`), without "home".

**The listing line:** "You're on {city}'s Founding Benefactors" (or "Benefactors") "as {name}.
You can change your name or hide it any time." When the gift is unlisted or has no name: "You're
anonymous here. Add your name on Your cities."

**Buttons:**
- "See your cities", linking to `{SITE}/me/`.
- "Tell a friend", a `mailto:` with a localized subject and body that link to `{SITE}/`.

**Footer:** "Stripe sends your payment receipt separately. You're getting this because you
donated to tinyworlds with this address."

### 2. Your city is built (right after the world is deployed)

**When it is sent:** `deploy/deploy.sh <world>`, and `all` for each world, runs one command on
the server after uploading the world:

```
docker exec <api container> node dist/benefactors/announce-cli.js <world>
```

The command takes the city whose `world_id` is `<world>`. It must be `BUILT` (the seed marks it,
as today). Its outcome is one of:

- **Unknown world** (no city has that `world_id`): it prints so, and exits 0.
- **Not BUILT yet:** it prints that the seed must run first, and exits 0.
- **Already announced** (`cities.built_announced_at` is set): it prints so, and exits 0.
- **Otherwise:**
  1. It claims the announcement in one conditional update, setting `built_announced_at`, so two
     runs cannot both send.
  2. It mails each donor who gave to that city once, whatever the number of gifts. Only donors
     with an email are mailed.
  3. It prints the counts: mailed and failed, never addresses.

Failures are listed by donor id, and the command exits 1 if any send failed. `deploy.sh` warns
on a non-zero exit but does not fail the deploy.

**Migration:** add `cities.built_announced_at` (nullable timestamp). Set it to `now()` for every
city that is already `BUILT`, so no old city is ever announced.

**What the mail shows:**
- Subject: "{city} is built. Come and see it".
- Hero picture: the world's real share card, `{SITE}/{world}/og/{world}.jpg`.
- Heading:
  - for a founder: "{city} is on the map, and you built it."
  - for a benefactor only: "{city} is on the map, and you helped keep it running."
- Text: "The city you helped fund is done. It's open to everyone, from today."
- Their badges: Founder No. n, First Stone, Keystone, or "Benefactor".
- Facts:
  - "You gave": their total to the city, and their stone ranges.
  - "Built by": "{founders} founders and {benefactors} benefactors", counted as the public list's
    rows.
- Buttons:
  - "Explore {city}", linking to `{SITE}/{world}/`.
  - "Share it", a `mailto:` linking to the world.
- Footer: "Your name and badges are on {city}'s benefactors, in About on its map. You're getting
  this because you donated towards {city}."
- Language: the locale of the person's latest donation to that city.

### 3. Sign-in, redesigned (admins and donors)

- **Layout:** the same look. The code comes first, big ("Type this code on the page you came
  from"), then the button. The button reads "See your cities" for donors and "Open the admin
  pages" for admins.
- **Below the button:** "The code and the button work once, for 15 minutes. Asked for another?
  Only the newest one works."
- **Footer:** "Didn't ask for this? Ignore it: nothing happens without the code or the button."
- **Unchanged:** the subject ("Your tinyworlds code: 482 913"), and every security property of
  signing in.

## How (decided; the builder follows these)

- **Mail module.** Move the mailer to `tinyworlds-api/src/mail/`: `mailer.ts`, the `MAILER` token
  and the provider, and a `MailModule` that every module needing it can use. Add a shared
  `layout.ts` with these pure functions, all returning HTML strings built from table-based
  markup with inline styles, readable at 320–600 px:
  - the shell: band, card, footer, preheader
  - button
  - badge (an image plus a text label)
  - stones grid (a table of cells)
  - progress bar
  - facts
  - impact box

  Every dynamic text is escaped. Display names come from donors, so this is mandatory. Each mail
  also has a plain-text part.
- **Pure builders.** Each mail is a pure builder, `thanksMail(...)`, `builtMail(...)` and the
  existing `signInMail(...)`, from typed data to `{ subject, text, html }`, unit-tested by
  variant and locale.
- **SITE_URL.** A new optional env, `SITE_URL` (an origin such as `https://example.com`). It
  defaults to the first `ALLOWED_ORIGINS` entry and is used for every link and image in mails.
- **Images.** They are the site's own files, under `tinyworlds-frontend/public/email/`:
  - `wordmark.png`: the Tiny5 wordmark, white "tiny" and yellow "worlds", transparent, 2×.
  - `founding.png`, `first-stone.png` and `keystone.png`: the badge pixel art at 3×, nearest
    neighbour, from the same maps as `src/components/benefactors/pixel-art.ts`.

  A script, `tinyworlds-frontend/scripts/email-images.mjs`, regenerates them. The PNGs are
  committed. Mails reference `{SITE}/email/<file>.png` with alt text, and every image has a
  text fallback next to it, so a mail with images blocked still reads.
- **Thank-you data.** It comes from the same `cityStanding` as the public lists (the gift's
  place via `places`), the city row, the donor's name and `nameHidden`, and `VisitsService` for
  the visit counts.
- **The announce CLI.** `src/benefactors/announce-cli.ts`, compiled into `dist/` like the
  backfill. It has npm scripts `cities:announce` (the built file) and `cities:announce:dev`
  (tsx). Its logic is a service method with tests.
- **`deploy.sh`.** It gets a new `deploy/.env` variable, `API_SERVICE`: the docker service or
  container name of the API on `DEPLOY_HOST`. Without it, announcing is skipped with a note.
  Add a placeholder to `deploy/.env.example` and document it in `deploy/README.md`. Keep the
  change small: another session edits `deploy.sh` too.
- **Docs.** The root `CLAUDE.md`, `tinyworlds-api/CLAUDE.md` (mail module, the two mails,
  announcing, `SITE_URL`), `tinyworlds-frontend/CLAUDE.md` (`public/email/`), `deploy/README.md`
  and `README.md`.

## Constraints

- The repository is public: no domain, host, address or id in tracked files (`example.com`).
- Mails go only to the person's own address. No mail contains another person's email. Names are
  escaped. Logs name ids, never addresses.
- A mail failure never fails, delays or undoes a donation, a deploy or a sign-in.
- Every picture of a map is the real share card, never redrawn.

## Tests

- **Builders:** each variant in en-US; at least one variant per pt-BR and es-ES; escaping
  (`<script>` in a name comes out as text); links built from `SITE_URL`; the plain-text part
  present.
- **`record()`:**
  - it sends one thank-you per new donation with an email;
  - it sends none on a replay and none without an email;
  - a mailer failure leaves the donation recorded.
- **Announce (e2e):**
  - it mails each donor of a built city once;
  - it does nothing the second time, for a city not `BUILT`, or for an unknown world;
  - the migration marks existing `BUILT` cities as announced.
- **Visual check:** render the three mails, two variants of the thank-you and a pt-BR one, to
  PNG with headless Chromium, and look at them.

## Left to the builder

- Exact markup and spacing within the mockup's look. Exact wording of the pt-BR and es-ES copy.
- How `VisitsService` exposes the totals.
- How `deploy.sh` finds the container from `API_SERVICE`.
