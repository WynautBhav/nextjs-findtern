"use client";

/**
 * Proof.
 *
 * A dated statement of something that happened, carrying its facts, and
 * exportable as text. This is where the reward lives.
 *
 * ── Why not confetti ───────────────────────────────────────────────────
 *
 * Because confetti is a reward for the person watching, and it is worthless
 * to the person being watched. A student cannot put confetti on a CV. They
 * can put "26 hours approved by Northwind Labs, 15 September 2026" on a CV.
 *
 * The research on this is unusually direct: rewards read as *information*
 * about your own competence raise intrinsic motivation, and rewards read as
 * *control* over your behaviour reduce it. A card that says "here is what you
 * actually did, and here is the date" is informational. A badge that says
 * "you earned a level" is control wearing a costume. There is no level here,
 * and there is not going to be one.
 *
 * ── The one moment of theatre ──────────────────────────────────────────
 *
 * A card that has never been seen before draws itself once: the amber thread
 * sweeps across the top, the facts settle in sequence. It happens exactly
 * once per card per device, it never loops, and under reduced motion the card
 * is simply there. That is the whole budget for delight on the record screen,
 * and it is spent on the one object that is actually worth having.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, Check, Copy, Download } from "lucide-react";

import { Pill, Surface } from "@/components/app/primitives";
import { PROOF_META, proofAsText, type Proof } from "@/lib/journey";
import { useSeenIds } from "@/components/app/thread";
import { cn } from "@/lib/utils";

const KIND_TONE: Record<Proof["kind"], "live" | "paid" | "new" | "neutral" | "closed" | "waiting"> = {
  assessment: "new",
  offer: "live",
  interview: "neutral",
  hours: "live",
  stipend: "paid",
};

export function ProofCard({
  proof,
  fresh,
  index,
  className,
}: {
  proof: Proof;
  /** True the first time this device has seen this card. */
  fresh: boolean;
  index: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const meta = PROOF_META[proof.kind];

  return (
    <motion.article
      initial={reduce || !fresh ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.5,
        delay: reduce ? 0 : Math.min(index, 5) * 0.07,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "apple-spring group relative overflow-hidden rounded-[20px] border border-ink-200/70 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] hover:border-ink-200",
        className,
      )}
    >
      {/* The amber thread. Reserved for proof and nothing else in the whole
          product, so when it appears it means something. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-accent-400 via-accent-300 to-brand-400"
      />

      <div className="p-5 pt-6">
        <div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-600">
              {meta.label}
            </p>
            <Pill tone={KIND_TONE[proof.kind]}>{formatDate(proof.at)}</Pill>
          </div>
          <h3 className="mt-2 text-balance text-lg font-semibold tracking-[-0.015em] text-ink-900">
            {proof.title}
          </h3>
        </div>

        <p className="mt-2 text-pretty text-sm leading-relaxed text-ink-600">{proof.line}</p>

        <dl className="mt-4 divide-y divide-ink-100 border-y border-ink-100">
          {proof.facts.map((fact, i) => (
            <motion.div
              key={fact.label}
              initial={reduce || !fresh ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: reduce ? 0 : 0.16 + i * 0.05 }}
              className="flex items-baseline justify-between gap-5 py-2.5"
            >
              <dt className="shrink-0 text-sm text-ink-600">{fact.label}</dt>
              <dd className="min-w-0 text-right text-sm font-medium text-ink-900">
                {fact.value}
              </dd>
            </motion.div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-xs text-ink-600">
            {proof.issuedBy ? `Confirmed by ${proof.issuedBy}` : "On your record"}
          </p>
          <div className="ml-auto flex items-center gap-3">
            <CopyFact text={proofAsText(proof, "")} label={`Copy ${meta.label.toLowerCase()}`} />
            {proof.href ? (
              <Link
                href={proof.href}
                className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Open
                <ArrowUpRight className="size-3.5" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

/** Copy to clipboard with a state that confirms itself, then gets out of the way. */
function CopyFact({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 2200);
        } catch {
          setCopied(false);
        }
      }}
      className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900"
    >
      {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      <span className="sr-only">{copied ? "Copied" : label}</span>
      <span aria-hidden>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

/**
 * The whole record, as one exportable document.
 *
 * A student needs this as a document, not as a screenshot of a dashboard. A
 * screenshot looks like a product; a plain text file looks like a record, and
 * it pastes cleanly into an email or a document. No ribbon, no share sheet
 * theatre, no export button that opens a modal asking which of nine formats
 * they want.
 */
export function RecordExport({
  filename,
  text,
  className,
}: {
  filename: string;
  text: string;
  className?: string;
}) {
  const [done, setDone] = useState(false);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  function download() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(blob);
    urlRef.current = url;
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setDone(true);
    window.setTimeout(() => setDone(false), 2400);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <button
        type="button"
        onClick={download}
        className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 rounded-[10px] bg-primary px-5 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover"
      >
        {done ? <Check className="size-4" aria-hidden /> : <Download className="size-4" aria-hidden />}
        {done ? "Downloaded" : "Download your record"}
      </button>
      <p className="text-sm text-ink-600">A plain text file. Opens anywhere.</p>
    </div>
  );
}

