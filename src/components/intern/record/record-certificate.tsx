/**
 * The record as a certificate: who, what internship, a seal, three totals,
 * then every entry on one dated rail. Server-rendered; only Copy is client
 * code (components/app/proof).
 */

import Link from "next/link";
import { ArrowUpRight, Award, Briefcase, Clock, MessagesSquare, Wallet, type LucideIcon } from "lucide-react";

import { CopyFact } from "@/components/app/proof";
import { buttonClass } from "@/components/ui/button";
import { formatMoney, shortDate } from "@/lib/format";
import { PROOF_META, proofAsText, type Proof, type ProofKind, type recordTotals } from "@/lib/journey";

const ICON: Record<ProofKind, LucideIcon> = {
  assessment: Award,
  offer: Briefcase,
  interview: MessagesSquare,
  hours: Clock,
  stipend: Wallet,
};

const day = (d: Date) => shortDate(d, { day: "numeric", month: "short", year: "numeric" });

export function RecordCertificate({
  name,
  internship,
  asOf,
  totals,
}: {
  name: string;
  /** "Frontend Intern at Northwind Labs", when there is one. */
  internship?: string;
  asOf: Date;
  totals: ReturnType<typeof recordTotals>;
}) {
  const facts = [
    ...(totals.paid.length ? [{ label: "Stipend paid", value: totals.paid.map((p) => formatMoney(p.minor, p.currency, { zeroLabel: false })).join(" + ") }] : []),
    ...(totals.hours > 0 ? [{ label: "Hours approved", value: `${totals.hours.toLocaleString("en-IN", { maximumFractionDigits: 2 })} h` }] : []),
    { label: "Confirmed entries", value: String(totals.items) },
  ];

  // A document, not a card: paper, a double rule top and bottom, the name set large, the facts ruled, and a verification line.
  return (
    <article aria-label="Record summary" className="border-y-[3px] border-double border-ink-400 bg-surface-raised px-5 py-8 sm:px-12 sm:py-12">
      <p className="text-sm text-ink-600">Findtern record of internship</p>
      <h2 className="mt-3 text-balance font-display text-4xl font-semibold tracking-[-0.03em] text-ink-900">{name}</h2>
      {internship ? <p className="mt-2 text-pretty text-lg text-ink-700">{internship}</p> : null}

      <dl className="mt-8 grid max-w-2xl divide-y divide-ink-200 border-y border-ink-200">
        {facts.map((f) => (
          <div key={f.label} className="flex items-baseline justify-between gap-6 py-3">
            <dt className="text-sm text-ink-700">{f.label}</dt>
            <dd className="nums text-right font-display text-xl font-semibold text-ink-900">{f.value}</dd>
          </div>
        ))}
      </dl>

      <p className="nums mt-6 max-w-2xl text-pretty text-sm text-ink-600">
        As of <time dateTime={asOf.toISOString()}>{day(asOf)}</time>. Each entry below is confirmed by a person or a payment on Findtern, not claimed. Anyone you share the downloaded file with can ask
        communicate@findtern.in to verify it.
      </p>
    </article>
  );
}

/** Every entry on one rail, newest first: icon node, what and when, the facts, who confirmed it. */
export function RecordTimeline({ proofs }: { proofs: Proof[] }) {
  return (
    <ol className="relative">
      {proofs.map((proof, i) => {
        const meta = PROOF_META[proof.kind];
        const Icon = ICON[proof.kind];
        const last = i === proofs.length - 1;
        return (
          <li key={proof.id} style={{ "--i": Math.min(i, 8) } as React.CSSProperties} className="rise relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 pb-8 last:pb-0 sm:gap-x-4">
            {last ? null : <span aria-hidden className="absolute bottom-0 left-5 top-11 w-px -translate-x-1/2 bg-ink-200" />}
            <span className="relative grid size-10 place-items-center rounded-full bg-surface-raised text-brand-800 ring-1 ring-inset ring-ink-300">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-1.5">
              {/* h2 under the page h1; kind and date follow the title. */}
              <h2 className="text-pretty font-display text-base font-semibold text-ink-900">{proof.title}</h2>
              <p className="nums mt-0.5 text-sm text-ink-600">
                {meta.label}
                {proof.at ? (
                  <>
                    {" · "}
                    <time dateTime={proof.at.toISOString()}>{day(proof.at)}</time>
                  </>
                ) : null}
              </p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {proof.facts.map((fact) => (
                  <div key={fact.label} className="min-w-0 max-w-full">
                    <dt className="text-xs text-ink-600">{fact.label}</dt>
                    <dd className="nums text-pretty break-words text-sm font-medium text-ink-800">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-xs text-ink-600">
                  {proof.issuedBy ? `Confirmed by ${proof.issuedBy}` : "On your record"}
                </p>
                <div className="-ml-3 flex items-center gap-1 sm:ml-0">
                  <CopyFact text={proofAsText(proof, "")} label={`Copy ${meta.label.toLowerCase()}`} />
                  {proof.href ? (
                    <Link
                      href={proof.href}
                      className={buttonClass({ variant: "ghost", size: "sm", className: "text-ink-600 hover:text-ink-900" })}
                    >
                      Open
                      <ArrowUpRight className="size-4" aria-hidden />
                      <span className="sr-only">{proof.title}</span>
                    </Link>
                  ) : null}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
