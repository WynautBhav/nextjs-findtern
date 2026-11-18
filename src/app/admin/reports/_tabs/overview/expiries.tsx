import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Section } from "@/components/app/stat";
import { LoadNote, windowWords } from "@/components/admin/money/rp-parts";
import { AI_EXPIRY_REASONS, type AiExpiryReason } from "@/lib/admin/ai-interview-expiry";
import { loadExpiries } from "@/lib/admin/reports/overview-load";
import { expiryLinks, type Expiries } from "@/lib/admin/reports/expiries";
import { reportHref } from "@/lib/admin/reports/href";
import { EXPIRED_REASONS, HEADLINE_REASONS } from "@/lib/admin/tracker";
import { EXPIRY_LABEL, type ExpiryReason } from "@/lib/proposal-expiry";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

const AI_LABEL: Record<AiExpiryReason, string> = { link_expired: "Link ran out", missed: "Missed", cancelled: "Cancelled", no_show: "No-show" };
const HINT: Partial<Record<ExpiryReason, string>> = {
  admin_closed: "Closed by hand; not counted as expired",
  withdrawn: "Taken back by the employer; not counted as expired",
};

function Row({ href, label, count, hint }: { href: string; label: string; count: number; hint?: string }) {
  return (
    <li className="border-b border-ink-200">
      <Link href={href} className="-mx-2 flex min-h-11 items-center justify-between gap-3 rounded-md px-2 py-2.5 text-sm transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
        <span className="min-w-0">
          <span className="block text-ink-900">{label}</span>
          {hint ? <span className="block text-xs text-ink-600">{hint}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="nums font-medium text-ink-900">{count === 0 ? <span className="font-normal text-ink-600">none</span> : formatNumber(count)}</span>
          <ChevronRight className="size-4 text-ink-500" aria-hidden />
          <span className="sr-only">: open the list</span>
        </span>
      </Link>
    </li>
  );
}

/** Offers and AI interviews that expired in the period, by reason, each row opening its own pre-filtered list. */
export default async function ExpiriesSection({ window: w, params, now }: TabProps) {
  let e: Expiries | null = null;
  try {
    e = await loadExpiries(w, now);
  } catch (error) {
    console.error("[admin/reports/expiries] load failed", error);
  }
  const label = windowWords(w);
  const links = expiryLinks({ since: w.since, until: w.until });
  return (
    <Section title="Expiries" hint={`By the date they expired, ${label}, India time.`}>
      {e ? (
        <div className="grid gap-x-12 gap-y-8 xl:grid-cols-2" data-rp="overview-expiries">
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">Offers: {e.proposalsHeadline === 0 ? "none expired" : `${formatNumber(e.proposalsHeadline)} expired`}</h3>
            <p className="mb-2 mt-0.5 text-sm text-ink-600">Unanswered or unpaid past the start date, or the candidate took another offer. Offers closed by hand or withdrawn are listed but not counted as expired.</p>
            <ul aria-label="Offers that expired, by reason" className="border-t-2 border-ink-800">
              {EXPIRED_REASONS.map((r: ExpiryReason) => (
                <Row key={r} href={links.proposals(r)} label={EXPIRY_LABEL[r]} count={e.proposals[r]} hint={HEADLINE_REASONS.includes(r) ? undefined : HINT[r]} />
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-base font-semibold text-ink-900">AI interviews: {e.aiTotal === 0 ? "none expired" : `${formatNumber(e.aiTotal)} expired`}</h3>
            <p className="mb-2 mt-0.5 text-sm text-ink-600">The link ran out before the interview was taken, or it was missed or cancelled.</p>
            <ul aria-label="AI interviews that expired, by reason" className="border-t-2 border-ink-800">
              {AI_EXPIRY_REASONS.map((r) => (
                <Row key={r} href={links.ai(r)} label={AI_LABEL[r]} count={e.ai[r]} />
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <LoadNote what="the expiries" retryHref={reportHref(params, {})} />
      )}
    </Section>
  );
}
