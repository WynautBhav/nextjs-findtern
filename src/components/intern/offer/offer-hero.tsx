import { Pill, type Tone } from "@/components/app/primitives";
import { SignatureHero } from "@/components/intern/kit/hero";

export type OfferTerm = { label: string; value: string; unit?: string };

/**
 * The offer page's hero: the money is the figure (large, never animated, it is
 * a string), the role and company above it, and the other terms that decide an
 * offer in a hairline strip underneath.
 */
export function OfferHero({
  role,
  company,
  project,
  status,
  fullTime,
  edited,
  moneyLabel,
  amount,
  per,
  amountIsText,
  bonusLabel,
  terms,
}: {
  role: string;
  company: React.ReactNode;
  project?: string | null;
  status: { label: string; tone: Tone };
  fullTime: boolean;
  edited: boolean;
  moneyLabel: string;
  amount: string;
  per?: string;
  amountIsText: boolean;
  bonusLabel: string | null;
  terms: OfferTerm[];
}) {
  return (
    <SignatureHero
      compact
      className="mb-6 lg:mb-8"
      title={role}
      lede={
        <>
          {company}
          {project ? <span> · {project}</span> : null}
        </>
      }
      actions={
        <div className="flex flex-wrap gap-2">
          <Pill tone={status.tone}>{status.label}</Pill>
          <Pill tone="neutral">{fullTime ? "Full-time role" : "Internship"}</Pill>
          {edited ? <Pill tone="new">Updated</Pill> : null}
        </div>
      }
      aside={
        <div className="lg:text-right">
          <p className="text-[13px] font-medium text-on-dark-subtle">{moneyLabel}</p>
          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 lg:justify-end">
            <span
              className={
                amountIsText
                  ? "text-2xl font-medium tracking-[-0.02em]"
                  : "nums text-[clamp(2.75rem,7vw,4.5rem)] font-light leading-none tracking-[-0.045em]"
              }
            >
              {amount}
            </span>
            {per ? <span className="text-base text-on-dark-subtle">{per.replace(/^\/\s*/, "/ ")}</span> : null}
          </p>
          {bonusLabel ? <p className="mt-3 text-sm text-on-dark">{bonusLabel}</p> : null}
        </div>
      }
    >
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-apple-lg bg-white/15 sm:grid-cols-4">
        {terms.map((t) => (
          <div key={t.label} className="min-w-0 bg-brand-950/80 px-4 py-4 sm:px-5">
            <dt className="text-[13px] text-on-dark-subtle">{t.label}</dt>
            <dd className="nums mt-1 break-words text-xl font-medium tracking-[-0.02em] sm:text-2xl">
              {t.value}
              {t.unit ? <span className="ml-1.5 text-sm font-normal text-on-dark-subtle">{t.unit}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </SignatureHero>
  );
}
