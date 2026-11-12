"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { Locale } from "@/i18n/locale";
import type { ListKey, MyLists } from "@/lib/lists";
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
let token: string | null = null;
let unwatch: (() => void) | null = null;
const listeners = new Set<() => void>();

function set(next: State): void {
  state = next;
  for (const listener of listeners) listener();
}

/** An answer only counts if the session it was asked under is still the one signed in. */
function settle(forToken: string, next: Partial<State>): void {
  if (token === forToken) set({ ...state, ...next });
}

/** "unauthorized": the API no longer knows the session, so the donor is signed out. */
function failed(forToken: string, error: unknown): void {
  const kind = (error as { kind?: string } | null)?.kind;
  if (kind === "unauthorized" && token === forToken) donorStore.set(null);
}

async function load(forToken: string): Promise<void> {
  const session = donorStore.getSnapshot();
  if (!session || session.accessToken !== forToken) return;
  set({ ...state, busy: true });
  try {
    const { fetchMyLists } = await import("@/lib/lists-api");
    settle(forToken, { lists: await fetchMyLists(session), busy: false });
  } catch (error) {
    settle(forToken, { busy: false });
    failed(forToken, error);
  }
}

/** Follows the donor session: a new one is fetched for, none clears. */
function sync(): void {
  const next = donorStore.getSnapshot()?.accessToken ?? null;
  if (next === token) return;
  token = next;
  set(IDLE);
  if (next) void load(next);
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
      state = IDLE;
    }
  };
}

async function change(
  call: "joinList" | "leaveList",
  key: ListKey,
  locale: Locale,
): Promise<boolean> {
  const session = donorStore.getSnapshot();
  if (!session) return false;
  const forToken = session.accessToken;
  set({ ...state, busy: true });
  try {
    const api = await import("@/lib/lists-api");
    const lists =
      call === "joinList"
        ? await api.joinList(session, key, locale)
        : await api.leaveList(session, key);
    settle(forToken, { lists, busy: false });
    return true;
  } catch (error) {
    settle(forToken, { busy: false });
    failed(forToken, error);
    return false;
  }
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
    if (token) void load(token);
  }, []);
  return { lists: current.lists, busy: current.busy, join, leave, refresh };
}
