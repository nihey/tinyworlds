# Benefactors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donors become Founding Benefactors (first US$100 of a city, as 100 stones) or Benefactors
of the cities they give to. They can choose to be listed by name, and can sign in with an emailed
link or code to see "your cities".

**Architecture:**
- **API:** a new `benefactors` module in `tinyworlds-api`. A pure `cityStanding()` turns a city's
  donations into stones, founders and benefactors. The webhook records the donor (Stripe's email)
  on each donation, together with the gift's own `listed` flag.
- **Sign-in:** extended so the mail carries a link and a 6-digit code, and so donors get sessions
  too. Admin stays the default: a route is admin-only unless it says otherwise.
- **Viewer:** a benefactors sign and an About panel, the Donate sign's stones preview and "Put my
  name on" block, a `/me/` page in the front page's build, and a names list on the admin page.

**Tech Stack:** NestJS 12, GraphQL code-first, Prisma 7 + Postgres, Stripe 23, vitest, Next.js 16
static export, React 19, Apollo Client 4, Tailwind v4, shadcn/ui.

**Spec:** `docs/superpowers/specs/2026-11-11-benefactors-design.md`. Read it first; this plan
argues from it. Mockup: `.superpowers/brainstorm/*/content/benefactors-screens-v7.html`. Its
`ART` pixel maps are the badge art.

## Global Constraints

- The repository is public. No domain, host, sender address, Stripe id or secret in any tracked
  file; examples use `example.com`. Run `git diff --cached` and check before every commit.
- npm, Node 22, TypeScript strict. In each project you touch, `npm run lint:fix`, `npm run
  typecheck` and `npm test` must pass before committing. In the API, run `npm run test:e2e` too
  (it needs `docker compose up -d`).
- API: ESM with `.js` in import paths. Snake_case columns via `@map`/`@@map`. UUID ids. Every new
  resolver is admin-only unless it is marked `@Public()` or `@ForDonors()`.
- Viewer: no hard-coded interface strings. Every new string goes in `src/i18n/types.ts` and in
  `en.ts`, `pt-BR.ts` and `es-ES.ts`, with the same `{placeholders}`. Never use browser-native
  modals. Apollo and the API modules are imported lazily (`await import(...)`), as `donate-api.ts`
  and `admin-api.ts` are now.
- One stone is US$1 (`STONE_CENTS = 100`). A city has `ceil(goalCents / 100)` stones.
- Display names are 1 to 40 characters (`NAME_MAX = 40`), plain text, and must contain at least
  one letter or digit.
- Codes are 6 digits (`CODE_DIGITS = 6`). After 5 wrong tries the link is spent
  (`CODE_TRIES = 5`). The existing rules stay: links last 15 minutes (`LINK_MINUTES`), one is
  sent per minute (`LINK_EVERY_MS`), and each works once.
- Titles:
  - en-US: Founding Benefactor / First Stone / Keystone / Benefactor
  - pt-BR: Benfeitor Fundador / Pedra Fundamental / Pedra-Chave / Benfeitor
  - es-ES: Benefactor Fundador / Primera Piedra / Piedra Clave / Benefactor
- The founding badge's short label:
  - en-US: `FOUNDER NO. {n}`
  - pt-BR: `FUNDADOR Nº {n}`
  - es-ES: `FUNDADOR N.º {n}`
- Emails never appear in GraphQL types, logs (log the donor id) or the admin funnel. The only
  exception is the person's own sign-in answer, which echoes the address they typed.
- No answer, its timing, or page text may say whether an address has donated. Contract changes
  ship API first, then the viewers (as in the root `CLAUDE.md`).

## Review Focus

1. **A donor session on an admin route, and an admin session on a donor route.** Both must be
   refused with `FORBIDDEN`, never answered. The test is in Task 6.
2. **A code pasted as "482 913", "482-913" or " 482913 ".** It must be accepted as `482913`, in
   the API and in the viewer. The tests are in Tasks 5 and 10.
3. **A paid session with no `customer_details.email`, or a malformed or over-long one.** The
   donation is still recorded, with `donorId` null and the gift unlisted. The test is in Task 3.
4. **A name of only spaces, emoji modifiers, zero-width or control characters, or over 40
   characters.** It is refused, or cleaned to at most 40 characters. The test is in Task 2.
5. **Two first donations from the same new email recorded at the same moment.** Both donations
   are recorded and there is one donor. The test is in Task 3 (using
   `commitDuringNextTransaction`).

---

## Part A: API (`tinyworlds-api/`)

### Task 1: `cityStanding`, the pure arithmetic of stones, founders and benefactors

**Files:**
- Create: `src/benefactors/standing.ts`
- Test: `src/benefactors/standing.spec.ts`

**Interfaces:**
- Produces:

```ts
export const STONE_CENTS = 100;
export interface Gift {
  id: string; donorId: string | null; amountCents: number; at: Date;
  /** the public name when this gift is listed and its donor's name is set and not hidden; else null */
  name: string | null;
}
export interface GiftPlace {
  number: number | null;      // founding number of this gift; null when it lays no stone
  stones: number[];           // 1-based stone indices this gift laid
  firstStone: boolean; keystone: boolean;
}
export interface FounderRow { number: number; name: string | null; amountCents: number; stones: number; firstStone: boolean; keystone: boolean }
export interface BenefactorRow { rank: number; name: string | null; amountCents: number }
export interface Standing {
  stoneCount: number;
  stones: (number | null)[];  // per stone: the founder ROW number that laid it, or null
  founders: FounderRow[];     // by number
  benefactors: BenefactorRow[]; // by rank
  places: Map<string, GiftPlace>; // by gift id
}
export function cityStanding(gifts: Gift[], goalCents: number): Standing;
```

The algorithm is set by the spec and isn't fully pinned by the tests, so here it is:

```
sort gifts by (at, id); cum = 0
stoneCount = ceil(goal / 100); stone i (1-based) is laid by the gift covering cent min(i·100, goal) − 1
for each gift: start = cum, end = cum + amount, cum = end
  founding = start < goal; number = founding ? ++n : null
  stones = { i : start ≤ min(i·100, goal) − 1 < min(end, goal) }
rows: a founding gift with name ≠ null and donorId ≠ null joins the row of the same donorId's
  earlier named founding gift (row number = the first gift's number, name = that name,
  amountCents and stones summed). Every other founding gift is a row of its own.
  amountCents of a row = the full amounts of its gifts (a crossing gift counts whole).
  firstStone = the row holds stone 1; keystone = the row holds stone stoneCount.
benefactors: the gifts with start ≥ goal, minus named gifts whose donorId already has a named
  founder row. Named gifts are grouped by donorId and summed; the rest are rows of their own.
  Sort by amountCents desc, then by earliest gift (at, id). rank = 1..n.
```

- [ ] **Step 1: Write the failing tests** in `standing.spec.ts`, with goal `10_000` unless stated. Use a helper `gift(id, cents, minute, name?, donorId?)`.
  - `empty city`: `stones` has length 100, all null. `founders` and `benefactors` are `[]`.
  - `one named gift lays its stones`: `[gift('a',1200,1,'Marta','d1')]` → `founders == [{number:1,name:'Marta',amountCents:1200,stones:12,firstStone:true,keystone:false}]`. `stones[0..11]` are 1, `stones[12]` is null.
  - `the gift that crosses the line is a founder and keeps its whole amount`: `a 8000 anon, b 5000 'Bia' d2` → `founders[1] == {number:2,name:'Bia',amountCents:5000,stones:20,firstStone:false,keystone:true}`. `benefactors == []`.
  - `one gift can hold both the First Stone and the Keystone`: a single gift of 15000 → `firstStone && keystone`, `stones:100`.
  - `a stone belongs to whoever pays its last cent`: `1250` then `100` → stones 12 then 1. `places.get(second).stones == [13]`.
  - `a named person's founding gifts are one row`: `d1 'Ana' 1000 @1`, `e anon 500 @2`, `d1 'Ana' 700 @3` → founder rows `[{number:1,name:'Ana',amountCents:1700,stones:17}, {number:2,name:null,…}]`. `places.get(third).number == 3`. `stones[15..21]` are 1.
  - `anonymous gifts never join`: two gifts from the same donorId, both `name: null` → two rows, numbers 1 and 2.
  - `benefactors are ranked by total, ties by who gave first`: after a funded city, `X 'Xu' 4000`, `Y anon 2500`, `X 'Xu' 8000`, `Z anon 2500` → `[{rank:1,name:'Xu',amountCents:12000},{rank:2,name:null,amountCents:2500 /*Y*/},{rank:3,…Z}]`.
  - `a named founder is not listed again among benefactors`: a named founder's later named gift → not in `benefactors`. Their later unnamed gift → an anonymous benefactor row.
  - `order is by time, not by input order`: the same gifts shuffled give the same result.
  - `a goal that is not whole dollars`: goal 250 → `stoneCount 3`. A gift of 250 → stones `[1,2,3]`.
- [ ] **Step 2: Run** `npx vitest run src/benefactors/standing.spec.ts`. Expected: FAIL (module not found).
- [ ] **Step 3: Implement `cityStanding`** in `src/benefactors/standing.ts` as described above.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): compute a city's stones, founders and benefactors`.

