"use client";

import { useSyncExternalStore } from "react";
import { ADMIN_KEY, type AdminSession } from "@/lib/admin";
import { createSessionStore } from "./session-store";

/** The admin signed in on this browser: null for everyone else, and while hydrating. */
export const adminStore = createSessionStore(ADMIN_KEY);

export function useAdminSession(): AdminSession | null {
  return useSyncExternalStore(
    adminStore.subscribe,
    adminStore.getSnapshot,
    adminStore.getServerSnapshot,
  );
}
