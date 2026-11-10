import Script from "next/script";

// Optional page analytics: a cookieless tracker script (Rybbit and its kin) that identifies the
// site with a `data-site-id`. Both values come from the build environment, so the source says
// nothing about where a deployment reports to; without them nothing is loaded.
const src = (process.env.NEXT_PUBLIC_ANALYTICS_SRC ?? "").trim();
const siteId = (process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID ?? "").trim();

export function Analytics() {
  if (!src || !siteId) return null;
  return <Script id="analytics" src={src} data-site-id={siteId} strategy="afterInteractive" />;
}
