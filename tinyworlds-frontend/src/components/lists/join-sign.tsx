"use client";

import { Bell, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SignIn } from "@/components/sign-in/sign-in";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { donorStore, useDonorSession } from "@/hooks/use-donor-session";
import { useI18n } from "@/hooks/use-i18n";
import { useLists } from "@/hooks/use-lists";
import {
  dropPendingJoin,
  homeReturnUrl,
  joinStep,
  joinWords,
  listParam,
  pendingKeptOnClose,
  savePendingJoin,
  takePendingJoin,
  type LinkNotice,
  type ListKey,
} from "@/lib/lists";
import { HOME_URL } from "@/site";

const ACTION =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-taxi px-5 text-base font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98]";

const QUIET =
  "rounded-sm text-sm font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi";

/**
 * The sign "Tell me" opens for someone not signed in: ask for a link by email (the list rides on
 * it), open it or type its code, and they are on the list. It also opens when the front page is
 * reached from the link: on its last step when that signed the visitor in, else asking again
 * with why (`notice`: the link was used or too old, say). `list` is what the sign is about.
 */
export function JoinSign({
  open,
  list,
  notice = null,
  onOpenChange,
  onHelp,
}: {
  open: boolean;
  list: ListKey | null;
  /** why the sign asks again: the link it was reached from did not sign the visitor in */
  notice?: LinkNotice | null;
  onOpenChange: (open: boolean) => void;
  /** "Help build {city}": the opener takes it to the donate sign */
  onHelp?: (city: string) => void;
}) {
  // the lists a link was asked for from this page: their join waits for the link to come back
  const asked = useRef(new Set<string>());
  const close = () => {
    // closed before a link was asked for its list: nothing is waiting for one
    if (list && !pendingKeptOnClose(list, asked.current)) dropPendingJoin();
    onOpenChange(false);
  };
  return (
    <Dialog
      open={open && list !== null}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
        className="sign max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-0 overflow-x-hidden overflow-y-auto p-0 ring-0 sm:max-w-md"
      >
        {list && (
          <JoinSteps
            list={list}
            notice={notice}
            onSent={() => asked.current.add(listParam(list))}
            onClose={close}
            onHelp={onHelp}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the sign is open, so each opening starts clean. */
function JoinSteps({
  list,
  notice: firstNotice,
  onSent,
  onClose,
  onHelp,
}: {
  list: ListKey;
  notice: LinkNotice | null;
  onSent: () => void;
  onClose: () => void;
  onHelp?: (city: string) => void;
}) {
  const { t } = useI18n();
  const session = useDonorSession();
  const { join } = useLists();
  const [joined, setJoined] = useState(false);
  const [failed, setFailed] = useState(false);
  // said until a new link is asked for
  const [notice, setNotice] = useState(firstNotice);
  const words = joinWords(t, list);
  const step = joinStep({ signedIn: session !== null, joined, failed });
  const askedFor = useRef<string | null>(null);
  const asked = useRef(false);

  // not signed in: the join waits for the link to bring the visitor back to this browser
  useEffect(() => {
    if (!session && !asked.current) {
      asked.current = true;
      savePendingJoin(list);
    }
  }, [session, list]);

  // a session (a typed code, or the return from the link): always join this sign's list, which
  // is idempotent, rather than trust the link's own join: two quick presses share one link
  const accessToken = session?.accessToken ?? null;
  useEffect(() => {
    const key = accessToken ? `${accessToken}:${listParam(list)}` : null;
    if (!key || askedFor.current === key) return;
    askedFor.current = key;
    void join(list).then((ok) => {
      if (ok) {
        takePendingJoin();
        setJoined(true);
      } else setFailed(true);
    });
  }, [accessToken, list, join]);

  return (
    <>
      <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />
      <div className="px-5 pt-5 pb-6 sm:px-6">
        {step === "done" ? (
          <div className="flex flex-col items-center text-center">
            <span
              aria-hidden
              className="flex size-12 items-center justify-center rounded-full bg-taxi text-taxi-ink"
            >
              <Check className="size-6" strokeWidth={3} />
            </span>
            <DialogTitle className="pt-4 text-xl leading-tight font-semibold text-paper">
              {words.doneTitle}
            </DialogTitle>
            <DialogDescription className="pt-2 text-[15px] leading-relaxed text-paper-dim">
              {words.doneBody(session?.email ?? "")}
            </DialogDescription>
            {words.help && onHelp && list.kind === "city" && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onHelp(list.name);
                }}
                className={`${ACTION} mt-5`}
              >
                {words.help}
              </button>
            )}
            <button type="button" onClick={onClose} className={`${QUIET} mt-4`}>
              {t.lists.join.close}
            </button>
          </div>
        ) : step === "failed" ? (
          <>
            <DialogTitle className="text-xl leading-tight font-semibold text-paper">
              {words.title}
            </DialogTitle>
            <DialogDescription role="alert" className="pt-3 text-[15px] leading-relaxed text-taxi">
              {t.lists.join.failed}
            </DialogDescription>
            <button type="button" onClick={onClose} className={`${QUIET} mt-4`}>
              {t.lists.join.close}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2.5">
              <Bell aria-hidden className="size-5 shrink-0 text-taxi" strokeWidth={2.5} />
              <DialogTitle className="text-xl leading-tight font-semibold text-paper">
                {words.title}
              </DialogTitle>
            </div>
            <DialogDescription className="sr-only">{words.body}</DialogDescription>
            {step === "joining" ? (
              <p role="status" className="pt-4 text-[15px] text-paper">
                {t.lists.join.signIn.verifying}
              </p>
            ) : (
              <SignIn
                embedded
                purpose="donor"
                words={{ ...t.lists.join.signIn, body: words.body }}
                notice={notice}
                onSent={() => {
                  setNotice(null);
                  onSent();
                }}
                verifying={false}
                list={listParam(list)}
                returnUrl={homeReturnUrl(HOME_URL, window.location.origin)}
                onSession={(fresh) => donorStore.set(fresh)}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
