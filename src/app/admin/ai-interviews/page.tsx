import { Download } from "lucide-react";
import Link from "next/link";

import { AiExpiredRows, AiLinkRows } from "@/components/admin/ai-link-rows";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { Pagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { AdminEmpty, AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ButtonAnchor, buttonClass } from "@/components/ui/button";
import { AI_EXPIRY_REASONS, aiExpiryLabel, aiTabOf, expiredAiCounts, expiredAiRows, filterExpiredAi, parseExpiredAiFilters, type AiExpiryReason, type AiTab } from "@/lib/admin/ai-interview-expiry";
import { filterAiLinkRows, pickQueue } from "@/lib/admin/ai-link-queue";
import { loadAiLinkRows } from "@/lib/admin/ai-link-queue-load";
import { flattenParams, parsePageRequest, toQueryString, type RawSearchParams } from "@/lib/admin/params";
import { canWrite as mayWrite } from "@/lib/admin/permissions";
import { paginate } from "@/lib/admin/tracker";
import { getSession } from "@/lib/auth";
import { formatNumber } from "@/lib/format";
import { getAiLinkExpiryDays } from "@/lib/platform-settings";
import { cn } from "@/lib/utils";

const BASE = "/admin/ai-interviews";
const TABS: { key: AiTab; label: string }[] = [
  { key: "waiting", label: "Waiting for a link" },
  { key: "sent", label: "Link sent" },
  { key: "completed", label: "Completed" },
  { key: "expired", label: "Expired" },
];
const REASON_CHIP: Record<AiExpiryReason, string> = { link_expired: "Link expired", missed: "Missed", cancelled: "Cancelled", no_show: "No-show" };

/**
 * Every AI interview by where it stands. Waiting shows paid applicants only (oldest first); the others show everyone.
 * Each interview is in exactly one tab (aiTabOf): a link older than `ai_link_expiry_days` that was never completed,
 * or a missed / cancelled one, is Expired and no longer "Link sent".
 */
export default async function AiInterviewsPage({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const q = (params.q ?? "").trim();
  const tab = TABS.find((t) => t.key === params.filter)?.key ?? "waiting";
  const session = await getSession();
  const canWrite = mayWrite(session?.permissions, BASE);
  const now = new Date();

  let all: Awaited<ReturnType<typeof loadAiLinkRows>>;
  let days: number;
  try {
    [all, days] = await Promise.all([loadAiLinkRows(), getAiLinkExpiryDays()]);
  } catch (error) {
    console.error("[admin/ai-interviews] load failed", error);
    return (
      <Panel>
        <AdminLoadError what="the AI interviews" retryHref={BASE} />
      </Panel>
    );
  }

  const matching = filterAiLinkRows(all, q);
  const newestFirst = (a: { createdAt: Date | string | null }, b: { createdAt: Date | string | null }) => +new Date(b.createdAt ?? 0) - +new Date(a.createdAt ?? 0);
  const byTab = (t: AiTab) => matching.filter((r) => aiTabOf(r, now, days) === t).sort(newestFirst);
  const { waiting, unpaid } = pickQueue(matching);
  const expiredAll = expiredAiRows(matching, now, days);
  const sent = byTab("sent");
  const completed = byTab("completed");
  const counts: Record<AiTab, number> = { waiting: waiting.length, sent: sent.length, completed: completed.length, expired: expiredAll.length };

  const reasonCounts = expiredAiCounts(expiredAll);
  const filters = parseExpiredAiFilters(params);
  const expired = filterExpiredAi(expiredAll, filters).sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
  const req = parsePageRequest(params);
  const pg = paginate(expired, req.page, req.perPage);
  const tabHref = (k: AiTab) => `${BASE}?filter=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const chipHref = (r: AiExpiryReason | null) => `${BASE}${toQueryString({ ...params, filter: "expired", reason: r ?? "", page: "" })}`;
  const expiredFiltersOn = Boolean(filters.reason || filters.since || filters.until || q);

  return (
    <div>
      <AdminPageHeader
        title="AI interviews"
        subtitle={`${waiting.length} paid applicant${waiting.length === 1 ? "" : "s"} waiting for a link${unpaid ? `, ${unpaid} unpaid not counted` : ""}.`}
        action={
          tab === "expired" ? (
            <ButtonAnchor href={`/api/admin/expired${toQueryString({ q, reason: params.reason ?? "", from: params.from ?? "", to: params.to ?? "", type: "ai" })}`} variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
              <Download className="size-4" aria-hidden />
              Export expired
            </ButtonAnchor>
          ) : undefined
        }
      />
      <TableToolbar searchPlaceholder="Name, phone or email" />
      <nav aria-label="Filter" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={tabHref(t.key)}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(buttonClass({ variant: t.key === tab ? "primary" : "outline", size: "sm" }), "min-h-11 gap-2 max-sm:flex-1")}
          >
            {t.label}
            <span className="nums opacity-80">{formatNumber(counts[t.key])}</span>
          </Link>
        ))}
      </nav>

      {tab === "expired" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <DateRangeForm params={params} fromLabel="Expired from" toLabel="Expired to" />
            <p className="max-w-prose text-sm text-text-subtle">
              A link not completed within <span className="nums font-medium text-foreground">{days}</span> {days === 1 ? "day" : "days"} of being sent counts as expired. Missed and cancelled interviews are listed too. The send time comes from
              when the link was last added or changed.
            </p>
          </div>
          <nav aria-label="Expiry reason" className="flex flex-wrap gap-2">
            {[{ key: null, label: "All", n: expiredAll.length }, ...AI_EXPIRY_REASONS.map((r) => ({ key: r, label: REASON_CHIP[r], n: reasonCounts[r] }))].map((c) => {
              const on = (filters.reason || null) === c.key;
              return (
                <Link key={c.key ?? "all"} href={chipHref(c.key)} aria-current={on ? "page" : undefined} className={cn(buttonClass({ variant: on ? "primary" : "outline", size: "sm" }), "min-h-11 gap-2 max-sm:flex-1")} title={c.key ? aiExpiryLabel(c.key, days) : undefined}>
                  {c.label}
                  <span className="nums opacity-80">{formatNumber(c.n)}</span>
                </Link>
              );
            })}
          </nav>
          <Panel>
            {pg.rows.length === 0 ? (
              <AdminEmpty
                title={expiredFiltersOn ? "No expired interviews match" : "Nothing has expired"}
                body={expiredFiltersOn ? "No expired AI interview fits this search, reason and date range." : "AI interviews whose link ran out, or that were missed or cancelled, are listed here."}
                action={expiredFiltersOn ? { href: `${BASE}?filter=expired`, label: "Clear filters" } : undefined}
              />
            ) : (
              <>
                <AiExpiredRows rows={pg.rows} now={now} canWrite={canWrite} days={days} />
                <Pagination page={pg.page} pages={pg.pages} total={pg.total} perPage={req.perPage} rowsShown={pg.rows.length} params={{ ...params, filter: "expired" }} basePath={BASE} noun="expired interviews" />
              </>
            )}
          </Panel>
        </div>
      ) : (
        <Panel>
          {(tab === "waiting" ? waiting : tab === "sent" ? sent : completed).length === 0 ? (
            <AdminEmpty title="Nothing here" body={q ? "No AI interview matches that search." : "No AI interviews in this view."} />
          ) : (
            <AiLinkRows rows={tab === "waiting" ? waiting : tab === "sent" ? sent : completed} now={now} canWrite={canWrite} state={tab === "sent" ? "sent" : tab === "completed" ? "completed" : "waiting"} />
          )}
        </Panel>
      )}
    </div>
  );
}
