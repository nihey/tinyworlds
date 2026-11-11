"use client";

import { useCallback, useEffect, useState } from "react";
import type { AdminSession } from "@/lib/admin";
import type { MyGiving } from "@/lib/benefactors";

/** A donor's giving as their page has it: on its way, not to be had, or there. */
export type GivingLoad =
  { state: "loading" } | { state: "failed" } | { state: "ready"; giving: MyGiving };

const unauthorized = (error: unknown): boolean =>
  (error as { kind?: string } | null)?.kind === "unauthorized";

/**
 * What a signed-in donor gave, for "Your cities": asked for when the page appears and again on
 * `retry`. A session the API no longer knows ends (`onEnded`); any other failure is "failed".
 * `patch` changes what is shown after a change was saved (a listing, a name), without asking again.
 */
export function useGiving(
  session: AdminSession,
  onEnded: () => void,
): {
  load: GivingLoad;
  retry: () => void;
  patch: (change: (giving: MyGiving) => MyGiving) => void;
} {
  const [load, setLoad] = useState<GivingLoad>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    import("@/lib/benefactors-api")
      .then((api) => api.fetchGiving(session))
      .then(
        (giving) => {
          if (live) setLoad({ state: "ready", giving });
        },
        (error: unknown) => {
          if (!live) return;
          if (unauthorized(error)) onEnded();
          else setLoad({ state: "failed" });
        },
      );
    return () => {
      live = false;
    };
  }, [session, attempt, onEnded]);

  const retry = useCallback(() => {
    setLoad({ state: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  const patch = useCallback(
    (change: (giving: MyGiving) => MyGiving) =>
      setLoad((current) =>
        current.state === "ready" ? { state: "ready", giving: change(current.giving) } : current,
      ),
    [],
  );

  return { load, retry, patch };
}
