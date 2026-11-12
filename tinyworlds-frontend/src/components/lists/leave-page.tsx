"use client";

import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { HallFrame } from "@/components/hall/hall-frame";
import { JoinSign } from "@/components/lists/join-sign";
import { ACTION, ACTION_QUIET, QUIET } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import { LEAVE_HASH, leaveState, leaveTokenFromHash, type LeaveState } from "@/lib/lists";
import { replaceUrl } from "@/map/hash";
import { HOME_URL, ME_PATH, RANKING_PATH } from "@/site";

/**
 * What a leave link in a mail opens. The token (`#t=`) is read once and taken out of the
 * address at once; the page leaves the list it names and says so, and offers the two ways on:
 * leaving every list, and joining again (the join sign for new cities, the ranking for a city).
 */
export function LeavePage() {
  const { t } = useI18n();
  const words = t.lists.leave;
  // the token and whether its list is "new cities" (its middle part is a city's id, or "*")
  const link = useRef<{ token: string; isNew: boolean } | null>(null);
  const started = useRef(false);
  const [state, dispatch] = useReducer(leaveState, { phase: "working", all: false } as LeaveState);
  const [joinOpen, setJoinOpen] = useState(false);

  const run = useCallback((all: boolean) => {
    const token = link.current?.token;
    dispatch({ type: "start", all });
    if (!token) {
      dispatch({ type: "none" });
      return;
    }
    import("@/lib/lists-api")
      .then((api) => api.leaveWithToken(token, all))
      .then(
        (good) => dispatch({ type: "answered", all, good }),
        () => dispatch({ type: "failed" }),
      );
  }, []);

  useEffect(() => {
    // once: a link may be used once here, and in development effects run twice
    if (started.current) return;
    started.current = true;
    // the page's own first script has already taken the hash out of the address, for the
    // trackers' sake, and kept it here; without it (a build served another way) it is still there
    const early = (window as { [LEAVE_HASH]?: string })[LEAVE_HASH];
    const hash = early ?? window.location.hash;
    delete (window as { [LEAVE_HASH]?: string })[LEAVE_HASH];
    const token = leaveTokenFromHash(hash);
    // the token leaves the address before anything else happens: it is a key
    if (window.location.hash) replaceUrl(window.location.pathname + window.location.search);
    if (token) link.current = { token, isNew: token.split(".")[1] === "*" };
    run(false);
  }, [run]);

  const message =
    state.phase === "working"
      ? state.all
        ? words.workingAll
        : words.working
      : state.phase === "left"
        ? words.left
        : state.phase === "left-all"
          ? words.leftAll
          : state.phase === "bad"
            ? words.bad
            : state.phase === "none"
              ? words.noToken
              : words.failed;

  return (
    <HallFrame title={words.title}>
      {() => (
        <section className="sign mx-auto w-full max-w-xl px-5 py-6 sm:px-7">
          <p
            role="status"
            className="flex items-start gap-2.5 text-lg leading-snug font-semibold text-paper"
          >
            {state.phase === "working" && (
              <Loader2 aria-hidden className="mt-1 size-4 shrink-0 animate-spin" />
            )}
            {message}
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-5">
            {state.phase === "failed" && (
              <button type="button" onClick={() => run(state.all)} className={ACTION}>
                {t.loadError.retry}
              </button>
            )}
            {state.phase === "left" && (
              <>
                {link.current?.isNew ? (
                  <button type="button" onClick={() => setJoinOpen(true)} className={ACTION}>
                    {words.joinAgain}
                  </button>
                ) : (
                  <a href={RANKING_PATH} className={ACTION}>
                    {words.joinAgain}
                  </a>
                )}
                <button type="button" onClick={() => run(true)} className={ACTION_QUIET}>
                  {words.leaveAll}
                </button>
              </>
            )}
            {(state.phase === "bad" || state.phase === "none") && (
              <a href={ME_PATH} className={ACTION}>
                {t.home.yourCities}
              </a>
            )}
            {state.phase !== "working" && (
              <a href={HOME_URL} className={QUIET}>
                {words.backHome}
              </a>
            )}
          </div>
          <JoinSign
            open={joinOpen}
            list={link.current?.isNew ? { kind: "new" } : null}
            onOpenChange={setJoinOpen}
          />
        </section>
      )}
    </HallFrame>
  );
}
