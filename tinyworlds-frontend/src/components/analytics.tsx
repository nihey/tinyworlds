import Script from "next/script";

// Optional page analytics, of two kinds, each loaded only when the build environment names it,
// so the source says nothing about where a deployment reports to:
//
// - a cookieless tracker script (Rybbit and its kin) that identifies the site with a
//   `data-site-id`;
// - a Google Tag Manager container, by its id. What the container fires (Google Analytics among
//   it) is set up in Tag Manager itself, not here.
const src = (process.env.NEXT_PUBLIC_ANALYTICS_SRC ?? "").trim();
const siteId = (process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID ?? "").trim();
const gtmId = (process.env.NEXT_PUBLIC_GTM_ID ?? "").trim();

// Google's install snippet: the data layer and its gtag() queue, which the container reads once
// it has loaded.
const gtmInit =
  "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());";

export function Analytics() {
  return (
    <>
      {src && siteId && (
        <Script id="analytics" src={src} data-site-id={siteId} strategy="afterInteractive" />
      )}
      {gtmId && (
        <>
          <Script id="gtm-init" strategy="afterInteractive">
            {gtmInit}
          </Script>
          <Script
            id="gtm"
            src={`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`}
            strategy="afterInteractive"
          />
        </>
      )}
    </>
  );
}
