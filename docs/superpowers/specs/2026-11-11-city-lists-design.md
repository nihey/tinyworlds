# Lists: "Tell me when it's built"

*Design, 2026-11-11. API, the front page's build (`/` and `/me/`, plus `/admin/`), and two new
mails. The map viewers do not change.*

## Why

Today a visitor who likes the idea of a city, but won't donate now, has no way to hear about it
again: they leave, and nothing brings them back the day it is on the map. The owner wants a
waiting list. People can ask to hear when **a particular city** is built, or when **any new
city** is built. Every address on a list must be **proven to be its owner's**, so the visitor
signs in first, the way "Your cities" already works.

*Claude's reading of the why, not the owner's words:* the lists bring people back when a city
opens. Showing how many people wait for each city (the owner asked for that) also tells
everyone else, donors included, which cities people want.

## Goals

- From the front page, anyone can join **a city's list** or the **"new cities" list** in a few
  steps without leaving the page. They sign in by email first, unless they already are.
- Joining sends a **welcome mail** with three curiosities: three famous buildings already on
  the map.
- The day a city is built, everyone waiting for it gets **one mail**.
- People can see and leave their lists on "Your cities", or from any list mail without signing
  in.
- Each city's card on the front page says how many people are waiting for it. The admin page
  shows the counts too.

## Non-goals

- **No newsletter beyond these mails.** A list sends the welcome mail and the "is built" mail,
  and nothing else. That means no digests, no news of proposed cities and no fundraising
  appeals. (The owner confirmed "one email when a city is built, nothing else".)
- No list of its own for any world already on the map, imagined worlds included. A new world
  added later still reaches everyone on "new cities" (section 4).
- Existing donors and people who have signed in are **not** put on any list. Donors already get
  their own "you built it" mail, unchanged.
- No changes to the map viewers (`/<world>/`).

## Anti-goals (what would make this a failure even if it works)

- **A mail to an address nobody proved.** No list mail ever goes to an address that wasn't
  verified by a sign-in link or code.
- **Anyone learning who is on a list, or whether an address is.** Only counts are public. No
  answer may reveal whether a given address is on a list (the same rule as for donations
  today).
- **The same person getting the same news twice.** That covers a donor who is also on the
  city's list, someone on both a city's list and "new cities", and a deploy that runs again.
- **Emojis anywhere.** The owner's rule: icons from the site's set (lucide) or pixel-art
  pictures in the site's style, in the pages and in the mails.
- **A list that is hard to leave.**

## What people see (decided by the owner)

The mockups were confirmed screen by screen. They are in
`.superpowers/brainstorm/city-lists/`, a local folder outside git. The HTML expects its pictures
at `/files/`, so open it through the brainstorm server, or just read the markup. Where this text
and the mockups differ, this text wins. The mockups use emoji in the first screen; the owner
rejected those, so use icons instead.

### 1. Where people join

- **On every city still being funded** (each `CityFundCard` in "Build the next city", on the
  front page and on "Your cities"), a third button beside Benefactors and Donate: a bell icon
  and **"Tell me"**.
  - Once the signed-in visitor is on that city's list, the button reads **"You'll be told"**
    with a check, in the accent colour. Pressing it again leaves the list.
  - A signed-in visitor who **donated to that city** also sees "You'll be told". Their donor
    mail covers it, and the button doesn't change anything for them.
- **Each card's status line** adds the number of people waiting once there is at least one:
  "1 waiting", "12 waiting". It goes beside the donations count, in the same quiet style.
- **The front page's "Which city should I build next?" tile** (`NextCityTile`, after the cities'
  cards) gets a second button beside "Fund a city", in the quieter outline style: a bell and
  **"Tell me when new cities are built"**. Once the visitor is on that list it reads **"You'll
  hear about new cities"** with a check, and pressing it leaves the list. (The owner picked this
  spot, option A, over a sign of its own and a spot under the hero.)
- Built cities and their cards get nothing: there is nothing left to wait for.

### 2. Joining: a sign over the page (the owner picked option A)

Pressing "Tell me" (or the new-cities button) while **signed out** opens a sign over the page,
as Donate does now. It has three steps:

1. **"Hear when Tokyo is built"** (or "Hear when new cities are built"), with a bell. *"One
   email the day it's on the map. First we check the address is yours: we'll send a code, no
   password."* An email field and **"Send me a code"**.
2. **"Check your email"**: a link and a 6-digit code are on their way. They can type the code
   or open the link. This is the existing sign-in sheet (`components/sign-in/sign-in.tsx`)
   with its own words, including "Wrong address? Change it" and "Send again".
