"use client";

import { Loader2, Mail } from "lucide-react";
import { useEffect, useId, useState, type FormEvent } from "react";
import { LegalLinks } from "@/components/legal/legal-links";
import { Wordmark } from "@/components/map/wordmark";
import { FOG_LINK } from "@/components/styles";
import { useI18n } from "@/hooks/use-i18n";
import type { SignInWords } from "@/i18n/types";
import { normalizeCode, type AdminSession, type Purpose } from "@/lib/admin";
import { API_URL, returnUrlOf } from "@/lib/donate";
import { HOME_URL } from "@/site";

/** How long a sign-in link and code are good for: the API's LINK_MINUTES, for the sentence that says so. */
const LINK_MINUTES = 15;
/** How long before another link may be asked for: the API's LINK_EVERY_MS. */
const RESEND_SECONDS = 60;
const CODE_DIGITS = 6;

/** Why the sign is showing again: said once, above the form. */
export type SignInNotice = "expired" | "ended" | "failed" | "tooMany";

type Problem = SignInNotice | "wrongCode";

const ACTION =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-taxi px-5 text-base font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-80";

const QUIET =
  "rounded-sm text-sm font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi";

const digitsOf = (text: string): string => text.replace(/\D/g, "").slice(0, CODE_DIGITS);

/** "0:42" */
const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/**
 * The sign everyone but someone signed in sees: ask for a link by email, then open it or type
 * the code that came with it. One sheet for admins and donors; `words` is what differs.
 */
