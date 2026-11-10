"use client";

import { Heart, Loader2 } from "lucide-react";
import { useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import { useMilestones } from "@/hooks/use-milestones";
import {
  API_URL,
  checkoutInput,
  chosenCity,
  CITY_MAX,
  donateMode,
  listCities,
  paymentLinkFor,
  returnUrlOf,
  selectable,
  type Choice,
} from "@/lib/donate";
import { cn } from "@/lib/utils";
import { SITE_ID, SITE_NAME } from "@/site";
import { MilestoneBar } from "./milestone-bar";

interface DonateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A dictionary line with "{wordmark}" replaced by the site's name, set a little stronger. */
function Named({ text }: { text: string }) {
  const [before, after] = text.split("{wordmark}");
  if (after === undefined) return <>{text}</>;
  return (
    <>
      {before}
      <span className="font-semibold">{SITE_NAME}</span>
      {after}
    </>
  );
}

const ROW =
  "flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-1.5 transition-colors hover:bg-sign-raised has-checked:bg-sign-raised has-focus-visible:shadow-[0_0_0_2px_var(--taxi)]";

/** The round mark of a radio row; the real input sits invisibly on top of the row's label. */
function Dot({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
        on ? "border-taxi" : "border-paper-dim/70",
      )}
    >
      {on && <span className="size-2 rounded-full bg-taxi" />}
    </span>
  );
}

const ACTION =
  "mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-taxi px-5 text-[15px] font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-80";

/**
 * What the sign says. Mounted only while the sign is open, so each opening starts fresh: the
 * list is fetched again and nothing is chosen.
 */
