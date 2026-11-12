"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/locale";
import {
  beginOp,
  finishOp,
  isBusy,
  NO_OPS,
  restartOps,
  type ListKey,
  type MyLists,
  type Ops,
} from "@/lib/lists";
import { useI18n } from "./use-i18n";
import { donorStore } from "./use-donor-session";

/**
 * The signed-in donor's lists, one store for every card and sign on the page: fetched when a
 * donor session appears, cleared when it goes. Nothing is fetched for a visitor who is not
 * signed in.
 */

interface State {
  lists: MyLists | null;
  busy: boolean;
}

const IDLE: State = { lists: null, busy: false };
let state: State = IDLE;
let ops: Ops = NO_OPS;
let token: string | null = null;
let unwatch: (() => void) | null = null;
const listeners = new Set<() => void>();

function set(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Runs one call under `forToken`: pending while in flight, and its answer written only as
 * `finishOp` allows. A call of a session that has gone changes nothing.
 */
async function run(
  forToken: string,
  kind: "load" | "change",
  call: () => Promise<MyLists>,
): Promise<boolean> {
  const begun = beginOp(ops);
  ops = begun.ops;
  set({ ...state, busy: isBusy(ops) });
  let answer: MyLists | null = null;
  let error: unknown = null;
  try {
    answer = await call();
  } catch (e) {
    error = e;
  }
  if (token !== forToken) return false;
  const done = finishOp(ops, begun.ticket, kind, answer !== null);
  ops = done.ops;
  set({ lists: done.apply ? answer : state.lists, busy: isBusy(ops) });
  if (error) {
    // "unauthorized": the API no longer knows the session, so the donor is signed out
    if ((error as { kind?: string } | null)?.kind === "unauthorized") donorStore.set(null);
  }
  return answer !== null;
}

function load(forToken: string): void {
  const session = donorStore.getSnapshot();
  if (!session || session.accessToken !== forToken) return;
  void run(forToken, "load", async () => (await import("@/lib/lists-api")).fetchMyLists(session));
}

/** Follows the donor session: a new one is fetched for, none clears. */
function sync(): void {
  const next = donorStore.getSnapshot()?.accessToken ?? null;
  if (next === token) return;
  token = next;
  ops = restartOps(ops);
  set(IDLE);
  if (next) load(next);
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    unwatch = donorStore.subscribe(sync);
    sync();
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unwatch?.();
      unwatch = null;
      token = null;
      ops = restartOps(ops);
      state = IDLE;
    }
  };
}

function change(call: "joinList" | "leaveList", key: ListKey, locale: Locale): Promise<boolean> {
  const session = donorStore.getSnapshot();
  if (!session) return Promise.resolve(false);
  return run(session.accessToken, "change", async () => {
    const api = await import("@/lib/lists-api");
    return call === "joinList" ? api.joinList(session, key, locale) : api.leaveList(session, key);
  });
}

export function useLists(): {
  lists: MyLists | null;
  busy: boolean;
  join(key: ListKey): Promise<boolean>;
  leave(key: ListKey): Promise<boolean>;
  refresh(): void;
} {
  const { locale } = useI18n();
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => IDLE,
  );
  // a session stored by this render's own tab may appear after the store subscribed
  useEffect(sync);
  const join = useCallback((key: ListKey) => change("joinList", key, locale), [locale]);
  const leave = useCallback((key: ListKey) => change("leaveList", key, locale), [locale]);
  const refresh = useCallback(() => {
    sync();
    if (token) load(token);
  }, []);
  return { lists: current.lists, busy: current.busy, join, leave, refresh };
}
