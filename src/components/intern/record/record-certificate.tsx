/**
 * The record as a certificate: who, what internship, a seal, three totals,
 * then every entry on one dated rail. Server-rendered; only Copy is client
 * code (components/app/proof).
 */

import Link from "next/link";
import { ArrowUpRight, Award, Briefcase, Clock, MessagesSquare, Wallet, type LucideIcon } from "lucide-react";

import { Surface } from "@/components/app/primitives";
import { CopyFact } from "@/components/app/proof";
import { buttonClass } from "@/components/ui/button";
import { formatMoney, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PROOF_META, proofAsText, type Proof, type ProofKind, type recordTotals } from "@/lib/journey";

const ICON: Record<ProofKind, LucideIcon> = {
  assessment: Award,
  offer: Briefcase,
  interview: MessagesSquare,
  hours: Clock,
  stipend: Wallet,
};

const COLS: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };

const day = (d: Date) => shortDate(d, { day: "numeric", month: "short", year: "numeric" });

/** A rosette: 24 scallops, a ring, a tick. Drawn, not an emoji or a badge image. */
function Seal({ className }: { className?: string }) {
  const points = Array.from({ length: 48 }, (_, i) => {
    const r = i % 2 ? 34 : 38;
    const a = (i / 48) * Math.PI * 2;
    return `${(40 + r * Math.cos(a)).toFixed(2)},${(40 + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden>
      <polygon points={points} className="fill-primary-soft stroke-primary/40" strokeWidth="1" strokeLinejoin="round" />
      <circle cx="40" cy="40" r="26" className="fill-none stroke-primary/50" strokeWidth="1" strokeDasharray="2 3" />
      <circle cx="40" cy="40" r="20" className="fill-none stroke-primary" strokeWidth="1.5" />
      <path d="M31 40.5l6 6 12-13" className="fill-none stroke-primary" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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
  const strip = [
    ...(totals.paid.length
      ? [{ label: "Stipend paid", value: totals.paid.map((p) => formatMoney(p.minor, p.currency, { zeroLabel: false })).join(" + ") }]
      : []),
    ...(totals.hours > 0 ? [{ label: "Hours approved", value: `${totals.hours.toLocaleString("en-IN", { maximumFractionDigits: 2 })} h` }] : []),
    { label: "Confirmed items", value: String(totals.items) },
  ];

  return (
    <Surface as="section" aria-label="Record summary" className="relative overflow-hidden p-5 sm:p-8">
      <div className="flex items-start gap-4 sm:gap-6">
        <Seal className="size-14 shrink-0 sm:size-20" />
        <div className="min-w-0">
          <p className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 sm:text-3xl">{name}</p>
          {internship ? <p className="mt-1 text-pretty text-base text-ink-700">{internship}</p> : null}
          <p className="nums mt-2 text-sm text-text-subtle">
            Findtern record as of {day(asOf)}
          </p>
        </div>
      </div>

      <dl className={cn("mt-6 grid border-t border-ink-100 pt-5 sm:mt-8", COLS[strip.length])}>
        {strip.map((s, i) => (
          <div key={s.label} className={i ? "border-l border-ink-100 pl-4 sm:pl-6" : "pr-4 sm:pr-6"}>
            <dt className="text-xs text-text-subtle sm:text-sm">{s.label}</dt>
            <dd className="nums mt-1 text-pretty text-lg font-semibold text-ink-900 sm:text-2xl">{s.value}</dd>
          </div>
        ))}
      </dl>
    </Surface>
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
          <li key={proof.id} className="relative grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 pb-8 last:pb-0 sm:gap-x-5">
            {last ? null : <span aria-hidden className="absolute bottom-0 left-5 top-11 w-px -translate-x-1/2 bg-ink-200" />}
            <span className="relative grid size-10 place-items-center rounded-full bg-primary-soft text-primary ring-1 ring-inset ring-primary/15">
              <Icon className="size-4.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-1.5">
              {/* h2 under the page h1; kind and date follow the title. */}
              <h2 className="text-pretty text-base font-medium text-ink-900">{proof.title}</h2>
              <p className="nums mt-0.5 text-xs text-text-subtle">
                {meta.label} · <time dateTime={proof.at.toISOString()}>{day(proof.at)}</time>
              </p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                {proof.facts.map((fact) => (
                  <div key={fact.label} className="min-w-0 max-w-full">
                    <dt className="text-xs text-text-subtle">{fact.label}</dt>
                    <dd className="nums text-pretty break-words text-sm font-medium text-ink-800">{fact.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <p className="text-xs text-text-subtle">
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
