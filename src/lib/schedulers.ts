import { and, eq, gte, lt, lte, or, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { readSkills, scoreOf } from "@/lib/employer-candidates";
import { notify } from "@/lib/notify";
import { HIDE_LIMIT_DAYS, HIDE_REMINDER_DAYS, visibleAgainAt } from "@/lib/profile-hide";

/**
 * In-process jobs, ported from the legacy interviewReminderScheduler and
 * notificationScheduler. Started from instrumentation.ts when SCHEDULERS=on,
 * which suits the long-running KVM process. Dedupe keys match the legacy ones
 * exactly, so the two apps never double-notify while they share a database.
 */

let started = false;

export function startSchedulers() {
  if (started) return;
  started = true;
  const run = (name: string, fn: () => Promise<void>) => () =>
    fn().catch((e) => console.error(`[scheduler] ${name} failed`, e));

  const reminders = run("interview reminders", interviewReminders);
  const daily = run("notification jobs", notificationJobs);
  reminders();
  daily();
  setInterval(reminders, 5 * 60 * 1000);
  setInterval(daily, 6 * 60 * 60 * 1000);
  console.log("[scheduler] started");
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);
/** Legacy `isoWeekKeyUtc`: the week's Monday as YYYY-MM-DD, then `_wk`. Kept
    byte-identical so the two apps share one dedupe key per week. */
function weekKey(d: Date) {
  const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const monday = new Date(base.getTime() - ((base.getUTCDay() + 6) % 7) * 86_400_000);
  return `${dayKey(monday)}_wk`;
}

/* ── Interview reminders: 24h, 12h and 1h before, both parties ───────── */

const REMINDER_HOURS = [24, 12, 1] as const;
const AI_EMPLOYER_EMAIL = "ai-interview@findtern.ai";

async function interviewReminders() {
  const db = getDb();
  const now = Date.now();
  const rows = await db
    .select({ i: schema.interviews, email: schema.employers.companyEmail })
    .from(schema.interviews)
    .leftJoin(schema.employers, eq(schema.employers.id, schema.interviews.employerId))
    .where(
      and(
        eq(schema.interviews.status, "scheduled"),
        or(
          gte(schema.interviews.slot1, new Date(now)),
          gte(schema.interviews.slot2, new Date(now)),
          gte(schema.interviews.slot3, new Date(now)),
        ),
      ),
    );
  for (const { i, email } of rows) {
    // AI interviews are run by Findtern, not an employer (legacy
    // interviewReminderScheduler.ts skips employerId "admin").
    if (i.employerId === "admin" || email === AI_EMPLOYER_EMAIL) continue;
    // No slot picked yet: the first slot that exists (legacy
    // interviewReminderScheduler.ts:5), not blindly slot 1.
    const slots = [i.slot1, i.slot2, i.slot3];
    const start = i.selectedSlot ? slots[i.selectedSlot - 1] : slots.find(Boolean);
    if (!start) continue;
    const hoursLeft = (start.getTime() - now) / 3_600_000;
    // The tightest window we're inside; earlier ones were sent on earlier ticks.
    const hours = [...REMINDER_HOURS].reverse().find((h) => hoursLeft > 0 && hoursLeft <= h);
    if (!hours) continue;
    // The bucket only dedupes. The copy states the real time left, so an
    // interview booked 5 hours out does not get "in 12 hours".
    const left = timeLeft(hoursLeft);
    for (const who of ["intern", "employer"] as const) {
      const recipientId = who === "intern" ? i.internId : i.employerId;
      const dedupeKey = await reminderKey(`interview_reminder:${i.id}:${who}:${hours}h`, who, recipientId, start, hours);
      await notify({
        to: { type: who, id: recipientId },
        type: "interview_reminder",
        title: `Interview in ${left}`,
        message: `Reminder: your interview starts in ${left}.`,
        data: { interviewId: i.id, hours, meetingLink: i.meetingLink, slotAt: start.toISOString() },
        dedupeKey,
      });
    }
  }
}

/**
 * The dedupe key for one reminder (SYS-06).
 *
 * The legacy key (`interview_reminder:<id>:<who>:<h>h`) has no slot time, so
 * once an interview was rescheduled its reminders never went out again. The
 * legacy key is still used, byte for byte, whenever it is free or was used
 * for this slot, so the two apps keep sharing one key per reminder. Only
 * when that key was already spent before this slot's window opened (i.e. on
 * an earlier slot) does the reminder get a key with the slot time in it.
 */
async function reminderKey(
  legacyKey: string,
  recipientType: "intern" | "employer",
  recipientId: string,
  start: Date,
  hours: number,
): Promise<string> {
  const [prior] = await getDb()
    .select({ at: schema.notifications.createdAt })
    .from(schema.notifications)
    .where(
      and(
        eq(schema.notifications.recipientType, recipientType),
        eq(schema.notifications.recipientId, recipientId),
        eq(schema.notifications.dedupeKey, legacyKey),
      ),
    )
    .limit(1);
  if (!prior?.at) return legacyKey;
  // Sent before this slot's window opened (with a few minutes of slack for
  // the 5-minute tick): that reminder was for the old time.
  const windowOpens = start.getTime() - hours * 3_600_000 - 10 * 60_000;
  return prior.at.getTime() < windowOpens ? `${legacyKey}:${start.toISOString()}` : legacyKey;
}

function timeLeft(hours: number): string {
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60));
    return mins === 1 ? "1 minute" : `${mins} minutes`;
  }
  const h = Math.round(hours);
  return h === 1 ? "1 hour" : `${h} hours`;
}

