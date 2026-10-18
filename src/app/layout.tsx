import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Analytics } from "@/components/marketing/analytics";
import { ChatWidget } from "@/components/chat/chat-widget";
import { JsonLd } from "@/components/seo/json-ld";
import { isStagingHost, siteGraph } from "@/lib/seo";
import "./globals.css";

/**
 * Poppins, self-hosted by next/font.
 *
 * The legacy site loaded a single Google Fonts <link> containing 26 families
 * to use exactly one. It also contradicted itself: --font-sans declared
 * "Inter, DM Sans" while the body actually rendered in Poppins. One family,
 * one declaration, downloaded once at build time and served from our own
 * origin.
 */
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  variable: "--font-poppins",
  display: "swap",
});

const SITE_URL = "https://findtern.in";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Findtern | Hire Pre-Screened Interns in India",
    template: "%s | Findtern",
  },
  description:
    "Findtern screens, interviews and scores interns before you see them. Hire a verified intern in India from free to ₹200/hr with one flat per-hire fee, or get placed in a paid internship.",
  applicationName: "Findtern",
  authors: [{ name: "Findtern", url: SITE_URL }],
  creator: "Findtern",
  publisher: "Findtern",
  category: "business",
  openGraph: {
    type: "website",
    siteName: "Findtern",
    locale: "en_IN",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
    site: "@Findtern",
    creator: "@Findtern",
  },
  // Staging and preview deploys carry noindex so they never compete with
  // findtern.in, which every canonical already points at.
  robots: isStagingHost()
    ? { index: false, follow: false }
    : {
        index: true,
        follow: true,
        googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
      },
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": `${SITE_URL}/blog/feed.xml` },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0E6049" },
    { media: "(prefers-color-scheme: dark)", color: "#041D17" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={poppins.variable}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lg"
        >
          Skip to content
        </a>
        <noscript>
          {/*
            Scroll reveals set opacity:0 on the server-rendered markup and let
            an IntersectionObserver clear it. Without JS that would leave the
            entire page invisible - content would be present in the DOM, in
            crawlers' indexes, and unreadable to anyone. Force it visible.
          */}
          <style>{`.reveal-pending > * { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
        <SmoothScroll>{children}</SmoothScroll>
        {/* Organization + WebSite once, site-wide. Pages add their own graphs. */}
        <JsonLd data={siteGraph()} />
        <Analytics />
        <ChatWidget />
      </body>
    </html>
  );
}