function DonateBody() {
  const { t, locale } = useI18n();
  const group = useId();
  const link = paymentLinkFor(locale, SITE_ID);
  const { state: list, cities } = useMilestones();
  const [choice, setChoice] = useState<Choice>({ kind: "none" });
  const [other, setOther] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [pending, setPending] = useState(false);
  const [checkoutFailed, setCheckoutFailed] = useState(false);

  const mode = donateMode({ api: API_URL !== "", link: link !== null, list, checkoutFailed });
  const { rows, more } = listCities(cities, expanded);
  const city = chosenCity(choice);

  const checkout = async () => {
    setPending(true);
    setCheckoutFailed(false);
    try {
      const api = await import("@/lib/donate-api");
      const input = checkoutInput(choice, SITE_ID, locale, returnUrlOf(window.location));
      // the page is left for the checkout: the button stays busy until it is gone
      window.location.assign(await api.createCheckout(input));
    } catch {
      // the API must never stand between a donor and donating: the plain checkout takes over
      setPending(false);
      setCheckoutFailed(true);
      if (link) window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <>
      <DialogHeader className="gap-2 px-5 pt-5 text-left">
        <DialogTitle className="flex items-center gap-2 pr-8 text-lg leading-tight font-semibold">
          <Heart
            aria-hidden
            className="size-[18px] shrink-0 fill-taxi text-taxi"
            strokeWidth={2.25}
          />
          {t.donate.title}
        </DialogTitle>
        <DialogDescription className="text-[15px] leading-relaxed text-paper">
          <Named text={t.donate.body} />
        </DialogDescription>
      </DialogHeader>

      <div className="px-5 pt-3 pb-5">
        <p className="text-sm leading-relaxed text-paper-dim">
          {mode === "api" ? t.donate.goal : t.donate.wish}
        </p>

        {mode === "api" && (
          <fieldset className="-mx-2.5 mt-3 min-w-0" disabled={pending}>
            <legend className="sr-only">{t.donate.cities}</legend>
            {list === "loading" && (
              <p role="status" className="px-2.5 py-2 text-sm text-paper-dim">
                {t.donate.loading}
              </p>
            )}
            {rows.map((row) =>
              selectable(row) ? (
                <label key={row.id} className={ROW}>
                  <input
                    type="radio"
                    name={group}
                    className="sr-only"
                    checked={choice.kind === "city" && choice.name === row.name}
                    onChange={() => setChoice({ kind: "city", name: row.name })}
                  />
                  <Dot on={choice.kind === "city" && choice.name === row.name} />
                  <MilestoneBar city={row} locale={locale} t={t} />
                </label>
              ) : (
                // built already: nothing left to fund, only somewhere to go
                <div key={row.id} className="flex items-center gap-3 px-2.5 py-2">
                  <span aria-hidden className="size-4 shrink-0" />
                  <MilestoneBar
                    city={row}
                    locale={locale}
                    t={t}
                    name={
                      row.worldId ? (
                        <a
                          href={`/${row.worldId}/`}
                          className="rounded-sm underline decoration-paper-dim/60 underline-offset-2 outline-none hover:decoration-taxi focus-visible:text-taxi"
                        >
                          {row.name}
                        </a>
                      ) : undefined
                    }
                  />
                </div>
              ),
            )}
            {more && (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                className="mx-2.5 my-1 rounded-sm text-xs font-semibold text-paper-dim underline decoration-paper-dim/50 underline-offset-2 outline-none hover:text-paper focus-visible:text-taxi"
              >
                {expanded ? t.donate.showFewer : t.donate.showAll}
              </button>
            )}

            <label className={ROW}>
              <input
                type="radio"
                name={group}
                className="sr-only"
                aria-label={t.donate.other}
                checked={choice.kind === "other"}
                onChange={() => setChoice({ kind: "other", text: other })}
              />
              <Dot on={choice.kind === "other"} />
              <input
                type="text"
                name="city"
                value={other}
                maxLength={CITY_MAX}
                aria-label={t.donate.other}
                placeholder={`${t.donate.other}: ${t.donate.otherPlaceholder.toLowerCase()}`}
                autoComplete="off"
                enterKeyHint="done"
                onFocus={() => setChoice({ kind: "other", text: other })}
                onChange={(e) => {
                  setOther(e.target.value);
                  setChoice({ kind: "other", text: e.target.value });
                }}
                className="h-8 min-w-0 flex-1 rounded-md border border-sign-line bg-transparent px-2.5 text-sm text-paper outline-none placeholder:text-paper-dim/80 focus:border-taxi"
              />
            </label>
            <label className={ROW}>
              <input
                type="radio"
                name={group}
                className="sr-only"
                checked={choice.kind === "none"}
                onChange={() => setChoice({ kind: "none" })}
              />
              <Dot on={choice.kind === "none"} />
              <span className="text-sm font-medium text-paper">{t.donate.none}</span>
            </label>
          </fieldset>
        )}

        {mode === "api" && (
          <button
            type="button"
            onClick={checkout}
            disabled={pending}
            aria-busy={pending}
            data-rybbit-event="donate_checkout"
            data-rybbit-prop-world={SITE_ID}
            data-rybbit-prop-city={city ?? undefined}
            className={ACTION}
          >
            {pending ? (
              <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.5} />
            ) : (
              <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
            )}
            {pending ? t.donate.pending : t.donate.action}
          </button>
        )}
        {mode === "link" && link && (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            data-rybbit-event="donate_checkout"
            data-rybbit-prop-world={SITE_ID}
            className={ACTION}
          >
            <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
            {t.donate.action}
          </a>
        )}
        {mode === "api" && checkoutFailed && (
          <p role="alert" className="pt-3 text-center text-xs leading-relaxed text-paper">
            {t.donate.failed}
          </p>
        )}
        <p className="pt-3 text-center text-xs leading-relaxed text-paper-dim">
          {t.donate.footnote}
        </p>
      </div>
    </>
  );
}

/** Why donate, which city to give towards, and the one button that leaves for the checkout. */
export function DonateDialog({ open, onOpenChange }: DonateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // the sign itself takes the focus: the first control is a text field, and focusing that
        // would raise a phone's keyboard over the list
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
        className="sign max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-0 overflow-x-hidden overflow-y-auto p-0 ring-0 sm:max-w-sm"
      >
        <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />
        <DonateBody />
      </DialogContent>
    </Dialog>
  );
}
