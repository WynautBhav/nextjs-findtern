import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

import { PageHead, Surface } from "@/components/app/primitives";
import { Tile } from "@/components/app/tiles";
import { requireRole } from "@/lib/auth";
import { CONDITIONS, EXCLUSIONS, FAQS, PROGRAM_TERMS, STEPS, termsFor } from "@/lib/content/guarantee";
import { getInternActivationFeeMinor } from "@/lib/platform-settings";

export const metadata: Metadata = {
  title: "How the 6-month guarantee works",
  robots: { index: false, follow: false },
};

/**
 * The guarantee, inside the intern's own console (bug sheet 12 Nov, row 21).
 * The terms are the public page's: both read `@/lib/content/guarantee`, so
 * the two cannot disagree. No sales hero, no sign-up buttons: this reader has
 * already signed up.
 */
export default async function InternGuarantee() {
  await requireRole("intern");
  const fee = Math.round((await getInternActivationFeeMinor()) / 100);

  return (
    <div>
      <Link
        href="/intern/dashboard"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-apple-sm text-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Home
      </Link>
      <PageHead
        title="How the 6-month guarantee works"
        lede={`Placed within 6 months of your AI interview, or the ₹${fee.toLocaleString("en-IN")} fee comes back in full.`}
      />

      <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {termsFor(fee).map((t) => (
            <Surface key={t.label} className="p-5">
              <dt className="text-sm font-medium text-text-subtle">{t.label}</dt>
              <dd className="mt-2">
                <span className="block text-xl font-semibold tracking-tight text-ink-900">{t.value}</span>
                <span className="mt-1 block text-sm text-ink-600">{t.note}</span>
              </dd>
            </Surface>
          ))}
        </dl>

        <Tile title="The process" description="One flow, so you always know what is next.">
          <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {STEPS.map((step) => (
              <li key={step.n} className="rounded-apple-sm bg-ink-50 p-4">
                <span className="nums text-sm font-semibold text-brand-700">{step.n}</span>
                <h3 className="mt-1 text-sm font-semibold text-ink-900">{step.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{step.text}</p>
              </li>
            ))}
          </ol>
        </Tile>

        <Tile title="Exactly 3 conditions" description="What each one actually asks of you.">
          <ol className="grid gap-4 md:grid-cols-3">
            {CONDITIONS.map(({ n, title, body }) => (
              <li key={n} className="rounded-apple-sm bg-ink-50 p-4">
                <span className="nums text-sm font-semibold text-brand-700">{n}</span>
                <h3 className="mt-1 text-sm font-semibold text-ink-900">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{body}</p>
              </li>
            ))}
          </ol>
        </Tile>

        <div className="grid gap-4 xl:grid-cols-2">
          <Tile title="Terms">
            <ul className="space-y-4">
              {PROGRAM_TERMS.map((term) => (
                <li key={term.title} className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink-900">{term.title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{term.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Tile>
          <Tile title="What it does not cover">
            <ul className="space-y-4">
              {EXCLUSIONS.map(({ title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-ink-500" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
                    <p className="mt-0.5 text-sm leading-relaxed text-ink-600">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Tile>
        </div>

        <Tile title="Questions">
          <div className="divide-y divide-ink-100">
            {FAQS.map((f) => (
              <details key={f.id} className="group py-3 first:pt-0 last:pb-0">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                  {f.question}
                  <span aria-hidden className="text-text-subtle transition-transform group-open:rotate-45 motion-reduce:transition-none">
                    +
                  </span>
                </summary>
                <p className="pb-1 text-sm leading-relaxed text-ink-600">{f.answer}</p>
              </details>
            ))}
          </div>
        </Tile>
      </div>
    </div>
  );
}