/* ── Six-hourly notification jobs ────────────────────────────────────── */

async function notificationJobs() {
  const now = new Date();
  for (const [name, job] of [
    ["monthly profile views", monthlyProfileViews],
    ["cart inactivity", cartInactivity],
    ["weekly hire tip", weeklyHireTip],
    ["profile hide limit", profileHideLimit],
    ["intern profile nudge", internProfileNudges],
    ["employer profile nudge", employerProfileNudges],
    ["talent spotlight", talentSpotlight],
    ["interview feedback request", feedbackRequests],
  ] as const) {
    await job(now).catch((e) => console.error(`[scheduler] ${name} failed`, e));
  }
}

async function monthlyProfileViews(now: Date) {
  if (now.getUTCDate() !== 1) return;
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const rows = await getDb()
    .select({ internId: schema.profileViews.internId, views: sql<number>`count(*)::int` })
    .from(schema.profileViews)
    .where(and(gte(schema.profileViews.createdAt, from), lt(schema.profileViews.createdAt, to)))
    .groupBy(schema.profileViews.internId);
  for (const r of rows) {
    await notify({
      to: { type: "intern", id: r.internId },
      type: "monthly_profile_views",
      title: "Monthly profile views",
      message: `Growth check: ${r.views} employer views last month. Keep your profile fresh.`,
      data: { views: r.views },
      dedupeKey: `monthly_profile_views:${r.internId}:${monthKey(from)}`,
    });
  }
}

async function cartInactivity(now: Date) {
  const rows = await getDb()
    .select({ employerId: schema.employerCartItems.employerId, n: sql<number>`count(*)::int` })
    .from(schema.employerCartItems)
    .where(
      and(
        eq(schema.employerCartItems.listType, "cart"),
        lte(schema.employerCartItems.createdAt, new Date(now.getTime() - 3 * 86_400_000)),
      ),
    )
    .groupBy(schema.employerCartItems.employerId);
  for (const r of rows) {
    await notify({
      to: { type: "employer", id: r.employerId },
      type: "cart_inactivity",
      title: "Cart reminder",
      message: `You still have ${r.n} candidate${r.n === 1 ? "" : "s"} waiting in your cart.`,
      data: { count: r.n },
      dedupeKey: `cart_inactivity:${r.employerId}:${dayKey(now)}`,
    });
  }
}

/**
 * Mondays, to onboarded employers with a hire. Alternates by ISO week: even
 * weeks carry the legacy full-time pitch (notificationScheduler.ts:17), odd
 * weeks the timesheet tip. One dedupe key per employer per week either way.
 */
