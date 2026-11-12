"use client";

import { useEffect, useRef, useState } from "react";
import { donorStore } from "@/hooks/use-donor-session";
import { useLists } from "@/hooks/use-lists";
import { tokenFromHash } from "@/lib/admin";
import { takePendingJoin, type ListKey } from "@/lib/lists";
import { replaceUrl } from "@/map/hash";

/**
 * The front page opened from a sign-in link (`#token=` in the address). The token leaves the
 * address at once, as on "Your cities", and is traded for a donor session. With a join waiting
 * in this browser (`list`) the page opens the join sign on its last step; without one (the link
 * was opened on another device, where the API already joined the list) it just signs in, quietly.
 */
export function useJoinReturn(): { list: ListKey | null; verifying: boolean; done: boolean } {
  const { refresh } = useLists();
  const [state, setState] = useState<{
    list: ListKey | null;
    verifying: boolean;
    done: boolean;
  }>({ list: null, verifying: false, done: false });
  const started = useRef(false);

  useEffect(() => {
    const token = typeof window === "undefined" ? null : tokenFromHash(window.location.hash);
    // once: a link works once, and in development effects run twice
    if (!token || started.current) return;
    started.current = true;
    // the token leaves the address before anything else happens: it is a key
    replaceUrl(window.location.pathname + window.location.search);
    setState({ list: null, verifying: true, done: false });
    import("@/lib/sign-in-api")
      .then((api) => api.verifyLink(token, "donor"))
      .then(
        (fresh) => {
          donorStore.set(fresh);
          refresh();
          setState({ list: takePendingJoin(), verifying: false, done: true });
        },
        () => setState({ list: null, verifying: false, done: true }),
      );
  }, [refresh]);

  return state;
}