### Task 2: Display names

**Files:**
- Create: `src/benefactors/display-name.ts`
- Test: `src/benefactors/display-name.spec.ts`

**Interfaces:**
- Produces: `export const NAME_MAX = 40; export function cleanDisplayName(raw: unknown): string | null`

- [ ] **Step 1: Write failing tests.** Each line below is input → expected output:
  - `'  Ana   from\tRecife '` → `'Ana from Recife'`
  - `'é'.repeat(41)` → 40 `é`s
  - `'a' + '𝒜'.repeat(40)` → `'a'` followed by 39 `𝒜` (it cuts by code points, so a surrogate pair is never split)
  - `'​‍ '` → `null`
  - `'Ana\u0000\u001f'` → `'Ana'`
  - `'José'` in NFD → the NFC `'José'`
  - `'👍🏽'` → `null` (no letter or digit)
  - `42` → `null`
  - `'the_cartographer'` → unchanged
- [ ] **Step 2: Run** `npx vitest run src/benefactors/display-name.spec.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
  1. NFC-normalize.
  2. Remove `\p{Cc}` and `\p{Cf}`.
  3. Collapse `\s+` to one space and trim.
  4. Cut to 40 code points (`Array.from`) and trim again.
  5. Return null unless `/[\p{L}\p{N}]/u` matches.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(api): clean display names`.

### Task 3: Donors on donations (schema, webhook, checkout input)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_donors/migration.sql` (via `npm run db:migrate -- --name donors`)
- Modify: `src/donations/donation-facts.ts`, `src/donations/donations.service.ts` (`createCheckout`, `insert`), `src/donations/dto/create-donation-checkout.input.ts`
- Modify: `test/fake-prisma.ts` (donors; `donation.create` takes `donorId`/`listed`), `test/fake-stripe.ts` (`SessionOptions.email`)
- Test: `src/donations/donation-facts.spec.ts`, `src/donations/donations.service.spec.ts`, `src/donations/dto/create-donation-checkout.input.spec.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `cleanDisplayName` (Task 2).
- Produces:
  - Prisma `Donor { id, email @unique, displayName String? @map("display_name"), nameHidden Boolean @default(false) @map("name_hidden"), lastLoginAt DateTime? @map("last_login_at"), createdAt, updatedAt, donations Donation[] }`, mapped to `donors`.
  - `Donation.donorId String? @db.Uuid @map("donor_id")` (relation `onDelete: SetNull`, `@@index([donorId])`).
  - `Donation.listed Boolean @default(false)`.
  - `DonationFacts.email: string | null` (lower case, trimmed; null if missing, not an email, or over 254 characters).
  - `DonationFacts.benefactorName: string | null` (from `metadata.benefactor_name`, run through `cleanDisplayName`).
  - `CreateDonationCheckoutInput.benefactorName?: string | null` (trimmed, `MaxLength(NAME_MAX)`). If `cleanDisplayName` gives null, `createCheckout` throws `BadRequestException('benefactorName needs a letter or a digit')`. It's sent as metadata `benefactor_name` only when a city is named.

- [ ] **Step 1: Write failing tests.**
  - `donation-facts.spec.ts`:
    - "reads the donor's email from customer_details, in lower case": `checkoutSession({ email: ' Ana@Example.COM ' })` gives `email == 'ana@example.com'`.
    - "has no email when Stripe gave none or a bad one": none, `'not-an-email'` and a 300-character address each give `null`.
    - "reads the listing name from the metadata, cleaned": `metadata.benefactor_name = '  Ana  '` gives `'Ana'`. A missing or blank name gives `null`.
  - `donations.service.spec.ts`:
    - "records the donor once per email, and the gift as listed when it carried a name": two sessions from the same email, the second with a name. Expect one donor, both donations with that `donorId`, `listed` false then true, and `displayName` `'Ana'`.
    - "never replaces a name the donor already has": the donor has `'Ana'`, and a new checkout says `'Fake'`. The name stays `'Ana'` and the new gift is `listed: true`.
    - "a name with no city lists nothing": `listed` is false.
    - "still records a donation with no email": `donorId` is null and the bar moves.
    - "two first donations from one new email at once make one donor": use `commitDuringNextTransaction` to insert the donor mid-transaction. Expect both donations recorded and `donors.length == 1`.
  - `create-donation-checkout.input.spec.ts`: a 41-character name is refused. `'  Ana '` is accepted.
  - `test/app.e2e-spec.ts`, new test "puts the listing name into the checkout's metadata and records it from the webhook": `createDonationCheckout` with `{ city: 'Lisbon', benefactorName: 'Ana' }`. FakeStripe's last `create` call has `metadata.benefactor_name == 'Ana'`. Then a signed webhook with that metadata and an email. The database has a donor and a donation with `listed: true`.
- [ ] **Step 2: Run** `npx vitest run src/donations` and `npm run test:e2e`. Expected: the new tests FAIL.
- [ ] **Step 3: Implement.**
  - Schema and migration.
  - In `insert`, inside the existing transaction and before `donation.create`, when `facts.email` is set: `tx.donor.upsert({ where: { email }, create: { email, displayName: facts.benefactorName }, update: {} })`. Then, if `facts.benefactorName` is set and the donor's `displayName` is null, `tx.donor.update` it.
  - `listed = facts.benefactorName !== null && city !== null && donor !== null`.
  - The existing P2002 retry in `record()` covers the donor race. Don't add another.
  - Extend `FakePrisma` with `donors: DonorRow[]` and the calls used here.
  - Add `email?: string | null` to `SessionOptions`. It becomes `customer_details: { email }`.
- [ ] **Step 4: Run** the unit tests and e2e. Expected: PASS. Then run `npm run lint:fix && npm run typecheck`.
- [ ] **Step 5: Commit** `feat(api): record each donation's donor and its listing`.

