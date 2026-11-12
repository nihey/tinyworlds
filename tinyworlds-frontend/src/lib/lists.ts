import type { CityStatus } from "./donate";
import type { Locale } from "@/i18n/locale";
import type { Strings } from "@/i18n/types";

/**
 * The lists a visitor can join to hear when a city is built: one per city still being funded,
 * and "new cities". Pure data here (the API's calls are in `lists-api.ts`, the shared state in
 * `hooks/use-lists.ts`).
 */

/** The list of every city built from now on, as the API names it. */
export const NEW_CITIES = "*";

export type ListKey = { kind: "new" } | { kind: "city"; slug: string; name: string };

/** What the API calls a list: "*" for new cities, else the city's slug. */
export function listParam(key: ListKey): string {
  return key.kind === "new" ? NEW_CITIES : key.slug;
}

export interface ListCity {
  slug: string;
  name: string;
  status: CityStatus;
  raisedCents: number;
  goalCents: number;
  waiting: number;
}

export interface MyLists {
  newCities: boolean;
  cities: ListCity[];
  /** slugs of the unbuilt cities the donor gave to: their donor mails cover them */
  donated: string[];
}

const STATUSES = ["PROPOSED", "FUNDED", "BUILDING", "BUILT"];

function parseListCity(value: unknown): ListCity | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.slug !== "string" || typeof c.name !== "string") return null;
  if (typeof c.status !== "string" || !STATUSES.includes(c.status)) return null;
  const { raisedCents, goalCents, waiting } = c;
  if (typeof raisedCents !== "number" || typeof goalCents !== "number") return null;
  return {
    slug: c.slug,
    name: c.name,
    status: c.status as CityStatus,
    raisedCents,
    goalCents,
    waiting: typeof waiting === "number" ? waiting : 0,
  };
}

/** The donor's lists as the API answered, or null when the answer is not the contract's. */
export function parseMyLists(raw: unknown): MyLists | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { newCities, cities, donated } = raw as Record<string, unknown>;
  if (typeof newCities !== "boolean" || !Array.isArray(cities) || !Array.isArray(donated))
    return null;
  if (!donated.every((slug) => typeof slug === "string")) return null;
  return {
    newCities,
    cities: cities.flatMap((c) => parseListCity(c) ?? []),
    donated: donated as string[],
  };
}

/**
 * What a city's button shows: "donor" (they gave, so the donor mail covers them: it wins),
 * "joined" (on the list), or "join" (also for anyone not signed in).
 */
export function cityListState(slug: string, lists: MyLists | null): "join" | "joined" | "donor" {
  if (!lists) return "join";
  if (lists.donated.includes(slug)) return "donor";
  return lists.cities.some((c) => c.slug === slug) ? "joined" : "join";
}

// ---------------------------------------------------------------------------------------------
// a join waiting for a sign-in link to be opened
// ---------------------------------------------------------------------------------------------

export const PENDING_JOIN_KEY = "tinyworlds.join";
const PENDING_MAX_AGE = 60 * 60 * 1000;

/** Remembers which list "Tell me" was pressed for, for when the sign-in link brings the visitor back. */
export function savePendingJoin(key: ListKey): void {
  try {
    window.localStorage.setItem(PENDING_JOIN_KEY, JSON.stringify({ at: Date.now(), key }));
  } catch {
    // storage blocked: the join still happens, on the link, server side
  }
}

/** The remembered list, once, if it is under an hour old; null otherwise (or without storage). */
export function takePendingJoin(now: number = Date.now()): ListKey | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PENDING_JOIN_KEY);
    if (raw !== null) window.localStorage.removeItem(PENDING_JOIN_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const { at, key } = JSON.parse(raw) as { at?: unknown; key?: Record<string, unknown> };
    if (typeof at !== "number" || now - at > PENDING_MAX_AGE || !key) return null;
    if (key.kind === "new") return { kind: "new" };
    if (key.kind === "city" && typeof key.slug === "string" && typeof key.name === "string")
      return { kind: "city", slug: key.slug, name: key.name };
  } catch {
    // garbage
  }
  return null;
}

