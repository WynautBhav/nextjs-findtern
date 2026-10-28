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
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { HeroBand, SectionHead } from "@/components/app/primitives";
import { ButtonLink } from "@/components/ui/button";
import { inrMinorSql, meaningfulProfile, realEmployerId, realEmployers, TEST_EMPLOYER_ID, AI_INTERVIEW_EMAIL } from "@/lib/admin/scope";
import { attentionTotal } from "@/lib/admin/dashboard";

/**
 * Admin home (DESIGN.md §6): one hero number that answers "what needs me
 * today", the queue of things a person owes someone directly under it, then
 * the hiring funnel and the supporting figures. Full lists live on their own
 * pages.
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
    <div className="space-y-10">
      <HeroBand
        eyebrow={today}
        title={`${greeting(d.now)}${firstName ? `, ${firstName}` : ""}`}
        lede={
          owed.total > 0
            ? "These are the things someone is waiting on the team for, most urgent first."
            : "Nothing is waiting on the team right now."
        }
        actions={
          <>
            <ButtonLink href="/admin/proposal-tracker" variant={owed.total > 0 ? "outlineLight" : "accent"}>
              Proposal pipeline
              <ArrowRight className="size-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="/admin/reports" variant="outlineLight">
              Reports
            </ButtonLink>
          </>
        }
      >
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          <p className="nums text-5xl font-semibold leading-none tracking-[-0.03em] text-white">
            {owed.total > 0 ? owed.total.toLocaleString("en-IN") : "All clear"}
          </p>
          <div className="pb-1 text-sm text-on-dark-subtle">
            <p className="font-medium text-white/90">
              {owed.total > 0 ? plural(owed.total, "item needs a person today", "items need a person today") : "No open items"}
            </p>
            <p className="nums">
              {owed.fresh > 0 ? `+${owed.fresh.toLocaleString("en-IN")} came in during the last 7 days` : "Nothing new in the last 7 days"}
            </p>
          </div>
        </div>
      </HeroBand>

      {/* Needs a person: the band comes first, before any figure. */}
      <section aria-labelledby="attention-head">
        <h2 id="attention-head" className="sr-only">
          Needs attention
        </h2>
        {tasks.length ? (
          <Panel as="ul" className="divide-y divide-ink-100">
            {tasks.map((t, i) => (
              <li key={t.key} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4">
                <span
                  className={
                    i === 0
                      ? "grid size-9 shrink-0 place-items-center rounded-full bg-accent-100 text-accent-700"
                      : "grid size-9 shrink-0 place-items-center rounded-full bg-ink-100 text-ink-600"
                  }
                >
                  <t.Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.9375rem] font-medium text-ink-900">
                    {t.flag ? null : <span className="nums font-semibold">{t.count.toLocaleString("en-IN")} </span>}
                    {t.label}
                  </p>
                  <p className="mt-0.5 text-sm text-ink-600">
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
          </Panel>
        ) : (
          <Panel>
            <AdminEmpty
              title="Nothing is waiting on the team"
              body="Due payouts, interviews without a link, unscored candidates and unread messages show up here the moment they appear."
            />
          </Panel>
        )}
        <div className="mt-3">
          <AttentionBanner
            count={n(d.incompleteProfiles)}
            total={n(d.signups)}
            noun="signups"
            href="/admin/interns?profile=incomplete"
          />
        </div>
      </section>

      {/* Supporting figures */}
      <section>
        <SectionHead title="Supporting figures" hint="All time unless the tile says otherwise." />
        <StatGrid cols={4}>
          <StatCard
            label="Interns with a profile"
            value={n(d.candidates).toLocaleString("en-IN")}
            delta={n(d.candidatesNew) ? `+${n(d.candidatesNew)} this week` : undefined}
            hint={`${n(d.signups).toLocaleString("en-IN")} signups in total`}
            href="/admin/interns"
          />
          <StatCard
            label="Hiring companies"
            value={n(d.companies).toLocaleString("en-IN")}
            delta={n(d.companiesNew) ? `+${n(d.companiesNew)} this week` : undefined}
            hint="Active, onboarding finished"
            href="/admin/companies"
          />
          <StatCard
            label="Placements"
            value={(accepted + hired).toLocaleString("en-IN")}
            hint={`${hired} paid · ${accepted} awaiting payment`}
            href="/admin/proposal-tracker?tab=proposals"
          />
          <StatCard
            label="Revenue"
            value={formatMoney(n(d.revenue), "INR", { zeroLabel: "₹0" })}
            hint={n(d.revenueWeek) ? `${formatMoney(n(d.revenueWeek), "INR")} in the last 7 days` : "Nothing in the last 7 days"}
            href="/admin/transactions"
          />
          <StatCard
            label="Scheduled interviews"
            value={n(d.interviewsUpcoming).toLocaleString("en-IN")}
            hint="Employer interviews still to happen"
            href="/admin/proposal-tracker?tab=interviews"
          />
          <StatCard
            label="All interviews"
            value={n(d.interviewsAll).toLocaleString("en-IN")}
            hint={`${Number(d.interviewsAll?.completed ?? 0).toLocaleString("en-IN")} completed`}
            href="/admin/proposal-tracker?tab=interviews"
          />
          <StatCard
            label="Full-time potential"
            value={Number(d.projectsTotal?.fullTime ?? 0).toLocaleString("en-IN")}
            hint={`of ${n(d.projectsTotal).toLocaleString("en-IN")} projects offer a full-time role`}
            href="/admin/projects"
          />
          <StatCard
            label="Avg hiring speed"
            value={speed == null ? "-" : `${speed} ${speed === 1 ? "day" : "days"}`}
            hint={
              speed == null
                ? "No hires with usable dates yet"
                : `Offer sent to hire, over ${speedN} of ${speedTotal} hires${
                    speedTotal > speedN ? " (the rest have a hire date before the offer)" : ""
                  }`
            }
          />
        </StatGrid>
      </section>

      {/* What just happened */}
      <section>
        <SectionHead title="Recent activity" />
        {events.length ? (
          <Panel as="ul" className="divide-y divide-ink-100">
            {events.map((e, i) => (
              <li key={`${e.href}-${i}`}>
                <Link
                  href={e.href}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 px-5 py-3 transition-colors hover:bg-ink-50/70"
                >
                  <span className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-2">
                    <span className="shrink-0 whitespace-nowrap text-sm font-medium text-ink-900">{e.label}</span>
                    <span className="min-w-0 truncate text-sm text-ink-600">{e.detail}</span>
                  </span>
                  <span className="nums whitespace-nowrap text-xs text-ink-600">
                    {e.date ? shortDate(e.date, { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "-"}
                  </span>
                </Link>
              </li>
            ))}
          </Panel>
        ) : (
          <Panel>
            <AdminEmpty
              title="Nothing yet"
              body="Payments, accepted offers, new projects and sign-ups will show up here as they happen."
            />
          </Panel>
        )}
      </section>
    </div>
  );
}