### Task 4: The public `cityBenefactors` query

**Files:**
- Create: `src/benefactors/benefactors.module.ts`, `benefactors.service.ts`, `benefactors.resolver.ts`, `models/city-benefactors.model.ts`, `dto/city-benefactors.input.ts`
- Modify: `src/app.module.ts` (import `BenefactorsModule`)
- Test: `test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `cityStanding`, `Gift` (Task 1). `Donor`/`listed` (Task 3).
- Produces:
  - GraphQL:
    ```graphql
    input CityBenefactorsInput { slug: String  world: String }   # exactly one; world matches WORLD_PATTERN
    type FounderRow { number: Int! name: String amountCents: Int! stones: Int! firstStone: Boolean! keystone: Boolean! }
    type BenefactorRow { rank: Int! name: String amountCents: Int! }
    type CityBenefactors { slug: String! name: String! status: CityStatus! worldId: String goalCents: Int! raisedCents: Int!
      stones: [Int]!  founders: [FounderRow!]!  benefactors: [BenefactorRow!]! }
    type Query { cityBenefactors(input: CityBenefactorsInput!): CityBenefactors }   # null: unknown or hidden city
    ```
  - `BenefactorsService.giftsOf(cityId): Promise<Gift[]>`. It reads the donations in `usd` for that city, ordered by `createdAt, id`. It sets `name = listed && donor?.displayName && !donor.nameHidden ? displayName : null` and `at = createdAt`. Later tasks reuse it.
  - `BenefactorsService.cityBenefactors(input): Promise<CityBenefactors | null>`. `raisedCents` and `goalCents` come from the city row.
- `@Public()`, `@UseGuards(GqlThrottlerGuard)`, `@Throttle({ default: { limit: 60, ttl: 60_000 } })`. Giving both `slug` and `world`, or neither, is `BAD_REQUEST`.

- [ ] **Step 1: Write failing e2e tests** in a new `describe('benefactors')`:
  - "answers a city's stones, founders and benefactors, with names only for listed gifts": seed via webhooks, every gift naming Lisbon:
    1. 1200 from `ana@example.com` named `'Ana'`.
    2. 8800 from `bo@example.com` with no name.
    3. 3000 from `ana@example.com` named.

    Expect:
    - `founders == [{number:1,name:'Ana',amountCents:1200,stones:12,firstStone:true,keystone:false},{number:2,name:null,amountCents:8800,stones:88,firstStone:false,keystone:true}]`
    - `benefactors == []` (Ana is already a named founder)
    - `stones.length == 100`, `stones[0] == 1`, `stones[99] == 2`

    The JSON answer must not contain `example.com` anywhere.
  - "finds a built city by its world": the seeded `tinynyc` → `slug == 'new-york'`, `founders == []`.
  - "says null for a hidden city and for one that does not exist".
  - "hides a name an admin hid": set `name_hidden` via Prisma → that row's `name` is null, and its stones are unchanged.
- [ ] **Step 2: Run** `npm run test:e2e`. Expected: FAIL.
- [ ] **Step 3: Implement** the module, service, resolver, models and input as above.
- [ ] **Step 4: Run** `npm run test:e2e && npm test`. Expected: PASS.
- [ ] **Step 5: Update `tinyworlds-api/CLAUDE.md`.** Add `benefactors/` to Structure and the query to Contract. Add a "Benefactors" section with the stone rule, numbering, grouping guards and hidden names. **Commit** `feat(api): public cityBenefactors query`.

### Task 5: Sign-in codes (admins, as today)

**Files:**
- Modify: `prisma/schema.prisma` (MagicLink: `codeHash String @map("code_hash")`, `attempts Int @default(0)`), with a migration that runs `DELETE FROM magic_links;` before adding the NOT NULL column
- Modify: `src/auth/auth.service.ts`, `src/auth/sign-in-mail.ts`, `src/auth/auth.controller.ts`, `src/auth/dto/verify-link.dto.ts`
- Modify: `test/fake-prisma.ts`
- Test: `src/auth/auth.service.spec.ts`, `src/auth/sign-in-mail.spec.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `export const CODE_DIGITS = 6; export const CODE_TRIES = 5;`
  - `export function normalizeCode(raw: string): string | null`: strips everything but digits, and returns null unless exactly 6 digits remain.
  - `export function formatCode(code: string): string`: `'482913'` → `'482 913'`.
  - `export const hashCode = (secret: string, tokenHash: string, code: string): string`: HMAC-SHA256 of `${tokenHash}:${code}`, as hex.
  - `AuthService.sendLink` makes a code with `crypto.randomInt(0, 10 ** 6)`, zero-padded, and stores `hashCode(sessionSecret(config), tokenHash, code)`.
  - `AuthService.verifyCode(email: string, code: string): Promise<Session>`. It looks up the admin by lower-cased email, then their newest link with `usedAt: null` and `expiresAt > now`. It compares with `timingSafeEqual`.
    - Wrong code: `attempts += 1`, and once `attempts >= CODE_TRIES` it sets `usedAt`. Either way it throws the same 401 as `verify`.
    - Right code: spends the link with the same single `updateMany … usedAt: null` as `verify`.
  - `VerifyLinkDto`: `token?` (length 20–200), `email?` (`IsEmail`), `code?` (normalized by `Transform` with `normalizeCode`, then `Matches(/^\d{6}$/)`). Use `ValidateIf`: a token, or both email and code, is required.
  - The controller dispatches to `verify(token)` or `verifyCode(email, code)`.
  - `signInMail(locale, link, code, minutes, purpose)`. The subject carries the code:
    - en: `Your tinyworlds code: {code}`
    - pt-BR: `Seu código do tinyworlds: {code}`
    - es-ES: `Tu código de tinyworlds: {code}`

    The body has the wordmark "tinyworlds" in dark ink (`#15171a`), the button, the line "Or type this code on the page:" (pt `Ou digite este código na página:`, es `O escribe este código en la página:`), the code in large monospace, the "works once" line now saying "Both work once, for {minutes} minutes." (pt `Os dois funcionam uma única vez, por {minutes} minutos.`, es `Los dos funcionan una sola vez, durante {minutes} minutos.`), and the ignore line. `purpose` is `'admin'` for now. Task 6 adds the donor wording.

