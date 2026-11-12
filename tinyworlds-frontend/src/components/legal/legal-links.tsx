"use client";

import { useI18n } from "@/hooks/use-i18n";
import { consentStore, GTM_ID } from "@/lib/consent";
import type { LegalKind } from "@/legal/types";
import { PRIVACY_URL, TERMS_URL } from "@/site";

/**
 * The terms of service and the privacy policy, as two links for a page's footer, and the
 * cookie settings beside them when asked for (only where Google's tags are: nothing else asks).
 * A fragment: the footer lays them out.
 */
export function LegalLinks({
  className,
  current,
  cookies = false,
}: {
  className: string;
  /** the page this is: its link says so */
  current?: LegalKind;
  cookies?: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <a
        href={TERMS_URL}
        className={className}
        aria-current={current === "terms" ? "page" : undefined}
      >
        {t.legal.terms}
      </a>
      <a
        href={PRIVACY_URL}
        className={className}
        aria-current={current === "privacy" ? "page" : undefined}
      >
        {t.legal.privacy}
      </a>
      {cookies && GTM_ID && (
        <button type="button" onClick={() => consentStore.reopen()} className={className}>
          {t.consent.settings}
        </button>
      )}
    </>
  );
}
