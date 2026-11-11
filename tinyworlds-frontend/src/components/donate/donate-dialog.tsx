"use client";

import { Heart, Loader2 } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import { activeLocale } from "@/i18n";
import { useMilestones } from "@/hooks/use-milestones";
import { cleanName } from "@/lib/benefactors";
import { defaultGoal, findMilestone, previewBar, withGoal } from "@/lib/city-picker";
import {
  AMOUNT_DEFAULT,
  API_URL,
  checkoutInput,
  chosenCity,
  donateMode,
  formatUsd,
  parseAmount,
  paymentLinkFor,
  returnUrlOf,
  type Choice,
} from "@/lib/donate";
import { currentVisit, trackStep } from "@/lib/funnel";
import { rememberCheckout, sessionStore, siteEvent } from "@/lib/site-events";
import { BUILT_CITIES, SITE_ID, SITE_NAME } from "@/site";
import { AmountPicker } from "./amount-picker";
import { CityPicker } from "./city-picker";
import { FundingPreview } from "./funding-preview";
import { JoinBlock } from "./join-block";

interface DonateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** a city already chosen when the sign opens (a row of the front page's ranking) */
  city?: string | null;
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

const ACTION =
  "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-taxi px-5 text-base font-semibold text-taxi-ink transition-[filter,transform] outline-none hover:brightness-110 focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-80";

const LABEL = "block pb-1.5 text-[11px] font-semibold tracking-[0.14em] text-paper-dim uppercase";

/**
 * What the sign says. Mounted only while the sign is open, so each opening starts fresh: the
 * list is fetched again, and the choice is the one the sign was opened with.
 */
function DonateBody({ city: opening }: { city: string | null }) {
  const { t, locale } = useI18n();
  const cityLabel = useId();
  const amountLabel = useId();
  const nameHintId = useId();
  const link = paymentLinkFor(locale, SITE_ID);
  const { state: list, cities } = useMilestones();
  const [choice, setChoice] = useState<Choice>(
    opening ? { kind: "city", name: opening } : { kind: "none" },
  );
  const [preset, setPreset] = useState<number>(AMOUNT_DEFAULT);
  const [custom, setCustom] = useState("");
  const [joinOn, setJoinOn] = useState(false);
  const [joinName, setJoinName] = useState("");
  const [pending, setPending] = useState(false);
  const [checkoutFailed, setCheckoutFailed] = useState(false);

  // the sign is open: a step of the donation funnel (the body is mounted once per opening)
  useEffect(() => {
    trackStep("DONATE_OPENED", SITE_ID, activeLocale());
    siteEvent("donate_open", { world: SITE_ID, city: opening });
    // what it opened with, once: a city chosen afterwards is the checkout's to say
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mode = donateMode({ api: API_URL !== "", link: link !== null, list, checkoutFailed });
  // what is typed counts as soon as it is a number; until then the last chip stands
  const amount = (custom !== "" ? parseAmount(custom) : null) ?? preset;
  const amountCents = amount * 100;
  const name = chosenCity(choice);
  const known = name ? findMilestone(cities, name) : null;
  // the chosen city as it stands: one nobody has given to yet stands at zero
  const standing = name
    ? (known ?? { name, raisedCents: 0, goalCents: defaultGoal(cities) })
    : null;
  // the line about giving beyond the goal is said once: by the bar when this donation does so
  const overGoal = standing !== null && previewBar(standing, amountCents).overCents > 0;

  // the name to list, only when asked for and only if it has something to show
  const benefactorName = joinOn ? cleanName(joinName) : null;
  const needsName = joinOn && benefactorName === null;

  const checkout = async () => {
    setPending(true);
    setCheckoutFailed(false);
    const chosen = { world: SITE_ID, city: name, amount };
    siteEvent("donate_checkout", chosen);
    try {
      const api = await import("@/lib/donate-api");
      // with the visit, so the API can note that it reached the checkout, and which donation it made
      const input = checkoutInput(
        choice,
        amount,
        SITE_ID,
        locale,
        returnUrlOf(window.location),
        currentVisit(),
        benefactorName,
      );
      const url = await api.createCheckout(input);
      // for the page the donor comes back to, which says whether they gave, and what
      const store = sessionStore();
      if (store) rememberCheckout(store, chosen);
      // the page is left for the checkout: the button stays busy until it is gone
      window.location.assign(url);
    } catch {
      // the API must never stand between a donor and donating: the plain checkout takes over
      setPending(false);
      setCheckoutFailed(true);
      if (link) {
        trackStep("CHECKOUT_STARTED", SITE_ID, locale);
        window.open(link, "_blank", "noopener,noreferrer");
      }
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
          {mode === "api"
            ? `${withGoal(t.donate.goal, defaultGoal(cities), locale)} ${t.donate.priority}`
            : t.donate.wish}
        </p>

        {mode === "api" && (
          <>
            <div className="pt-4">
              <span id={cityLabel} className={LABEL}>
                {t.donate.cities}
              </span>
              <CityPicker
                labelledBy={cityLabel}
                milestones={cities}
                loading={list === "loading"}
                builtNames={BUILT_CITIES}
                choice={choice}
                onChoice={setChoice}
                disabled={pending}
                locale={locale}
                t={t}
              />
            </div>

            <div className="pt-3">
              {standing ? (
                <FundingPreview
                  city={standing}
                  isNew={known === null && list === "ready"}
                  built={known?.status === "BUILT"}
                  amountCents={amountCents}
                  locale={locale}
                  t={t}
                />
              ) : (
                <p className="rounded-xl bg-white/[0.045] px-3.5 py-3 text-[13px] leading-relaxed text-paper-dim">
                  {t.donate.whole}
                </p>
              )}
            </div>

            <div className="pt-4">
              <span id={amountLabel} className={LABEL}>
                {t.donate.amount}
              </span>
              <AmountPicker
                labelledBy={amountLabel}
                amount={amount}
                custom={custom}
                onPreset={(dollars) => {
                  setPreset(dollars);
                  setCustom("");
                }}
                onCustom={setCustom}
                disabled={pending}
                locale={locale}
                t={t}
              />
            </div>

            {name && (
              <JoinBlock
                city={name}
                on={joinOn}
                name={joinName}
                onOn={setJoinOn}
                onName={setJoinName}
                disabled={pending}
                hint={needsName ? { id: nameHintId } : undefined}
                t={t}
              />
            )}

            <button
              type="button"
              onClick={checkout}
              disabled={pending || needsName}
              aria-describedby={needsName ? nameHintId : undefined}
              aria-busy={pending}
              data-rybbit-event="donate_checkout"
              data-rybbit-prop-world={SITE_ID}
              data-rybbit-prop-city={name ?? undefined}
              data-rybbit-prop-amount={amount}
              className={ACTION}
            >
              {pending ? (
                <Loader2 aria-hidden className="size-4 animate-spin" strokeWidth={2.5} />
              ) : (
                <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
              )}
              {pending
                ? t.donate.pending
                : t.donate.actionAmount.replace("{amount}", formatUsd(amountCents, locale))}
            </button>
            {checkoutFailed && (
              <p role="alert" className="pt-3 text-center text-xs leading-relaxed text-paper">
                {t.donate.failed}
              </p>
            )}
            <p className="pt-3 text-center text-xs leading-relaxed text-paper-dim">
              {overGoal
                ? t.donate.footnoteApi
                : `${withGoal(t.donate.over, defaultGoal(cities), locale)} ${t.donate.footnoteApi}`}
            </p>
          </>
        )}

        {mode === "link" && link && (
          <>
            {API_URL !== "" && (
              <p role="status" className="pt-2 text-[13px] leading-relaxed text-paper-dim">
                {t.donate.linkNote}
              </p>
            )}
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                trackStep("CHECKOUT_STARTED", SITE_ID, locale);
                // the amount and the city are chosen on the payment page
                siteEvent("donate_checkout", { world: SITE_ID });
              }}
              data-rybbit-event="donate_checkout"
              data-rybbit-prop-world={SITE_ID}
              className={ACTION}
            >
              <Heart aria-hidden className="size-4 fill-current" strokeWidth={2.5} />
              {t.donate.action}
            </a>
            <p className="pt-3 text-center text-xs leading-relaxed text-paper-dim">
              {t.donate.footnote}
            </p>
          </>
        )}
      </div>
    </>
  );
}

/** Why donate, which city to give towards and how much, and the one button that leaves for the checkout. */
export function DonateDialog({ open, onOpenChange, city = null }: DonateDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // the sign itself takes the focus: focusing the first field would open its list at once
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
        }}
        className="sign max-h-[calc(100dvh-2rem)] grid-cols-[minmax(0,1fr)] gap-0 overflow-x-hidden overflow-y-auto p-0 ring-0 sm:max-w-md"
      >
        <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />
        <DonateBody city={city} />
      </DialogContent>
    </Dialog>
  );
}
