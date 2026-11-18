import { desc, eq, sql } from "drizzle-orm";
import { Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { flattenParams, parsePageRequest, toQueryString } from "@/lib/admin/params";
import { isTestEmployer } from "@/lib/admin/scope";
import { expiredCounts, expiredProposals, filterExpired, filterInterviews, filterProposals, headlineCount, ineligibleInterns, parseExpiredFilters, parseIstDay, proposalTimezone, type TrackerFilters } from "@/lib/admin/tracker";
import { loadExpiredSources } from "@/lib/admin/expired-load";
import { kickProposalExpiry } from "@/lib/proposal-expiry-kick";
import { acceptanceRate, proposalOutcome } from "@/lib/proposals";
import { formatNumber } from "@/lib/format";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { DateRangeForm } from "@/components/admin/date-range-form";
import { ProposalTrackerView, TRACKER_TABS, type TrackerTab } from "@/components/admin/proposal-tracker-view";
import { LeadStat, Overview, StatList, type StatItem } from "@/components/app/stat";
import { OPEN_STATUSES } from "@/components/admin/proposal-stages";
import { daysSince } from "@/lib/admin/ai-interview-expiry";
import { isAiInterview } from "@/lib/admin/interview-notes";
import { ButtonAnchor } from "@/components/ui/button";

/**
 * Proposal pipeline (legacy admin-proposal-tracker.tsx): companies,
 * proposals, candidates, interviews and hires, all filtered by the same URL
 * (date range, exact company, exact candidate, timezone), so the figures and
 * the tables never disagree.
 */

async function load() {
  const db = getDb();
  const [employers, proposals, interviews, onboarding, expiredSources] = await Promise.all([
    db
      .select({
        id: schema.employers.id,
        companyName: schema.employers.companyName,
        companyEmail: schema.employers.companyEmail,
        city: schema.employers.city,
        country: schema.employers.country,
        isActive: schema.employers.isActive,
      })
      .from(schema.employers)
      .orderBy(desc(schema.employers.createdAt)),
    db
      .select({
        id: schema.proposals.id,
        status: schema.proposals.status,
        flowType: schema.proposals.flowType,
        currency: schema.proposals.currency,
        offerDetails: schema.proposals.offerDetails,
        createdAt: schema.proposals.createdAt,
        updatedAt: schema.proposals.updatedAt,
        hiredAt: schema.proposals.hiredAt,
        internId: schema.proposals.internId,
        internFirstName: schema.users.firstName,
        internLastName: schema.users.lastName,
        internEmail: schema.users.email,
        internPhone: schema.users.phoneNumber,
        employerId: schema.proposals.employerId,
        companyName: schema.employers.companyName,
        projectId: schema.proposals.projectId,
        projectName: schema.projects.projectName,
        projectTimezone: schema.projects.timezone,
      })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .leftJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
      .orderBy(desc(schema.proposals.createdAt)),
    db
      .select({
        id: schema.interviews.id,
        status: schema.interviews.status,
        slot1: schema.interviews.slot1,
        slot2: schema.interviews.slot2,
        slot3: schema.interviews.slot3,
        selectedSlot: schema.interviews.selectedSlot,
        timezone: schema.interviews.timezone,
        meetingLink: schema.interviews.meetingLink,
        notes: schema.interviews.notes,
        createdAt: schema.interviews.createdAt,
        internId: schema.interviews.internId,
        internFirstName: schema.users.firstName,
        internLastName: schema.users.lastName,
        internEmail: schema.users.email,
        employerId: schema.interviews.employerId,
        companyName: schema.employers.companyName,
        companyEmail: schema.employers.companyEmail,
        projectId: schema.interviews.projectId,
        projectName: schema.projects.projectName,
      })
      .from(schema.interviews)
      .leftJoin(schema.users, eq(schema.users.id, schema.interviews.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, schema.interviews.employerId))
      .leftJoin(schema.projects, eq(schema.projects.id, schema.interviews.projectId))
      .orderBy(desc(schema.interviews.createdAt)),
    db
      .select({ userId: schema.internOnboarding.userId, endedAt: sql<string | null>`${schema.internOnboarding.extraData}->>'guaranteeEndedAt'` })
      .from(schema.internOnboarding)
      .where(sql`${schema.internOnboarding.extraData} ? 'guaranteeEndedAt'`),
    loadExpiredSources(),
  ]);
  // From every proposal, not the filtered page rows: same inputs as the intern's own offer page.
  const noGuarantee = ineligibleInterns(proposals, new Map(onboarding.map((o) => [o.userId, { guaranteeEndedAt: o.endedAt }])));
  return { noGuarantee, expiredSources, employers, proposals, interviews: interviews.map(({ companyEmail, ...i }) => ({ ...i, isAi: isAiInterview(i.employerId, companyEmail) })) };
}

type TrackerData = Awaited<ReturnType<typeof load>>;

export default async function AdminProposalTrackerPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  kickProposalExpiry(); // queued after the response; throttled to one sweep per 10 minutes
  const params = flattenParams(await searchParams);
  const tab: TrackerTab = (TRACKER_TABS as readonly string[]).includes(params.tab ?? "") ? (params.tab as TrackerTab) : "proposals";
  const filters: TrackerFilters = {
    from: parseIstDay(params.from),
    to: parseIstDay(params.to, true),
    company: params.company ?? "",
    intern: params.intern ?? "",
    tz: params.tz ?? "",
  };

  const header = (
    <AdminPageHeader
      title="Proposal pipeline"
      action={
        <ButtonAnchor
          href={
            tab === "hired"
              ? `/api/admin/export/hired${toQueryString({ ...params, tab: "", page: "", per: "" })}`
              : tab === "expired"
                ? `/api/admin/expired${toQueryString({ ...params, type: "proposals", tab: "", page: "", per: "", sort: "", dir: "" })}`
                : `/api/admin/export${toQueryString({ ...params, type: "proposals", tab: "", page: "", per: "" })}`
          }
          variant="outline"
          size="sm"
        >
          <Download className="size-4" aria-hidden />
          {tab === "hired" ? "Export hires" : tab === "expired" ? "Export expired" : "Export CSV"}
        </ButtonAnchor>
      }
    />
  );

  let data: TrackerData;
  try {
    data = await load();
  } catch (error) {
    console.error("[admin/proposal-tracker]", error);
    return (
      <div className="space-y-6">
        {header}
        <Panel>
          <AdminLoadError what="the proposal pipeline" retryHref="/admin/proposal-tracker" />
        </Panel>
      </div>
    );
  }

  // The internal "admin" and AI-interview employers are not hiring activity.
  const testIds = new Set(data.employers.filter((e) => isTestEmployer(e)).map((e) => e.id));
  testIds.add("admin");
  const realProposals = data.proposals.filter((p) => !testIds.has(p.employerId));
  const realInterviews = data.interviews.filter((i) => !testIds.has(i.employerId));

  const proposals = filterProposals(realProposals, filters);
  const interviews = filterInterviews(realInterviews, filters);

  // Picker options come from the unfiltered rows, so a pick never hides itself.
  const name = (first: string | null, last: string | null, email: string | null) => `${first ?? ""} ${last ?? ""}`.trim() || email || "Candidate";
  const companyOptions = data.employers
    .filter((e) => !testIds.has(e.id) && (realProposals.some((p) => p.employerId === e.id) || realInterviews.some((i) => i.employerId === e.id)))
    .map((e) => ({ value: e.id, label: e.companyName }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const interns = new Map<string, string>();
  for (const r of [...realProposals, ...realInterviews]) interns.set(r.internId, name(r.internFirstName, r.internLastName, r.internEmail));
  const internOptions = [...interns].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  const zones = new Set<string>();
  for (const p of realProposals) {
    const z = proposalTimezone(p);
    if (z) zones.add(z);
  }
  for (const i of realInterviews) zones.add(i.timezone || "Asia/Kolkata");
  const tzOptions = [...zones].sort().map((z) => ({ value: z, label: z }));

  const won = proposals.filter((p) => proposalOutcome(p.status) === "won").length;
  const lost = proposals.filter((p) => proposalOutcome(p.status) === "lost").length;
  const rate = acceptanceRate(won, lost);
  const now = new Date().getTime();
  const upcoming = interviews.filter((i) => {
    const s = i.selectedSlot === 1 ? i.slot1 : i.selectedSlot === 2 ? i.slot2 : i.selectedSlot === 3 ? i.slot3 : null;
    return i.status === "scheduled" && s && s.getTime() > now;
  }).length;
  // Expired offers: on this tab the date range is the EXPIRY date (every other tab filters on when the offer was sent).
  const expiredNow = new Date();
  const expired = filterExpired(expiredProposals(data.expiredSources.rows, expiredNow, data.expiredSources.openOrderIds), { ...parseExpiredFilters(params), reason: "", q: "" });
  const expiredHeadline = headlineCount(expiredCounts(expired));
  const rangeLabel = filters.from || filters.to ? `${params.from ?? "start"} to ${params.to ?? "today"}` : "All time";
  const req = parsePageRequest(params);

  // The page's one lead figure: offers still moving, and how long the oldest has sat in its stage.
  const open = proposals.filter((p) => OPEN_STATUSES.includes(p.status));
  const oldest = open.reduce<(typeof open)[number] | null>((o, p) => ((p.updatedAt ?? p.createdAt)! < ((o?.updatedAt ?? o?.createdAt) ?? new Date(8.64e15)) ? p : o), null);
  const oldestDays = oldest ? daysSince(oldest.updatedAt ?? oldest.createdAt, expiredNow) : null;
  const queueHref = `/admin/proposal-tracker${toQueryString({ ...params, tab: "proposals", lane: "", sort: "", dir: "", page: "" })}`;
  const rest: StatItem[] = tab === "expired"
    ? [{ label: filters.from || filters.to ? `Expired ${rangeLabel}` : "Expired, all time", value: formatNumber(expiredHeadline) }]
    : [
        { label: "Accepted or hired", value: formatNumber(won), hint: rate === null ? undefined : `${rate}% of decided offers` },
        ...(lost ? [{ label: "Declined", value: formatNumber(lost) }] : []),
        ...(upcoming ? [{ label: "Interviews upcoming", value: formatNumber(upcoming) }] : []),
      ];

  return (
    <div className="space-y-6">
      {header}

      <Overview
        lead={
          <LeadStat
            label={open.length === 1 ? "Offer still moving" : "Offers still moving"}
            value={formatNumber(open.length)}
            tone={open.length ? "signal" : "ink"}
            note={
              oldest
                ? oldestDays
                  ? `The oldest has sat ${oldestDays} ${oldestDays === 1 ? "day" : "days"} in its stage: ${name(oldest.internFirstName, oldest.internLastName, oldest.internEmail)} at ${oldest.companyName ?? "a company"}.`
                  : "Nothing has sat longer than a day."
                : "Every offer in this period has been decided."
            }
            action={open.length ? { label: "Work the queue, oldest first", href: queueHref } : undefined}
          />
        }
        rest={<StatList items={rest} />}
      />

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <DateRangeForm params={params} fromLabel={tab === "expired" ? "Expired from" : "From"} toLabel={tab === "expired" ? "Expired to" : "To"} />
        <p className="nums pb-2 text-sm text-text-subtle">{rangeLabel}</p>
      </div>

      <ProposalTrackerView
        tab={tab}
        params={params}
        page={req.page}
        perPage={req.perPage}
        search={req.search}
        employers={data.employers.filter((e) => !testIds.has(e.id))}
        proposals={proposals}
        interviews={interviews}
        noGuarantee={data.noGuarantee}
        expired={expired}
        options={{ companies: companyOptions, interns: internOptions, timezones: tzOptions }}
      />
    </div>
  );
}
