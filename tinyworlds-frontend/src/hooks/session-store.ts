"use client";

import { parseSession, writeSession, type AdminSession } from "@/lib/admin";

/**
 * A signed-in person on this browser, as an external store for React: null while prerendering
 * and hydrating, and for everyone who is not signed in. Kept in local storage under `key`, so
 * it is the same in every tab and on every page of the site. One store per kind of sign-in
 * (admin, donor).
 */
export function createSessionStore(key: string) {
  let known: { raw: string | null; session: AdminSession | null } | null = null;
  // when the browser will not keep anything, the session lasts as long as the page
  let unsaved: AdminSession | null = null;
  const listeners = new Set<() => void>();

  function read(): AdminSession | null {
    let raw: string | null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return unsaved;
    }
    if (raw === null && unsaved) return unsaved;
    // the same object for the same stored text: React compares snapshots by identity
    if (!known || known.raw !== raw) known = { raw, session: parseSession(raw, Date.now()) };
    return known.session;
  }

  function onStorage(event: StorageEvent): void {
    if (event.key !== null && event.key !== key) return;
    for (const listener of listeners) listener(); // signed in or out in another tab
  }

  return {
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
      writeSession(key, session);
      for (const listener of listeners) listener();
    },
  };
}

export type SessionStore = ReturnType<typeof createSessionStore>;