/** Forgets the remembered list: the sign closed before a link was asked for it. */
export function dropPendingJoin(): void {
  try {
    window.localStorage.removeItem(PENDING_JOIN_KEY);
  } catch {
    // storage blocked: there is nothing kept to forget
  }
}

/**
 * Whether closing the join sign keeps the remembered list: only while a link asked for that
 * list from this page may still bring the visitor back (`asked` holds those lists, as
 * `listParam` names them). Closed before any was asked, it is forgotten, so a link asked for
 * on another device never joins a list this browser only looked at.
 */
export function pendingKeptOnClose(list: ListKey, asked: ReadonlySet<string>): boolean {
  return asked.has(listParam(list));
}

// ---------------------------------------------------------------------------------------------
// the front page opened from a join's sign-in link
// ---------------------------------------------------------------------------------------------

/** Why a sign-in link did not sign the visitor in, in the sign-in words' own names. */
export type LinkNotice = "expired" | "tooMany" | "failed";

/** The API's refusal of a link: used or too old ("unauthorized"), too many tries, or no answer. */
export function linkNoticeOf(error: unknown): LinkNotice {
  const kind = (error as { kind?: unknown } | null)?.kind;
  return kind === "unauthorized" ? "expired" : kind === "too-many" ? "tooMany" : "failed";
}

/**
 * What the front page shows once the link it was opened from has been tried, given the join
 * remembered in this browser (`pending`, taken once): with one, the join sign on that list (on
 * its last step when signed in, else asking again with why); without one, a toast (the link
 * was opened on another device than the one where "Tell me" was pressed).
 */
export type JoinReturn =
  | { show: "sign"; list: ListKey; notice: LinkNotice | null }
  | { show: "toast"; notice: LinkNotice }
  | { show: "signed-in" };

export function joinReturnOf(
  outcome: { ok: true } | { ok: false; notice: LinkNotice },
  pending: ListKey | null,
): JoinReturn {
  if (pending) return { show: "sign", list: pending, notice: outcome.ok ? null : outcome.notice };
  return outcome.ok ? { show: "signed-in" } : { show: "toast", notice: outcome.notice };
}

// ---------------------------------------------------------------------------------------------
// which of the lists' calls in flight may write, and whether any is pending
// ---------------------------------------------------------------------------------------------

/** `version` counts the answers that were written; `pending` the calls in flight. */
export interface Ops {
  version: number;
  pending: number;
}

export const NO_OPS: Ops = { version: 0, pending: 0 };

/** A call starts: it is pending, and remembers which version it saw. */
export function beginOp(ops: Ops): { ops: Ops; ticket: number } {
  return { ops: { ...ops, pending: ops.pending + 1 }, ticket: ops.version };
}

/**
 * A call ends. A join or leave answer is written when it succeeded; a load's only if nothing was
 * written since it began (an older reading must not undo a newer answer). Every write bumps
 * the version.
 */
export function finishOp(
  ops: Ops,
  ticket: number,
  kind: "load" | "change",
  ok: boolean,
): { ops: Ops; apply: boolean } {
  const apply = ok && (kind === "change" || ops.version === ticket);
  return {
    ops: { version: apply ? ops.version + 1 : ops.version, pending: Math.max(0, ops.pending - 1) },
    apply,
  };
}

/** True while any call is in flight: every card reads this. */
export const isBusy = (ops: Ops): boolean => ops.pending > 0;

/** A new session starts clean, and nothing begun under the old one can write. */
export const restartOps = (ops: Ops): Ops => ({ version: ops.version + 1, pending: 0 });

// ---------------------------------------------------------------------------------------------
// the join sign
// ---------------------------------------------------------------------------------------------

