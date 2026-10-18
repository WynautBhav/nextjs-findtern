import { and, eq, gte, lt, lte, or, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { readSkills, scoreOf } from "@/lib/employer-candidates";
import { notify } from "@/lib/notify";

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
function weekKey(d: Date) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const week = Math.ceil(((t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/* ── Interview reminders: 24h, 12h and 1h before, both parties ───────── */

const REMINDER_HOURS = [24, 12, 1] as const;

async function interviewReminders() {
  const db = getDb();
  const now = Date.now();
  const rows = await db
    .select()
    .from(schema.interviews)
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
  for (const i of rows) {
    const start = [i.slot1, i.slot2, i.slot3][(i.selectedSlot ?? 1) - 1];
    if (!start) continue;
    const hoursLeft = (start.getTime() - now) / 3_600_000;
    // The tightest window we're inside; earlier ones were sent on earlier ticks.
    const hours = [...REMINDER_HOURS].reverse().find((h) => hoursLeft > 0 && hoursLeft <= h);
    if (!hours) continue;
    const title = hours === 1 ? "Interview in 1 hour" : `Interview in ${hours} hours`;
    for (const who of ["intern", "employer"] as const) {
      await notify({
        to: { type: who, id: who === "intern" ? i.internId : i.employerId },
        type: "interview_reminder",
        title,
        message: hours === 1 ? "Your interview starts in 1 hour." : `Reminder: your interview is in ${hours} hours.`,
        data: { interviewId: i.id, hours, meetingLink: i.meetingLink },
        dedupeKey: `interview_reminder:${i.id}:${who}:${hours}h`,
      });
    }
  }
}

/* ── Six-hourly notification jobs ────────────────────────────────────── */

async function notificationJobs() {
  const now = new Date();
  for (const [name, job] of [
    ["monthly profile views", monthlyProfileViews],
    ["cart inactivity", cartInactivity],
    ["weekly hire tip", weeklyHireTip],
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

async function weeklyHireTip(now: Date) {
  if (now.getUTCDay() !== 1) return;
  const rows = await getDb()
    .selectDistinct({ employerId: schema.proposals.employerId })
    .from(schema.proposals)
    .where(eq(schema.proposals.status, "hired"));
  for (const r of rows) {
    await notify({
      to: { type: "employer", id: r.employerId },
      type: "weekly_hire_tip",
      title: "Weekly tip",
      message: "Approve timesheets on time and share clear weekly goals; interns who get both deliver more.",
      dedupeKey: `weekly_hire_tip:${r.employerId}:${weekKey(now)}`,
    });
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

async function talentSpotlight(now: Date) {
  const db = getDb();
  const projects = await db
    .select({ employerId: schema.projects.employerId, skills: schema.projects.skills })
    .from(schema.projects)
    .where(eq(schema.projects.status, "active"));
  if (projects.length === 0) return;
  const pool = (await db.select().from(schema.internOnboarding))
    .map((o) => ({ score: scoreOf(o), skills: new Set(readSkills(o.skills).map((s) => s.toLowerCase())) }))
    .filter((c) => c.score >= 6);
  const wanted = new Map<string, Set<string>>();
  for (const p of projects) {
    const set = wanted.get(p.employerId) ?? new Set<string>();
    for (const s of (p.skills as string[] | null) ?? []) set.add(s.toLowerCase());
    wanted.set(p.employerId, set);
  }
  for (const [employerId, skills] of wanted) {
    if (!pool.some((c) => [...skills].some((s) => c.skills.has(s)))) continue;
    await notify({
      to: { type: "employer", id: employerId },
      type: "talent_spotlight",
      title: "Talent spotlight",
      message: "New high-scoring candidates match your open projects.",
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
