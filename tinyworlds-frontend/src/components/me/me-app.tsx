"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SignIn, type SignInNotice } from "@/components/sign-in/sign-in";
import { donorStore, useDonorSession } from "@/hooks/use-donor-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { useI18n } from "@/hooks/use-i18n";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import { tokenFromHash } from "@/lib/admin";
import { replaceUrl } from "@/map/hash";
import { MePage } from "./me-page";

/** The token of a sign-in link in the address, when the page was opened from one. */
const linkToken = (): string | null =>
  typeof window === "undefined" ? null : tokenFromHash(window.location.hash);

/**
 * "Your cities": a sign-in form to anyone; to someone signed in, their page (`MePage`): what
 * they gave, cities to fund and worlds to explore. Opening a
 * sign-in link lands here with its token in the address's hash, which is taken out at once and
 * traded for a session, exactly as the admin page does.
 */
export function MeApp() {
  const { t, locale } = useI18n();
  const [prefs] = usePrefs();
  useTheme(prefs.theme);
  useDocumentLanguage(locale, t.me.title);
  const hydrated = useHydrated();
  const session = useDonorSession();
  const [verifying, setVerifying] = useState(() => linkToken() !== null);
  const [notice, setNotice] = useState<SignInNotice | null>(null);
  const started = useRef(false);

  useEffect(() => {
    const token = linkToken();
    // once: a link works once, and in development effects run twice
    if (!token || started.current) return;
    started.current = true;
    // the token leaves the address before anything else happens: it is a key
    replaceUrl(window.location.pathname + window.location.search);
    import("@/lib/sign-in-api")
      .then((api) => api.verifyLink(token, "donor"))
      .then(
        (fresh) => donorStore.set(fresh),
        (error: unknown) => {
          const kind = (error as { kind?: string } | null)?.kind;
          setNotice(
            kind === "unauthorized" ? "expired" : kind === "too-many" ? "tooMany" : "failed",
          );
        },
      )
      .finally(() => setVerifying(false));
  }, []);

  // the API no longer knows the session: it ran out, or it is not a donor's
  const end = useCallback(() => {
    donorStore.set(null);
    setNotice("ended");
  }, []);

  const signOut = useCallback(() => {
    donorStore.set(null);
    setNotice(null);
  }, []);

  // prerendered and hydrating: nothing is known yet, and nothing is shown
  if (!hydrated) return <main className="min-h-dvh" />;
  if (session && !verifying) return <MePage session={session} onEnded={end} onSignOut={signOut} />;
  return (
    <SignIn
      purpose="donor"
      words={t.me.signIn}
      notice={notice}
      verifying={verifying}
      onSession={(fresh) => donorStore.set(fresh)}
    />
  );
}