/** Where the join sign is: asking to sign in, adding to the list, or finished (or failed). */
export function joinStep(s: {
  signedIn: boolean;
  joined: boolean;
  failed: boolean;
}): "sign-in" | "joining" | "done" | "failed" {
  if (!s.signedIn) return "sign-in";
  if (s.joined) return "done";
  return s.failed ? "failed" : "joining";
}

/**
 * The sign's words for one list: `body` says what the list sends (one mail for a city, one per
 * new city for new cities); `help` is the "Help build" button's label, null for new cities.
 */
export function joinWords(
  t: Strings,
  list: ListKey,
): {
  title: string;
  body: string;
  doneTitle: string;
  doneBody: (email: string) => string;
  help: string | null;
} {
  const j = t.lists.join;
  if (list.kind === "new") {
    return {
      title: j.newTitle,
      body: j.bodyNew,
      doneTitle: j.doneNew,
      doneBody: (email) => j.doneBodyNew.replace("{email}", email),
      help: null,
    };
  }
  const fill = (text: string) => text.replace("{city}", list.name);
  return {
    title: fill(j.cityTitle),
    body: j.body,
    doneTitle: fill(j.doneCity),
    doneBody: (email) => fill(j.doneBody.replace("{email}", email)),
    help: fill(j.help),
  };
}

/**
 * Where a sign-in link brings the visitor back to: the front page's root, from wherever the
 * sign opened (`homeUrl` is the site's HOME_URL: "/" or an absolute address).
 */
export function homeReturnUrl(homeUrl: string, origin: string): string {
  return /^https?:\/\//i.test(homeUrl)
    ? homeUrl
    : origin + (homeUrl.startsWith("/") ? homeUrl : `/${homeUrl}`);
}

/** "1 waiting", "12 waiting": how many wait to hear a city is built; null when none do. */
export function waitingLine(n: number, locale: Locale, t: Strings): string | null {
  if (!(n > 0)) return null;
  const form =
    new Intl.PluralRules(locale).select(n) === "one" ? t.lists.waitingOne : t.lists.waitingMany;
  return form.replace("{n}", new Intl.NumberFormat(locale).format(n));
}

// ---------------------------------------------------------------------------------------------
// the page a mail's leave link opens
// ---------------------------------------------------------------------------------------------

/**
 * The token of a leave link: `…/lists/leave/#t=<donor>.<list>.<mac>`. In the hash, so it is
 * never sent to the web server nor seen by the page analytics. Null when the address has none
 * or it is not shaped like one (the API judges the rest).
 */
export function leaveTokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, "")).get("t");
  return token && /^[\w.*-]{20,300}$/.test(token) ? token : null;
}

/**
 * Where the leave page is: waiting for the API, done, a link that is not ours (`bad`), no link at
 * all (`none`: a reload after leaving, or the page opened by hand), or no answer.
 */
export type LeaveState =
  | { phase: "working"; all: boolean }
  | { phase: "left" }
  | { phase: "left-all" }
  | { phase: "bad" }
  | { phase: "none" }
  | { phase: "failed"; all: boolean };

export type LeaveEvent =
  | { type: "start"; all: boolean }
  | { type: "answered"; all: boolean; good: boolean }
  | { type: "failed" }
  | { type: "none" };

/** An answer only counts while one is awaited; `failed` keeps what to retry. */
export function leaveState(state: LeaveState, event: LeaveEvent): LeaveState {
  if (event.type === "start") return { phase: "working", all: event.all };
  if (state.phase !== "working") return state;
  if (event.type === "none") return { phase: "none" };
  if (event.type === "failed") return { phase: "failed", all: state.all };
  if (!event.good) return { phase: "bad" };
  return event.all ? { phase: "left-all" } : { phase: "left" };
}

/** Where the page's first script leaves the hash it took out of the address (memory only). */
export const LEAVE_HASH = "__tinyworldsLeaveHash";
