"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useI18n } from "@/hooks/use-i18n";
import { bannerShown, consentStore, GTM_ID, loadTagManager, mayLoad } from "@/lib/consent";
import { PRIVACY_URL } from "@/site";

/** The visitor's consent for Google's tags (`lib/consent.ts`). */
export function useConsent() {
  return useSyncExternalStore(
    consentStore.subscribe,
    consentStore.getSnapshot,
    consentStore.getServerSnapshot,
  );
}

/**
 * Google Tag Manager, loaded once the visitor's consent allows it, and the question that asks
 * for it. Renders nothing when the build names no container.
 */
export function GoogleTagManager() {
  const consent = useConsent();
  const load = consent.ready && mayLoad(consent.choice, consent.asks);
  const granted = consent.choice === "granted";

  useEffect(() => {
    if (load) loadTagManager(GTM_ID, granted);
  }, [load, granted]);

  if (!GTM_ID || !bannerShown(consent)) return null;
  return <ConsentBanner />;
}

const BUTTON =
  "h-9 flex-1 rounded-full px-4 text-[13px] font-semibold outline-none transition-[filter] focus-visible:shadow-[0_0_0_2px_var(--sign),0_0_0_4px_var(--taxi)] sm:flex-none";

/**
 * The question, as a sign at the foot of the page: it covers nothing that cannot wait, and the
 * page works the same whatever the answer. Both answers are the same size and one click away.
 */
function ConsentBanner() {
  const { t } = useI18n();
  return (
    <section
      aria-label={t.consent.label}
      className="sign sign-in consent-sign z-40 mx-auto max-w-[27rem] p-4"
    >
      <p className="text-[13px] leading-relaxed text-paper">
        {t.consent.message}{" "}
        <a
          href={PRIVACY_URL}
          className="rounded-sm font-semibold underline decoration-paper-dim/60 underline-offset-2 outline-none hover:decoration-taxi focus-visible:shadow-[0_0_0_2px_var(--taxi)]"
        >
          {t.legal.privacy}
        </a>
      </p>
      <div className="mt-3 flex gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => consentStore.answer("denied")}
          className={`${BUTTON} border border-paper-dim/50 text-paper hover:border-paper`}
        >
          {t.consent.deny}
        </button>
        <button
          type="button"
          onClick={() => consentStore.answer("granted")}
          className={`${BUTTON} bg-taxi text-taxi-ink hover:brightness-110`}
        >
          {t.consent.allow}
        </button>
      </div>
    </section>
  );
}
