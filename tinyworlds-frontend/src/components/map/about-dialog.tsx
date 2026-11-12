"use client";

import {
  Code,
  Cookie,
  FileText,
  Heart,
  LayoutGrid,
  Mail,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { BenefactorsPanel } from "@/components/benefactors/benefactors-panel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useI18n } from "@/hooks/use-i18n";
import { consentStore, GTM_ID } from "@/lib/consent";
import { API_URL } from "@/lib/donate";
import { cn } from "@/lib/utils";
import { CONTACT_URL, GITHUB_URL, HOME_URL, ME_URL, PRIVACY_URL, TERMS_URL } from "@/site";
import { WORLD } from "@/worlds";
import { Wordmark } from "./wordmark";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  attribution: string[];
  /** the world has outlines to draw, so the B key does something */
  hoodLines: boolean;
  /** absent when this build takes no donations */
  onDonate?: () => void;
  /** "Become a benefactor of {city}": opens the donate sign with that city chosen */
  onBecome?: (cityName: string) => void;
}

const QUIET =
  "flex items-center gap-1.5 rounded-sm text-paper underline decoration-paper-dim/60 underline-offset-2 outline-none hover:decoration-taxi focus-visible:text-taxi";

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="kbd-key">{children}</kbd>
);

/** A help line from the dictionary: "{X}" becomes the key cap X, "{hoods}" the world's own word. */
function Keyed({ text, hoods }: { text: string; hoods: string }) {
  const parts = text.replace("{hoods}", hoods).split(/\{([^{}]+)\}/g);
  return <>{parts.map((part, i) => (i % 2 === 1 ? <Key key={i}>{part}</Key> : part))}</>;
}

/** Turns the URLs in an attribution line into links. */
function Linked({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-paper underline decoration-paper-dim/60 underline-offset-2 hover:decoration-taxi"
          >
            {part.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
          </a>
        ) : (
          part
        ),
      )}
    </>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
  attribution,
  hoodLines,
  onDonate,
  onBecome,
}: AboutDialogProps) {
  const { t, copy } = useI18n();
  const hoods = copy.hoodLines.inSentence;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sign max-h-[min(44rem,calc(100dvh-2rem))] gap-0 overflow-y-auto p-0 ring-0 sm:max-w-md">
        <div aria-hidden className="h-[3px] shrink-0 bg-taxi" />
        <DialogHeader className="gap-2 px-5 pt-5 text-left">
          <DialogTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1.5 text-base font-semibold">
            <Wordmark className="text-[34px]" />
            <span className="text-paper-dim">{copy.tagline}</span>
          </DialogTitle>
          <DialogDescription className="text-[15px] leading-relaxed text-paper">
            {copy.about.intro}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 pt-4 pb-5 text-sm leading-relaxed text-paper-dim">
          {/* for a made-up place the notes are the disclaimer: set apart, so nobody takes it for an official map */}
          <div
            className={cn(
              "space-y-4",
              WORLD.fictional && "rounded-lg border border-sign-line bg-sign-raised px-3.5 py-3",
            )}
          >
            {copy.about.notes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>

          <section>
            <h3 className="pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
              {t.about.gettingAround}
            </h3>
            <ul className="space-y-1.5">
              <li>{t.about.drag}</li>
              <li>
                <Keyed text={t.about.keysSearch} hoods={hoods} />
              </li>
              <li>
                <Keyed
                  text={hoodLines ? t.about.keysToggles : t.about.keysTogglesNoHoods}
                  hoods={hoods}
                />
              </li>
              <li>{t.about.link}</li>
            </ul>
          </section>

          {attribution.length > 0 && (
            <section>
              <h3 className="pb-1.5 text-[10.5px] font-semibold tracking-[0.14em] uppercase">
                {t.about.mapData}
              </h3>
              <ul className="space-y-1">
                {attribution.map((line) => (
                  <li key={line}>
                    <Linked text={line} />
                  </li>
                ))}
                {WORLD.sights && (
                  <li>
                    <Linked text={t.about.descriptions} />
                  </li>
                )}
              </ul>
            </section>
          )}

          {/* a real city's own benefactors, when the API is there; the panel draws nothing for a city that is not built */}
          {!WORLD.fictional && API_URL !== "" && onBecome && (
            <section
              aria-label={t.about.benefactors}
              className="border-t border-sign-line pt-4 empty:hidden"
            >
              <BenefactorsPanel by={{ world: WORLD.id }} onBecome={onBecome} />
            </section>
          )}

          <nav className="flex flex-wrap gap-x-5 gap-y-2 border-t border-sign-line pt-4">
            {onDonate && (
              <button type="button" onClick={onDonate} className={QUIET}>
                <Heart aria-hidden className="size-3.5 fill-taxi text-taxi" strokeWidth={2.25} />
                {t.donate.action}
              </button>
            )}
            <a href={HOME_URL} className={QUIET}>
              <LayoutGrid aria-hidden className="size-3.5 text-paper-dim" strokeWidth={2.25} />
              {t.about.allCities}
            </a>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className={QUIET}>
              <Code aria-hidden className="size-3.5 text-paper-dim" strokeWidth={2.25} />
              {t.about.openSource}
            </a>
            {API_URL !== "" && (
              <a href={ME_URL} className={QUIET}>
                <UserRound aria-hidden className="size-3.5 text-paper-dim" strokeWidth={2.25} />
                {t.about.yourCities}
              </a>
            )}
            <a href={CONTACT_URL} className={QUIET}>
              <Mail aria-hidden className="size-3.5 text-paper-dim" strokeWidth={2.25} />
              {t.about.contact}
            </a>
            <a href={TERMS_URL} className={QUIET}>
              <FileText aria-hidden className="size-3.5 text-paper-dim" strokeWidth={2.25} />
              {t.legal.terms}
            </a>
            <a href={PRIVACY_URL} className={QUIET}>
              <ShieldCheck aria-hidden className="size-3.5 text-paper-dim" strokeWidth={2.25} />
              {t.legal.privacy}
            </a>
            {GTM_ID && (
              <button
                type="button"
                onClick={() => {
                  // the question is a sign at the foot of the page: clear the way to it
                  onOpenChange(false);
                  consentStore.reopen();
                }}
                className={QUIET}
              >
                <Cookie aria-hidden className="size-3.5 text-paper-dim" strokeWidth={2.25} />
                {t.consent.settings}
              </button>
            )}
          </nav>
        </div>
      </DialogContent>
    </Dialog>
  );
}