- [ ] **Step 1: Write failing tests.**
  - `auth.service.spec.ts`:
    - "mails a code with the link, and keeps only its HMAC": the fake mailer's subject contains a `\d{3} \d{3}` code. The row's `codeHash` is not the code and equals `hashCode(secret, tokenHash, code)`.
    - "trades the right code for a session, once": a second `verifyCode` with the same code → 401.
    - "spends the link after five wrong codes, even for the right one after": 5× wrong, then right → 401.
    - "a code spends the link, and the link spends the code": `verify(token)` after `verifyCode` → 401, and the reverse.
    - "refuses a code for an address that is not an admin, the same way".
  - `normalizeCode`: `'482 913'`, `'482-913'` and `' 482913 '` → `'482913'`. `'48291'` and `'4829134'` → null.
  - `sign-in-mail.spec.ts`: for each locale, the subject ends with the formatted code, and both `text` and `html` contain it.
  - e2e "signs an admin in with the code from the mail": read the code from FakeMailer's subject, `POST /api/auth/verify { email, code: '482 913' format }` → 200 with `admin.email`.
- [ ] **Step 2: Run** `npx vitest run src/auth && npm run test:e2e`. Expected: FAIL.
- [ ] **Step 3: Implement** as in Interfaces.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Update `tinyworlds-api/CLAUDE.md`** ("Admins and signing in": link + code, tries, HMAC). **Commit** `feat(api): sign-in mail carries a one-time code`.

### Task 6: Donors sign in (purpose, session kinds, the guard)

**Files:**
- Modify: `prisma/schema.prisma` (MagicLink: `adminId String?`, `donorId String? @map("donor_id")` → Donor with `onDelete: Cascade`, `@@index([donorId, createdAt])`) and its migration
- Modify: `src/auth/auth.service.ts`, `auth.controller.ts`, `dto/request-link.dto.ts`, `dto/verify-link.dto.ts`, `jwt.strategy.ts`, `jwt-auth.guard.ts`, `current-admin.decorator.ts`, `sign-in-mail.ts`, `src/config/env.ts`
- Create: `src/auth/for-donors.decorator.ts`, `src/auth/current-donor.decorator.ts`
- Test: `src/auth/auth.service.spec.ts`, `src/config/env.spec.ts`, `test/app.e2e-spec.ts`

**Interfaces:**
- Produces:
  - `export type Purpose = 'admin' | 'donor'`.
  - `export interface SessionIdentity { kind: Purpose; id: string; email: string }`.
  - JWT payload `{ sub, kind }`. A token with no `kind` is an admin's, so live admin sessions keep working.
  - `RequestLinkDto.purpose?: Purpose` (default `'admin'`). `VerifyLinkDto.purpose?: Purpose` (default `'admin'`; used only with a code).
  - `sendLink(address, target, locale, purpose)`:
    - `'admin'` as today.
    - `'donor'`: only when `prisma.donor.findFirst({ where: { email, donations: { some: {} } } })` finds one. Nothing else differs (one link a minute per account, same answer).
  - `verify(token)` reads the link's kind from whichever of `adminId`/`donorId` is set. `verifyCode(email, code, purpose)`.
  - `Session` becomes `{ accessToken, expiresAt, identity: SessionIdentity }`. The controller answers `{ accessToken, expiresAt, admin: {id,email} }` for an admin and `{ accessToken, expiresAt, donor: {id,email} }` for a donor. A donor sign-in sets `donor.lastLoginAt`.
  - `AuthService.identityOf(kind, id): Promise<SessionIdentity | null>`. It replaces `adminOf`; an admin is still checked against `ADMIN_EMAILS`.
  - `@ForDonors()` sets metadata `SESSION_KIND = 'donor'`.
  - `JwtAuthGuard.canActivate` becomes async. If the route is public, allow it. Otherwise `await super.canActivate`, then require `user.kind === (kind metadata ?? 'admin')`, else throw `ForbiddenException`.
  - `CurrentAdmin` returns `{ id, email }` from the identity. `CurrentDonor` returns `{ id, email }`.
  - The donor mail: button "See your cities" (pt `Ver suas cidades`, es `Ver tus ciudades`), intro "Here's how to see the cities you helped build." (pt `Veja aqui as cidades que você ajudou a construir.`, es `Así puedes ver las ciudades que ayudaste a construir.`).
  - Env: in **production**, `JWT_SECRET` (at least 32 characters), `SMTP_HOST` and `MAIL_FROM` are always required, because donors sign in whether or not there are admins. The existing rule (`ADMIN_EMAILS` set → `JWT_SECRET` at least 32) stays.

- [ ] **Step 1: Write failing tests.**
  - auth.service:
    - "mails a donor who has given": a donor row with one donation and purpose `'donor'` → a mail goes out.
    - "mails nobody for an address with no donations, or for a donor asked as an admin".
    - "a donor's link gives a donor session".
  - env.spec:
    - "production needs a session secret and a mail server even without admins".
    - "development needs neither".
  - e2e:
    - "a donor signs in with the link or the code".
    - "a donor session is refused by admin queries, and an admin session by donor ones": `donationFunnel` with a donor token → `errors[0].extensions.code == 'FORBIDDEN'`. Use the Task 7 query `myGiving` with an admin token → `FORBIDDEN`. Write this assertion in Task 7 if that query doesn't exist yet.
    - "an admin token from before this change still works": sign a JWT `{ sub }` with no `kind` → `me` answers.
    - "asking for a donor link answers the same for any address": the same status and body for a donor's address and a stranger's.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Update the docs.**
  - `tinyworlds-api/CLAUDE.md`: signing in for donors, `@ForDonors()`, session kinds.
  - `README.md` and `.env.example`: the new production requirement.
  - The root `CLAUDE.md` API contract: REST signing in now carries `purpose`, and verify takes `{ email, code, purpose }`.

  **Commit** `feat(api): donors sign in; routes stay admin-only unless marked`.