async function weeklyHireTip(now: Date) {
  if (now.getUTCDay() !== 1) return;
  const rows = await getDb()
    .select({
      employerId: schema.proposals.employerId,
      internId: schema.proposals.internId,
      first: schema.users.firstName,
      last: schema.users.lastName,
    })
    .from(schema.proposals)
    .innerJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
    .leftJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .where(
      and(
        eq(schema.proposals.status, "hired"),
        eq(schema.employers.isActive, true),
        eq(schema.employers.onboardingCompleted, true),
      ),
    );
  const firstHire = new Map<string, (typeof rows)[number]>();
  for (const r of rows) if (!firstHire.has(r.employerId)) firstHire.set(r.employerId, r);
  const pitchWeek = isoWeekNumber(now) % 2 === 0;
  for (const [employerId, r] of firstHire) {
    const internName = `${r.first ?? ""} ${r.last ?? ""}`.trim() || "your intern";
    await notify({
      to: { type: "employer", id: employerId },
      type: "weekly_hire_tip",
      title: "Weekly tip",
      message: pitchWeek
        ? `Internship going well? Consider hiring ${internName} full-time.`
        : "Approve timesheets on time and share clear weekly goals; interns who get both deliver more.",
      data: pitchWeek ? { internId: r.internId, internName } : undefined,
      dedupeKey: `weekly_hire_tip:${employerId}:${weekKey(now)}`,
    });
  }
}