export function SignIn({
  purpose,
  words,
  notice,
  verifying,
  onSession,
  onSent,
  list,
  returnUrl,
  embedded = false,
}: {
  purpose: Purpose;
  words: SignInWords;
  notice: SignInNotice | null;
  /** a link was just opened and is being traded for a session */
  verifying: boolean;
  onSession: (session: AdminSession) => void;
  /** a link was asked for (and the API took the request) */
  onSent?: () => void;
  /** a list the link joins on opening (the API's name for it); absent: a plain sign-in */
  list?: string;
  /** where the link brings the visitor back to; absent: this page */
  returnUrl?: string;
  /** inside a dialog: no page, wordmark or heading before the link is sent */
  embedded?: boolean;
}) {
  const { t, locale } = useI18n();
  const field = useId();
  const codeField = useId();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  // the address a link was asked for; the API says the same whoever it belongs to
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [code, setCode] = useState("");
  const [focused, setFocused] = useState(false);
  const [checking, setChecking] = useState(false);
  // when another link may be asked for, on the browser's clock
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const said: Problem | null = problem ?? notice;
  const wait = Math.max(0, Math.ceil((resendAt - now) / 1000));

  useEffect(() => {
    if (resendAt <= Date.now()) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, [resendAt]);

  const ask = async (address: string) => {
    setPending(true);
    setProblem(null);
    try {
      const api = await import("@/lib/sign-in-api");
      await api.requestLink(
        address,
        returnUrl ?? returnUrlOf(window.location),
        locale,
        purpose,
        list,
      );
      setSentTo(address);
      setCode("");
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
      onSent?.();
    } catch (error) {
      const kind = (error as { kind?: string } | null)?.kind;
      setProblem(kind === "too-many" ? "tooMany" : "failed");
    } finally {
      setPending(false);
    }
  };

  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || pending) return;
    void ask(address);
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    const digits = normalizeCode(code);
    if (!sentTo || !digits || checking) return;
    setChecking(true);
    setProblem(null);
    try {
      const api = await import("@/lib/sign-in-api");
      onSession(await api.verifyCode(sentTo, digits, purpose));
    } catch (error) {
      const kind = (error as { kind?: string } | null)?.kind;
      setProblem(
        kind === "unauthorized" ? "wrongCode" : kind === "too-many" ? "tooMany" : "failed",
      );
      setChecking(false);
    }
  };

  const say = (which: Problem): string =>
    which === "wrongCode" ? t.signIn.wrongCode : words[which];

  const alert = said && (
    <p role="alert" className="pt-3 text-sm leading-relaxed text-taxi">
      {say(said)}
    </p>
  );
  const current = Math.min(code.length, CODE_DIGITS - 1);

  const content = (
    <>
      {!embedded && (
        <a
          href={HOME_URL}
          aria-label={t.admin.frontPage}
          className="inline-block rounded-sm outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
        >
          <Wordmark className="text-4xl" />
        </a>
      )}
      {(!embedded || (sentTo && !verifying)) && (
        <h1 className="pt-4 text-xl leading-tight font-semibold text-paper">
          {sentTo && !verifying ? t.signIn.checkEmail : words.heading}
        </h1>
      )}

      {verifying ? (
        <p role="status" className="flex items-center gap-2 pt-4 text-[15px] text-paper">
          <Loader2 aria-hidden className="size-4 animate-spin text-taxi" strokeWidth={2.5} />
          {words.verifying}
        </p>
      ) : API_URL === "" ? (
        <p className="pt-3 text-[15px] leading-relaxed text-paper-dim">{words.unavailable}</p>
      ) : sentTo ? (
        <form onSubmit={submitCode} noValidate>
          <p role="status" className="pt-3 text-[15px] leading-relaxed text-paper">
            {words.sent.replace("{email}", sentTo).replace("{minutes}", String(LINK_MINUTES))}
          </p>
          {alert}
          <label
            htmlFor={codeField}
            className="block pt-5 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-paper-dim uppercase"
          >
            {t.signIn.code}
          </label>
          <div className="relative flex items-center gap-1.5">
            {Array.from({ length: CODE_DIGITS }, (_, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i === 3 && (
                  <span aria-hidden className="px-0.5 text-paper-dim">
                    –
                  </span>
                )}
                <div
                  aria-hidden
                  className={`flex h-12 w-10 items-center justify-center rounded-xl border bg-white/[0.045] text-lg font-semibold text-paper ${
                    focused && i === current ? "border-taxi" : "border-sign-line"
                  }`}
                >
                  {code[i] ?? ""}
                </div>
              </div>
            ))}
            {/* the one real field, laid over the cells: paste, autofill and the keyboard all land here */}
            <input
              id={codeField}
              type="text"
              name="code"
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]*"
              enterKeyHint="go"
              spellCheck={false}
              placeholder={t.signIn.codePlaceholder}
              value={code}
              onChange={(event) => setCode(digitsOf(event.target.value))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              disabled={checking}
              className="absolute inset-0 h-full w-full cursor-text bg-transparent text-transparent caret-transparent opacity-0 outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={checking || normalizeCode(code) === null}
            aria-busy={checking}
            className={`${ACTION} mt-4 h-11 text-[15px]`}
          >
            {checking && <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.5} />}
            {t.signIn.submit}
          </button>
          <div className="mt-3 flex items-start gap-2.5 rounded-[10px] bg-taxi/10 px-3 py-2.5">
            <span aria-hidden className="leading-snug font-bold text-taxi">
              !
            </span>
            <p className="text-[13px] leading-snug text-paper">{t.signIn.spam}</p>
          </div>
          <p className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs text-paper-dim">
            <button
              type="button"
              onClick={() => {
                setSentTo(null);
                setCode("");
                setProblem(null);
              }}
              className={QUIET}
            >
              {t.signIn.changeAddress}
            </button>
            {wait > 0 ? (
              <span>{t.signIn.sendAgainIn.replace("{seconds}", clock(wait))}</span>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => void ask(sentTo)}
                className={QUIET}
              >
                {t.signIn.sendAgain}
              </button>
            )}
          </p>
        </form>
      ) : (
        <form onSubmit={submitEmail} noValidate>
          <p className="pt-2 text-[15px] leading-relaxed text-paper-dim">{words.body}</p>
          {alert}
          <label
            htmlFor={field}
            className="block pt-5 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-paper-dim uppercase"
          >
            {words.email}
          </label>
          <input
            id={field}
            type="email"
            name="email"
            required
            autoComplete="email"
            inputMode="email"
            enterKeyHint="send"
            spellCheck={false}
            autoCapitalize="none"
            placeholder={words.placeholder}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
            className="h-12 w-full rounded-xl border border-sign-line bg-white/[0.045] px-3.5 text-base text-paper outline-none placeholder:text-paper-dim/60 focus:border-taxi disabled:opacity-70"
          />
          <button
            type="submit"
            disabled={pending || email.trim() === ""}
            aria-busy={pending}
            className={`${ACTION} mt-4`}
          >
            {pending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.5} />
            ) : (
              <Mail aria-hidden className="size-4" strokeWidth={2.5} />
            )}
            {pending ? words.sending : words.action}
          </button>
        </form>
      )}
    </>
  );

  if (embedded) return <div>{content}</div>;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="sign overflow-hidden">
        <div aria-hidden className="h-[3px] bg-taxi" />
        <div className="px-5 pt-6 pb-6 sm:px-6">{content}</div>
      </div>
      {/* the address asked for here is what the privacy policy is about */}
      <footer className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 pt-6 text-xs leading-relaxed">
        <LegalLinks className={FOG_LINK} />
      </footer>
    </main>
  );
}
