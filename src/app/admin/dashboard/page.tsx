import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import {
  ArrowRight,
  Banknote,
  CalendarX,
  ClipboardCheck,
  CreditCard,
  Gauge,
  Link2Off,
  MessageSquare,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { calendarMissing } from "@/lib/calendar-status";
import { formatMoney, shortDate } from "@/lib/format";
import { AdminEmpty, AdminLoadError, AttentionBanner, Panel } from "@/components/admin/panel";
import { TrendChart } from "@/components/admin/trend-chart";
import { DetailRow, PageHead } from "@/components/app/primitives";
import { STAT_ROW, StatTile, Tile } from "@/components/app/tiles";
import { ButtonLink } from "@/components/ui/button";
import { inrMinorSql, meaningfulProfile, realEmployerId, realEmployers, TEST_EMPLOYER_ID, AI_INTERVIEW_EMAIL } from "@/lib/admin/scope";
import { attentionTotal } from "@/lib/admin/dashboard";

/**
 * Admin home, a bento like the intern home (SPECS §2 dashboard exception):
 * the key numbers first with one brand tile ("Needs you", the count a person
 * owes someone today), then the queue beside a six-month pipeline chart, then
 * recent activity beside the leftover figures. Nothing appears twice. Full
 * lists live on their own pages.
 */

type Task = {
  key: string;
  count: number;
  /** Added in the last 7 days, when the queue can tell. */
  fresh?: number;
  label: string;
  detail: string;
  href: string;
  cta: string;
  Icon: typeof MessageSquare;
  /** A state rather than a queue: the label reads on its own, without the figure. */
  flag?: boolean;
};

type Event = { label: string; detail: string; href: string; date: Date | null };

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

function greeting(now: Date): string {
  // Admins work in IST; the server may not.
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** The selected slot of an interview, in SQL. */
const SELECTED_SLOT = sql`(CASE ${schema.interviews.selectedSlot} WHEN 1 THEN ${schema.interviews.slot1} WHEN 2 THEN ${schema.interviews.slot2} WHEN 3 THEN ${schema.interviews.slot3} END)`;

/** An AI-interview row (the internal "admin" employer or the AI employer). */
const AI_INTERVIEW = sql`(i.employer_id = ${TEST_EMPLOYER_ID} OR i.employer_id IN (SELECT id FROM ${schema.employers} WHERE lower(company_email) = ${AI_INTERVIEW_EMAIL}))`;

async function loadDashboard(uid: string | null) {
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const soon = new Date(now.getTime() + 3 * DAY_MS).toISOString().slice(0, 10);

  const [
    [admin],
    [candidates],
    [signups],
    [candidatesNew],
    [companies],
    [companiesNew],
    [revenue],
    [revenueWeek],
    [incompleteProfiles],
    [unreadMessages],
    [sheetsWaiting],
    [interviewsUpcoming],
    [interviewsNoLink],
    [interviewsAll],
    [payoutsDue],
    [unscored],
    [projectsTotal],
    [hiringSpeed],
    proposalStatus,
    recentUsers,
    recentProjects,
    recentAccepted,
    recentPayments,
    trend,
  ] = await Promise.all([
    uid
      ? db.select({ name: schema.admins.name }).from(schema.admins).where(eq(schema.admins.id, uid)).limit(1)
      : Promise.resolve([undefined]),
    // Legacy "total interns": active interns with a real profile, not every signup.
    db
      .select({ value: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(and(eq(schema.users.role, "intern"), eq(schema.users.isActive, true), meaningfulProfile())),
    db.select({ value: count() }).from(schema.users).where(eq(schema.users.role, "intern")),
    // New this week, counted by the same rule as the total beside it (it
    // counted every signup, so the tile read "117, +120 this week").
    db
      .select({ value: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(and(eq(schema.users.role, "intern"), eq(schema.users.isActive, true), meaningfulProfile(), gte(schema.users.createdAt, weekAgo))),
    // Legacy rule: active, onboarded, real companies (not the test employers).
    db
      .select({ value: count() })
      .from(schema.employers)
      .where(and(realEmployers(), eq(schema.employers.isActive, true), eq(schema.employers.onboardingCompleted, true))),
    db
      .select({ value: count() })
      .from(schema.employers)
      .where(and(realEmployers(), eq(schema.employers.isActive, true), eq(schema.employers.onboardingCompleted, true), gte(schema.employers.createdAt, weekAgo))),
    // Paid employer orders plus intern fees, USD converted (same as Reports).
    db.execute<{ value: number }>(sql`
      SELECT coalesce(sum(v), 0)::bigint AS value FROM (
        SELECT ${inrMinorSql(schema.employerPayments.amountMinor, schema.employerPayments.currency)} AS v
          FROM ${schema.employerPayments} WHERE ${schema.employerPayments.status} = 'paid'
        UNION ALL
        SELECT ${inrMinorSql(schema.internPayments.amountMinor, schema.internPayments.currency)}
          FROM ${schema.internPayments} WHERE ${schema.internPayments.status} = 'paid'
      ) t`).then((r) => r.rows),
    db.execute<{ value: number }>(sql`
      SELECT coalesce(sum(v), 0)::bigint AS value FROM (
        SELECT ${inrMinorSql(schema.employerPayments.amountMinor, schema.employerPayments.currency)} AS v
          FROM ${schema.employerPayments}
          WHERE ${schema.employerPayments.status} = 'paid' AND ${schema.employerPayments.paidAt} >= ${weekAgo}
        UNION ALL
        SELECT ${inrMinorSql(schema.internPayments.amountMinor, schema.internPayments.currency)}
          FROM ${schema.internPayments}
          WHERE ${schema.internPayments.status} = 'paid' AND ${schema.internPayments.paidAt} >= ${weekAgo}
      ) t`).then((r) => r.rows),
    db
      .select({ value: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(sql`${schema.users.role} = 'intern' and not ${meaningfulProfile()}`),
    db
      .select({
        value: count(),
        fresh: sql<number>`count(*) filter (where ${schema.contactMessages.createdAt} >= ${weekAgo})`,
      })
      .from(schema.contactMessages)
      .where(eq(schema.contactMessages.isRead, false)),
    db
      .select({
        value: count(),
        fresh: sql<number>`count(*) filter (where ${schema.timesheets.updatedAt} >= ${weekAgo})`,
      })
      .from(schema.timesheets)
      .where(eq(schema.timesheets.status, "submitted")),
    // Upcoming only: a picked slot still in the future, employer interviews
    // only (AI interviews are not on anyone's calendar). Legacy rule.
    db
      .select({ value: count() })
      .from(schema.interviews)
      .where(and(eq(schema.interviews.status, "scheduled"), realEmployerId(schema.interviews.employerId), sql`${SELECTED_SLOT} > now()`)),
    // Upcoming employer interviews nobody has sent a meeting link for.
    db
      .select({
        value: count(),
        fresh: sql<number>`count(*) filter (where ${schema.interviews.createdAt} >= ${weekAgo})`,
      })
      .from(schema.interviews)
      .where(
        and(
          eq(schema.interviews.status, "scheduled"),
          realEmployerId(schema.interviews.employerId),
          sql`${SELECTED_SLOT} > now()`,
          sql`coalesce(trim(${schema.interviews.meetingLink}), '') = ''`,
        ),
      ),
    // Legacy "All interviews": every employer interview on record.
    db
      .select({
        value: count(),
        completed: sql<number>`count(*) filter (where lower(${schema.interviews.status}) = 'completed')`,
      })
      .from(schema.interviews)
      .where(realEmployerId(schema.interviews.employerId)),
    // Stipend payouts that are due (or due within 3 days) and still have no
    // bank reference, i.e. nobody has paid them yet.
    db
      .select({
        value: count(),
        fresh: sql<number>`count(*) filter (where ${schema.internPayouts.createdAt} >= ${weekAgo})`,
      })
      .from(schema.internPayouts)
      .where(
        and(
          eq(schema.internPayouts.status, "pending"),
          sql`coalesce(nullif(${schema.internPayouts.raw}->>'scheduledFor', ''), '0000-01-01') <= ${soon}`,
        ),
      ),
    // Interns whose latest AI interview is completed but who have no score.
    db.execute<{ value: number; fresh: number }>(sql`
      SELECT count(*)::int AS value,
             count(*) FILTER (WHERE latest.created_at >= ${weekAgo})::int AS fresh
        FROM ${schema.users} u
        LEFT JOIN ${schema.internOnboarding} o ON o.user_id = u.id
        JOIN LATERAL (
          SELECT lower(i.status) AS status, i.created_at FROM ${schema.interviews} i
           WHERE i.intern_id = u.id AND ${AI_INTERVIEW}
           ORDER BY i.created_at DESC NULLS LAST LIMIT 1
        ) latest ON true
       WHERE u.role = 'intern' AND latest.status = 'completed'
         AND coalesce(jsonb_typeof(o.extra_data->'findternScore'), '') <> 'number'`).then((r) => r.rows),
    db
      .select({
        value: count(),
        fullTime: sql<number>`count(*) filter (where ${schema.projects.fullTimeOffer})`,
      })
      .from(schema.projects)
      .where(realEmployerId(schema.projects.employerId)),
    // "Avg hiring speed": offer sent to hire, in days. The same definition as
    // Reports' "Avg time to hire" (lib/admin/analytics.ts): hired rows with a
    // real hired_at at or after the offer. It used to fall back to updated_at,
    // which moves on any edit and averaged to a negative figure (QA-009).
    db
      .select({
        // Rows with a hire date before the offer (bad legacy data) are left
        // out of the average and counted, so the tile can say so (QA-134).
        days: sql<number | null>`round((avg(extract(epoch from (${schema.proposals.hiredAt} - ${schema.proposals.createdAt}))) filter (where ${schema.proposals.hiredAt} >= ${schema.proposals.createdAt}) / 86400)::numeric, 1)::float8`,
        n: sql<number>`(count(*) filter (where ${schema.proposals.hiredAt} >= ${schema.proposals.createdAt}))::int`,
        total: count(),
      })
      .from(schema.proposals)
      .where(and(eq(schema.proposals.status, "hired"), realEmployerId(schema.proposals.employerId))),
    db
      .select({ status: schema.proposals.status, value: count() })
      .from(schema.proposals)
      .where(realEmployerId(schema.proposals.employerId))
      .groupBy(schema.proposals.status),
    db
      .select({
        id: schema.users.id,
        name: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
        date: schema.users.createdAt,
      })
      .from(schema.users)
      .where(eq(schema.users.role, "intern"))
      .orderBy(desc(schema.users.createdAt))
      .limit(5),
    db
      .select({
        name: schema.projects.projectName,
        company: schema.employers.companyName,
        date: schema.projects.createdAt,
        employerId: schema.projects.employerId,
      })
      .from(schema.projects)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
      .where(realEmployerId(schema.projects.employerId))
      .orderBy(desc(schema.projects.createdAt))
      .limit(5),
    db
      .select({
        internId: schema.proposals.internId,
        first: schema.users.firstName,
        last: schema.users.lastName,
        company: schema.employers.companyName,
        date: schema.proposals.updatedAt,
      })
      .from(schema.proposals)
      .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
      .where(and(sql`${schema.proposals.status} in ('accepted', 'hired')`, realEmployerId(schema.proposals.employerId)))
      .orderBy(desc(schema.proposals.updatedAt))
      .limit(5),
    db
      .select({
        amountMinor: schema.employerPayments.amountMinor,
        currency: schema.employerPayments.currency,
        company: schema.employers.companyName,
        date: schema.employerPayments.paidAt,
      })
      .from(schema.employerPayments)
      .leftJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
      .where(eq(schema.employerPayments.status, "paid"))
      .orderBy(desc(schema.employerPayments.paidAt))
      .limit(5),
    // Proposals and interviews created per month, the last six months, bucketed
    // in India time (the columns hold UTC without a zone).
    db
      .execute<{ label: string; proposals: number; interviews: number }>(sql`
        SELECT to_char(m.month, 'Mon') AS label,
          (SELECT count(*)::int FROM ${schema.proposals}
            WHERE ${realEmployerId(schema.proposals.employerId)}
              AND date_trunc('month', (${schema.proposals.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') = m.month) AS proposals,
          (SELECT count(*)::int FROM ${schema.interviews}
            WHERE ${realEmployerId(schema.interviews.employerId)}
              AND date_trunc('month', (${schema.interviews.createdAt} AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') = m.month) AS interviews
        FROM generate_series(
          date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata') - interval '5 months',
          date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata'),
          interval '1 month'
        ) AS m(month)
        ORDER BY m.month`)
      .then((r) => r.rows),
  ]);

  return {
    now,
    admin,
    candidates,
    signups,
    candidatesNew,
    companies,
    companiesNew,
    revenue,
    revenueWeek,
    incompleteProfiles,
    unreadMessages,
    sheetsWaiting,
    interviewsUpcoming,
    interviewsNoLink,
    interviewsAll,
    payoutsDue,
    unscored,
    projectsTotal,
    hiringSpeed,
    proposalStatus,
    recentUsers,
    recentProjects,
    recentAccepted,
    recentPayments,
    trend,
  };
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export default async function AdminDashboard() {
  const session = await getSession();
  let d: Awaited<ReturnType<typeof loadDashboard>>;
  try {
    d = await loadDashboard(session?.uid ?? null);
  } catch (error) {
    console.error("[admin/dashboard] load failed", error);
    return (
      <Panel>
        <AdminLoadError what="the dashboard" retryHref="/admin/dashboard" />
      </Panel>
    );
  }

  const noCalendar = await calendarMissing();
  const n = (row: { value: number | string } | undefined) => Number(row?.value ?? 0);
  const f = (row: { fresh?: number | string } | undefined) => Number(row?.fresh ?? 0);
  const byStatus = new Map(d.proposalStatus.map((r) => [r.status, Number(r.value)]));
  const accepted = byStatus.get("accepted") ?? 0;
  const hired = byStatus.get("hired") ?? 0;

  // A disconnected calendar comes first: it breaks every meeting at once.
  // Then by what a person owes someone: money first, then a meeting that
  // can't happen, then a candidate waiting on a score, then the rest.
  const tasks: Task[] = (
    [
      {
        key: "calendar",
        count: noCalendar ? 1 : 0,
        flag: true,
        label: "Google calendar not connected",
        detail: "Interviews and campus-drive calls get no meeting link until it is, so drive calls are refused.",
        href: "/admin/settings",
        cta: "Connect",
        Icon: CalendarX,
      },
      {
        key: "payouts",
        count: n(d.payoutsDue),
        fresh: f(d.payoutsDue),
        label: plural(n(d.payoutsDue), "stipend payout due with no bank reference", "stipend payouts due with no bank reference"),
        detail: "Due now or within 3 days. Pay them, then record the bank reference.",
        href: "/admin/payouts?status=pending",
        cta: "Open payouts",
        Icon: Banknote,
      },
      {
        key: "nolink",
        count: n(d.interviewsNoLink),
        fresh: f(d.interviewsNoLink),
        label: plural(n(d.interviewsNoLink), "upcoming interview has no meeting link", "upcoming interviews have no meeting link"),
        detail: "Neither side can join until a link is saved.",
        href: "/admin/proposal-tracker?tab=interviews",
        cta: "Add links",
        Icon: Link2Off,
      },
      {
        key: "unscored",
        count: n(d.unscored),
        fresh: f(d.unscored),
        label: plural(n(d.unscored), "candidate finished the AI interview but has no score", "candidates finished the AI interview but have no score"),
        detail: "Employers can't find them until the Findtern Score is set.",
        href: "/admin/interns?ai=completed&score=none",
        cta: "Score them",
        Icon: Gauge,
      },
      {
        key: "messages",
        count: n(d.unreadMessages),
        fresh: f(d.unreadMessages),
        label: plural(n(d.unreadMessages), "unread message", "unread messages"),
        detail: "Contact form, in-app feedback and problem reports.",
        href: "/admin/messages",
        cta: "Open inbox",
        Icon: MessageSquare,
      },
      {
        key: "accepted",
        count: accepted,
        label: plural(accepted, "accepted offer waiting on employer payment", "accepted offers waiting on employer payment"),
        detail: "The hire only completes once the employer pays. A nudge usually moves these.",
        href: "/admin/proposal-tracker?tab=proposals",
        cta: "See offers",
        Icon: CreditCard,
      },
      {
        key: "sheets",
        count: n(d.sheetsWaiting),
        fresh: f(d.sheetsWaiting),
        label: plural(n(d.sheetsWaiting), "timesheet waiting on employer approval", "timesheets waiting on employer approval"),
        detail: "Interns are not paid until these are approved.",
        href: "/admin/payouts",
        cta: "Review",
        Icon: ClipboardCheck,
      },
    ] satisfies Task[]
  ).filter((t) => t.count > 0);

  const owed = attentionTotal(tasks);


  const speed = d.hiringSpeed?.days;
  const speedN = Number(d.hiringSpeed?.n ?? 0);
  const speedTotal = Number(d.hiringSpeed?.total ?? 0);

  const events: Event[] = [
    ...d.recentPayments.map((p) => ({
      label: `Payment received · ${formatMoney(p.amountMinor, p.currency === "USD" ? "USD" : "INR", { zeroLabel: "₹0" })}`,
      detail: p.company ?? "Employer",
      href: "/admin/orders",
      date: p.date,
    })),
    ...d.recentAccepted.map((p) => ({
      label: "Offer accepted",
      detail: `${`${p.first ?? ""} ${p.last ?? ""}`.trim() || "Candidate"} · ${p.company ?? "Employer"}`,
      href: `/admin/interns/${p.internId}`,
      date: p.date,
    })),
    ...d.recentProjects.map((p) => ({
      label: "Project posted",
      detail: `${p.name}${p.company ? ` · ${p.company}` : ""}`,
      href: `/admin/companies/${p.employerId}`,
      date: p.date,
    })),
    ...d.recentUsers.map((u) => ({
      label: "Candidate signed up",
      detail: u.name.trim() || "New candidate",
      href: `/admin/interns/${u.id}`,
      date: u.date,
    })),
  ]
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, 8);

  const firstName = d.admin?.name?.trim().split(/\s+/)[0];
  const today = d.now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" });

  return (
    <div className="space-y-4 lg:space-y-5">
      <PageHead
        eyebrow={today}
        title={`${greeting(d.now)}${firstName ? `, ${firstName}` : ""}`}
        lede={owed.total > 0 ? "Most urgent first." : "Nothing is waiting on the team right now."}
        action={
          <>
            <ButtonLink href="/admin/proposal-tracker" variant="outline" size="sm">
              Proposal pipeline
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/admin/reports" variant="outline" size="sm">
              Reports
            </ButtonLink>
          </>
        }
      />

      <div className={STAT_ROW}>
        <StatTile
          featured
          index={0}
          label="Needs you today"
          value={owed.total.toLocaleString("en-IN")}
          meta={
            owed.total === 0
              ? "All clear"
              : owed.fresh > 0
                ? `+${owed.fresh.toLocaleString("en-IN")} in the last 7 days`
                : plural(owed.total, "item", "items") + ", none new this week"
          }
        />
        <StatTile
          index={1}
          label="Interns with a profile"
          value={n(d.candidates).toLocaleString("en-IN")}
          meta={`${n(d.candidatesNew) ? `+${n(d.candidatesNew)} this week · ` : ""}${n(d.signups).toLocaleString("en-IN")} signups`}
          href="/admin/interns"
        />
        <StatTile
          index={2}
          label="Hiring companies"
          value={n(d.companies).toLocaleString("en-IN")}
          meta={n(d.companiesNew) ? `+${n(d.companiesNew)} this week` : "Active, onboarding finished"}
          href="/admin/companies"
        />
        <StatTile
          index={3}
          label="Placements"
          value={(accepted + hired).toLocaleString("en-IN")}
          meta={`${hired} paid · ${accepted} awaiting payment`}
          href="/admin/proposal-tracker?tab=proposals"
        />
        <StatTile
          index={4}
          label="Revenue"
          value={formatMoney(n(d.revenue), "INR", { zeroLabel: "₹0" })}
          meta={n(d.revenueWeek) ? `${formatMoney(n(d.revenueWeek), "INR")} in the last 7 days` : "Nothing in the last 7 days"}
          href="/admin/transactions"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-5">
        {/* Needs a person: what someone is waiting on the team for. */}
        <Tile title="Needs you" description={tasks.length ? "What someone is waiting on the team for." : undefined}>
          {tasks.length ? (
            <ul className="-mt-1 divide-y divide-ink-100">
              {tasks.map((t, i) => (
                <li key={t.key} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                  <span
                    aria-hidden
                    className={
                      i === 0
                        ? "grid size-9 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700"
                        : "grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-600"
                    }
                  >
                    <t.Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-pretty text-[0.9375rem] font-medium text-ink-900">
                      {t.flag ? null : <span className="nums font-semibold">{t.count.toLocaleString("en-IN")} </span>}
                      {t.label}
                    </p>
                    <p className="mt-0.5 text-pretty text-sm text-ink-600">
                      {t.detail}
                      {t.fresh ? <span className="nums"> {t.fresh} new this week.</span> : null}
                    </p>
                  </div>
                  <ButtonLink href={t.href} variant={i === 0 ? "primary" : "outline"} size="sm" className="self-start sm:self-auto">
                    {t.cta}
                    <ArrowRight className="size-4" aria-hidden />
                  </ButtonLink>
                </li>
              ))}
            </ul>
          ) : (
            <AdminEmpty
              title="Nothing is waiting on the team"
              body="Due payouts, interviews without a link, unscored candidates and unread messages show up here the moment they appear."
            />
          )}
          <div className="mt-3">
            <AttentionBanner
              count={n(d.incompleteProfiles)}
              total={n(d.signups)}
              noun="signups"
              href="/admin/interns?profile=incomplete"
            />
          </div>
        </Tile>

        <div className="flex flex-col gap-4 lg:gap-5">
          <Tile
            title="Proposals and interviews"
            description="Created each month, last six months. The current month is still in progress."
            action={{ href: "/admin/reports/analytics", label: "Open analytics" }}
          >
            <TrendChart data={d.trend} height={200} />
          </Tile>
          <Tile title="Also worth knowing" className="flex-1">
            <dl className="-mt-2 divide-y divide-ink-100">
              <DetailRow label="Scheduled interviews" value={n(d.interviewsUpcoming).toLocaleString("en-IN")} mono />
              <DetailRow
                label="All interviews"
                value={`${n(d.interviewsAll).toLocaleString("en-IN")} · ${Number(d.interviewsAll?.completed ?? 0).toLocaleString("en-IN")} completed`}
                mono
              />
              <DetailRow
                label="Full-time potential"
                value={`${Number(d.projectsTotal?.fullTime ?? 0).toLocaleString("en-IN")} of ${n(d.projectsTotal).toLocaleString("en-IN")} projects`}
                mono
              />
              <DetailRow
                label="Avg hiring speed"
                value={speed == null ? "-" : `${speed} ${speed === 1 ? "day" : "days"}`}
                mono
              />
            </dl>
            <p className="mt-3 text-pretty text-xs text-text-subtle">
              {speed == null
                ? "No hires with usable dates yet."
                : `Hiring speed is offer sent to hire, over ${speedN} of ${speedTotal} hires${
                    speedTotal > speedN ? " (the rest have a hire date before the offer)" : ""
                  }.`}
            </p>
          </Tile>
        </div>
      </div>

      {/* What just happened */}
      <div>
        <Tile title="Recent activity">
          {events.length ? (
            <ul className="-mx-2">
              {events.map((e, i) => (
                <li key={`${e.href}-${i}`}>
                  <Link
                    href={e.href}
                    className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 rounded-apple-sm px-2 py-2.5 transition-colors hover:bg-ink-50"
                  >
                    <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                      <span className="shrink-0 text-sm font-medium text-ink-900">{e.label}</span>
                      <span className="min-w-0 text-pretty text-sm text-ink-600 [overflow-wrap:anywhere]">{e.detail}</span>
                    </span>
                    <span className="nums whitespace-nowrap text-xs text-ink-600">
                      {e.date ? shortDate(e.date, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "-"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <AdminEmpty
              title="Nothing yet"
              body="Payments, accepted offers, new projects and sign-ups will show up here as they happen."
            />
          )}
        </Tile>

      </div>
    </div>
  );
}