### Task 7: The donor's own queries

**Files:**
- Create: `src/benefactors/my-giving.resolver.ts`, `models/my-giving.model.ts`, `dto/set-listing.input.ts`, `dto/set-display-name.input.ts`
- Modify: `src/benefactors/benefactors.service.ts`
- Test: `test/app.e2e-spec.ts`

**Interfaces:**
- Consumes: `giftsOf`, `cityStanding().places` (Tasks 1 and 4). `@ForDonors`, `CurrentDonor` (Task 6). `cleanDisplayName` (Task 2).
- Produces:
  ```graphql
  type MyCity { slug: String! name: String! status: CityStatus! worldId: String goalCents: Int! raisedCents: Int!
    givenCents: Int!  founderNumber: Int  stones: [Int!]!  firstStone: Boolean!  keystone: Boolean!  listed: Boolean! }
  type MyGiving { displayName: String  cities: [MyCity!]!  projectCents: Int! }
  input SetListingInput { city: String! (slug)  listed: Boolean! }
  input SetDisplayNameInput { name: String! }
  Query    { myGiving: MyGiving! }                                   # @ForDonors
  Mutation { setListing(input: SetListingInput!): Boolean!  setDisplayName(input: SetDisplayNameInput!): String! }  # @ForDonors
  ```
  - `cities` are ordered by the donor's latest gift there, newest first.
  - `givenCents` counts all of the donor's gifts to the city in USD (the gifts `giftsOf` reads).
  - `founderNumber` is the smallest `places.get(id).number` among their gifts. `stones` are all their stone indices, sorted.
  - `listed` is true if any of their gifts there is listed.
  - `projectCents` is the sum of their gifts with no city.
  - `setListing` updates `listed` on every one of the donor's gifts to that city. `listed: true` with no `displayName` → `BadRequestException('Choose a name first')`.
  - `setDisplayName` cleans the name (`BAD_REQUEST` if null), saves it and returns it.

- [ ] **Step 1: Write failing e2e tests.**
  - "a donor sees their cities, titles and stones": continue the Task 4 seeds and sign in as Ana. Expect `cities[0] == { slug:'lisbon', givenCents: 4200, founderNumber: 1, stones: [1..12], firstStone: true, keystone: false, listed: true }`.
  - "switching a city's listing changes every gift there": `setListing(lisbon, false)` → `cityBenefactors` row 1 `name == null`.
  - "listing needs a name first": a donor with no name → `BAD_REQUEST`.
  - "a name is cleaned and used everywhere": `setDisplayName('  Ana  B ')` → `'Ana B'`, and the public row shows it.
  - The cross-session `FORBIDDEN` assertion left from Task 6.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Update the docs** (API `CLAUDE.md` contract). **Commit** `feat(api): a donor's own cities, listing and name`.

### Task 8: Admins hide names; past donations get their donors

**Files:**
- Create: `src/benefactors/names.resolver.ts`, `models/benefactor-name.model.ts`, `dto/set-name-hidden.input.ts`, `src/benefactors/backfill.ts`, `prisma/backfill-donors.ts`
- Modify: `package.json` (`"donors:backfill": "tsx prisma/backfill-donors.ts"`), `test/fake-stripe.ts` (`checkout.sessions.retrieve`)
- Test: `test/app.e2e-spec.ts`, `src/benefactors/backfill.spec.ts`

**Interfaces:**
- Produces:
  ```graphql
  type BenefactorName { donorId: ID!  name: String!  hidden: Boolean!  cities: [String!]!  lastGiftAt: DateTime! }
  Query    { benefactorNames: [BenefactorName!]! }           # admin; donors with a name and ≥1 listed gift, newest gift first, at most 100
  Mutation { setNameHidden(input: { donorId: ID!, hidden: Boolean! }): Boolean! }   # admin
  ```
  - `export async function backfillDonors(prisma: PrismaService, stripe: StripeClient, log: (line: string) => void): Promise<{ filled: number; skipped: number }>`. For each donation with `donorId: null`, it calls `stripe.checkout.sessions.retrieve(id)`, reads `customer_details.email` with the same rule as `DonationFacts.email` (export that helper from `donation-facts.ts` as `donorEmailOf(session)`), upserts the donor and sets `donorId`. `listed` is never touched. Running it again fills nothing new.
- [ ] **Step 1: Write failing tests.**
  - e2e:
    - "an admin lists names and hides one": the row comes back `hidden: true`, and the public row's `name` is null.
    - "a donor cannot list or hide names" (`FORBIDDEN`).
  - `backfill.spec.ts` (FakePrisma + FakeStripe):
    - "fills each donation's donor from Stripe, once".
    - "skips a session without an email".
    - "leaves every gift unlisted".
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** The script builds Stripe from `STRIPE_SECRET_KEY` and `PrismaService` the way `prisma/import-funnel.ts` builds its client. It prints the counts.
- [ ] **Step 4: Run** `npm test && npm run test:e2e`. Expected: PASS.
- [ ] **Step 5: Update the docs** (API `CLAUDE.md`: commands, `npm run donors:backfill`, run it once after deploying). **Commit** `feat(api): admins hide names; backfill donors from Stripe`.

---

## Part B: Viewer (`tinyworlds-frontend/`)

Only `src/**/*.test.ts` run under vitest (node), so components are checked by `npm run build`
for both targets and by looking at them in `npm run dev`. Pure logic goes in `src/lib/` with tests.

### Task 9: Pure helpers for benefactors

**Files:**
- Create: `src/lib/benefactors.ts`
- Test: `src/lib/__tests__/benefactors.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export const STONE_CENTS = 100; export const NAME_MAX = 40;
  export interface FounderRow { number: number; name: string | null; amountCents: number; stones: number; firstStone: boolean; keystone: boolean }
  export interface BenefactorRow { rank: number; name: string | null; amountCents: number }
  export interface CityBenefactors { slug: string; name: string; status: CityStatus; worldId: string | null; goalCents: number; raisedCents: number; stones: (number | null)[]; founders: FounderRow[]; benefactors: BenefactorRow[] }
  export function parseCityBenefactors(value: unknown): CityBenefactors | null;
  export function stonePreview(raisedCents: number, goalCents: number, amountCents: number): { from: number; to: number; firstStone: boolean; keystone: boolean } | null;
  export type StoneLook = "gold" | "gold-alt" | "anon" | "empty";
  export function stoneLooks(stones: (number | null)[], founders: FounderRow[]): StoneLook[];   // named runs alternate gold/gold-alt
  export function collapseFounders(founders: FounderRow[], limit = 6): { shown: FounderRow[]; hidden: { count: number; anonymous: number; amountCents: number; after: number } | null };
  export function stoneRanges(stones: number[]): string[];        // [1,2,3,7] → ["1–3","7"] (en dash)
  export function cleanName(text: string): string | null;         // same rules as the API's cleanDisplayName
  ```
  - `stonePreview`: `from = floor(raised/100) + 1` and `to = floor(min(raised + amount, goal)/100)`. It returns null when `from > to` or `raised >= goal`.
  - `collapseFounders` always keeps the First Stone and Keystone rows. It hides the middle rows when there are more than `limit`, and `after` is the number of the shown row the summary follows.

