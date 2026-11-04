import { and, count, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { calendarMissing } from "@/lib/calendar-status";
import { dbTimestamp, getDb, schema } from "@/lib/db";
import { formatMoney, shortDate, shortDateTime } from "@/lib/format";
import { formatPeriodDays } from "@/lib/timesheet-days";
import { AI_INTERVIEW_EMAIL, inrMinorSql, realEmployerId, TEST_EMPLOYER_ID } from "@/lib/admin/scope";
import { loadCollectedLastDays } from "@/lib/admin/receivables-load";
import type { DashboardQueues, MoneyStuck, QueueGroup, QueueKey, QueueRecord } from "@/lib/admin/dashboard-queues.types";
import {
  ageInDays,
  comparePayouts,
  compareStuck,
  dueDay,
  dueLabel,
  failedGroup,
  fullName,
  isoOrNull,
  joinParts,
  offerAmountMinorInr,
  overdueDays,
  QUEUE_ORDER,
  RECORD_CAP,
  topRecords,
  totalOf,
  totalOwed,
  truncate,
  DAY_MS,
} from "@/lib/admin/dashboard-queues-pure";

export * from "@/lib/admin/dashboard-queues-pure";

/**
 * The dashboard's triage queues: the true count, the week's new items and the
 * first few most urgent records of each. The definitions are the old "Needs
 * you today" tasks (and the rail badges in lib/admin/queue-counts); keep all
 * three in step. Each queue runs on its own, so one failing query marks that
 * queue `error` and never takes the page down or reads as zero.
 */

const WEEK_MS = 7 * DAY_MS;

/** The selected slot of an interview, in SQL. */
const SELECTED_SLOT = sql`(CASE ${schema.interviews.selectedSlot} WHEN 1 THEN ${schema.interviews.slot1} WHEN 2 THEN ${schema.interviews.slot2} WHEN 3 THEN ${schema.interviews.slot3} END)`;

/** An AI-interview row (the internal "admin" employer or the AI employer). */
const AI_INTERVIEW = sql`(i.employer_id = ${TEST_EMPLOYER_ID} OR i.employer_id IN (SELECT id FROM ${schema.employers} WHERE lower(company_email) = ${AI_INTERVIEW_EMAIL}))`;

type Meta = Omit<QueueGroup, "count" | "fresh" | "records" | "error">;
type Result = { count: number; fresh: number; records: QueueRecord[] };

const META: Record<QueueKey, Meta> = {
  calendar: {
    key: "calendar",
    label: "Google calendar not connected",
    detail: "Interviews and campus-drive calls get no meeting link until it is, so drive calls are refused.",
    flag: true,
    moreHref: "/admin/settings",
    moreLabel: "Connect",
  },
  payouts: {
    key: "payouts",
    label: "Stipend payouts due",
    detail: "Due now or within 3 days. Pay them, then record the bank reference.",
    moreHref: "/admin/payouts?status=pending",
    moreLabel: "Open payouts",
  },
  nolink: {
    key: "nolink",
    label: "Upcoming interviews with no meeting link",
    detail: "Neither side can join until a link is saved.",
    moreHref: "/admin/proposal-tracker?tab=interviews",
    moreLabel: "Add links",
  },
  unscored: {
    key: "unscored",
    label: "Candidates who finished the AI interview with no score",
    detail: "Employers can't find them until the Findtern Score is set.",
    moreHref: "/admin/interns?ai=completed&score=none",
    moreLabel: "Score them",
  },
  messages: {
    key: "messages",
    label: "Unread messages",
    detail: "Contact form, in-app feedback and problem reports.",
    moreHref: "/admin/messages",
    moreLabel: "Open inbox",
  },
  accepted: {
    key: "accepted",
    label: "Accepted offers waiting on employer payment",
    detail: "The hire only completes once the employer pays. A nudge usually moves these.",
    moreHref: "/admin/proposal-tracker?tab=proposals",
    moreLabel: "See offers",
  },
  sheets: {
    key: "sheets",
    label: "Timesheets waiting on employer approval",
    detail: "Interns are not paid until these are approved.",
    moreHref: "/admin/payouts",
    moreLabel: "Review",
  },
};

const num = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Runs one queue; a failure is logged and returned as an `error` group. */
async function settle(key: QueueKey, run: () => Promise<Result>): Promise<QueueGroup> {
  try {
    return { ...META[key], ...(await run()) };
  } catch (error) {
    console.error(`[admin/dashboard] queue "${key}" failed`, error);
    return failedGroup(META[key]);
  }
}

// ------------------------------------------------------------------ payouts

const payoutProposal = alias(schema.proposals, "dq_payout_proposal");
const payoutEmployer = alias(schema.employers, "dq_payout_employer");
const scheduledRaw = sql`coalesce(nullif(${schema.internPayouts.raw}->>'scheduledFor', ''), '0000-01-01')`;
const scheduledShown = sql<string | null>`nullif(coalesce(${schema.internPayouts.raw}->>'scheduledFor', ${schema.internPayouts.raw}->>'scheduled_for'), '')`;

type PayoutsResult = Result & { dueToInternsMinor: number };

async function loadPayouts(now: Date, weekAgo: Date): Promise<PayoutsResult> {
  const db = getDb();
  const soon = new Date(now.getTime() + 3 * DAY_MS).toISOString().slice(0, 10);
  const p = schema.internPayouts;
  // Today's payoutsDue definition (and the rail's): pending, due within 3 days, no bank reference yet.
  const due: SQL = and(eq(p.status, "pending"), sql`${scheduledRaw} <= ${soon}`)!;
  const [[agg], rows] = await Promise.all([
    db
      .select({
        value: count(),
        fresh: sql<number>`count(*) filter (where ${p.createdAt} >= ${weekAgo})`,
        inr: sql<number>`coalesce(sum(${inrMinorSql(p.amountMinor, p.currency)}), 0)::bigint`,
      })
      .from(p)
      .where(due),
    db
      .select({
        id: p.id,
        internId: p.internId,
        first: schema.users.firstName,
        last: schema.users.lastName,
        email: schema.users.email,
        amountMinor: p.amountMinor,
        currency: p.currency,
        inrMinor: inrMinorSql(p.amountMinor, p.currency),
        status: p.status,
        referenceId: p.referenceId,
        raw: p.raw,
        scheduled: scheduledShown,
        company: payoutEmployer.companyName,
      })
      .from(p)
      .leftJoin(schema.users, eq(schema.users.id, p.internId))
      .leftJoin(payoutProposal, sql`${payoutProposal.id} = coalesce(${p.raw}->>'proposalId', ${p.raw}->>'proposal_id')`)
      .leftJoin(payoutEmployer, sql`${payoutEmployer.id} = coalesce(nullif(${p.raw}->>'employerId', ''), ${payoutProposal.employerId})`)
      .where(due)
      // Most overdue first (no date counts as oldest), then the largest.
      .orderBy(scheduledRaw, sql`${inrMinorSql(p.amountMinor, p.currency)} desc`, p.id)
      .limit(RECORD_CAP),
  ]);

  const records = rows
    .map<QueueRecord>((r) => {
      const name = fullName(r.first, r.last);
      const raw = (r.raw ?? {}) as Record<string, unknown>;
      const dueOn = dueLabel(r.scheduled);
      const company = (r.company ?? "").trim();
      const note = typeof raw.opsNote === "string" && raw.opsNote.trim() ? raw.opsNote : null;
      return {
        id: `payouts:${r.id}`,
        queue: "payouts",
        title: name,
        subtitle: joinParts(company, dueOn ? `due ${dueOn}` : "") || "Stipend payout",
        amountMinorInr: Math.round(num(r.inrMinor)),
        ageDays: overdueDays(r.scheduled, now),
        when: dueOn ? new Date(`${dueDay(r.scheduled)}T00:00:00+05:30`).toISOString() : null,
        href: r.email ? `/admin/payouts?status=pending&q=${encodeURIComponent(r.email)}` : `/admin/interns/${r.internId}`,
        props: [
          { label: "Due", value: dueOn ?? "No date set" },
          { label: "Amount", value: formatMoney(r.amountMinor, r.currency, { zeroLabel: false }) },
          { label: "Status", value: "Pending" },
          { label: "Candidate", value: name },
          { label: "Company", value: company || "Not recorded" },
        ],
        payout: { id: r.id, internId: r.internId, status: r.status, reference: r.referenceId, note },
      };
    })
    .sort(comparePayouts);

  return { count: num(agg?.value), fresh: num(agg?.fresh), records, dueToInternsMinor: num(agg?.inr) };
}

// ----------------------------------------------------------------- accepted

/** Only the offer keys the amount and the subtitle need, so no JD text crosses the wire. */
const OFFER_SLIM = sql`jsonb_build_object(
  'totalPrice', ${schema.proposals.offerDetails}->'totalPrice',
  'monthlyAmount', ${schema.proposals.offerDetails}->'monthlyAmount',
  'monthly_amount', ${schema.proposals.offerDetails}->'monthly_amount',
  'perHireCharge', ${schema.proposals.offerDetails}->'perHireCharge',
  'duration', ${schema.proposals.offerDetails}->'duration',
  'currency', ${schema.proposals.offerDetails}->'currency',
  'roleTitle', ${schema.proposals.offerDetails}->'roleTitle',
  'fullTimeOffer', ${schema.proposals.offerDetails}->'fullTimeOffer'
)`;

/** A safety cap: accepted-and-unpaid offers are dozens in practice; the sum below is over what is loaded. */
const ACCEPTED_LOAD_CAP = 500;

async function loadAccepted(now: Date): Promise<Result & Pick<MoneyStuck, "owedByEmployersMinor" | "employerOfferCount">> {
  const pr = schema.proposals;
  const rows = await getDb()
    .select({
      id: pr.id,
      internId: pr.internId,
      first: schema.users.firstName,
      last: schema.users.lastName,
      company: schema.employers.companyName,
      currency: pr.currency,
      offer: sql<Record<string, unknown>>`${OFFER_SLIM}`,
      acceptedAt: pr.updatedAt,
      total: sql<number>`count(*) over ()`,
    })
    .from(pr)
    .leftJoin(schema.users, eq(schema.users.id, pr.internId))
    .leftJoin(schema.employers, eq(schema.employers.id, pr.employerId))
    // Today's definition (and the rail's): status accepted, test employers out.
    .where(and(eq(pr.status, "accepted"), realEmployerId(pr.employerId)))
    .orderBy(pr.updatedAt)
    .limit(ACCEPTED_LOAD_CAP);

  const all = rows.map((r) => {
    const name = fullName(r.first, r.last);
    const amountMinorInr = offerAmountMinorInr(r.offer, r.currency);
    const company = (r.company ?? "").trim();
    const role = typeof r.offer?.roleTitle === "string" ? r.offer.roleTitle.trim() : "";
    const record: QueueRecord = {
      id: `accepted:${r.id}`,
      queue: "accepted",
      title: name,
      subtitle: joinParts(company, role) || "Accepted offer",
      amountMinorInr,
      ageDays: ageInDays(r.acceptedAt, now),
      when: isoOrNull(r.acceptedAt),
      href: `/admin/interns/${r.internId}`,
      props: [
        { label: "Offer value", value: amountMinorInr == null ? "Not priced" : formatMoney(amountMinorInr, "INR", { zeroLabel: false }) },
        { label: "Accepted", value: r.acceptedAt ? shortDate(r.acceptedAt, { day: "numeric", month: "short", year: "numeric" }) : "Not recorded" },
        { label: "Candidate", value: name },
        { label: "Company", value: company || "Not recorded" },
        { label: "Role", value: role || "Not recorded" },
      ],
    };
    return record;
  });

  const total = Math.max(num(rows[0]?.total), rows.length);
  return { count: total, fresh: 0, records: topRecords(all, compareStuck), ...totalOwed(all), employerOfferCount: total };
}

// ------------------------------------------------------------------- nolink

async function loadNoLink(weekAgo: Date): Promise<Result> {
  const db = getDb();
  const iv = schema.interviews;
  const where = and(
    eq(iv.status, "scheduled"),
    realEmployerId(iv.employerId),
    sql`${SELECTED_SLOT} > now()`,
    sql`coalesce(trim(${iv.meetingLink}), '') = ''`,
  )!;
  const [[agg], rows] = await Promise.all([
    db
      .select({ value: count(), fresh: sql<number>`count(*) filter (where ${iv.createdAt} >= ${weekAgo})` })
      .from(iv)
      .where(where),
    db
      .select({
        id: iv.id,
        first: schema.users.firstName,
        last: schema.users.lastName,
        company: schema.employers.companyName,
        slot: sql<Date | null>`${SELECTED_SLOT}`,
        timezone: iv.timezone,
      })
      .from(iv)
      .leftJoin(schema.users, eq(schema.users.id, iv.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, iv.employerId))
      .where(where)
      .orderBy(SELECTED_SLOT, iv.id)
      .limit(RECORD_CAP),
  ]);

  const records = rows.map<QueueRecord>((r) => {
    const name = fullName(r.first, r.last);
    const company = (r.company ?? "").trim();
    const slot = r.slot ? dbTimestamp(r.slot) : null;
    const slotText = slot ? shortDateTime(slot, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "Not set";
    return {
      id: `nolink:${r.id}`,
      queue: "nolink",
      title: name,
      subtitle: company || "Employer interview",
      amountMinorInr: null,
      ageDays: null,
      when: isoOrNull(slot),
      href: "/admin/proposal-tracker?tab=interviews",
      props: [
        { label: "Slot", value: slotText },
        { label: "Company", value: company || "Not recorded" },
        { label: "Candidate", value: name },
        { label: "Meeting link", value: "None yet" },
      ],
    };
  });
  return { count: num(agg?.value), fresh: num(agg?.fresh), records };
}

// ----------------------------------------------------------------- unscored

type UnscoredRow = {
  id: string;
  first: string | null;
  last: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  institution: string | null;
  finished_at: string | Date | null;
};

async function loadUnscored(now: Date, weekAgo: Date): Promise<Result> {
  const db = getDb();
  // The rail's definition: latest AI interview completed, no numeric Findtern Score.
  const from = sql`
        FROM ${schema.users} u
        LEFT JOIN ${schema.internOnboarding} o ON o.user_id = u.id
        JOIN LATERAL (
          SELECT lower(i.status) AS status, i.created_at, i.updated_at FROM ${schema.interviews} i
           WHERE i.intern_id = u.id AND ${AI_INTERVIEW}
           ORDER BY i.created_at DESC NULLS LAST LIMIT 1
        ) latest ON true
       WHERE u.role = 'intern' AND latest.status = 'completed'
         AND coalesce(jsonb_typeof(o.extra_data->'findternScore'), '') <> 'number'`;
  const [aggRes, listRes] = await Promise.all([
    db.execute<{ value: number; fresh: number }>(sql`
      SELECT count(*)::int AS value, count(*) FILTER (WHERE latest.created_at >= ${weekAgo})::int AS fresh ${from}`),
    db.execute<UnscoredRow>(sql`
      SELECT u.id, u.first_name AS first, u.last_name AS last, u.email, o.city, o.state,
             o.extra_data->'academics'->>'institution' AS institution,
             coalesce(latest.updated_at, latest.created_at) AS finished_at
        ${from}
       ORDER BY coalesce(latest.updated_at, latest.created_at) ASC NULLS LAST, u.id
       LIMIT ${RECORD_CAP}`),
  ]);

  const records = listRes.rows.map<QueueRecord>((r) => {
    const name = fullName(r.first, r.last);
    const finished = dbTimestamp(r.finished_at);
    const city = joinParts(r.city, r.state).replace(" · ", ", ");
    const college = (r.institution ?? "").trim();
    return {
      id: `unscored:${r.id}`,
      queue: "unscored",
      title: name,
      subtitle: college || city || "No college or city on the profile",
      amountMinorInr: null,
      ageDays: ageInDays(finished, now),
      when: isoOrNull(finished),
      href: `/admin/interns/${r.id}`,
      props: [
        { label: "AI interview finished", value: finished ? shortDate(finished, { day: "numeric", month: "short", year: "numeric" }) : "Not recorded" },
        { label: "College", value: college || "Not given" },
        { label: "City", value: city || "Not given" },
        { label: "Email", value: (r.email ?? "").trim() || "Not given" },
      ],
    };
  });
  return { count: num(aggRes.rows[0]?.value), fresh: num(aggRes.rows[0]?.fresh), records };
}

// ----------------------------------------------------------------- messages

async function loadMessages(now: Date, weekAgo: Date): Promise<Result> {
  const db = getDb();
  const m = schema.contactMessages;
  const where = eq(m.isRead, false);
  const [[agg], rows] = await Promise.all([
    db.select({ value: count(), fresh: sql<number>`count(*) filter (where ${m.createdAt} >= ${weekAgo})` }).from(m).where(where),
    db
      .select({
        id: m.id,
        first: m.firstName,
        last: m.lastName,
        email: m.email,
        subject: m.subject,
        // Only the start of the body: it is the fallback line, never shown whole.
        message: sql<string>`left(${m.message}, 200)`,
        queryType: m.queryType,
        createdAt: m.createdAt,
      })
      .from(m)
      .where(where)
      .orderBy(m.createdAt, m.id)
      .limit(RECORD_CAP),
  ]);

  const records = rows.map<QueueRecord>((r) => {
    const sender = fullName(r.first, r.last, (r.email ?? "").trim() || "Unknown sender");
    const subject = truncate(r.subject) || truncate(r.message) || "No subject";
    return {
      id: `messages:${r.id}`,
      queue: "messages",
      title: sender,
      subtitle: subject,
      amountMinorInr: null,
      ageDays: ageInDays(r.createdAt, now),
      when: isoOrNull(r.createdAt),
      href: "/admin/messages",
      props: [
        { label: "From", value: (r.email ?? "").trim() || "Not given" },
        { label: "Type", value: (r.queryType ?? "").trim() || "General" },
        { label: "Received", value: r.createdAt ? shortDate(r.createdAt, { day: "numeric", month: "short", year: "numeric" }) : "Not recorded" },
        { label: "Subject", value: subject },
      ],
    };
  });
  return { count: num(agg?.value), fresh: num(agg?.fresh), records };
}

// ------------------------------------------------------------------- sheets

async function loadSheets(now: Date, weekAgo: Date): Promise<Result> {
  const db = getDb();
  const t = schema.timesheets;
  // Today's definition: every submitted timesheet (no employer filter).
  const where = eq(t.status, "submitted");
  const [[agg], rows] = await Promise.all([
    db.select({ value: count(), fresh: sql<number>`count(*) filter (where ${t.updatedAt} >= ${weekAgo})` }).from(t).where(where),
    db
      .select({
        id: t.id,
        first: schema.users.firstName,
        last: schema.users.lastName,
        company: schema.employers.companyName,
        periodStart: t.periodStart,
        periodEnd: t.periodEnd,
        submittedAt: t.submittedAt,
        updatedAt: t.updatedAt,
      })
      .from(t)
      .leftJoin(schema.users, eq(schema.users.id, t.internId))
      .leftJoin(schema.employers, eq(schema.employers.id, t.employerId))
      .where(where)
      .orderBy(sql`coalesce(${t.submittedAt}, ${t.updatedAt}) asc nulls last`, t.id)
      .limit(RECORD_CAP),
  ]);

  const records = rows.map<QueueRecord>((r) => {
    const name = fullName(r.first, r.last);
    const company = (r.company ?? "").trim();
    const period = formatPeriodDays(r.periodStart, r.periodEnd);
    const since = r.submittedAt ?? r.updatedAt;
    return {
      id: `sheets:${r.id}`,
      queue: "sheets",
      title: name,
      subtitle: joinParts(company, period),
      amountMinorInr: null,
      ageDays: ageInDays(since, now),
      when: isoOrNull(since),
      href: "/admin/payouts",
      props: [
        { label: "Period", value: period },
        { label: "Company", value: company || "Not recorded" },
        { label: "Candidate", value: name },
        { label: "Submitted", value: since ? shortDate(since, { day: "numeric", month: "short", year: "numeric" }) : "Not recorded" },
      ],
    };
  });
  return { count: num(agg?.value), fresh: num(agg?.fresh), records };
}

// ----------------------------------------------------------------- calendar

async function loadCalendar(): Promise<Result> {
  return { count: (await calendarMissing()) ? 1 : 0, fresh: 0, records: [] };
}

// --------------------------------------------------------------------- main

/** The seven triage queues, in the rail's order, with the money that is stuck. */
export async function loadDashboardQueues(now: Date = new Date()): Promise<DashboardQueues> {
  const weekAgo = new Date(now.getTime() - WEEK_MS);

  let payoutMoney = { dueToInternsMinor: 0, payoutCount: 0 };
  let acceptedMoney = { owedByEmployersMinor: 0, employerOfferCount: 0 };

  const [calendar, payouts, nolink, unscored, messages, accepted, sheets, collected] = await Promise.all([
    settle("calendar", loadCalendar),
    settle("payouts", async () => {
      const r = await loadPayouts(now, weekAgo);
      payoutMoney = { dueToInternsMinor: r.dueToInternsMinor, payoutCount: r.count };
      return r;
    }),
    settle("nolink", () => loadNoLink(weekAgo)),
    settle("unscored", () => loadUnscored(now, weekAgo)),
    settle("messages", () => loadMessages(now, weekAgo)),
    settle("accepted", async () => {
      const r = await loadAccepted(now);
      acceptedMoney = { owedByEmployersMinor: r.owedByEmployersMinor, employerOfferCount: r.employerOfferCount };
      return r;
    }),
    settle("sheets", () => loadSheets(now, weekAgo)),
    // The one money layer; the week is the last 7 India days, as on Transactions. MoneyStuck has no error flag, so a failure is logged and reads 0.
    loadCollectedLastDays(7, now)
      .then((c) => c.receivedMinor)
      .catch((error) => {
        console.error("[admin/dashboard] collected failed", error);
        return 0;
      }),
  ]);

  const byKey: Record<QueueKey, QueueGroup> = { calendar, payouts, nolink, unscored, messages, accepted, sheets };
  const groups = QUEUE_ORDER.map((k) => byKey[k]);
  return {
    groups,
    money: { ...acceptedMoney, ...payoutMoney, collectedWeekMinor: collected },
    ...totalOf(groups),
  };
}
