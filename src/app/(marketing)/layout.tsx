import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * ISR safety net. Marketing pages are prerendered at build time from the CMS
 * tables (or the TS fallback when the build has no database). Admin CMS writes
 * call revalidatePath; this bounds staleness for anything else, including a
 * build that ran without a reachable DB.
 */
export const revalidate = 300;

/**
 * Public marketing shell. Header and footer, plus a column that keeps the
 * footer at the bottom on short pages.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
