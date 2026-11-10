"use client";

import { useSyncExternalStore } from "react";
import { ADMIN_KEY, parseSession, writeSession, type AdminSession } from "@/lib/admin";

/**
 * The admin signed in on this browser, as an external store for React: null while prerendering
 * and hydrating, and for everyone who is not an admin. Kept in local storage, so it is the
 * same in every tab and on every page of the site.
 */

let known: { raw: string | null; session: AdminSession | null } | null = null;
// when the browser will not keep anything, the session lasts as long as the page
let unsaved: AdminSession | null = null;
const listeners = new Set<() => void>();

function read(): AdminSession | null {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(ADMIN_KEY);
  } catch {
    return unsaved;
  }
  if (raw === null && unsaved) return unsaved;
  // the same object for the same stored text: React compares snapshots by identity
  if (!known || known.raw !== raw) known = { raw, session: parseSession(raw, Date.now()) };
  return known.session;
}

function onStorage(event: StorageEvent): void {
  if (event.key !== null && event.key !== ADMIN_KEY) return;
  for (const listener of listeners) listener(); // signed in or out in another tab
}

export const adminStore = {
  subscribe(listener: () => void): () => void {
    if (listeners.size === 0) window.addEventListener("storage", onStorage);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) window.removeEventListener("storage", onStorage);
    };
  },
  getSnapshot: read,
  getServerSnapshot(): AdminSession | null {
    return null;
  },
  /** Signs in (a session) or out (null). */
  set(session: AdminSession | null): void {
    unsaved = session;
    writeSession(session);
    for (const listener of listeners) listener();
  },
};

export function useAdminSession(): AdminSession | null {
  return useSyncExternalStore(
    adminStore.subscribe,
    adminStore.getSnapshot,
    adminStore.getServerSnapshot,
  );
}
