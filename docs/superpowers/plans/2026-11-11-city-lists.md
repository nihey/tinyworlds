# Lists ("Tell me when it's built") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visitors join a city's list, or the "new cities" list, after proving their address by signing in. They get a welcome mail with three famous buildings, then one mail the day the city (or any new world) is built. City cards show how many are waiting.

**Architecture:** A new API module, `tinyworlds-api/src/lists/`, holds the memberships (on `Donor`, since a donor is just a verified address) and the GraphQL operations (donors', public, admins'). It also holds the two mails, a catalog that reads famous buildings from the live site's own files, and a PNG picture route for mails. A sign-in link can carry the list to join, and spending the link joins it. The existing announce command, after telling donors, tells the lists. On the front page's build: a "Tell me" button and a waiting count on each funding card, a new-cities button in the "Which city next?" tile, a join sign that wraps the existing `SignIn`, a "Your lists" section on `/me/`, a `/lists/leave/` page, and a counts table on `/admin/`.

**Tech Stack:** NestJS 12 + GraphQL (code-first) + Prisma 7 + PostgreSQL, sharp, nodemailer; Next.js 16 static export, React 19, Tailwind v4, lucide-react, Apollo Client 4 (lazy), vitest.

**Spec:** `docs/superpowers/specs/2026-11-11-city-lists-design.md`. Read it first: it fixes what people see and every wording quoted below. The mockups are in `.superpowers/brainstorm/city-lists/` (local, outside git).

## Global Constraints

