"use client";

import { Loader2, LogOut } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/map/wordmark";
import { adminStore, useAdminSession } from "@/hooks/use-admin-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { useI18n } from "@/hooks/use-i18n";
import { usePrefs } from "@/hooks/use-prefs";
import { useDocumentLanguage } from "@/hooks/use-site-effects";
import { useTheme } from "@/hooks/use-theme";
import {
  DEFAULT_RANGE,
  RANGES,
  rangeOf,
  tokenFromHash,
  type AdminSession,
  type DonationFunnel,
  type RangeDays,
} from "@/lib/admin";
import { cn } from "@/lib/utils";
import { replaceUrl } from "@/map/hash";
import { HOME_URL } from "@/site";
import { FunnelReport } from "./funnel-report";
import { ListCounts } from "./list-counts";
import { Names } from "./names";
import { SignIn, type SignInNotice } from "@/components/sign-in/sign-in";

/** The token of a sign-in link in the address, when the page was opened from one. */
const linkToken = (): string | null =>
  typeof window === "undefined" ? null : tokenFromHash(window.location.hash);

const CHIP =
  "h-9 rounded-full border px-3.5 text-[13px] font-semibold outline-none transition-colors focus-visible:shadow-[0_0_0_2px_var(--fog),0_0_0_4px_var(--taxi)]";

const QUIET =
  "inline-flex items-center gap-1.5 rounded-sm text-xs font-semibold underline underline-offset-2 outline-none text-[#15171a]/75 decoration-[#15171a]/40 hover:text-[#15171a] focus-visible:decoration-2 dusk:text-paper-dim dusk:decoration-paper-dim/60 dusk:hover:text-paper";

const FOG_TEXT = "text-[#15171a]/70 dusk:text-paper-dim";

/** What the last answer was, and which question it answered. */
interface Loaded {
  key: string;
  funnel: DonationFunnel | null;
}

function Report({ session, onEnded }: { session: AdminSession; onEnded: () => void }) {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<RangeDays>(DEFAULT_RANGE);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // the question now on the table: who asks, for which period, and which try this is
  const key = `${session.accessToken}|${days}|${attempt}`;

  useEffect(() => {
    let live = true;
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    import("@/lib/admin-api")
      .then((api) => api.fetchFunnel(session, rangeOf(days, new Date()), timeZone))
      .then(
        (funnel) => {
          if (live) setLoaded({ key, funnel });
        },
        (error: unknown) => {
          if (!live) return;
          if ((error as { kind?: string } | null)?.kind === "unauthorized") onEnded();
          else setLoaded({ key, funnel: null });
        },
      );
    return () => {
      live = false;
    };
  }, [session, days, key, onEnded]);

  const waiting = loaded?.key !== key;
  // while the next period loads, the last one stays up, dimmed: nothing jumps
  const funnel = loaded?.funnel ?? null;
  const failed = !waiting && funnel === null;
  const labels: Record<RangeDays, string> = {
    7: t.admin.ranges.d7,
    30: t.admin.ranges.d30,
    90: t.admin.ranges.d90,
    365: t.admin.ranges.d365,
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-8 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <h1 className="flex items-baseline gap-2.5">
          <a
            href={HOME_URL}
            aria-label={t.admin.frontPage}
            className="rounded-sm text-[#15171a] outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)] dusk:text-paper"
          >
            <Wordmark plain className="text-4xl" />
          </a>
          <span className={cn("text-sm font-semibold", FOG_TEXT)}>{t.admin.footerLink}</span>
        </h1>
        <p className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs", FOG_TEXT)}>
          <span>{t.admin.signedInAs.replace("{email}", session.email)}</span>
          <button type="button" onClick={() => adminStore.set(null)} className={QUIET}>
            <LogOut aria-hidden className="size-3.5" strokeWidth={2.25} />
            {t.admin.signOut}
          </button>
        </p>
      </header>

      <div role="group" aria-label={t.admin.period} className="flex flex-wrap items-center gap-2">
        {RANGES.map((range) => (
          <button
            key={range}
            type="button"
            aria-pressed={range === days}
            onClick={() => setDays(range)}
            className={cn(
              CHIP,
              range === days
                ? "border-[#15171a] bg-[#15171a] text-paper dusk:border-taxi dusk:bg-taxi dusk:text-taxi-ink"
                : "border-[#15171a]/25 text-[#15171a]/80 hover:border-[#15171a]/60 dusk:border-paper/25 dusk:text-paper dusk:hover:border-paper/60",
            )}
          >
            {labels[range]}
          </button>
        ))}
        {waiting && funnel !== null && (
          <Loader2
            role="status"
            aria-label={t.admin.loading}
            className={cn("ml-1 size-4 animate-spin", FOG_TEXT)}
            strokeWidth={2.5}
          />
        )}
      </div>

      {funnel !== null ? (
        <div
          aria-busy={waiting}
          className={cn("flex flex-col gap-8 transition-opacity", waiting && "opacity-50")}
        >
          <FunnelReport funnel={funnel} locale={locale} t={t} />
          <Names session={session} locale={locale} t={t} onEnded={onEnded} />
          <ListCounts session={session} t={t} onEnded={onEnded} />
        </div>
      ) : (
        <div className="sign px-5 py-5 sm:px-6">
          {failed ? (
            <div role="alert" className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-[15px] text-paper">{t.admin.loadFailed}</p>
              <button
                type="button"
                onClick={() => setAttempt(attempt + 1)}
                className="rounded-sm text-sm font-semibold text-taxi underline underline-offset-2 outline-none focus-visible:decoration-2"
              >
                {t.admin.retry}
              </button>
            </div>
          ) : (
            <p role="status" className="flex items-center gap-2 text-[15px] text-paper">
              <Loader2 aria-hidden className="size-4 animate-spin text-taxi" strokeWidth={2.5} />
              {t.admin.loading}
            </p>
          )}
        </div>
      )}

      <footer className={cn("mt-auto pt-2 text-xs leading-relaxed", FOG_TEXT)}>
        <p>{t.admin.ownVisits}</p>
      </footer>
    </main>
  );
}

/**
 * The admin pages: a sign-in form to anyone, the donation funnel to a signed-in admin. Opening
 * a sign-in link lands here with its token in the address's hash, which is taken out at once
 * and traded for a session.
 */
export function AdminApp() {
  const { t, locale } = useI18n();
  const [prefs] = usePrefs();
  useTheme(prefs.theme);
  useDocumentLanguage(locale, t.admin.title);
  const hydrated = useHydrated();
  const session = useAdminSession();
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
      .then((api) => api.verifyLink(token, "admin"))
      .then(
        (fresh) => adminStore.set(fresh),
        (error: unknown) => {
          const kind = (error as { kind?: string } | null)?.kind;
          setNotice(
            kind === "unauthorized" ? "expired" : kind === "too-many" ? "tooMany" : "failed",
          );
        },
      )
      .finally(() => setVerifying(false));
  }, []);

  // the API no longer knows the session: it ran out, or the address is no longer an admin's
  const end = useCallback(() => {
    adminStore.set(null);
    setNotice("ended");
  }, []);

  // prerendered and hydrating: nothing is known yet, and nothing is shown
  if (!hydrated) return <main className="min-h-dvh" />;
  // a link that fails changes nothing for an admin who is signed in already
  if (session && !verifying) return <Report session={session} onEnded={end} />;
  return (
    <SignIn
      purpose="admin"
      words={t.admin.signIn}
      notice={notice}
      verifying={verifying}
      onSession={(fresh) => adminStore.set(fresh)}
    />
  );
}
