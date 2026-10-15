import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { Analytics } from "@/components/marketing/analytics";
import { ChatWidget } from "@/components/chat/chat-widget";
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
    default: "Findtern | Internship Simplified",
    template: "%s | Findtern",
  },
  description:
    "Hire a verified intern for the price of a coffee, or get placed in a paid internship in 18 months — or your deposit back.",
  applicationName: "Findtern",
  authors: [{ name: "Findtern" }],
  creator: "Findtern",
  openGraph: {
    type: "website",
    siteName: "Findtern",
    locale: "en_IN",
    url: SITE_URL,
  },
  twitter: {
    card: "summary_large_image",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: { canonical: "/" },
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
            entire page invisible — content would be present in the DOM, in
            crawlers' indexes, and unreadable to anyone. Force it visible.
          */}
          <style>{`.reveal-pending > * { opacity: 1 !important; transform: none !important; }`}</style>
        </noscript>
        <SmoothScroll>{children}</SmoothScroll>
        <Analytics />
        <ChatWidget />
      </body>
    </html>
  );
}