- [ ] **Step 1: Write failing tests.**
  - `stonePreview(6200, 10000, 2000)` → `{from:63,to:82,firstStone:false,keystone:false}`.
  - `stonePreview(8000, 10000, 5000)` → `{from:81,to:100,keystone:true,…}`.
  - `stonePreview(0, 10000, 100)` → `{from:1,to:1,firstStone:true,…}`.
  - `stonePreview(10000, 10000, 500)` → null.
  - `stoneRanges([63,…,82])` → `["63–82"]`.
  - `collapseFounders` of 9 rows with the Keystone at 9 → rows 1–4 and 9 shown, `hidden.count == 4`.
  - `cleanName` agrees with the API cases from Task 2 (copy that table).
  - `parseCityBenefactors` drops a payload missing `stones` (→ null) and keeps a valid one.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/benefactors.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(viewer): pure helpers for stones and benefactors`.

### Task 10: One sign-in for admins and donors, with the code and the spam warning

**Files:**
- Create: `src/lib/sign-in-api.ts`, `src/hooks/session-store.ts`, `src/hooks/use-donor-session.ts`, `src/components/sign-in/sign-in.tsx` (moved from `components/admin/sign-in.tsx`)
- Modify: `src/lib/admin.ts`, `src/lib/admin-api.ts`, `src/hooks/use-admin-session.ts`, `src/components/admin/admin-app.tsx`, `src/i18n/types.ts` and all three dictionaries
- Test: `src/lib/__tests__/admin.test.ts`

**Interfaces:**
- Produces:
  - `lib/admin.ts`:
    - `export type Purpose = "admin" | "donor"`
    - `export const DONOR_KEY = "tinyworlds.donor"`
    - `sessionOf(answer: unknown, purpose: Purpose = "admin")`: reads `answer[purpose].email`
    - `readSession(key: string)` and `writeSession(key: string, session)`, keyed now
    - `export function normalizeCode(text: string): string | null`: the API's rule
  - `lib/sign-in-api.ts` holds `post()` and the error type moved out of `admin-api.ts`, renamed `SignInError` (`kind: "unauthorized" | "too-many" | "failed"`; `admin-api.ts` re-exports it as `AdminApiError`), plus:
    - `requestLink(email: string, returnUrl: string, locale: Locale, purpose: Purpose): Promise<void>`
    - `verifyLink(token: string, purpose: Purpose): Promise<AdminSession>` (`AdminSession` is the stored session's shape for donors too)
    - `verifyCode(email: string, code: string, purpose: Purpose): Promise<AdminSession>`
  - `hooks/session-store.ts`: `createSessionStore(key: string)` gives `{ subscribe, getSnapshot, getServerSnapshot, set }` (today's `adminStore` logic). `adminStore`/`useAdminSession` and `donorStore`/`useDonorSession` are built from it.
  - `components/sign-in/sign-in.tsx`: `SignIn({ purpose, words, notice, verifying, onSession }: { purpose: Purpose; words: SignInWords; notice: SignInNotice | null; verifying: boolean; onSession: (s: AdminSession) => void })`.
    - After "Send me a link" it shows "Check your email", using `words.sent` (conditional wording, `{email}`).
    - Then one code input (`autoComplete="one-time-code"`, `inputMode="numeric"`, pasted text normalized), drawn as six cells as in the mockup if you like.
    - Then a "Sign in" button that calls `verifyCode`.
    - Then the spam warning box, "Wrong address? Change it", and "Send again" after a 60-second countdown.
    - A wrong or spent code shows `t.signIn.wrongCode`. `"too-many"` shows the existing `tooMany`.
  - i18n:
    - New group `signIn`: `{ code, codePlaceholder, submit, spam, changeAddress, sendAgain, sendAgainIn ("{seconds}"), wrongCode }`. The spam copy is fixed:
      - en: `Not in your inbox? Look in your spam or junk folder too: the mail comes from tinyworlds, and the first one sometimes lands there.`
      - pt-BR: `Não chegou? Procure também na pasta de spam ou lixo eletrônico: o e-mail vem de tinyworlds, e o primeiro às vezes vai parar lá.`
      - es-ES: `¿No está en tu bandeja de entrada? Mira también en la carpeta de spam o correo no deseado: el correo viene de tinyworlds, y el primero a veces acaba ahí.`
    - Type `SignInWords = { heading; body; email; placeholder; send; sent; again; verifying; unavailable; expired; ended; failed; tooMany }`, which is today's `admin.signIn` shape. `admin.signIn` keeps that type.
- [ ] **Step 1: Write failing tests** in `admin.test.ts`:
  - `normalizeCode`: `'482 913'`, `'482-913'` and `' 482913 '` → `'482913'`. A 5-digit or 7-digit code → null.
  - `sessionOf({accessToken:'x',expiresAt:'…',donor:{email:'a@example.com'}}, 'donor')` returns a session. The same with `'admin'` returns null.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/admin.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Move the code, point `admin-app.tsx` at `SignIn purpose="admin" words={t.admin.signIn}` and `sign-in-api`, and add the strings.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Expected: PASS. Then, with `NEXT_PUBLIC_WORLD=home NEXT_PUBLIC_API_URL=http://localhost:4000/api/graphql npm run dev` and the API running with an `ADMIN_EMAILS` entry, sign in at `/admin/` with the code printed in the API's log. You should reach the funnel.
- [ ] **Step 5: Commit** `feat(viewer): sign in with a link or a code; tell people to look in spam`.

### Task 11: Pixel badges, the stone grid, and the benefactors sign

**Files:**
- Create: `src/components/benefactors/pixel-art.ts`, `pixel-badge.tsx`, `stone-grid.tsx`, `benefactors-panel.tsx`, `benefactors-sign.tsx`, `src/lib/benefactors-api.ts`
- Modify: `src/i18n/types.ts` and the three dictionaries (group `benefactors`)