- The repo is public: no domain, host, address or id in a tracked file. Tests and docs use `example.com`.
- **No emojis** anywhere (pages, mails, tests' expected copy). Icons come from lucide-react on the site; pixel-art PNGs (or none) in mails.
- Every interface string goes in `tinyworlds-frontend/src/i18n/types.ts` plus `en.ts`, `pt-BR.ts` and `es-ES.ts`. Every mail is written in en-US, pt-BR and es-ES, with a plain-text part.
- API conventions: code-first GraphQL, UUIDs as `ID`, snake_case columns via `@map`, ESM `.js` import paths, services hold the logic, and emails never in GraphQL types or logs (log donor ids).
- An operation is admins-only unless marked `@Public()` or `@ForDonors()` (`JwtAuthGuard` is global).
- **A mail never fails, holds up or undoes anything** (a join, a sign-in, a deploy). Failures are logged by donor id.
- Mails use PNG or JPEG pictures only (no WebP), with alt text.
- `SITE_URL` is read through `ConfigService` as the existing mails do (default: first of `ALLOWED_ORIGINS`).
- Commit after every task, from the worktree `.claude/worktrees/city-lists` (branch `city-lists`). End every commit message with `Claude-Session: https://claude.ai/code/session_01MykmSK8ZGUTNXcSxKvt9Ky`. Before every commit, run `git diff --cached` and check it for hosts and addresses.
- API checks: `npm run lint && npm run typecheck && npm test` in `tinyworlds-api`. Run `npm run test:e2e` (needs `docker compose up -d`) for tasks that touch the database or HTTP.
  - Other sessions share that Postgres, so always run e2e on this branch's own database: `E2E_DATABASE_URL=postgresql://<the user and password from .env.example>@localhost:5434/tinyworlds_test_lists npm run test:e2e`.
  - The worktree has no `node_modules`: run `npm ci` in each sub-project first. Copy `tinyworlds-api/.env` from `.env.example`.
- Front-end checks: `npm run lint && npm run typecheck && npm test` in `tinyworlds-frontend`.

## Review Focus

1. **Opening the sign-in link on another device** (a phone) than the one where "Tell me" was pressed: the join must still happen, because it rides on the link, server side. Test in Task 5: `verify(token)` on a link carrying `joinList` makes the membership.
2. **A city built or hidden between "Tell me" and the code being typed:** the sign-in still succeeds, nothing is joined, and no error is shown or thrown. Test in Task 5.
3. **One person, several reasons to hear:** on the city's list and on "new cities", or a donor of the city who also joined its list. Exactly one mail, or none for the donor. Tests in Task 6.
4. **The site's files can't be read, or a world has no quiz or no lit buildings:** mails still go out, with fewer or no buildings, and the command's output names the unread worlds. Tests in Tasks 3 and 6.
5. **The leave link used twice, after the city was built, or with a tampered token:** used twice or after building answers `true` and changes nothing; a tampered token answers `false` and changes nothing. The page says the right thing for each. Tests in Tasks 2 and 10.

---

### Task 1: The data model

**Files:**
- Modify: `tinyworlds-api/prisma/schema.prisma`
- Create: `tinyworlds-api/prisma/migrations/20261112030000_city_lists/migration.sql`
- Modify: `tinyworlds-api/test/fake-prisma.ts` (the new tables and columns, with their unique rules)
- Test: `tinyworlds-api/test/migrations.e2e-spec.ts`

**Interfaces:**
- Produces (Prisma client):
  - `ListMember` (`list_members`): `id` uuid; `donorId` (cascade); `cityId` nullable (null means "new cities", cascade); `locale` String; `createdAt`.
  - `ListNotice` (`list_notices`): `donorId`, `cityId`, `sentAt`, with `@@id([donorId, cityId])`.
  - `Donor.welcomedAt DateTime?` (`welcomed_at`).
  - `City.listsStartedAt DateTime?` (`lists_started_at`) and `City.listsAnnouncedAt DateTime?` (`lists_announced_at`).
  - `MagicLink.joinList String?` (`join_list`: a city slug, or `*` for new cities) and `MagicLink.joinLocale String?` (`join_locale`).
  - Back-relations: `Donor.listMembers`, `Donor.listNotices`, `City.listMembers`.

- [ ] **Step 1: Write the failing migration test** in `test/migrations.e2e-spec.ts`: `it('counts every world already on the map as told to the lists')`. Apply every migration before `20261112030000_city_lists` and insert three cities:
  - a `BUILT` one with `world_id`;
  - a `PROPOSED` one with a `world_id` (an imagined world's row);
  - a `PROPOSED` one without.
  
  Apply the migration. Expect `lists_announced_at` and `lists_started_at` to be non-null for the first two and null for the third.
- [ ] **Step 2: Run** `npm run test:e2e -- migrations`. Expected: FAIL (the migration doesn't exist).
- [ ] **Step 3: Write the schema and the migration.** The SQL creates both tables and their indexes, including `list_members (city_id)`. The one-membership-per-list rule is an expression index Prisma can't model, so write it by hand: `CREATE UNIQUE INDEX "list_members_donor_list_key" ON "list_members" ("donor_id", COALESCE("city_id", '00000000-0000-0000-0000-000000000000'::uuid));`. Then: `UPDATE "cities" SET "lists_announced_at" = now(), "lists_started_at" = now() WHERE "status" = 'BUILT' OR "world_id" IS NOT NULL;`.
- [ ] **Step 4: Teach `fake-prisma.ts` the new tables.** Add `listMember` and `listNotice` arrays, with the same unique rule (one row per donor and list, `cityId` null counting as one list), and the new columns on donors, cities and magic links, defaulting to null. Support only the Prisma calls Tasks 2–6 make: `findMany`, `findFirst`, `create`, `createMany`, `deleteMany`, `updateMany`, `count`, `groupBy` by `cityId`. A unique violation throws the same `P2002`-shaped error the fake already throws.
- [ ] **Step 5: Run** `npx prisma generate && npm run typecheck && npm test && npm run test:e2e -- migrations`. Expected: PASS.
- [ ] **Step 6: Commit:** `feat(api): lists' tables, and every world on the map counted as told`.

### Task 2: Lists: join, leave, mine, counts

**Files:**
- Create: `tinyworlds-api/src/lists/list-key.ts`, `src/lists/leave-token.ts`, `src/lists/lists.service.ts`, `src/lists/lists.module.ts`
- Create: `src/lists/lists.resolver.ts` (donors), `src/lists/leave.resolver.ts` (public), `src/lists/list-counts.resolver.ts` (admins)
- Create: `src/lists/models/*.model.ts`, `src/lists/dto/*.input.ts`
- Modify: `src/app.module.ts` (import `ListsModule`)
- Modify: `src/cities/cities.service.ts`, `src/cities/models/city-milestone.model.ts` (the `waiting` field), `src/cities/cities.module.ts`
- Test: `src/lists/leave-token.spec.ts`, `src/lists/lists.service.spec.ts`, `src/cities/cities.service.spec.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `list-key.ts`: `export const NEW_CITIES = '*'`; `export type ListKey = { kind: 'new' } | { kind: 'city'; slug: string }`; `export function listKeyOf(raw: string | null | undefined): ListKey` (`'*'`, empty or absent mean new; anything else is a slug); `export function listParam(key: ListKey): string`.
  - `leave-token.ts`: `export function leaveToken(secret: string, donorId: string, list: string): string` (where `list` is a city id or `'*'`); `export function readLeaveToken(secret: string, token: string): { donorId: string; list: string } | null`. The token is `<donorId>.<list>.<mac>`, with `mac = base64url(HMAC-SHA256(secret, 'leave:' + donorId + ':' + list))`, compared with `timingSafeEqual`. The secret is `sessionSecret(config)` (`auth/session-secret.ts`).
  - `ListsService`:
    - `mine(donorId: string): Promise<MyListsView>`, where `MyListsView = { newCities: boolean; cities: ListCityView[]; donated: string[] }`.
      - `ListCityView = { slug, name, status, raisedCents, goalCents, waiting }`.
      - `donated` holds the slugs of unbuilt cities the donor gave to.
    - `join(donorId: string, key: ListKey, locale: Locale): Promise<MyListsView>`.
    - `leave(donorId: string, key: ListKey): Promise<MyListsView>`.
    - `leaveWithToken(token: string, all: boolean): Promise<boolean>`.
    - `waitingByCity(): Promise<Map<string, number>>`, keyed by city id.
    - `counts(): Promise<{ newCities: number; cities: { slug: string; name: string; waiting: number }[] }>`, most waited for first, then by name.
    - `leaveUrls(donorId: string, list: string): { leaveUrl: string; unsubscribeUrl: string }`, where `leaveUrl = ${site}/lists/leave/#t=<token>` and `unsubscribeUrl = ${site}/api/lists/unsubscribe?t=<token>`.
  - GraphQL:
    - `type ListCity { slug: String! name: String! status: CityStatus! raisedCents: Int! goalCents: Int! waiting: Int! }`
    - `type MyLists { newCities: Boolean! cities: [ListCity!]! donated: [String!]! }`
    - `input ListInput { city: String }` (omitted: "new cities")
    - Donor-only: `myLists`, `joinList(input)` and `leaveList(input)`, each answering `MyLists`. `joinList` is throttled to 20 a minute.
    - Public: `leaveListWithToken(input: { token: String!, all: Boolean }): Boolean!`, throttled to 30 a minute.
    - Admin: `listCounts: ListCounts`, with `type ListCounts { newCities: Int! cities: [CityWaiting!]! }` and `type CityWaiting { slug: String! name: String! waiting: Int! }`.
    - `CityMilestone.waiting: Int!`.

- [ ] **Step 1: Write the failing tests** (unit, over `fake-prisma`):
  - `leave-token.spec.ts`:
    - "reads back what it signed";
    - "refuses a token whose donor, list or mac was changed" (each answers `null`);
    - "refuses garbage" (`''`, `'a.b'`, `'a.b.c.d'`).
  - `lists.service.spec.ts`:
    - "joins a city still being funded, once" (joining twice leaves one row; `mine()` lists it);
    - "joins new cities" (`mine().newCities === true`);
    - "refuses a built, hidden or unknown city" (`BadRequestException`, no row);
    - "leaves" (the row is gone; leaving again is fine);
    - "lists the unbuilt cities the donor gave to in `donated`";
    - "leaveWithToken leaves that list and answers true; with all, every list";
    - "leaveWithToken answers true a second time and false for a bad token, changing nothing";
    - "waitingByCity counts each city's members and leaves new cities out";
    - "counts are most first, then by name, with new cities apart".
  - `cities.service.spec.ts`: "cityMilestones carries each city's waiting, 0 without anyone".
  - `test/app.e2e-spec.ts`:
    - "a donor joins, sees, and leaves a list over GraphQL";
    - "an admin's session is FORBIDDEN on joinList";
    - "anyone gets cityMilestones with waiting".
- [ ] **Step 2: Run** `npm test -- lists cities` and confirm the new tests FAIL.
- [ ] **Step 3: Implement** the files above. A city may be joined when it exists, isn't hidden and isn't `BUILT`. Create the membership, and treat a `P2002` as already joined. Leaving deletes the row. The welcome mail is not in this task: Task 4 adds a call in `join`.
- [ ] **Step 4: Run** `npm run lint && npm run typecheck && npm test && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): lists to hear when a city is built: join, leave, counts`.

### Task 3: Famous buildings from the site, and their pictures as PNG

**Files:**
- Create: `tinyworlds-api/src/lists/sights-catalog.ts`, `src/lists/sight-pictures.ts` (pure: the source URL from world and hash, and drawing it), `src/lists/sight-pictures.controller.ts`
- Modify: `src/lists/lists.module.ts`
- Test: `src/lists/sights-catalog.spec.ts`, `src/lists/sight-pictures.spec.ts`

**Interfaces:**
- Consumes: `SITE_URL` (config); `WORLD_PATTERN` (`donations/donation-facts.ts`).
- Produces:
  - `MailSight = { world: string; id: string; name: string; text: string; mapUrl: string; picture: { src: string; width: number; height: number } | null }`.
    - `text` is the article's opening, cut at a word boundary to at most 160 characters plus `…`.
    - `mapUrl = ${site}/${world}/#${lat.toFixed(5)},${lon.toFixed(5)},1`.
    - `picture.src = ${site}/api/sight-pictures/${world}/${hash}.png`, with width and height fitting the sprite inside 110 × 110, never enlarged.
  - `SightsCatalog`:
    - Constructor: `(config: ConfigService<Env, true>, fetcher: typeof fetch = fetch)`.
    - `famous(world: string, locale: Locale): Promise<MailSight[] | null>`:
      - `null` when the files can't be read;
      - `[]` when the world has no lit buildings with an article and a sprite;
      - successful reads are cached for an hour per world and locale.
    - `pickAcross(worlds: string[], locale: Locale, count: number, random?: () => number): Promise<{ sights: MailSight[]; unread: string[] }>`: one building from each of up to `count` distinct worlds, chosen at random. It fills from repeat worlds only when there are fewer than `count` worlds.
    - `pickIn(world: string, locale: Locale, count: number, random?): Promise<{ sights: MailSight[]; unread: boolean }>`.
  - `GET /api/sight-pictures/:world/:file` (`@Public()`, REST like `link-images`):
    - `:file` must match `/^[a-z0-9]{1,16}\.png$/` and `:world` `WORLD_PATTERN`, else 404.
    - It reads `${site}/${world}/data/sights/<hash>.webp` (5 s timeout, at most 2 MB, `limitInputPixels` 25e6). It draws a PNG fitting 220 × 220 (twice the mail's box, never enlarged).
    - It keeps the last 200 in memory and answers `image/png`, `nosniff` and `Cache-Control: public, max-age=31536000, immutable`. A missing source is a 404.

"Famous" means:
- the sight ids of `quiz.<locale>.json` questions with `level === 1`;
- for a world whose quiz file is a 404, every sight with a text in `sights.<locale>.json`;
- in both cases, only sights that have a `sprite` in `sights.json`.

Files are read from `${site}/${world}/data/{quiz.<locale>.json, sights.json, sights.<locale>.json}`, each with a 5 s timeout.

- [ ] **Step 1: Write the failing tests** with a fake `fetcher` serving tiny JSON fixtures:
  - "famous buildings are the quiz's easiest level, with their text, map link and picture" (assert the exact `mapUrl` and the `picture.src`);
  - "a world with sights but no quiz offers every sight with an article";
  - "a sight without a sprite, or without a text, is left out";
  - "unreadable files answer null, and are asked again next time" (not cached);
  - "a long opening is cut at a word with an ellipsis, at most 161 characters";
  - "pickAcross takes distinct worlds and reports the unread ones";
  - `sight-pictures.spec.ts`: "draws a webp as a png within 220 px, never larger" (with a real sharp-made WebP); "refuses a file name that is not a hash".
- [ ] **Step 2: Run** `npm test -- sights sight-pictures`. Expected: FAIL.
- [ ] **Step 3: Implement.** Never throw from the catalog: a failure is `null` or `unread`, and is logged with the world and the reason.
- [ ] **Step 4: Run** the API checks. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): famous buildings for the mails, read from the site, pictures as PNG`.

### Task 4: The welcome mail, list headers and one-click leave

**Files:**
- Create: `tinyworlds-api/src/lists/mail-parts.ts` (the building rows, as HTML and as text), `src/lists/welcome-mail.ts`, `src/lists/unsubscribe.controller.ts`
- Modify: `src/mail/mailer.ts` (`Mail.headers?: Record<string, string>`, passed to nodemailer), `src/lists/lists.service.ts` (sending the welcome from `join`), `src/lists/lists.module.ts` (imports `MailModule`)
- Test: `src/lists/welcome-mail.spec.ts`, `src/lists/lists.service.spec.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `shell`, `heading`, `paragraph`, `buttons` and `link` (`mail/layout.ts`); `fill` and `fillHtml` (`mail/html.ts`); `SightsCatalog.pickAcross` (Task 3); `leaveUrls` (Task 2).
- Produces:
  - `welcomeMail(facts: WelcomeFacts): Omit<Mail, 'to'>`, where `WelcomeFacts = { locale: Locale; site: string; list: { kind: 'new' } | { kind: 'city'; name: string; slug: string }; sights: MailSight[]; leaveUrl: string; unsubscribeUrl: string }`.
    - Its `headers` are `List-Unsubscribe: <${unsubscribeUrl}>` and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
  - `listHeaders(unsubscribeUrl: string): Record<string, string>`, exported from `mail-parts.ts` for Task 6.
  - `sightRowsHtml(sights: MailSight[], seeLabel: string): string` and `sightRowsText(sights, seeLabel): string`.
  - `POST /api/lists/unsubscribe?t=<token>` (`@Public()`, `@HttpCode(200)`, throttled to 30 a minute): calls `leaveWithToken(t, false)` and always answers 200.

- [ ] **Step 1: Write the failing tests:**
  - `welcome-mail.spec.ts`:
    - "says the city's name in the heading and the footer, in each language". English: subject `You're on the list for Tokyo`, heading `We'll write the day Tokyo is built.`, label `You're on the list`.
    - "new cities: `We'll write each time a new city is built.` and no Help-build button".
    - "each building has its picture with alt text, city, name, line and See it on the map link".
    - "with no buildings, no 'While you wait' section".
    - "escapes a city name with markup".
    - "has a text part and the List-Unsubscribe headers".
    - "contains no emoji" (`/\p{Extended_Pictographic}/u` finds nothing in subject, text or HTML for all three locales).
  - `lists.service.spec.ts`:
    - "the first join sends one welcome, after answering, in the join's language";
    - "a second join sends none";
    - "a failed welcome leaves the membership and lets the next join try again" (`welcomedAt` is released);
    - "the welcome's buildings come from built, shown worlds".
  - `app.e2e-spec.ts`: "POST /api/lists/unsubscribe with a good token leaves the list; with a bad one it answers 200 and changes nothing".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
  - **Wording, English** (write pt-BR and es-ES in the same voice as `built-mail.ts`):
    - Paragraph: `Your email is confirmed. When {city} is on the map, you'll get one email saying so, and that's all this list sends.` For new cities: `Your email is confirmed. Each time a new city is on the map, you'll get one email saying so, and that's all this list sends.`
    - Section label: `While you wait: three buildings already on the map`.
    - Buttons: `Explore the cities` (`${site}/#cities`) and `Help build {city}` (`${site}/#ranking`).
    - Footer: `You're getting this because you asked to hear when {city} is built.` (new cities: `…when new cities are built.`), then a `Leave this list` link.
  - **Sending:**
    - In `join`, when the row is new and `donor.welcomedAt` is null, claim the welcome with `updateMany({ where: { id, welcomedAt: null } })`.
    - Then `setImmediate` the send. It picks three buildings from the built, shown cities with a `worldId`.
    - On failure, set `welcomedAt` back to null and log by donor id.
- [ ] **Step 4: Run** the API checks, plus `npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): a welcome mail with three famous buildings, and one-click leave`.

### Task 5: Signing in to join

**Files:**
- Modify: `tinyworlds-api/src/auth/dto/request-link.dto.ts` (`list?: string`: `@IsOptional`, `@IsString`, `@MaxLength(120)`), `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/auth.module.ts` (imports `ListsModule`), `src/auth/sign-in-mail.ts`
- Modify: `src/lists/lists.service.ts`
- Test: `src/auth/auth.service.spec.ts`, `src/auth/sign-in-mail.spec.ts`, `src/lists/lists.service.spec.ts`

**Interfaces:**
- Consumes: `ListsService` (Task 2).
- Produces:
  - `AuthService.sendLink(address, target, locale, purpose, list?: string)`. A `list` is only kept for `purpose === 'donor'`, and only when `ListsService.describe(list)` knows it. It is stored as `magicLink.joinList` and `joinLocale`.
  - `ListsService.describe(raw: string): Promise<{ kind: 'new' } | { kind: 'city'; name: string } | null>`: null for a built, hidden or unknown city.
  - `ListsService.joinAfterSignIn(donorId: string, raw: string, locale: Locale): Promise<void>`: never throws; skips anything `describe` refuses.
  - `SignInMailFacts.list?: { kind: 'new' } | { kind: 'city'; name: string }`. With it, a donor's mail opens with words of its own:
    - label `Confirm your email`;
    - heading `One step and you're on the list for {city}.`;
    - new cities: `One step and you'll hear about new cities.`;
    - button `Confirm and join`.
    
    The subject stays `Your tinyworlds code: 482 913`.
  - In `spend()`, when the link has `joinList` and the account is a donor, await `joinAfterSignIn` before answering, so the page's next `myLists` already shows it.

- [ ] **Step 1: Write the failing tests:**
  - "a donor's link asked with a list joins it when the link is opened";
  - "…and when the code is typed instead";
  - "a list for a built or unknown city is dropped: the mail is a plain sign-in and spending joins nothing";
  - "an admin's link ignores list";
  - "spending a joining link never fails because joining failed" (make `join` throw: verify still answers a session);
  - `sign-in-mail.spec.ts`: "a joining mail says which list, in each language; the subject is unchanged".
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the API checks and `npm run test:e2e`. The e2e test is "magic-link with list, then verify, then myLists shows the list". Expected: PASS.
- [ ] **Step 5: Commit:** `feat(api): a sign-in link can carry a list, and opening it joins`.

### Task 6: The "is built" mail to the lists

**Files:**
- Create: `tinyworlds-api/src/lists/list-built-mail.ts`, `src/lists/list-announce.service.ts`
- Modify: `src/benefactors/announce-cli.ts` (after the donors' loop: `ListAnnounceService.announce(worlds)` and its lines; a shortfall exits 1), `src/lists/lists.module.ts`
- Test: `src/lists/list-built-mail.spec.ts`, `src/lists/list-announce.service.spec.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `SightsCatalog.pickIn` (Task 3); `sightRowsHtml`/`Text` and `listHeaders` (Task 4); `leaveUrls` (Task 2).
- Produces:
  - `listBuiltMail(facts: ListBuiltFacts): Omit<Mail, 'to'>`, where `ListBuiltFacts = { locale; site; cities: { name: string; slug: string; world: string; quiz: boolean; sights: MailSight[] }[]; reason: { kind: 'new' } | { kind: 'city'; name: string }; leaveUrl: string; unsubscribeUrl: string }`.
  - `ListAnnounceService`:
    - Constructor: `(prisma, config, mailer, catalog)`. It is built by hand in the CLI, like `AnnounceService`.
    - `announce(worlds: string[]): Promise<ListAnnouncement>`.
  - `ListAnnouncement = { cities: { world: string; city: string; mailed: number; failed: string[]; unsent: string[] }[]; unread: string[] }`.
  - `describeListAnnouncement(done: ListAnnouncement): string[]` and `listsFellShort(done): boolean`. The output holds counts and donor ids, never an address.

The algorithm, in this order:
1. **Pick the cities.** These are the given worlds' cities that are `BUILT`, not hidden, and have `listsAnnouncedAt` null.
2. **Mark each one started.** Set `listsStartedAt = now()` where it is null (first run only).
3. **Gather the people.** These are the city's list members, plus "new cities" members whose `createdAt <= listsStartedAt`.
4. **Leave out three groups:**
   - anyone with a `donations` row for that city (the donors' mail covers them);
   - any `(donor, city)` already in `list_notices`;
   - any city membership created after `listsStartedAt`.
5. **One mail per person.** Group by donor, so each person gets one mail naming all of their cities from this run.
   - The language is that of their newest membership among the reasons.
   - The `reason` is the city when exactly one city list is why, otherwise new cities. The leave link points at that reason's list.
6. **Write the content.**
   - One city: three of its buildings (`pickIn(world, locale, 3)`).
   - Several cities: one building each.
   - Buttons: `Explore {city}` (`${site}/${world}/`), plus `Play Guess the building` (the same URL) when the world has a quiz.
7. **Claim before sending, release on failure.**
   - Before each mail, `createMany` its `list_notices`, which is the per-person claim. If that hits a P2002, someone else is mailing them: skip them.
   - If the mail fails, delete those notices. A server failure (`isServerFailure`) stops the run and counts the rest as `unsent`.
8. **Close the city if everyone got their mail.** When a run leaves no `failed` or `unsent` for a city, set its `listsAnnouncedAt` and delete its `list_members` rows (its list ends).

**Wording (English):**
- Subject: `{city} is built. Come and see it`. With several cities: `{a} and {b} are built. Come and see them`, joining with commas as `built-mail.ts`'s `and` does.
- Label: `Now on the map`.
- Heading: `{city} is built. Come and see it.`
- Paragraph: `You asked to hear the day it was on the map: it is, from today, open to everyone.`
- Section label: `Three places to start`.
- A world with no buildings: just the picture (share card `${site}/${world}/og/${world}.jpg`) and the buttons. The text never calls an imagined world a city: use `{name}`, never "the city".

- [ ] **Step 1: Write the failing tests** (fake prisma, fake mailer, stub catalog):
  - "mails each member of the city's list once, in their language, with three of its buildings";
  - "new-cities members hear about every new world, imagined ones too";
  - "someone on both lists gets one mail";
  - "a donor of the city gets no list mail";
  - "two cities in one run make one mail naming both, a building each";
  - "a second run sends nothing" (`listsAnnouncedAt` set, members gone);
  - "a failed mail is tried again on the next run, and only that one";
  - "a mail server that goes away stops the run; the rest are unsent and tried next run";
  - "someone who joined new cities after the city was first announced is not mailed about it";
  - "unreadable site files: mails go without buildings, and the output names the world";
  - `list-built-mail.spec.ts`:
    - wording in three languages;
    - a quiz button only with a quiz;
    - a world without sights;
    - escaping;
    - no emoji;
    - headers present.
  - `app.e2e-spec.ts`: "after the donors' announcement, the CLI's list step mails the waiting" (with `ListAnnounceService` taken from the app).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement**, wiring the service into `announce-cli.ts` (built by hand; `SightsCatalog` with the real `fetch`).
- [ ] **Step 4: Run** the API checks and `npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Update `tinyworlds-api/CLAUDE.md`:**
  - the contract (new types and operations, the two REST routes);
  - a "Lists (`lists/`)" section: tables, rules, the token, the catalog and pictures, counts;
  - Mails: the welcome and list "built" mails, and the sign-in mail's join words;
  - the announce command's second step;
  - Structure.
- [ ] **Step 6: Commit:** `feat(api): the day a world is built, everyone waiting hears, once`.

### Task 7: The front page's lists: data, API, store and words

**Files:**
- Create: `tinyworlds-frontend/src/lib/lists.ts`, `src/lib/lists-api.ts`, `src/hooks/use-lists.ts`
- Modify: `src/lib/donate.ts` (`CityMilestone.waiting: number`, parsed with default `0`), `src/lib/donate-api.ts` (ask for `waiting`), `src/lib/sign-in-api.ts` (`requestLink(email, returnUrl, locale, purpose, list?: string)`)
- Modify: `src/i18n/types.ts`, `en.ts`, `pt-BR.ts`, `es-ES.ts` (a `lists` section with every string Tasks 8–11 use)
- Test: `src/lib/__tests__/lists.test.ts`, the i18n key and placeholder tests (existing)

**Interfaces:**
- Produces:
  - `lib/lists.ts`:
    - `NEW_CITIES = "*"`; `type ListKey = { kind: "new" } | { kind: "city"; slug: string; name: string }`; `listParam(key): string`.
    - `interface MyLists { newCities: boolean; cities: ListCity[]; donated: string[] }`, with `ListCity` as in the API; `parseMyLists(raw: unknown): MyLists | null`.
    - `cityListState(slug: string, lists: MyLists | null): "join" | "joined" | "donor"`.
    - Pending join: `PENDING_JOIN_KEY = "tinyworlds.join"`, `savePendingJoin(key: ListKey): void`, `takePendingJoin(now?: number): ListKey | null`. Keep it in localStorage behind try/catch, for at most 1 hour.
  - `lib/lists-api.ts` (imported lazily; per-session Apollo, like `benefactors-api.ts`):
    - `fetchMyLists(session): Promise<MyLists>`;
    - `joinList(session, key, locale): Promise<MyLists>`;
    - `leaveList(session, key): Promise<MyLists>`.
    
    All reject with `SignInError`. Also `leaveWithToken(token: string, all: boolean): Promise<boolean>`, a plain `fetch` to `API_URL` with a 5 s timeout.
  - `hooks/use-lists.ts`: `useLists(): { lists: MyLists | null; busy: boolean; join(key: ListKey): Promise<boolean>; leave(key: ListKey): Promise<boolean>; refresh(): void }`.
    - One module-level store shared by every card, fetched when a donor session appears and cleared when it goes.
    - "unauthorized" signs the donor out, as `MeApp` does.
  - `t.lists` (English values; the other two languages in the same voice):
    - **Buttons:**
      - `tellMe: "Tell me"`, `toldYou: "You'll be told"`;
      - `tellMeAria: "Tell me when {city} is built"`, `leaveAria: "Stop telling me about {city}"`;
      - `newCities: "Tell me when new cities are built"`, `newCitiesOn: "You'll hear about new cities"`.
    - **Counts:** `waitingOne: "1 waiting"`, `waitingMany: "{n} waiting"`.
    - **Join sign:**
      - `join.cityTitle: "Hear when {city} is built"`, `join.newTitle: "Hear when new cities are built"`;
      - `join.body: "One email the day it's on the map. First we check the address is yours: we'll send a code, no password."`;
      - `join.action: "Send me a code"`;
      - `join.doneCity: "You're on {city}'s list"`, `join.doneNew: "You're on the list for new cities"`;
      - `join.doneBody: "We'll write to {email} the day {city} is built. A welcome email is on its way, with three buildings to visit while you wait."` (and a new-cities form);
      - `join.help: "Help build {city}"`, `join.close: "Close"`, `join.failed: "Couldn't add you to the list. Try again."`.
    - **The rest:** the `SignInWords` for the join (Task 8) and the `/me/` section, leave page and admin table strings (Tasks 9–11, wording there).

- [ ] **Step 1: Write the failing tests** in `lists.test.ts`:
  - `parseMyLists` takes a good answer and refuses a bad one;
  - `cityListState` gives join, joined and donor (donor wins over joined);
  - `takePendingJoin` returns the saved key once, and none after an hour or with storage blocked;
  - `parseMilestones` reads `waiting` and defaults it to 0.
- [ ] **Step 2: Run** `npm test -- lists`. Expected: FAIL.
- [ ] **Step 3: Implement**, including every `t.lists` string in all three dictionaries (the key-parity test enforces it).
- [ ] **Step 4: Run** the front-end checks. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(viewer): lists' data, calls and words`.

### Task 8: The join sign and its sign-in

**Files:**
- Create: `tinyworlds-frontend/src/components/lists/join-sign.tsx`, `src/hooks/use-join-return.ts`
- Modify: `src/components/sign-in/sign-in.tsx` (an optional `list?: string` passed to `requestLink`)
- Test: `src/lib/__tests__/lists.test.ts`. The viewer's tests are pure-function tests in a node environment, with no component tests, so the sign's logic lives in `lib/lists.ts` as `joinStep(...)` and `joinWords(t, list)`, and is tested there.

**Interfaces:**
- Consumes: `SignIn` (`purpose="donor"`, `words`, `notice`, `verifying`, `onSession`), `donorStore`, `useLists` and `savePendingJoin`/`takePendingJoin` (Task 7).
- Produces:
  - `<JoinSign open: boolean; list: ListKey | null; onOpenChange(open: boolean): void; onHelp?(city: string): void />`. It is a shadcn `Dialog` styled as a `sign`, with three steps.
    - **Signed out:** `SignIn` with join words and `list={listParam(list)}`. Before it asks, it saves the pending join.
    - **On session:** it stores the session in `donorStore`, calls `join(list)` and shows step 3.
    - **Signed in already:** it never opens. The caller joins directly. `JoinSign` is only for the signed-out path and the return from a link.
    - Step 3 (copy from `t.lists.join`): a check in a yellow circle (lucide `Check`), the title, the body with the session's email, "Help build {city}" for a city (calls `onHelp(city.name)`), and Close.
  - `useJoinReturn(): { list: ListKey | null; verifying: boolean; done: boolean }`, for the front page opened from a sign-in link (`#token=` in the hash).
    - It takes the token out of the address at once, as `MeApp` does, and calls `verifyLink(token, "donor")`.
    - It stores the session and refreshes lists.
    - With a pending join, it answers that list, so the front page opens `JoinSign` at step 3.
    - Without one (another device), it just signs in quietly.

- [ ] **Step 1: Write the failing tests:**
  - `joinStep({ signedIn, joined, failed })` gives `"sign-in" | "joining" | "done" | "failed"`;
  - `joinWords(t, list)` gives the city's title and body with the name filled in, the new-cities forms, and no "Help build" for new cities.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** Icons are lucide `Bell` and `Check`, never emoji.
- [ ] **Step 4: Run** the front-end checks. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(viewer): the join sign, signing in to join a list`.

### Task 9: The buttons, the counts, and the front page

**Files:**
- Create: `tinyworlds-frontend/src/components/lists/tell-me-button.tsx`, `src/components/lists/new-cities-button.tsx`
- Modify: `src/components/donate/city-fund-card.tsx` (a third button, and `waiting` in the status line), `src/components/donate/build-next.tsx` (pass the handlers), `src/components/home/next-city-tile.tsx` (the new-cities button beside "Fund a city", in `QUIET`/outline style), `src/components/home/landing.tsx` (owns `JoinSign`, `useJoinReturn`, `useLists`; one sign at a time with Donate and Benefactors)
- Test: `src/lib/__tests__/lists.test.ts` (the status line's words: `waitingLine`)

**Interfaces:**
- Consumes: `useLists`, `cityListState`, `JoinSign`, `useDonorSession`.
- Produces:
  - `<TellMeButton city: CityMilestone; state: "join" | "joined" | "donor"; onJoin(): void; onLeave(): void />`:
    - `join`: bell and `t.lists.tellMe`, in the ghost pill style.
    - `joined`: check and `t.lists.toldYou`, in the accent; pressing it leaves.
    - `donor`: check and `t.lists.toldYou`, not a button that leaves. Use `aria-disabled` with a title explaining their donor mail covers it.
    - Every state carries its `aria-label`.
  - `<NewCitiesButton on: boolean; onJoin(); onLeave() />`.
  - `waitingLine(n: number, locale, t): string | null` (in `lib/lists.ts`): null at 0.
  - `CityFundCard` gains `onTellMe?(city: CityMilestone): void`, `onLeave?(city: CityMilestone): void` and `listState?`. Without them (no API) there is no button.

What a press does:
- **Signed in:** `join` or `leave` straight away. If the join fails, a sonner `toast` (as `use-site-effects.ts` uses) says `t.lists.join.failed`.
- **Signed out:** open `JoinSign` for that list.

The front page is laid out once, so the three buttons on a card must fit: `flex-wrap` with `flex-1` pills. At the smallest card width, keep `Tell me` short (its label is the word, the aria carries the city).

- [ ] **Step 1: Write the failing tests:** `waitingLine` gives null, "1 waiting" and "12 waiting" (with a pt-BR form), and `cityListState` cases already exist from Task 7.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the front-end checks. Then build the front page and look at it.
  - Build: `NEXT_PUBLIC_WORLD=home npm run build` with `public/data` moved away by absolute path, as `CLAUDE.md` says.
  - Serve it against a local API with a throwaway database. My notes on this: build the export, serve it, and drive it with puppeteer from `tinyworlds-videos`.
  - Check four things: a card's three buttons at 320 px and at desktop width, the tile's two buttons, the join sign's three steps (code typed from the API's log), and the button flipping to "You'll be told" and back.
- [ ] **Step 5: Commit:** `feat(viewer): "Tell me" on every city being funded, and how many wait`.

### Task 10: "Your lists" on `/me/`, and the leave page

**Files:**
- Create: `tinyworlds-frontend/src/components/me/your-lists.tsx`, `src/app/lists/leave/page.home.tsx`, `src/components/lists/leave-page.tsx`
- Modify: `src/components/me/me-page.tsx` (the section, above "Your links"; the "Build the next city" cards there get `onTellMe` too)
- Test: `src/lib/__tests__/lists.test.ts` (pure helpers: `leaveTokenFromHash(hash: string): string | null`; the leave page's state reducer `leaveState`)

**Interfaces:**
- Consumes: `useLists`, `leaveWithToken`, `JoinSign`, `HallFrame` or the frame `/me/` uses (match `/me/`'s frame).
- Produces:
  - `<YourLists />`. Strings in `t.lists.me`:
    - title `Your lists`;
    - a row per city: name, status (the ranking's words, such as `US$10 of US$30` or `Funded, in the queue`) and `Leave`;
    - `New cities` with `Leave`;
    - when empty: `You're not waiting for any city yet.`, the `NewCitiesButton`, and `Or press "Tell me" on a city below.`.
  - `/lists/leave/` (`noindex`, like `/me/`):
    - It reads `#t=` once and takes it out of the address at once.
    - It calls `leaveWithToken(t, false)` and shows `You've left the list.`, or `That link doesn't work any more. You can still leave from Your cities.` for `false`.
    - It has `Leave all lists` (calls `leaveWithToken(t, true)`, then `You've left every list.`) and `Join again`, which opens `JoinSign` for new cities, or links to `/#ranking` for a city.
    - Strings go in `t.lists.leave`.

- [ ] **Step 1: Write the failing tests:** `leaveTokenFromHash`, and `leaveState` transitions (loading, left, left-all, bad, failed).
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the front-end checks. Build and look at `/me/` (signed in, with and without lists) and `/lists/leave/#t=…` with a good token and a tampered one.
- [ ] **Step 5: Commit:** `feat(viewer): your lists on Your cities, and a page to leave from a mail`.

### Task 11: Counts on the admin page, and the docs

**Files:**
- Create: `tinyworlds-frontend/src/components/admin/list-counts.tsx`
- Modify: `src/lib/admin-api.ts` (`fetchListCounts(session): Promise<ListCounts>`), `src/components/admin/admin-app.tsx` (the table, loaded apart like `names.tsx`)
- Modify: root `CLAUDE.md` (the API contract block; "How the pieces fit": a bullet on lists), `tinyworlds-frontend/CLAUDE.md` (Layout, the front page's tile and cards, `/me/`, `/lists/leave/`, admin), `README.md` if anything in setup changed
- Test: `src/lib/__tests__/admin.test.ts` (`parseListCounts`)

**Interfaces:**
- Produces: `parseListCounts(raw: unknown): ListCounts | null` and `<ListCounts />`.
  - The table: `Waiting to hear`, with a row per city (most first) and a `New cities` row.
  - Counts only, never an address. Strings in `t.admin.lists`.

- [ ] **Step 1: Write the failing test** for `parseListCounts`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement**, then write the docs.
- [ ] **Step 4: Run** the full checks in both projects, then `deploy/deploy.sh check` from the worktree (with a copy of `deploy/.env`; it must still report every world as before). Expected: PASS.
- [ ] **Step 5: Commit:** `feat(admin): how many are waiting, and docs for the lists`.

---

## After the plan: shipping (by the owner's leave)

Merging to main deploys the API, then the viewers. Nothing is mailed to anyone by the merge itself: the migration marks every world already on the map as told, and the welcome mails only go out when someone joins. Ask the owner before merging, as with every PR here. After the deploy:
- join a list on the live site from a test address;
- check the welcome mail arrives with its three pictures;
- leave it from the mail's link.
