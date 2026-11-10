"use client";

import { Loader2, Mail } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { Wordmark } from "@/components/map/wordmark";
import { useI18n } from "@/hooks/use-i18n";
import type { Strings } from "@/i18n";
import { API_URL, returnUrlOf } from "@/lib/donate";
import { HOME_URL } from "@/site";

/** How long a sign-in link is good for: the API's LINK_MINUTES, for the sentence that says so. */
const LINK_MINUTES = 15;

/** Why the sign is showing again: said once, above the form. */
export type SignInNotice = "expired" | "ended" | "failed" | "tooMany";

const ACTION =
  "flex h-12 w-full items-center justify-center gap-2 rounded-full bg-taxi px-5 text-base font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-80";

const QUIET =
  "rounded-sm text-sm font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi";

const noticeText = (notice: SignInNotice, t: Strings): string => t.admin.signIn[notice];

/** The sign everyone but a signed-in admin sees: ask for a link by email, or wait for one to be checked. */
export function SignIn({
  notice,
  verifying,
}: {
  notice: SignInNotice | null;
  /** a link was just opened and is being traded for a session */
  verifying: boolean;
}) {
  const { t, locale } = useI18n();
  const field = useId();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  // the address a link was asked for; the API says the same whoever it belongs to
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [problem, setProblem] = useState<SignInNotice | null>(null);
  const said = problem ?? notice;

  const ask = async (event: FormEvent) => {
    event.preventDefault();
    const address = email.trim();
    if (!address || pending) return;
    setPending(true);
    setProblem(null);
    try {
      const api = await import("@/lib/admin-api");
      await api.requestLink(address, returnUrlOf(window.location), locale);
      setSentTo(address);
    } catch (error) {
      const kind = (error as { kind?: string } | null)?.kind;
      setProblem(kind === "too-many" ? "tooMany" : "failed");
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="sign overflow-hidden">
        <div aria-hidden className="h-[3px] bg-taxi" />
        <div className="px-5 pt-6 pb-6 sm:px-6">
          <a
            href={HOME_URL}
            aria-label={t.admin.frontPage}
            className="inline-block rounded-sm outline-none focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
          >
            <Wordmark className="text-4xl" />
          </a>
          <h1 className="pt-4 text-xl leading-tight font-semibold text-paper">
            {t.admin.signIn.heading}
          </h1>

          {verifying ? (
            <p role="status" className="flex items-center gap-2 pt-4 text-[15px] text-paper">
              <Loader2 aria-hidden className="size-4 animate-spin text-taxi" strokeWidth={2.5} />
              {t.admin.signIn.verifying}
            </p>
          ) : API_URL === "" ? (
            <p className="pt-3 text-[15px] leading-relaxed text-paper-dim">
              {t.admin.signIn.unavailable}
            </p>
          ) : sentTo ? (
            <>
              <p role="status" className="pt-3 text-[15px] leading-relaxed text-paper">
                {t.admin.signIn.sent
                  .replace("{email}", sentTo)
                  .replace("{minutes}", String(LINK_MINUTES))}
              </p>
              <button type="button" onClick={() => setSentTo(null)} className={`${QUIET} mt-4`}>
                {t.admin.signIn.again}
              </button>
            </>
          ) : (
            <form onSubmit={ask} noValidate>
              <p className="pt-2 text-[15px] leading-relaxed text-paper-dim">
                {t.admin.signIn.body}
              </p>
              {said && (
                <p role="alert" className="pt-3 text-sm leading-relaxed text-taxi">
                  {noticeText(said, t)}
                </p>
              )}
              <label
                htmlFor={field}
                className="block pt-5 pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-paper-dim uppercase"
              >
                {t.admin.signIn.email}
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
                placeholder={t.admin.signIn.placeholder}
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
                {pending ? t.admin.signIn.sending : t.admin.signIn.action}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
