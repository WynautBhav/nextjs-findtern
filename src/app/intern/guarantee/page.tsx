import type { Metadata } from "next";
import { CheckCircle2, XCircle } from "lucide-react";

import { PageHead } from "@/components/app/primitives";
import { Section as Block } from "@/components/app/stat";
import { requireRole } from "@/lib/auth";
import { guardPrecomplete } from "@/lib/intern-precomplete";
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
  const session = await requireRole("intern");
  // Closed until the profile is complete (unpaid interns only).
  await guardPrecomplete(session.uid, "/intern/guarantee");
  const fee = Math.round((await getInternActivationFeeMinor()) / 100);

  return (
    <div>
      <PageHead
        title="How the 6-month guarantee works"
        lede={`Placed within 6 months of your AI interview, or the ₹${fee.toLocaleString("en-IN")} fee comes back in full.`}
      />

      <div className="space-y-12">
        {/* The terms as a ledger: what is promised, in the right-hand column. */}
        <dl className="divide-y divide-ink-200 border-y border-ink-200">
          {termsFor(fee).map((t) => (
            <div key={t.label} className="grid gap-x-8 gap-y-1 py-3.5 sm:grid-cols-[12rem_minmax(0,1fr)]">
              <dt className="text-sm text-ink-600">{t.label}</dt>
              <dd>
                <span className="nums font-display text-lg font-semibold text-ink-900">{t.value}</span>
                <span className="mt-0.5 block text-sm text-ink-700">{t.note}</span>
              </dd>
            </div>
          ))}
        </dl>

        <Block title="The process" hint="One flow, so you always know what is next.">
          <Numbered items={STEPS.map((x) => ({ n: x.n, title: x.title, text: x.text }))} />
        </Block>

        <Block title="Exactly 3 conditions" hint="What each one actually asks of you.">
          <Numbered items={CONDITIONS.map((x) => ({ n: x.n, title: x.title, text: x.body }))} />
        </Block>

        <div className="grid gap-x-14 gap-y-12 xl:grid-cols-2">
          <Block title="What is covered">
            <ul className="divide-y divide-ink-200">
              {PROGRAM_TERMS.map((term) => (
                <li key={term.title} className="flex items-start gap-3 py-3.5 first:pt-0">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink-900">{term.title}</h3>
                    <p className="mt-0.5 text-pretty text-sm text-ink-700">{term.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Block>
          <Block title="What ends it, and what it does not cover">
            <ul className="divide-y divide-ink-200">
              {EXCLUSIONS.map(({ title, body }) => (
                <li key={title} className="flex items-start gap-3 py-3.5 first:pt-0">
                  <XCircle className="mt-0.5 size-4 shrink-0 text-ink-600" aria-hidden />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
                    <p className="mt-0.5 text-pretty text-sm text-ink-700">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Block>
        </div>

        <Block title="Questions">
          <div className="divide-y divide-ink-200">
            {FAQS.map((f) => (
              <details key={f.id} className="group py-1">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-ink-900 [&::-webkit-details-marker]:hidden">
                  {f.question}
                  <span aria-hidden className="text-ink-600 transition-transform group-open:rotate-45 motion-reduce:transition-none">
                    +
                  </span>
                </summary>
                <p className="max-w-prose text-pretty pb-3 text-sm text-ink-700">{f.answer}</p>
              </details>
            ))}
          </div>
        </Block>
      </div>
    </div>
  );
}

/** Numbered steps as ruled rows: the number is a hanging column, not a card. */
function Numbered({ items }: { items: { n: number | string; title: string; text: string }[] }) {
  return (
    <ol className="divide-y divide-ink-200">
      {items.map((x) => (
        <li key={x.n} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3 py-3.5 first:pt-0 sm:grid-cols-[2.5rem_14rem_minmax(0,1fr)] sm:gap-x-4">
          <span className="nums font-display text-lg font-semibold text-brand-700">{x.n}</span>
          <h3 className="text-sm font-semibold text-ink-900">{x.title}</h3>
          <p className="col-start-2 mt-1 text-pretty text-sm text-ink-700 sm:col-start-3 sm:mt-0">{x.text}</p>
        </li>
      ))}
    </ol>
  );
}
