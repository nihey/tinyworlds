import Script from "next/script";
import { GoogleTagManager } from "@/components/consent/google-tag-manager";
import { GTM_ID } from "@/lib/consent";

// Optional page analytics, of two kinds, each loaded only when the build environment names it,
// so the source says nothing about where a deployment reports to:
//
// - a cookieless tracker script (Rybbit and its kin) that identifies the site with a
//   `data-site-id`;
// - a Google Tag Manager container, by its id (`NEXT_PUBLIC_GTM_ID`). What the container fires
//   (Google Analytics among it) is set up in Tag Manager itself, not here. It sets cookies, so
//   it waits for the visitor's consent where that is asked for (`lib/consent.ts`).
const src = (process.env.NEXT_PUBLIC_ANALYTICS_SRC ?? "").trim();
const siteId = (process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID ?? "").trim();

export function Analytics() {
  return (
    <>
      {src && siteId && (
        <Script id="analytics" src={src} data-site-id={siteId} strategy="afterInteractive" />
      )}
      {GTM_ID && <GoogleTagManager />}
    </>
  );
}