**Interfaces:**
- Consumes: Task 9's helpers and types. The API's `cityBenefactors` (Task 4).
- Produces:
  - `pixel-art.ts`: `export const PIXEL_ART: Record<"founding" | "firstStone" | "keystone", { palette: Record<string,string>; rows: string[] }>`. Copy `found`, `first` and `key` from the mockup's `ART`/`PAL`.
  - `PixelIcon({ art, scale = 1 })`: an inline SVG, `shape-rendering="crispEdges"`, one rect per pixel, width = columns·scale.
  - `PixelBadge({ art, label, title })`: Tiny5 at 10px, height 18px, a 1px stepped border (the mockup's `.pxbadge`). It fits on a name's line without making the row taller.
  - `lib/benefactors-api.ts` (lazy): `fetchCityBenefactors(by: { slug: string } | { world: string }): Promise<CityBenefactors | null>`. It uses `withTimeout` and the API timeout like `donate-api.ts`.
  - `StoneGrid({ stones, founders })`: 10 columns, with looks from `stoneLooks` and the First Stone and Keystone cells marked. Each stone's `title` is "Stone n · name/anonymous", from the dictionary.
  - `BenefactorsPanel({ by, onBecome }: { by: { slug: string } | { world: string }; onBecome: (cityName: string) => void })`. It shows:
    - the status badge and a one-line summary
    - the grid and a legend with icons
    - "Founding Benefactors" rows: `PixelBadge founding` with the number, the name or "anonymous", First Stone/Keystone badges, and the amount with stones on the right
    - the collapsed line from `collapseFounders`
    - "Benefactors" rows
    - the button "Become a benefactor of {city}"

    The First Stone and Keystone rows get the faint gold strip from the mockup.

    It renders nothing while the API is unconfigured or the city is null, and a quiet "couldn't load" line on failure.
  - `BenefactorsSign({ open, onOpenChange, by, onBecome })`: the shadcn `Dialog` shell around the panel, styled like `DonateDialog` (the `sign` class and the 3px taxi bar).
  - The `benefactors` strings: `{ heading ("Benefactors of {city}"), founders, benefactors, keepingRunning, anonymous, more ("{n} more, {anonymous} anonymous"), stones ({one,other}), firstStone, keystone, foundingTitle, founderNo ("…{n}"), benefactorTitle, legendFirst, legendKey, legendAnon, become ("Become a benefactor of {city}"), failed, stoneTitle ("Stone {n} · {name}") }`. Use the Global Constraints wording for the titles.
- [ ] **Step 1:** Add the strings. `npm test` should pass, because the i18n tests check keys and placeholders across languages.
- [ ] **Step 2:** Implement the components and the API module.
- [ ] **Step 3: Run** `npm run typecheck && npm run lint && npm test`. Expected: PASS.
- [ ] **Step 4:** Temporarily mount `BenefactorsSign` on the front page in `npm run dev`, with the API seeded as in Task 4. Check that the rows match the mockup's screen 2, with the same height for rows with and without badges, then remove the temporary mount.
- [ ] **Step 5: Commit** `feat(viewer): pixel badges, stone grid and the benefactors sign`.

### Task 12: Where the benefactors open, and giving to a built city

**Files:**
- Modify: `src/components/home/landing.tsx` (the `CityRow` gets a second button; real-city world cards get a "Benefactors" button outside their `<a>`; a `BenefactorsSign` state; `onBecome` → the existing `openFor(city)`)
- Modify: `src/components/map/about-dialog.tsx` (a `BenefactorsPanel by={{ world: WORLD.id }}` section for non-fictional worlds when `API_URL`; prop `onBecome`)
- Modify: `src/components/map/map-app.tsx` (DonateDialog gets `city` state; About's `onBecome` sets it and opens the sign)
- Modify: `src/components/donate/donate-dialog.tsx`, `src/components/donate/funding-preview.tsx` (built city)
- Modify: i18n (`home.benefactorsOf: "Benefactors of {city}"`, `about.benefactors`, `donate.builtUpkeep: "{city} is built: your gift goes to its servers and upkeep."`, `donate.stones`: `"You'd lay stones {from}–{to} of {city}'s {count} and be one of its Founding Benefactors."` with a `one` form `"You'd lay stone {from} of {city}'s {count} and be one of its Founding Benefactors."`)

**Interfaces:**
- Consumes: `BenefactorsSign`, `BenefactorsPanel` (Task 11). `stonePreview` (Task 9).
- Produces:
  - `CityRow` is a `<div>` holding today's button (unchanged behaviour) and a sibling `<button aria-label={t.home.benefactorsOf}>` with `PixelIcon art="founding"`. Never nest buttons.
  - **The stones line**, for every chosen city: under the bar in `FundingPreview` (mockup screen 1), from `stonePreview(standing.raisedCents, standing.goalCents, amountCents)`, shown when it is not null.
  - When the Donate sign is opened with a city whose milestone has `status === "BUILT"`, the preview shows the stones line if `raisedCents < goalCents`, otherwise `donate.builtUpkeep`, instead of today's "fills the bar" wording. The picker's search still never offers built cities (`pickerOptions` unchanged).
- [ ] **Step 1:** Implement the front page row and cards, the About panel, and map-app's Donate city state.
- [ ] **Step 2:** Implement the stones line and the built-city preview.
- [ ] **Step 3: Run** `npm run typecheck && npm run lint && npm test`, then `npm run build` for `NEXT_PUBLIC_WORLD=home` and for `NEXT_PUBLIC_WORLD=tinynyc` (move `public/data` aside as the frontend `CLAUDE.md` says). Expected: both builds succeed.
- [ ] **Step 4:** In dev, with the API:
  - The ranking row's flag opens the sign.
  - "Become a benefactor" opens the Donate sign with that city.
  - In `tinynyc`, About shows New York's panel, and "Become a benefactor of New York" opens the Donate sign with New York chosen and the stones line.
  - Search in the picker still says New York is built.
  - `tinywinterfell` shows no panel.
- [ ] **Step 5: Commit** `feat(viewer): open a city's benefactors from the front page and from About`.

### Task 13: Joining in the Donate sign

**Files:**
- Modify: `src/lib/donate.ts` (`CheckoutInput.benefactorName`; `checkoutInput(..., visitId, benefactorName = null)`), `src/lib/donate-api.ts` (send it)
- Create: `src/components/donate/join-block.tsx`
- Modify: `src/components/donate/donate-dialog.tsx`, `src/components/donate/funding-preview.tsx`
- Modify: i18n `donate.join` (`{ label: "Put my name on {city}", name, namePlaceholder, counter: "{n}/{max}", note: "Off: you still count, as “anonymous”. Sign in later with the email you give Stripe to change your name or take it off." }`)
- Test: `src/lib/__tests__/donate.test.ts`

**Interfaces:**
- Consumes: `cleanName`, `NAME_MAX` (Task 9). The stones line from Task 12.
- Produces: `JoinBlock({ city, on, name, onOn, onName, disabled })`. The switch is the shadcn `Switch` and starts **off**. The name input has `maxLength`, and the counter counts code points.
  - DonateBody shows the block only in `mode === "api"` with a city chosen.
  - While the switch is on and `cleanName(name)` is null, the Donate button is disabled.
  - The checkout sends `benefactorName: on ? cleanName(name) : null`.
- [ ] **Step 1: Write failing tests** in `donate.test.ts`: `checkoutInput(choice, 20, 'tinynyc', 'en-US', url, null, 'Ana')` has `benefactorName: 'Ana'`. With no name argument it has `benefactorName: null`.
- [ ] **Step 2: Run** `npx vitest run src/lib/__tests__/donate.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the join block, and pass its name into `checkoutInput`.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`. Then in dev, make a test-mode checkout with the switch on: the API's FakeStripe or Stripe test mode metadata has `benefactor_name`.
- [ ] **Step 5: Commit** `feat(viewer): join a city's benefactors from the Donate sign`.

### Task 14: "Your cities" (`/me/`)

**Files:**
- Create: `src/app/me/page.home.tsx` (metadata like `admin/page.home.tsx`: noindex, title from the dictionary), `src/components/me/me-app.tsx`, `src/components/me/your-cities.tsx`, `src/components/me/name-editor.tsx`
- Modify: `src/lib/benefactors-api.ts` (`fetchGiving(session)`, `setListing(session, slug, listed)`, `setDisplayName(session, name)`; a per-session Apollo client like `admin-api.ts`; `"unauthorized"` on `UNAUTHENTICATED`/`FORBIDDEN`), `src/lib/benefactors.ts` (`MyGiving`, `MyCity` types, `parseGiving`, `givingSummary(giving): { cities: number; stones: number; givenCents: number }`)
- Modify: `src/site.ts` (`export const ME_PATH = \`${BASE_PATH}/me/\``; `export const ME_URL` = `HOME_URL` with a trailing slash + `"me/"`, for links from a world's build)
- Modify: `src/components/home/landing.tsx` (a "Your cities" link in the header, as in mockup screen 3), `src/components/map/about-dialog.tsx` (a quiet "Your cities" link next to "Contact"), `src/hooks/use-site-effects.ts` (the thank-you toast gets `action: { label: t.donate.seeYourPlace, onClick: () => location.assign(ME_URL) }`)
- Modify: i18n group `me` (`{ title, signIn: SignInWords (heading "Your cities", body "Sign in with the email you gave at checkout. We'll send you a link and a code, no password.", sent "If {email} has given to tinyworlds, a link and a code are on their way. Open the link, or type the code here.", …), summary ("{cities} cities · {stones} stones laid · {given} given"), founderNo, firstStone, keystone, benefactor, given ("{amount} given"), stonesRange ("stones {ranges}"), toGo ("{left} to go"), status: {funded, building, built}, explore ("Explore {city} →"), listedAs ("Listed as {name}"), notListed ("Not listed: you show as “anonymous”"), edit, save, cancel, nameFirst, project ("{amount} to the project as a whole"), signOut, failed, empty }`), `home.yourCities`, `about.yourCities`, `donate.seeYourPlace`
- Test: `src/lib/__tests__/benefactors.test.ts`

**Interfaces:**
- Consumes: `SignIn` and `donorStore`/`useDonorSession` (Task 10). `PixelBadge` (Task 11). `stoneRanges` (Task 9). `MilestoneBar` (existing).
- Produces:
  - `MeApp` behaves like `AdminApp`: it takes `#token=` out of the address, `verifyLink(token, "donor")`, then `donorStore.set`. With no session it renders `SignIn purpose="donor" words={t.me.signIn}`.
  - `YourCities({ session, onEnded })` follows mockup screen 3:
    - the summary
    - one card per city: badges, given and stones, the bar or the status, an explore link when `worldId`, and the listing `Switch`
    - turning the switch on with no name opens `NameEditor` first
    - "Listed as … · edit"
    - the project line and "Sign out"
- [ ] **Step 1: Write failing tests:**
  - `givingSummary` of two cities (12 stones + 0 stones, 4200 + 1500 cents) → `{cities:2, stones:12, givenCents:5700}`.
  - `parseGiving` rejects a malformed answer.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run lint`, and the `home` build. Then in dev, end to end with the API:
  - donate (or use `npm run webhook:send` with an email)
  - ask for a link at `/me/`
  - paste the code from the API log
  - see the city with its badges
  - switch the listing and edit the name, and check that the benefactors sign follows
  - sign out
- [ ] **Step 5: Commit** `feat(viewer): your cities, for donors who sign in`.

### Task 15: Names on the admin page, and the documentation

**Files:**
- Create: `src/components/admin/names.tsx`
- Modify: `src/lib/admin-api.ts` (`fetchNames(session): Promise<BenefactorName[]>`, `setNameHidden(session, donorId, hidden): Promise<void>`), `src/lib/admin.ts` (`BenefactorName` type, `parseNames`), `src/components/admin/admin-app.tsx` (the `Names` section below the funnel), i18n `admin.names` (`{ heading, note, empty, hide, unhide, hidden, cities }`)
- Modify: `tinyworlds-frontend/CLAUDE.md` (Layout: `components/benefactors/`, `components/me/`, `components/sign-in/`, `/me/`; a "Benefactors" section with where the sign opens, built cities only through it, and badges as SVG pixel maps), root `CLAUDE.md` (the API contract: the new queries, `benefactorName`, sign-in with code and purpose; the "How the pieces fit" line about donors signing in), `README.md` (`/me/`, backfill)
- Test: `src/lib/__tests__/admin.test.ts` (`parseNames` keeps valid rows and drops malformed ones)

- [ ] **Step 1: Write the failing `parseNames` test.** Run it. Expected: FAIL.
- [ ] **Step 2: Implement** the names section and API calls. Run the test. Expected: PASS.
- [ ] **Step 3: Update the three docs.** Then run the whole check in both projects: API `npm run lint && npm run typecheck && npm test && npm run test:e2e`; viewer `npm run lint && npm run typecheck && npm test` and the `home` and `tinynyc` builds. Expected: all green.
- [ ] **Step 4:** Check `git diff --cached` for hosts, addresses and ids (Global Constraints).
- [ ] **Step 5: Commit** `feat: admins hide benefactor names; document benefactors`.

## Deploy notes (for whoever ships it, not a task)

1. Production now needs `JWT_SECRET`, `SMTP_HOST` and `MAIL_FROM` even without admins (Task 6).
2. Deploy the API first: the migrations run on start.
3. Run `npm run donors:backfill` once in the API container.
4. Then run `deploy/deploy.sh home` and each world.
