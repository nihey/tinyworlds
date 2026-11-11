"use client";

import { useSyncExternalStore } from "react";
import { DONOR_KEY, type AdminSession } from "@/lib/admin";
import { createSessionStore } from "./session-store";

/** The donor signed in on this browser: null for everyone else, and while hydrating. */
export const donorStore = createSessionStore(DONOR_KEY);

export function useDonorSession(): AdminSession | null {
  return useSyncExternalStore(
    donorStore.subscribe,
    donorStore.getSnapshot,
    donorStore.getServerSnapshot,
  );
}
