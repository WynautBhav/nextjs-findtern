import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  ClipboardCheck,
  CreditCard,
  MessageSquare,
  UserRoundX,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { formatMoney } from "@/lib/format";
import { AdminEmpty, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { TrendChart, type TrendPoint } from "@/components/admin/trend-chart";
import { cn } from "@/lib/utils";

/**
 * Admin home: what needs a person today, four numbers that move, the pipeline
 * and what just happened. Full lists (candidates, projects, placements) live
 * on their own pages; repeating them here only made this page five screens
 * long.
 */

type Task = {
  count: number;
  label: string;
  detail: string;
  href: string;
  cta: string;
  Icon: typeof MessageSquare;
};

type Event = { label: string; detail: string; href: string; date: Date | null };

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function greeting(now: Date): string {
  // Admins work in IST; the server may not.
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function AdminDashboard() {
  const session = await getSession();
  const db = getDb();
  const now = new Date();
  const weekAgo = new Date(now.getTime() - WEEK_MS);
  const trendStart = new Date(now.getTime() - 12 * WEEK_MS);

  const [
    [admin],
    [candidates],
    [candidatesNew],
    [companies],
    [companiesNew],
    [revenue],
    [revenueWeek],
    [incompleteProfiles],
    [unreadMessages],
    [sheetsWaiting],
    [interviewsUpcoming],
    proposalStatus,
    weeklyProposals,
    weeklyInterviews,
    recentUsers,
    recentProjects,
    recentAccepted,
    recentPayments,
  ] = await Promise.all([
    session
      ? db.select({ name: schema.admins.name }).from(schema.admins).where(eq(schema.admins.id, session.uid)).limit(1)
      : Promise.resolve([undefined]),
    db.select({ value: count() }).from(schema.users).where(eq(schema.users.isActive, true)),
    db.select({ value: count() }).from(schema.users).where(gte(schema.users.createdAt, weekAgo)),
    db.select({ value: count() }).from(schema.employers).where(eq(schema.employers.isActive, true)),
    db.select({ value: count() }).from(schema.employers).where(gte(schema.employers.createdAt, weekAgo)),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.employerPayments.amountMinor}), 0)::bigint` })
      .from(schema.employerPayments)
      .where(and(eq(schema.employerPayments.status, "paid"), eq(schema.employerPayments.currency, "INR"))),
    db
      .select({ value: sql<number>`coalesce(sum(${schema.employerPayments.amountMinor}), 0)::bigint` })
      .from(schema.employerPayments)
      .where(
        and(
          eq(schema.employerPayments.status, "paid"),
          eq(schema.employerPayments.currency, "INR"),
          gte(schema.employerPayments.paidAt, weekAgo),
        ),
      ),
    db
      .select({ value: count() })
      .from(schema.users)
      .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
      .where(sql`${schema.internOnboarding.id} is null`),
    db.select({ value: count() }).from(schema.contactMessages).where(eq(schema.contactMessages.isRead, false)),
    db.select({ value: count() }).from(schema.timesheets).where(eq(schema.timesheets.status, "submitted")),
    db.select({ value: count() }).from(schema.interviews).where(eq(schema.interviews.status, "scheduled")),
    db.select({ status: schema.proposals.status, value: count() }).from(schema.proposals).groupBy(schema.proposals.status),
    db
      .select({ week: sql<string>`to_char(date_trunc('week', ${schema.proposals.createdAt}), 'YYYY-MM-DD')`, c: count() })
      .from(schema.proposals)
      .where(gte(schema.proposals.createdAt, trendStart))
      .groupBy(sql`1`),
    db
      .select({ week: sql<string>`to_char(date_trunc('week', ${schema.interviews.createdAt}), 'YYYY-MM-DD')`, c: count() })
      .from(schema.interviews)
      .where(gte(schema.interviews.createdAt, trendStart))
      .groupBy(sql`1`),
    db
      .select({
        id: schema.users.id,
        name: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
        date: schema.users.createdAt,
      })
      .from(schema.users)
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
      .where(sql`${schema.proposals.status} in ('accepted', 'hired')`)
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

  const n = (row: { value: number | string } | undefined) => Number(row?.value ?? 0);
  const byStatus = new Map(proposalStatus.map((r) => [r.status, Number(r.value)]));
  const sent = proposalStatus.reduce((sum, r) => sum + Number(r.value), 0);
  const accepted = byStatus.get("accepted") ?? 0;
  const hired = byStatus.get("hired") ?? 0;
  const declined = (byStatus.get("rejected") ?? 0) + (byStatus.get("withdrawn") ?? 0) + (byStatus.get("expired") ?? 0);
  const open = sent - accepted - hired - declined;

  const tasks: Task[] = [
    {
      count: n(unreadMessages),
      label: "unread contact messages",
      detail: "From the website contact form.",
      href: "/admin/messages",
      cta: "Open inbox",
      Icon: MessageSquare,
    },
    {
      count: accepted,
      label: accepted === 1 ? "accepted offer waiting on employer payment" : "accepted offers waiting on employer payment",
      detail: "The hire only completes once the employer pays. A nudge usually moves these.",
      href: "/admin/proposal-tracker?tab=proposals",
      cta: "See offers",
      Icon: CreditCard,
    },
    {
      count: n(sheetsWaiting),
      label: n(sheetsWaiting) === 1 ? "timesheet waiting on employer approval" : "timesheets waiting on employer approval",
      detail: "Interns are not paid until these are approved.",
      href: "/admin/payouts",
      cta: "Review",
      Icon: ClipboardCheck,
    },
    {
      count: n(interviewsUpcoming),
      label: n(interviewsUpcoming) === 1 ? "interview scheduled" : "interviews scheduled",
      detail: "Make sure both sides have the meeting link.",
      href: "/admin/proposal-tracker?tab=interviews",
      cta: "See schedule",
      Icon: CalendarClock,
    },
    {
      count: n(incompleteProfiles),
      label: n(incompleteProfiles) === 1 ? "candidate signed up but never started a profile" : "candidates signed up but never started a profile",
      detail: "They are invisible to employers until they do.",
      href: "/admin/interns?profile=incomplete",
      cta: "See list",
      Icon: UserRoundX,
    },
  ].filter((t) => t.count > 0);

  const kpis = [
    { label: "Active candidates", value: n(candidates).toLocaleString("en-IN"), delta: n(candidatesNew), href: "/admin/interns" },
    { label: "Hiring companies", value: n(companies).toLocaleString("en-IN"), delta: n(companiesNew), href: "/admin/companies" },
    {
      label: "Placements",
      value: String(accepted + hired),
      note: `${hired} paid · ${accepted} awaiting payment`,
      href: "/admin/proposal-tracker",
    },
    {
      label: "Revenue (INR)",
      value: formatMoney(n(revenue), "INR", { zeroLabel: "₹0" }),
      note: n(revenueWeek) ? `${formatMoney(n(revenueWeek), "INR")} this week` : "nothing this week",
      href: "/admin/transactions",
    },
  ];

  // Weekly buckets, Monday-start (Postgres date_trunc('week')).
  const monday = (d: Date) => {
    const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
    return x;
  };
  const pMap = new Map(weeklyProposals.map((r) => [r.week, Number(r.c)]));
  const iMap = new Map(weeklyInterviews.map((r) => [r.week, Number(r.c)]));
  const trend: TrendPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const wk = monday(new Date(now.getTime() - i * WEEK_MS));
    const key = wk.toISOString().slice(0, 10);
    trend.push({
      label: wk.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }),
      proposals: pMap.get(key) ?? 0,
      interviews: iMap.get(key) ?? 0,
    });
  }
  const trendTotal = trend.reduce((s, p) => s + p.proposals + p.interviews, 0);

  const events: Event[] = [
    ...recentPayments.map((p) => ({
      label: `Payment received · ${formatMoney(p.amountMinor, p.currency === "USD" ? "USD" : "INR")}`,
      detail: p.company ?? "Employer",
      href: "/admin/orders",
      date: p.date,
    })),
    ...recentAccepted.map((p) => ({
      label: "Offer accepted",
      detail: `${`${p.first ?? ""} ${p.last ?? ""}`.trim() || "Candidate"} · ${p.company ?? "Employer"}`,
      href: `/admin/interns/${p.internId}`,
      date: p.date,
    })),
    ...recentProjects.map((p) => ({
      label: "Project posted",
      detail: `${p.name}${p.company ? ` · ${p.company}` : ""}`,
      href: `/admin/companies/${p.employerId}`,
      date: p.date,
    })),
    ...recentUsers.map((u) => ({
      label: "Candidate signed up",
      detail: u.name.trim() || "New candidate",
      href: `/admin/interns/${u.id}`,
      date: u.date,
    })),
  ]
    .sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0))
    .slice(0, 8);

  const firstName = admin?.name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-[84rem] space-y-10">
      <AdminPageHeader
        title={`${greeting(now)}${firstName ? `, ${firstName}` : ""}`}
        subtitle={now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}
        action={
          <Link
            href="/admin/reports"
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
          >
            Reports <ArrowUpRight className="size-4" aria-hidden />
          </Link>
        }
      />

      {/* Needs a person */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-ink-950">Needs attention</h2>
        {tasks.length ? (
          <Panel as="ul" className="divide-y divide-ink-100">
            {tasks.map((t) => (
              <li key={t.href} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
                  <t.Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink-900">
                    <span className="tabular-nums">{t.count}</span> {t.label}
                  </p>
                  <p className="text-[13px] text-text-subtle">{t.detail}</p>
                </div>
                <Link
                  href={t.href}
                  className="apple-spring apple-pressable inline-flex min-h-9 shrink-0 items-center gap-1.5 self-start whitespace-nowrap rounded-[10px] border border-ink-200 px-3 text-[13px] font-medium text-ink-800 hover:border-ink-300 hover:bg-ink-50 max-lg:min-h-11 sm:self-auto"
                >
                  {t.cta} <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </li>
            ))}
          </Panel>
        ) : (
          <Panel>
            <p className="px-5 py-4 text-sm text-text-subtle">Nothing is waiting on the team.</p>
          </Panel>
        )}
      </section>

      {/* Four numbers */}
      <StatGrid cols={4}>
        {kpis.map((k) => {
          const hasDelta = "delta" in k && typeof k.delta === "number";
          return (
            <StatCard
              key={k.label}
              label={k.label}
              value={k.value}
              href={k.href}
              tone="neutral"
              delta={hasDelta && k.delta > 0 ? `+${k.delta}` : undefined}
              hint={hasDelta ? (k.delta > 0 ? "new this week" : "none new this week") : k.note}
            />
          );
        })}
      </StatGrid>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* Weekly activity */}
        <Panel className="min-w-0 overflow-visible p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[15px] font-semibold text-ink-950">Proposals and interviews, weekly</h2>
            <span className="text-xs text-text-subtle">last 12 weeks</span>
          </div>
          {trendTotal === 0 ? (
            <p className="mt-10 mb-10 text-center text-sm text-text-subtle">No proposals or interviews in the last 12 weeks.</p>
          ) : (
            <div className="mt-4">
              <TrendChart data={trend} height={200} />
            </div>
          )}
        </Panel>

        {/* Pipeline */}
        <Panel className="min-w-0 p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-[15px] font-semibold text-ink-950">Proposal pipeline</h2>
            <Link href="/admin/proposal-tracker" className="text-xs font-medium text-brand-700 hover:underline">
              Tracker
            </Link>
          </div>
          <p className="mt-1 text-xs text-text-subtle">{sent} proposals, all time</p>
          <dl className="mt-5 space-y-3.5">
            {[
              { label: "Open", value: open, tone: "bg-ink-300" },
              { label: "Accepted, awaiting payment", value: accepted, tone: "bg-accent-500" },
              { label: "Hired (paid)", value: hired, tone: "bg-brand-700" },
              { label: "Declined or expired", value: declined, tone: "bg-ink-200" },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <dt className="text-ink-700">{row.label}</dt>
                  <dd className="tabular-nums">
                    <span className="font-semibold text-ink-950">{row.value}</span>
                    <span className="ml-1.5 text-text-subtle">
                      {sent ? `${Math.round((row.value / sent) * 100)}%` : "-"}
                    </span>
                  </dd>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                  <div
                    className={cn("h-full rounded-full", row.tone)}
                    style={{ width: `${sent ? Math.max((row.value / sent) * 100, row.value ? 2 : 0) : 0}%` }}
                  />
                </div>
              </div>
            ))}
          </dl>
        </Panel>
      </div>

      {/* What just happened */}
      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-ink-950">Recent activity</h2>
        {events.length ? (
          <Panel as="ul" className="divide-y divide-ink-100">
            {events.map((e, i) => (
              <li key={`${e.href}-${i}`}>
                <Link
                  href={e.href}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 px-5 py-3 transition-colors hover:bg-ink-50/70"
                >
                  {/* Label stays on one line; the detail truncates as a real
                      flex child instead of an inline span that wrapped under it. */}
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="shrink-0 whitespace-nowrap text-[14px] font-medium text-ink-900">{e.label}</span>
                    <span className="min-w-0 truncate text-[13px] text-text-subtle">{e.detail}</span>
                  </span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-text-subtle">
                    {e.date
                      ? e.date.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" })
                      : "-"}
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