/** ISO-8601 week number (1-53) of a UTC date. */
function isoWeekNumber(d: Date): number {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/* ── 30-day profile hiding: remind, then switch back on ──────────────── */

async function profileHideLimit(now: Date) {
  const db = getDb();
  const rows = await db
    .select({ id: schema.internOnboarding.id, userId: schema.internOnboarding.userId, extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(sql`${schema.internOnboarding.extraData}->>'openToWork' = 'false'`);
  for (const r of rows) {
    const extra = (r.extra ?? {}) as Record<string, unknown>;
    let hiddenAt = typeof extra.hiddenAt === "string" ? extra.hiddenAt : null;
    if (!hiddenAt) {
      // Hidden before the limit existed: the clock starts now, never backdated.
      hiddenAt = now.toISOString();
      await db
        .update(schema.internOnboarding)
        .set({ extraData: { ...extra, hiddenAt } })
        .where(eq(schema.internOnboarding.id, r.id));
      continue;
    }
    const until = visibleAgainAt(hiddenAt);
    if (!until) continue;
    const msLeft = until.getTime() - now.getTime();
    if (msLeft <= 0) {
      await db
        .update(schema.internOnboarding)
        .set({ extraData: { ...extra, openToWork: true, hiddenAt: null, hideReminderSentAt: null }, updatedAt: now })
        .where(eq(schema.internOnboarding.id, r.id));
      await notify({
        to: { type: "intern", id: r.userId },
        type: "profile_visible_again",
        title: "Your profile is visible again",
        message: `Profiles can be hidden for up to ${HIDE_LIMIT_DAYS} days, so employers can see yours again. Your placement guarantee is running.`,
        dedupeKey: `profile_visible_again:${r.userId}:${hiddenAt}`,
      });
    } else if (msLeft <= HIDE_REMINDER_DAYS * 86_400_000 && !extra.hideReminderSentAt) {
      await notify({
        to: { type: "intern", id: r.userId },
        type: "profile_hide_ending",
        title: "Your profile becomes visible soon",
        message: `Your profile has been hidden for almost ${HIDE_LIMIT_DAYS} days. It will be visible to employers again on ${until.toLocaleDateString("en-IN", { day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}.`,
        dedupeKey: `profile_hide_ending:${r.userId}:${hiddenAt}`,
      });
      await db
        .update(schema.internOnboarding)
        .set({ extraData: { ...extra, hideReminderSentAt: now.toISOString() } })
        .where(eq(schema.internOnboarding.id, r.id));
    }
  }
}

async function internProfileNudges(now: Date) {
  const rows = await getDb()
    .select({ id: schema.users.id, first: schema.users.firstName, o: schema.internOnboarding })
    .from(schema.users)
    .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
    .where(eq(schema.users.isActive, true));
  for (const r of rows) {
    const o = r.o;
    if (o && readSkills(o.skills).length > 0 && o.bio?.trim() && o.city?.trim()) continue;
    await notify({
      to: { type: "intern", id: r.id },
      type: "profile_completion_nudge",
      title: "Complete your profile",
      message: `${r.first || "Hi"}, complete your profile to get noticed by employers.`,
      dedupeKey: `profile_completion_nudge:${r.id}:${dayKey(now)}`,
    });
  }
}

async function employerProfileNudges(now: Date) {
  const rows = await getDb().select().from(schema.employers).where(eq(schema.employers.isActive, true));
  for (const e of rows) {
    if (e.setupCompleted && e.onboardingCompleted && e.logoUrl && e.websiteUrl && e.companySize && e.city) continue;
    await notify({
      to: { type: "employer", id: e.id },
      type: "employer_profile_completion_nudge",
      title: "Complete your employer profile",
      message: "Missing details? Update your company profile today.",
      dedupeKey: `employer_profile_completion_nudge:${e.id}:${dayKey(now)}`,
    });
  }
}

/**
 * Daily talent spotlight (SYS-07), the legacy job (notificationScheduler.ts
 * 100-195): for each onboarded employer, the top 5 candidates by skill
 * overlap with their projects, then by Findtern Score. Two deliberate
 * differences: only active projects of active employers count, and the
 * notification carries candidate ids only. Legacy also put the interns'
 * full names in it, which showed identities before hire. Hidden profiles
 * are never spotlighted.
 */
async function talentSpotlight(now: Date) {
  const db = getDb();
  const projects = await db
    .select({ employerId: schema.projects.employerId, skills: schema.projects.skills })
    .from(schema.projects)
    // Deactivated or not-yet-onboarded employers get nothing.
    .innerJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
    .where(
      and(
        eq(schema.projects.status, "active"),
        eq(schema.employers.isActive, true),
        eq(schema.employers.onboardingCompleted, true),
      ),
    );
  if (projects.length === 0) return;
  const pool = (await db.select().from(schema.internOnboarding))
    .filter((o) => ((o.extraData ?? {}) as Record<string, unknown>).openToWork !== false)
    .map((o) => ({
      internId: o.userId,
      score: scoreOf(o) ?? 0,
      skills: new Set(readSkills(o.skills).map((s) => s.trim().toLowerCase())),
    }));
  const wanted = new Map<string, Set<string>>();
  for (const p of projects) {
    const set = wanted.get(p.employerId) ?? new Set<string>();
    for (const s of (p.skills as string[] | null) ?? []) {
      const k = String(s ?? "").trim().toLowerCase();
      if (k) set.add(k);
    }
    wanted.set(p.employerId, set);
  }
  for (const [employerId, skills] of wanted) {
    if (skills.size === 0) continue;
    const top = pool
      .map((c) => ({ ...c, overlap: [...skills].filter((s) => c.skills.has(s)).length }))
      .filter((c) => c.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap || b.score - a.score)
      .slice(0, 5);
    if (top.length === 0) continue;
    await notify({
      to: { type: "employer", id: employerId },
      type: "talent_spotlight",
      title: "Talent spotlight",
      message: `Today's top ${top.length === 1 ? "candidate" : `${top.length} candidates`} for your projects, matched on skills and Findtern Score.`,
      data: { skills: [...skills].slice(0, 25), candidateIds: top.map((c) => c.internId) },
      dedupeKey: `talent_spotlight:${employerId}:${dayKey(now)}`,
    });
  }
}

async function feedbackRequests(now: Date) {
  // Same rule and key as legacy: completed interviews, real employers only,
  // dated by the interview's last update.
  const rows = await getDb()
    .select({ id: schema.interviews.id, employerId: schema.interviews.employerId, at: schema.interviews.updatedAt, created: schema.interviews.createdAt, notes: schema.interviews.notes, email: schema.employers.companyEmail })
    .from(schema.interviews)
    .innerJoin(schema.employers, eq(schema.employers.id, schema.interviews.employerId))
    .where(eq(schema.interviews.status, "completed"));
  for (const i of rows) {
    if (i.employerId === "admin" || i.email === "ai-interview@findtern.ai") continue;
    if (i.notes?.includes("feedback_text:")) continue; // already given
    await notify({
      to: { type: "employer", id: i.employerId },
      type: "interview_feedback_request",
      title: "Provide interview feedback",
      message: "Share your thoughts on the interview so the candidate hears back.",
      data: { interviewId: i.id },
      dedupeKey: `interview_feedback_request:${i.id}:${i.employerId}:${dayKey(i.at ?? i.created ?? now)}`,
    });
  }
}
