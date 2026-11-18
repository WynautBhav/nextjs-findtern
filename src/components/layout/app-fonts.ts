import { Bricolage_Grotesque, Figtree } from "next/font/google";

/**
 * The signed-in product's two faces, self-hosted by next/font and loaded only by the pages that
 * mount an app shell (marketing keeps Poppins and never downloads these).
 *
 * - Display: Bricolage Grotesque. Page titles and the big figures. Its optical-size axis gives a
 *   sturdy, slightly eccentric cut at small sizes and a tight one at large sizes; has tabular
 *   numerals and the rupee sign.
 * - Text: Figtree. Calm and legible at 14px, tabular numerals, rupee sign.
 */
export const appDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-app-display",
  display: "swap",
});

export const appText = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-app-text",
  display: "swap",
});

/** Both CSS-variable classes; put them on the shell root and on <html> (portals live under <body>). */
export const APP_FONT_CLASSES = `${appDisplay.variable} ${appText.variable}`;
