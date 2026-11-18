import type { Metadata } from "next";
import Link from "next/link";

import { LoginForm } from "@/components/auth/login-form";
import { Logo } from "@/components/brand/logo";
import { APP_FONT_CLASSES } from "@/components/layout/app-fonts";

export const metadata: Metadata = {
  title: "Admin sign in",
  robots: { index: false, follow: false },
};

/** What sits behind the door, in the console's own words (the same queues the sidebar names). */
const DESK: { what: string; who: string }[] = [
  { what: "Proposals and payouts", who: "Move offers along and release stipends" },
  { what: "CGPA and identity checks", who: "Review what candidates uploaded" },
  { what: "Messages", who: "Answer candidates and employers" },
  { what: "Website content and pricing", who: "Edit what visitors see" },
];

export default function AdminLoginPage() {
  return (
    <div data-app className={`${APP_FONT_CLASSES} grid min-h-[100dvh] bg-canvas font-sans text-ink-900 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]`}>
      <section className="flex flex-col justify-between gap-12 px-6 py-8 sm:px-10 lg:px-16 lg:py-12">
        <Link href="/" aria-label="Findtern - home" className="inline-flex w-fit rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-700">
          <Logo priority alt="Findtern - Internship Simplified" className="h-12" />
        </Link>

        <div className="max-w-xl">
          <p className="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-ink-900 sm:text-5xl">The operations desk</p>
          <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-ink-700">For Findtern staff. What you can open depends on the role you were given.</p>
          <ul className="mt-10 divide-y divide-ink-200 border-y border-ink-200">
            {DESK.map((d) => (
              <li key={d.what} className="flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="text-sm font-semibold text-ink-900">{d.what}</span>
                <span className="text-sm text-ink-700">{d.who}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="hidden text-xs text-ink-600 lg:block">Every change staff make is recorded in the audit log.</p>
      </section>

      <main id="main" tabIndex={-1} className="flex items-center px-6 pb-12 outline-none sm:px-10 lg:px-12 lg:py-12">
        <div className="mx-auto w-full max-w-sm rounded-lg border border-ink-200 bg-surface-raised p-6 sm:p-8">
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-ink-900">Admin sign in</h1>
          <p className="mt-1.5 text-sm text-ink-700">Use the email and password your super admin gave you.</p>
          <div className="mt-7">
            <LoginForm endpoint="/api/auth/admin/login" redirectTo="/admin/dashboard" forgotHref="/forgot-password?as=admin" />
          </div>
        </div>
      </main>
    </div>
  );
}