/**
 * A short list of records, on the home screen.
 *
 * The "have I seen this before" check has to happen on the device, because
 * "new" here means new *to you*, not new in the database. A card that draws
 * itself once and then never again is the difference between a reward and an
 * animation, and only local storage can tell the two apart without asking the
 * server to remember something about a person it should not be tracking.
 *
 * Rendering is not blocked on the answer. Until the device has answered, cards
 * render without the entrance, which is the safe direction: a returning
 * candidate never sees their history replay at them.
 */
export function FreshProofList({
  proofs,
  className,
}: {
  proofs: Proof[];
  className?: string;
}) {
  const [seen] = useSeenIds("findtern.seen.proofs");
  const isClient = seen !== null;

  return (
    <ProofGrid className={className}>
      {proofs.slice(0, 2).map((proof, i) => (
        <ProofCard
          key={proof.id}
          proof={proof}
          index={i}
          fresh={isClient && !seen.has(proof.id)}
        />
      ))}
    </ProofGrid>
  );
}

/** The record screen's list. Same rule, same storage key, full set. */
export function FreshProofGrid({ proofs }: { proofs: Proof[] }) {
  const [seen] = useSeenIds("findtern.seen.proofs");
  const isClient = seen !== null;

  return (
    <ProofGrid>
      {proofs.map((proof, i) => (
        <ProofCard
          key={proof.id}
          proof={proof}
          index={i}
          fresh={isClient && !seen.has(proof.id)}
        />
      ))}
    </ProofGrid>
  );
}

/**
 * Cards lay out in one column until there is genuinely room for two.
 *
 * The previous version went two up at `sm`, which put a pair of cards inside a
 * 20rem side rail and wrapped every line to one or two words. A card is a
 * document with facts in it, so the grid only splits at `xl` and the card
 * itself sets a floor. Compressing it further is now impossible rather than
 * merely unlikely.
 */
export function ProofGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,22rem),1fr))]", className)}>
      {children}
    </div>
  );
}

/** A compact count strip. Shown above the record so the size is legible at a glance. */
export function RecordCount({ proofs }: { proofs: Proof[] }) {
  return (
    <Surface className="flex flex-wrap items-baseline gap-x-3 gap-y-1 p-5">
      <p className="text-3xl font-semibold tabular-nums tracking-[-0.02em] text-ink-900">
        {proofs.length}
      </p>
      <p className="text-sm text-ink-600">
        verified item{proofs.length === 1 ? "" : "s"} on your record. Each one carries a date and a
        name, and each one was checked by a person or a payment, not by you.
      </p>
    </Surface>
  );
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
