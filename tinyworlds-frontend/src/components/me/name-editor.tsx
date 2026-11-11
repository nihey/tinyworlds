"use client";

import { Loader2 } from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useI18n } from "@/hooks/use-i18n";
import type { AdminSession } from "@/lib/admin";
import { NAME_MAX, cleanName } from "@/lib/benefactors";

const BUTTON =
  "inline-flex h-9 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold outline-none transition-[filter] focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] disabled:pointer-events-none disabled:opacity-60";

/**
 * Sets the one name a donor shows under in every city. `first` says it was opened because a
 * listing was asked for before there was a name to list.
 */
export function NameEditor({
  session,
  initial,
  first,
  onSaved,
  onCancel,
  onEnded,
}: {
  session: AdminSession;
  initial: string;
  first: boolean;
  /** the name as the API kept it */
  onSaved: (name: string) => void;
  onCancel: () => void;
  onEnded: () => void;
}) {
  const { t } = useI18n();
  const field = useId();
  const [text, setText] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const cleaned = cleanName(text);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!cleaned || pending) return;
    setPending(true);
    setFailed(false);
    import("@/lib/benefactors-api")
      .then((api) => api.setDisplayName(session, cleaned))
      .then(
        (kept) => onSaved(kept),
        (error: unknown) => {
          if ((error as { kind?: string } | null)?.kind === "unauthorized") onEnded();
          else {
            setFailed(true);
            setPending(false);
          }
        },
      );
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-2.5">
      <label htmlFor={field} className="block text-xs font-semibold text-paper-dim">
        {first ? t.me.nameFirst : t.me.nameLabel}
      </label>
      <input
        id={field}
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={t.me.namePlaceholder}
        maxLength={NAME_MAX * 2}
        autoComplete="off"
        autoFocus
        className="h-10 w-full rounded-md border border-paper/25 bg-white/5 px-3 text-[15px] text-paper outline-none placeholder:text-paper-dim/60 focus-visible:border-taxi"
      />
      {failed && (
        <p role="alert" className="text-xs text-taxi">
          {t.me.failed}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={!cleaned || pending}
          className={`${BUTTON} bg-taxi text-taxi-ink hover:brightness-110`}
        >
          {pending && <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.5} />}
          {t.me.save}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className={`${BUTTON} text-paper-dim hover:text-paper`}
        >
          {t.me.cancel}
        </button>
      </div>
    </form>
  );
}
