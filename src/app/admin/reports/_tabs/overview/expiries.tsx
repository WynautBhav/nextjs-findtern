import { ChevronRight } from "lucide-react";
import Link from "next/link";

import { AdminLoadError, Panel, PanelHeader } from "@/components/admin/panel";
import { AI_EXPIRY_REASONS, type AiExpiryReason } from "@/lib/admin/ai-interview-expiry";
import { loadExpiries } from "@/lib/admin/reports/overview-load";
import { expiryLinks, type Expiries } from "@/lib/admin/reports/expiries";
import { reportHref } from "@/lib/admin/reports/href";
import { EXPIRED_REASONS, HEADLINE_REASONS } from "@/lib/admin/tracker";
import { EXPIRY_LABEL, type ExpiryReason } from "@/lib/proposal-expiry";
import { formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

const AI_LABEL: Record<AiExpiryReason, string> = { link_expired: "Link ran out", missed: "Missed", cancelled: "Cancelled", no_show: "No-show" };

function Row({ href, label, count, hint }: { href: string; label: string; count: number; hint?: string }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 items-center justify-between gap-3 px-[var(--admin-pad-panel)] py-2.5 text-sm hover:bg-[color:var(--admin-panel-2)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <span className="min-w-0">
          <span className="block text-foreground">{label}</span>
          {hint ? <span className="block text-xs text-text-subtle">{hint}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span className="nums font-semibold text-foreground">{formatNumber(count)}</span>
          <ChevronRight className="size-4 text-text-subtle" aria-hidden />
          <span className="sr-only">: open the list</span>
        </span>
      </Link>
    </li>
  );
}

/** Expiries in the selected period (India time, on the expiry date): offers by reason and AI interviews, each linking to its pre-filtered list. */
export default async function Expiries({ window: w, params, now }: TabProps) {
  let e: Expiries | null = null;
  try {
    e = await loadExpiries(w, now);
  } catch (error) {
    console.error("[admin/reports/expiries] load failed", error);
  }
  const label = w.kind === "all" ? "all time" : w.label.toLowerCase();
  const links = expiryLinks({ since: w.since, until: w.until });

  if (!e) {
    return (
      <Panel data-rp="overview-expiries">
        <PanelHeader title="Expiries" />
        <AdminLoadError what="the expiries" retryHref={reportHref(params, {})} />
      </Panel>
    );
  }

  return (
    <section aria-labelledby="overview-expiries-title" className="space-y-3" data-rp="overview-expiries">
      <h2 id="overview-expiries-title" className="text-lg font-semibold tracking-[-0.01em] text-foreground">
        Expiries
        <span className="ml-2 text-sm font-normal text-text-subtle">By the date they expired, {label}, India time.</span>
      </h2>
      <div className="grid gap-5 lg:gap-6 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title={`Offers: ${formatNumber(e.proposalsHeadline)} expired`}
            description="Went unanswered or unpaid past the start date, or the candidate took another offer. Offers closed by hand are counted apart."
          />
          <ul aria-label="Offers that expired, by reason" className="divide-y divide-[color:var(--admin-rule)] border-t border-[color:var(--admin-rule)]">
            {EXPIRED_REASONS.map((r: ExpiryReason) => (
              <Row key={r} href={links.proposals(r)} label={EXPIRY_LABEL[r]} count={e.proposals[r]} hint={HEADLINE_REASONS.includes(r) ? undefined : "Not counted as expired"} />
            ))}
          </ul>
        </Panel>
        <Panel>
          <PanelHeader title={`AI interviews: ${formatNumber(e.aiTotal)} expired`} description="The link ran out before the interview was taken, or it was missed or cancelled." />
          <ul aria-label="AI interviews that expired, by reason" className="divide-y divide-[color:var(--admin-rule)] border-t border-[color:var(--admin-rule)]">
            {AI_EXPIRY_REASONS.map((r) => (
              <Row key={r} href={links.ai(r)} label={AI_LABEL[r]} count={e.ai[r]} />
            ))}
          </ul>
        </Panel>
      </div>
    </section>
  );
}
