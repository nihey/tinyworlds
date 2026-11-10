import type { Metadata, Viewport } from "next";
import { Archivo, Tiny5 } from "next/font/google";
import { Analytics } from "@/components/analytics";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DICTIONARIES } from "@/i18n";
import { ogLocale } from "@/i18n/locale";
import { PREFS_KEY } from "@/lib/prefs";
import { HOME_CARD_PATH, SITE_ACCENT, SITE_HOME_LOCALE, SITE_ID, SITE_NAME } from "@/site";
import { IS_HOME, WORLD } from "@/worlds";
import "./globals.css";

const archivo = Archivo({
  variable: "--font-archivo",
  subsets: ["latin"],
  axes: ["wdth"],
});

const tiny5 = Tiny5({
  variable: "--font-tiny5",
  subsets: ["latin"],
  weight: "400",
});

// The tab icon: a little skyline with one tower lit in the world's colour.
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges"><rect width="16" height="16" rx="3" fill="#15171a"/><rect x="3" y="8" width="2" height="5" fill="#f4f2ec"/><rect x="6" y="5" width="2" height="8" fill="#f4f2ec"/><rect x="9" y="3" width="2" height="10" fill="${SITE_ACCENT.color}"/><rect x="12" y="7" width="1" height="6" fill="#f4f2ec"/></svg>`;

// What is baked into the HTML (title, description, share card, <html lang>) is in the site's
// home language: crawlers and link previews do not run the page. Visitors get their own language
// once it is running (useI18n), and the page then retitles the document to match.
const trimmed = (value: string | undefined) => (value ?? "").trim().replace(/\/+$/, "");
const siteUrl = trimmed(process.env.NEXT_PUBLIC_SITE_URL);
const basePath = trimmed(process.env.NEXT_PUBLIC_BASE_PATH);

// A world's page is about that world; the front page is about all of them, and has a share
// card of its own: several cities side by side under the site's name.
const page = IS_HOME
  ? {
      title: DICTIONARIES[SITE_HOME_LOCALE].home.title,
      description: DICTIONARIES[SITE_HOME_LOCALE].home.description,
      cardPath: HOME_CARD_PATH,
      cardAlt: DICTIONARIES[SITE_HOME_LOCALE].home.cardAlt,
    }
  : {
      title: WORLD.copy[SITE_HOME_LOCALE].title,
      description: WORLD.copy[SITE_HOME_LOCALE].description,
      cardPath: `${basePath}/og/${WORLD.id}.jpg`,
      cardAlt: WORLD.copy[SITE_HOME_LOCALE].cardAlt,
    };

// Share cards need absolute URLs, and Next does not put the base path into metadata URLs, so
// they are built here. Without NEXT_PUBLIC_SITE_URL (local dev) the card is text only.
const pageUrl = siteUrl ? `${siteUrl}${basePath}/` : undefined;
const card = siteUrl
  ? { url: `${siteUrl}${page.cardPath}`, width: 1200, height: 630, alt: page.cardAlt }
  : undefined;

export const metadata: Metadata = {
  metadataBase: siteUrl ? new URL(siteUrl) : undefined,
  title: page.title,
  description: page.description,
  icons: { icon: { url: `data:image/svg+xml,${encodeURIComponent(icon)}`, type: "image/svg+xml" } },
  alternates: pageUrl ? { canonical: pageUrl } : undefined,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: page.title,
    description: page.description,
    locale: ogLocale(SITE_HOME_LOCALE),
    url: pageUrl,
    images: card ? [{ ...card, type: "image/jpeg" }] : undefined,
  },
  twitter: {
    card: card ? "summary_large_image" : "summary",
    title: page.title,
    description: page.description,
    images: card ? [{ url: card.url, alt: card.alt }] : undefined,
  },
};

// The brand colour is the one thing a world changes about the look: it overrides the stylesheet's
// default (--taxi) on <html>, and everything that is "on" follows.
const accent = {
  "--taxi": SITE_ACCENT.color,
  "--taxi-ink": SITE_ACCENT.ink,
} as React.CSSProperties;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#e9e6df" },
    { media: "(prefers-color-scheme: dark)", color: "#101214" },
  ],
};

// Runs before first paint so a visitor who chose dusk (or whose system is dark) never sees a
// flash of daylight. useTheme keeps the class in sync afterwards.
const themeScript = `(function(){try{var t="system";try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(
  PREFS_KEY,
)})||"{}");if(p.theme==="light"||p.theme==="dark")t=p.theme}catch(e){}if(t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches))document.documentElement.classList.add("dusk")}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang={SITE_HOME_LOCALE}
      data-world={SITE_ID}
      className={`${archivo.variable} ${tiny5.variable}`}
      style={accent}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <TooltipProvider delayDuration={350}>{children}</TooltipProvider>
        <Toaster position="bottom-center" />
        <Analytics />
      </body>
    </html>
  );
}