3. **"You're on Tokyo's list"**, with a check in a yellow circle. *"We'll write to
   ana@example.com the day Tokyo is built. A welcome email is on its way, with three buildings
   to visit while you wait."* For a city's list it adds **"Help build Tokyo"**, which opens the
   donate sign with that city chosen, and **Close**. For "new cities" there is only Close.

- **Opening the link instead of typing the code** finishes the same join. The link brings the
  visitor back to the front page, which completes the sign-in, joins the list it was opened
  for, and shows step 3.
- **Already signed in:** the button joins at once, with no sign, and the button changes state.
  Leaving works the same way.
- Signing in this way is a donor session (`purpose: "donor"`). In this project a donor is just
  an email address, and anyone may sign in. So the visitor is then signed in on the front page
  and on "Your cities" as well.

### 3. The welcome mail (the owner picked option A)

Sent when someone joins a list, but **only for their first list**. Joining a second list sends
nothing more: the page already says they're on it.

- The look of the existing mails: the dark band with the pixel wordmark and a label (**"You're
  on the list"**), then a white card on paper (`tinyworlds-api/src/mail/layout.ts`).
- **"We'll write the day Tokyo is built."** (for "new cities": "We'll write each time a new city
  is built.") *"Your email is confirmed. When Tokyo is on the map, you'll get one email saying
  so, and that's all this list sends."*
- **"While you wait: three buildings already on the map"**: three famous buildings picked at
  random, from three different built cities where there are enough.
  - "Famous" means a building in "Guess the building"'s easiest level, which is how the quiz
    ranks by Wikipedia page views. A world with lit buildings but no quiz (Truckee) can supply
    any lit building that has an article.
  - Each one shows its **pixel-art picture**, the one the map lights up (`sights/<hash>`), on
    the paper colour. It also shows the city's name in small capitals, the building's name, its
    Wikipedia opening (`sights.<locale>.json`, shortened at a word boundary if needed) and
    **"See it on the map"**, a link to the world at that building (`/<world>/#lat,lon,scale`).
- Buttons: **"Explore the cities"** (the front page's cities) and, for a city's list, **"Help
  build Tokyo"** (the front page, opening Donate for that city).
- Footer: *"You're getting this because you asked to hear when Tokyo is built."* and **"Leave
  this list"**.

### 4. The mail the day a city is built

This mail goes to everyone on the city's list or on "new cities" **who didn't donate to that
city**. Donors keep getting their own "you built it" mail, and only that one.

- Band label **"Now on the map"**, the city's share card as the picture (as in the donors'
  mail), then **"Colorado Springs is built. Come and see it."** *"You asked to hear the day it
  was on the map: it is, from today, open to everyone."*
- **"Three places to start"**: three of **the new city's own** famous buildings, laid out like
  the welcome mail's. A city with no lit buildings has just its picture and buttons.
- Buttons: **"Explore Colorado Springs"**, and **"Play Guess the building"** when the city has
  a quiz.
- Footer: why they got it and **"Leave this list"**. For someone on "new cities", "Leave this
  list" leaves "new cities".
- **Several cities built in the same deploy:** a person gets **one** mail naming all the new
  cities they wait for (Colorado Springs and Truckee shipped together, for example). *Claude's
  call on the layout:* one block per city, each with its share card, its Explore button and one
  famous building, so the mail stays short.
- **A city's list ends** once its mail has gone out. "New cities" lasts until the person leaves
  it.
- **Any new world counts as new, including imagined ones** (the owner's answer). If a new
  fan-made world like Winterfell is added, everyone on "new cities" gets its mail too. So this
  mail must read well for a world with **no lit buildings, no quiz and no city in the usual
  sense**: its picture, a line that doesn't call it a city, and Explore. The button keeps its
  words, "Tell me when new cities are built". The API needs no new knowledge of which worlds
  are imagined.

### 5. "Your cities" (`/me/`)

- A new section, **"Your lists"**. It shows each city they're waiting for, with its status
  ("US$10 of US$30", "Funded, in the queue"…), and "New cities" if they're on that list. Each
  row has a **Leave** button.
- With no lists, the section offers the two ways in: "Tell me when new cities are built", and
  a line pointing at the "Tell me" on the cards below.
- The "Build the next city" cards on this page get the same "Tell me" button.

### 6. Leaving from a mail

- **"Leave this list"** opens a small page in the front page's build that leaves that list at
  once and says so. It needs no sign-in and has one button to join again. It also has **"Leave
  all lists"**.
- The link carries a signed token that names the person and the list. It doesn't expire and
  isn't the person's address.
- *Claude's call:* every list mail also carries the `List-Unsubscribe` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058). Mail clients then show
  their own "Unsubscribe" button, which Gmail and Yahoo expect of mail people subscribe to. That
  header needs an HTTPS endpoint the mail client can `POST` to, so it is **a REST endpoint**:
  the same deliberate exception as the Stripe webhook, since a mail client can't speak GraphQL.

### 7. The admin page

`/admin/` gets a small table: **how many people are waiting for each city**, most waited for
first, and how many are on **"new cities"**. It shows counts only, never addresses.

## Data and API (constraints, and the calls already made)

- **Who is on a list:** a `Donor` (one email address, verified by signing in). The data needs
  to record:
  - each person's lists: a city, or "new cities";
  - when they joined, and the language they joined in (every mail they get from a list is in
    that language);
  - whether they have had their welcome mail;
  - whether they have had a given city's "is built" mail.
  
  The table design is the builder's, following the project's Prisma conventions.
- **Which cities have lists:** only cities that aren't built yet (PROPOSED, FUNDED, BUILDING)
  and aren't hidden. Joining a built or unknown city is refused.
- **Counts:** `CityMilestone` gains `waiting: Int!`, the number of people on the city's list.
  Donors of the city aren't added in unless they joined. The count is public, like everything
  else in `cityMilestones`.
- **GraphQL, as the project does it:**
  - donor-only queries and mutations: their lists, join, leave;
  - a public mutation for leaving with a mail's token;
  - an admin query for the counts.
  
  Joining is throttled like the other public and donor calls. No answer ever says whether an
  address is on a list.
- **The "is built" mails go out with the donors' announcement.** It is the same command
  (`announce-cli`), run by `deploy/deploy.sh` after uploading worlds. It already takes every
  world of the run at once, which is how several cities fit in one mail.
  - Each city's list mails go out **once**. A person is mailed at most once per city, even when
    a run is repeated or partly fails, and a run that failed for some people tries those again.
  - The run's output prints counts and ids only, never an address, as now.
- **Migration:** every world that is **already built** when this ships, imagined ones included,
  counts as already announced to the lists. Otherwise the first deploy would mail "new cities"
  about all fifteen worlds. (The donors' announcement had the same migration.)
- **The mails' pictures:** mails use PNG or JPEG, as the existing ones do (Outlook on Windows
  shows no WebP). The buildings' pictures are WebP in the map data.
  - *Claude's call:* the API reads the published files from the site, the way a browser does:
    `SITE_URL/<world>/data/quiz.<locale>.json`, `sights.json`, `sights.<locale>.json` and
    `sights/<hash>.webp`. It turns the pictures it needs into PNG with `sharp`, which it
    already uses for links' pictures.
  - It keeps those PNGs and serves them over the existing REST pattern for pictures
    (`GET /api/link-images/<id>` is the precedent).
  - This avoids running the pipeline again for fifteen worlds. A world whose files can't be
    read is simply skipped.
  - *Checked in production (2026-11-11):* from inside the running API container, `fetch` of
    `SITE_URL/tinynyc/data/quiz.en-US.json` and of a `sights/<hash>.webp` both answered 200 in
    under 100 ms.
  - Skipping is silent to the reader, but **the announce command's output and the API's log
    must say when a world's files could not be read**, and a mail that should have had
    buildings and went without them must be visible there too. A run should never quietly send
    mails without their buildings.
- **A mail never holds anything up:** a failed welcome mail doesn't undo the join. This is the
  rule every mail here follows (`tinyworlds-api/CLAUDE.md`, Mails).
- **The sign-in mail** sent for a join should say what it's for: confirming the address to
  hear about a city, not signing in to "Your cities". The way it learns that (a field on the
  magic-link request, or a new `purpose`) is the builder's call. An unknown value must fall
  back to today's words.

## Constraints from the project

- The repository is public: no domain, host, address or id in a tracked file. Docs and tests
  use `example.com`.
- Every interface string goes through the viewer's i18n dictionaries in all three languages
  (en-US, pt-BR, es-ES), and every mail is written in all three.
- The global stack and the project's deviations apply (`CLAUDE.md`). That means code-first
  GraphQL, UUIDs exposed as `ID`, snake_case columns, a Prisma migration, services holding the
  logic, and tests passing before a commit.
- Update the docs: the root `CLAUDE.md` (API contract, "How the pieces fit"),
  `tinyworlds-api/CLAUDE.md` (the lists, the mails, the announce command),
  `tinyworlds-frontend/CLAUDE.md` and the README if setup changes.
- When the contract grows, deploy the API before the viewers (the rule already in `CLAUDE.md`).

## Left to the builder

- The tables, names and exact GraphQL shapes.
- How the front page knows the signed-in visitor's lists (one donor query after sign-in is
  enough).
- How the join that a sign-in link was opened for survives the trip through the mail. The
  return address may carry it, as long as it holds no address.
- The leave page's path in the front page's build.
- How the random buildings are picked, within the rules above, and how long the API caches the
  site's files and pictures.
- Exact wording beyond the lines quoted here, in the voice of the existing mails and pages.
