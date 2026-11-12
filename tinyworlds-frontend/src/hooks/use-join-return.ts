"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { donorStore } from "@/hooks/use-donor-session";
import { useLists } from "@/hooks/use-lists";
import { activeStrings } from "@/i18n";
import { tokenFromHash } from "@/lib/admin";
import {
  joinReturnOf,
  linkNoticeOf,
  takePendingJoin,
  type JoinReturn,
  type LinkNotice,
  type ListKey,
} from "@/lib/lists";
import { replaceUrl } from "@/map/hash";
import { ME_URL } from "@/site";

/** A moment after the page settles, so the toaster is listening (as the donation's thanks). */
function toastLater(shown: Exclude<JoinReturn, { show: "sign" }>): void {
  window.setTimeout(() => {
    const t = activeStrings();
    if (shown.show === "signed-in")
      toast.success(t.lists.join.signedIn, {
        action: { label: t.home.yourCities, onClick: () => location.assign(ME_URL) },
      });
    else toast.error(t.lists.join.signIn[shown.notice]);
  }, 700);
}

/**
 * The front page opened from a sign-in link (`#token=` in the address). The token leaves the
 * address at once, as on "Your cities", and is traded for a donor session. With a join waiting
 * in this browser (`list`) the page opens the join sign on that list: on its last step when the
 * link signed the visitor in, else asking again, saying why (`notice`: the link was used or too
 * old, say), so a new link is one press away. Without one (the link was opened on another device
 * than the one where "Tell me" was pressed, and the API joined the list itself) a toast says the
 * visitor is signed in, and the buttons show their lists; or, when the link failed, why.
 */
export function useJoinReturn(): {
  list: ListKey | null;
  notice: LinkNotice | null;
  verifying: boolean;
  done: boolean;
} {
  const { refresh } = useLists();
  const [state, setState] = useState<{
    list: ListKey | null;
    notice: LinkNotice | null;
    verifying: boolean;
    done: boolean;
  }>({ list: null, notice: null, verifying: false, done: false });
  const started = useRef(false);

  useEffect(() => {
    const token = typeof window === "undefined" ? null : tokenFromHash(window.location.hash);
    // once: a link works once, and in development effects run twice
    if (!token || started.current) return;
    started.current = true;
    // the token leaves the address before anything else happens: it is a key
    replaceUrl(window.location.pathname + window.location.search);
    setState({ list: null, notice: null, verifying: true, done: false });
    const settle = (outcome: Parameters<typeof joinReturnOf>[0]) => {
      const shown = joinReturnOf(outcome, takePendingJoin());
      if (shown.show === "sign") {
        setState({ list: shown.list, notice: shown.notice, verifying: false, done: true });
        return;
      }
      setState({ list: null, notice: null, verifying: false, done: true });
      toastLater(shown);
    };
    import("@/lib/sign-in-api")
      .then((api) => api.verifyLink(token, "donor"))
      .then(
        (fresh) => {
          donorStore.set(fresh);
          // the lists the link may have joined, so the buttons say so
          refresh();
          settle({ ok: true });
        },
        (error: unknown) => settle({ ok: false, notice: linkNoticeOf(error) }),
      );
  }, [refresh]);

  return state;
}
