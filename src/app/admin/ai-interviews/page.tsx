import { Download } from "lucide-react";

import { AiExpiredRows, AiLinkRows } from "@/components/admin/ai-link-rows";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { Pagination } from "@/components/admin/pagination";
import { TableToolbar } from "@/components/admin/table-toolbar";
import { AdminEmpty, AdminLoadError, AdminPageHeader, PageLead, Panel } from "@/components/admin/panel";
import { FilterTabs } from "@/components/app/primitives";
import { ButtonAnchor } from "@/components/ui/button";
import { AI_EXPIRY_REASONS, aiTabOf, expiredAiCounts, expiredAiRows, filterExpiredAi, parseExpiredAiFilters, type AiExpiryReason, type AiTab } from "@/lib/admin/ai-interview-expiry";
import { daysWaiting, filterAiLinkRows, pickQueue } from "@/lib/admin/ai-link-queue";
import { loadAiLinkRows } from "@/lib/admin/ai-link-queue-load";
import { flattenParams, parsePageRequest, toQueryString, type RawSearchParams } from "@/lib/admin/params";
import { canWrite as mayWrite } from "@/lib/admin/permissions";
import { paginate } from "@/lib/admin/tracker";
import { getSession } from "@/lib/auth";
import { getAiLinkExpiryDays } from "@/lib/platform-settings";

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
  const oldestDays = waiting.length ? daysWaiting(waiting[0].createdAt, now) : 0;
  const expiredFiltersOn = Boolean(filters.reason || filters.since || filters.until || q);

  return (
    <div>
      <AdminPageHeader
        title="AI interviews"
        action={
          tab === "expired" ? (
            <ButtonAnchor href={`/api/admin/expired${toQueryString({ q, reason: params.reason ?? "", from: params.from ?? "", to: params.to ?? "", type: "ai" })}`} variant="outline" size="sm">
              <Download className="size-4" aria-hidden />
              Export expired
            </ButtonAnchor>
          ) : undefined
        }
      />
      <PageLead
        value={waiting.length}
        label={waiting.length === 1 ? "paid applicant waiting for a link" : "paid applicants waiting for a link"}
        note={
          waiting.length === 0
            ? `Nobody is waiting.${unpaid ? ` ${unpaid} unpaid ${unpaid === 1 ? "applicant is" : "applicants are"} not counted.` : ""}`
            : `Oldest has waited ${oldestDays === 0 ? "since today" : `${oldestDays} ${oldestDays === 1 ? "day" : "days"}`}, listed first.${unpaid ? ` ${unpaid} unpaid not counted.` : ""}`
        }
        tone={oldestDays >= 2 ? "signal" : "ink"}
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterTabs label="AI interview views" value={tab} hrefFor={(k) => tabHref(k as AiTab)} tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.key] }))} />
        <div className="w-full min-w-0 sm:w-80">
          <TableToolbar searchPlaceholder="Name, phone or email" />
        </div>
      </div>

      {tab === "expired" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <DateRangeForm params={params} fromLabel="Expired from" toLabel="Expired to" />
            <p className="max-w-prose text-sm text-ink-700">
              A link not completed within <span className="nums font-medium text-foreground">{days}</span> {days === 1 ? "day" : "days"} of being sent is expired. Missed, cancelled and no-show interviews are listed here too. Send time is when the link was
              last added or changed.
            </p>
          </div>
          <FilterTabs
            label="Expiry reason"
            value={filters.reason || "all"}
            hrefFor={(k) => chipHref(k === "all" ? null : (k as AiExpiryReason))}
            tabs={[{ key: "all", label: "All", count: expiredAll.length }, ...AI_EXPIRY_REASONS.map((r) => ({ key: r, label: REASON_CHIP[r], count: reasonCounts[r] }))]}
          />
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
            <AdminEmpty title={q ? "Nothing matches" : "Nothing here"} body={q ? "No AI interview matches that search." : "No AI interviews in this view."} action={q ? { href: tabHref(tab).replace(/&q=.*$/, ""), label: "Clear the search" } : tab === "waiting" ? { href: "/admin/interns?ai=applied", label: "See candidates who applied" } : { href: `${BASE}?filter=waiting`, label: "Open the waiting list" }} />
          ) : (
            <AiLinkRows rows={tab === "waiting" ? waiting : tab === "sent" ? sent : completed} now={now} canWrite={canWrite} state={tab === "sent" ? "sent" : tab === "completed" ? "completed" : "waiting"} />
          )}
        </Panel>
      )}
    </div>
  );
}
