import Link from "next/link";

import { Logo } from "@/components/brand/logo";

/**
 * Split auth shell, one for every sign-in surface so they never drift apart.
 *
 * Left is the brand: one flat field of brand-950 carrying a short statement
 * and, for the account types that have one, what is true about Findtern for
 * them. Facts, not a sample score card: an invented number on a sign-in page
 * reads as a promise. Right is the form at a comfortable measure. On phones
 * the brand panel drops to a logo so the form is never pushed below the fold.
 */
export function AuthShell({
  title,
  subtitle,
  points,
  children,
}: {
  /** Two lines at most at 36px: about 35 characters. */
  title: string;
  subtitle: string;
  /** What is true for this account type; recovery and admin pages have none. */
  points?: { lead: string; text: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel ─────────────────────────────────────────── */}
      {/* Sticky, so the long company signup scrolls past it instead of with it. */}
      <aside className="sticky top-0 hidden h-[100dvh] flex-col justify-between overflow-y-auto bg-brand-950 px-16 py-12 text-white lg:flex">
        <Link href="/" aria-label="Findtern - home" className="inline-flex w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-300">
          <Logo variant="white" priority alt="Findtern - Internship Simplified" className="h-14" />
        </Link>

        <div className="max-w-md py-16">
          <p className="text-balance text-[2.25rem] font-medium leading-[1.1] tracking-[-0.03em]">{title}</p>
          <p className="mt-5 text-pretty text-base leading-relaxed text-on-dark-subtle">{subtitle}</p>

          {points?.length ? (
            <ul className="mt-14 space-y-7">
              {points.map((p) => (
                <li key={p.lead}>
                  <p className="text-base font-semibold text-white">{p.lead}</p>
                  <p className="mt-1 text-pretty text-sm leading-relaxed text-on-dark-subtle">{p.text}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <p className="text-xs text-on-dark-subtle">
          © {new Date().getFullYear()} Findtern ·{" "}
          <Link href="/terms-and-conditions" className="underline underline-offset-4 hover:text-white">
            Terms
          </Link>
        </p>
      </aside>

      {/* ── Form panel ──────────────────────────────────────────── */}
      <main id="main" tabIndex={-1} className="outline-none flex flex-col justify-center px-6 py-12 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-sm">
          {/* Compact brand lockup, mobile only. */}
          <Link href="/" aria-label="Findtern - home" className="mb-10 inline-flex lg:hidden">
            <Logo priority alt="Findtern - Internship Simplified" className="h-12" />
          </Link>

          {children}
        </div>
      </main>
    </div>
  );
}
