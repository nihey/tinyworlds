"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** False while prerendering and hydrating, true once the page is running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
