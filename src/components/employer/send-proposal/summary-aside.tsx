import Link from "next/link";
import { Send, TriangleAlert } from "lucide-react";

import { RATING_META, type CandidateSummary } from "@/lib/employer-candidates";
import { formatMoney } from "@/lib/format";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Column heads for the four-axis meter in the summary card. */
const SHORT_RATING: Record<string, string> = { communication: "Comms", coding: "Coding", aptitude: "Aptitude", interview: "Interview" };

/**
 * Live price summary. A pure view over the form's computed totals: the
 * figures are previews, the server recomputes them on send.
 */
export function SummaryAside({
  candidate,
  currency,
  monthly,
  perHire,
  durationLabel,
  notice,
  disabled,
  onReview,
}: {
  candidate: CandidateSummary;
  currency: "INR" | "USD";
  monthly: number;
  perHire: number;
  durationLabel: string;
  notice: { tone: "ok" | "bad"; text: string } | null;
  disabled: boolean;
  onReview: () => void;
}) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-8 lg:self-start">
      <section className="overflow-hidden rounded-[24px] bg-white shadow-tile">
        <div className="relative isolate overflow-hidden bg-gradient-to-br from-brand-600 via-brand-800 to-brand-950 p-6 text-white">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 -z-10 size-64 rounded-full bg-brand-400/25 blur-3xl" />
          <p className="text-[13px] font-medium text-on-dark-subtle">
            {currency === "INR" && monthly > 0 ? "Monthly (incl. GST)" : "Monthly amount"}
          </p>
          {/* One month's figure only (client QA), not monthly × months. */}
          <p className="nums mt-1.5 break-words text-[clamp(2.25rem,4vw,3rem)] font-light leading-none tracking-[-0.04em]">
            {formatMoney(Math.round(monthly * 100), currency)}
          </p>
          <dl className="mt-5 space-y-1.5 border-t border-white/15 pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-on-dark-subtle">Duration</dt>
              <dd className="nums font-medium">{durationLabel || "-"}</dd>
            </div>
            {perHire > 0 ? (
              <div className="flex justify-between gap-3">
                <dt className="text-on-dark-subtle">Hiring fee (one-time)</dt>
                <dd className="nums font-medium">{formatMoney(Math.round(perHire * 100), currency)}</dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex items-center gap-3 border-b border-ink-100 p-5">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-50 text-sm font-semibold text-brand-800">
            {candidate.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="break-words font-semibold text-ink-900">{candidate.name}</p>
            <p className="nums text-sm text-text-subtle">
              {candidate.scored ? `${candidate.score.toFixed(1)}/10 Findtern Score` : "Not scored"}
            </p>
          </div>
          <Link
            href={`/employer/intern/${encodeURIComponent(candidate.id)}`}
            className="apple-spring inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline-offset-4 hover:underline"
          >
            Profile
          </Link>
        </div>
        {RATING_META.some((r) => candidate.ratings[r.key] > 0) ? (
          <dl className="grid grid-cols-4 border-b border-ink-100">
            {RATING_META.map((r, i) => (
              <div key={r.key} className={cn("px-3 py-3 text-center", i > 0 && "border-l border-ink-100")}>
                <dt className="truncate text-xs text-text-subtle">{SHORT_RATING[r.key] ?? r.label}</dt>
                <dd className="nums mt-0.5 text-sm font-semibold text-ink-900">{candidate.ratings[r.key] > 0 ? candidate.ratings[r.key].toFixed(1) : "-"}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="p-5">
          <p className="text-sm leading-relaxed text-text-subtle">Nothing is charged now. You pay once the candidate accepts.</p>

          {/* Always mounted, so the result is announced when it fills in. */}
          <p
            role="status"
            className={
              notice
                ? cn(
                    "mt-4 flex items-start gap-2 rounded-apple-md px-3 py-2.5 text-sm",
                    notice.tone === "ok" ? "bg-success-soft text-ink-800" : "border border-warning/25 bg-warning-soft text-ink-700",
                  )
                : "sr-only"
            }
          >
            {notice?.tone === "bad" ? <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden /> : null}
            {notice ? <span>{notice.text}</span> : null}
          </p>

          <button
            type="button"
            onClick={onReview}
            disabled={disabled}
            className={buttonClass({ block: true, className: "mt-4 hidden lg:inline-flex" })}
          >
            <Send className="size-4" aria-hidden />
            Review and send
          </button>
        </div>
      </section>
    </aside>
  );
}

export function Row({
  label,
  children,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-sm text-ink-600">{label}</dt>
      <dd className={strong ? "nums text-lg font-semibold tracking-tight text-ink-900" : "nums text-sm font-medium text-ink-800"}>
        {children}
      </dd>
    </div>
  );
}
