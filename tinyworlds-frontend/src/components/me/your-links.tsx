"use client";

import { Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { LinkIcon, LinkPicture } from "@/components/benefactors/benefactor-link";
import { useI18n } from "@/hooks/use-i18n";
import type { AdminSession } from "@/lib/admin";
import { namedSomewhere, type MyGiving } from "@/lib/benefactors";
import { formatUsd } from "@/lib/donate";
import {
  LINK_REL,
  URL_MAX,
  centsToPictures,
  cleanLinkUrl,
  hostOf,
  type MyLink,
  type MyLinks,
} from "@/lib/links";
import { cn } from "@/lib/utils";

const QUIET =
  "rounded-sm text-xs font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi disabled:pointer-events-none disabled:opacity-60";

const unauthorized = (error: unknown): boolean =>
  (error as { kind?: string } | null)?.kind === "unauthorized";

/** What went wrong with the link being added: with the link itself, or with saving it. */
type Problem = "invalid" | "duplicate" | "failed";

/**
 * The links a donor shows beside their name: up to three, each read by the API when it is
 * added (its title, its icon, its picture). They show wherever the name does (the front page,
 * each city's benefactors), their pictures once the donor has given enough; this says which of
 * those holds, and what is missing.
 */
export function YourLinks({
  session,
  giving,
  links,
  patch,
  onEnded,
}: {
  session: AdminSession;
  giving: MyGiving;
  links: MyLinks;
  patch: (change: (giving: MyGiving) => MyGiving) => void;
  /** the API no longer accepts the session */
  onEnded: () => void;
}) {
  const { t, locale } = useI18n();
  const field = useId();
  const hint = useId();
  const [text, setText] = useState("");
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  // the link being read again or taken away, and one whose page did not answer
  const [busy, setBusy] = useState<string | null>(null);
  const [away, setAway] = useState<string | null>(null);
  const words = t.me.links;

  const change = (next: (links: MyLink[]) => MyLink[]) =>
    patch((g) => (g.links ? { ...g, links: { ...g.links, links: next(g.links.links) } } : g));

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (adding) return;
    const url = cleanLinkUrl(text);
    if (!url) return setProblem("invalid");
    if (links.links.some((link) => link.url === url)) return setProblem("duplicate");
    setAdding(true);
    setProblem(null);
    import("@/lib/benefactors-api")
      .then((api) => api.addLink(session, url))
      .then(
        (link) => {
          change((all) => [...all, link]);
          setText("");
        },
        (error: unknown) => {
          if (unauthorized(error)) onEnded();
          else setProblem("failed");
        },
      )
      .finally(() => setAdding(false));
  };

  const refresh = (link: MyLink) => {
    setBusy(link.id);
    setAway(null);
    import("@/lib/benefactors-api")
      .then((api) => api.refreshLink(session, link.id))
      .then(
        (read) => change((all) => all.map((l) => (l.id === link.id ? read : l))),
        (error: unknown) => {
          if (unauthorized(error)) onEnded();
          else setAway(link.id);
        },
      )
      .finally(() => setBusy(null));
  };

  const remove = (link: MyLink) => {
    setBusy(link.id);
    setAway(null);
    import("@/lib/benefactors-api")
      .then((api) => api.removeLink(session, link.id))
      .then(
        () => change((all) => all.filter((l) => l.id !== link.id)),
        (error: unknown) => {
          if (unauthorized(error)) onEnded();
          else setProblem("failed");
        },
      )
      .finally(() => setBusy(null));
  };

  const toGo = centsToPictures(links);
  const from = formatUsd(links.picturesFromCents, locale);
  const room = links.links.length < links.max;

  return (
    <section aria-labelledby="your-links" className="sign min-w-0 px-5 py-5 sm:px-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="your-links" className="text-lg leading-tight font-semibold text-paper">
          {words.heading}
        </h2>
        <span className="text-xs font-semibold text-paper-dim tabular-nums">
          {words.count
            .replace("{n}", String(links.links.length))
            .replace("{max}", String(links.max))}
        </span>
      </div>
      <p className="pt-1 text-sm leading-relaxed text-paper-dim">
        {words.body.replace("{max}", String(links.max))}
      </p>

      {links.hidden && (
        <p role="status" className="pt-2.5 text-[13px] leading-snug font-semibold text-taxi">
          {words.hidden}
        </p>
      )}
      {!links.hidden && links.links.length > 0 && !namedSomewhere(giving) && (
        <p role="status" className="pt-2.5 text-[13px] leading-snug text-paper">
          {words.needsName}
        </p>
      )}

      {links.links.length === 0 ? (
        <p className="pt-3.5 text-[13px] leading-snug text-paper-dim">{words.empty}</p>
      ) : (
        <ul className="pt-3.5">
          {links.links.map((link) => (
            <li key={link.id} className="border-t border-paper/12 py-3">
              <div className="flex items-start gap-3">
                {link.image ? (
                  <LinkPicture
                    src={link.image}
                    className={cn("w-24 shrink-0 sm:w-28", toGo > 0 && "opacity-45 grayscale")}
                  />
                ) : (
                  <LinkIcon src={link.icon} className="mt-0.5" />
                )}
                <div className="min-w-0 flex-1 leading-tight">
                  <a
                    href={link.url}
                    target="_blank"
                    rel={LINK_REL}
                    className="flex items-center gap-1.5 rounded-sm text-sm font-semibold text-paper outline-none hover:text-taxi focus-visible:text-taxi focus-visible:underline"
                  >
                    {link.image && <LinkIcon src={link.icon} className="size-4 rounded-[4px]" />}
                    <span className="min-w-0 truncate">{link.title}</span>
                  </a>
                  <p className="truncate pt-0.5 text-xs text-paper-dim">{hostOf(link.url)}</p>
                  {link.image && toGo > 0 && (
                    <p className="pt-0.5 text-xs text-paper-dim">
                      {words.pictureWaiting.replace("{amount}", from)}
                    </p>
                  )}
                  <p className="flex items-center gap-3 pt-1.5">
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => refresh(link)}
                      aria-label={words.refreshLabel.replace("{title}", link.title)}
                      className={QUIET}
                    >
                      {words.refresh}
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => remove(link)}
                      aria-label={words.removeLabel.replace("{title}", link.title)}
                      className={QUIET}
                    >
                      {words.remove}
                    </button>
                    {busy === link.id && (
                      <Loader2
                        aria-hidden
                        className="size-3.5 animate-spin text-taxi"
                        strokeWidth={2.5}
                      />
                    )}
                  </p>
                  {away === link.id && (
                    <p role="alert" className="pt-1 text-xs text-taxi">
                      {words.refreshFailed}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {room && (
        <form onSubmit={add} className="border-t border-paper/12 pt-3.5">
          <label htmlFor={field} className="block pb-1.5 text-xs font-semibold text-paper-dim">
            {words.label}
          </label>
          <div className="flex flex-wrap gap-2">
            <input
              id={field}
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setProblem(null);
              }}
              placeholder={words.placeholder}
              maxLength={URL_MAX * 4}
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="url"
              aria-invalid={problem === "invalid" || problem === "duplicate"}
              aria-describedby={problem ? hint : undefined}
              className="h-10 min-w-0 flex-1 basis-48 rounded-md border border-paper/25 bg-white/5 px-3 text-[15px] text-paper outline-none placeholder:text-paper-dim/60 focus-visible:border-taxi"
            />
            <button
              type="submit"
              disabled={adding || text.trim() === ""}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-taxi px-4 text-sm font-semibold whitespace-nowrap text-taxi-ink transition-[filter] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] disabled:pointer-events-none disabled:opacity-60"
            >
              {adding && <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.5} />}
              {adding ? words.reading : words.add}
            </button>
          </div>
          {problem && (
            <p id={hint} role="alert" className="pt-1.5 text-xs text-taxi">
              {words[problem]}
            </p>
          )}
        </form>
      )}
      {!room && problem === "failed" && (
        <p role="alert" className="pt-1.5 text-xs text-taxi">
          {words.failed}
        </p>
      )}

      <p className="pt-3.5 text-[13px] leading-snug text-paper-dim">
        {toGo > 0
          ? words.picturesOff.replace("{amount}", formatUsd(toGo, locale))
          : words.picturesOn}
      </p>
    </section>
  );
}
