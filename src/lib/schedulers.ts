import { getDb, schema } from "@/lib/db";
import { eq, and, gte, lte, isNull } from "drizzle-orm";

let started = false;

export function startSchedulers() {
  if (started) return;
  started = true;

  // Interview reminders: every 5 minutes, remind intern + employer 24h/12h/1h before.
  setInterval(async () => {
    try {
      const db = getDb();
      const now = new Date();
      const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const interviews = await db
        .select()
        .from(schema.interviews)
        .where(and(eq(schema.interviews.status, "scheduled"), gte(schema.interviews.slot1, now), lte(schema.interviews.slot1, in24h)));
      for (const i of interviews) {
        // Deduped via dedupeKey on notifications
        await db.insert(schema.notifications).values({
          recipientType: "intern",
          recipientId: i.internId,
          type: "interview_reminder",
          title: "Interview reminder",
          message: `Your interview is coming up. Meeting link: ${i.meetingLink ?? "pending"}`,
          dedupeKey: `interview_reminder_${i.id}_${i.slot1?.toISOString()}`,
        }).onConflictDoNothing();
      }
    } catch (e) {
      console.error("interview reminder scheduler error:", e);
    }
  }, 5 * 60 * 1000);

  // Notification scheduler: every 6 hours — profile completion nudges, cart inactivity.
  setInterval(async () => {
    try {
      const db = getDb();
      // Nudge interns with incomplete onboarding
      const incomplete = await db
        .select()
        .from(schema.internOnboarding)
        .where(isNull(schema.internOnboarding.skills));
      for (const row of incomplete.slice(0, 50)) {
        await db.insert(schema.notifications).values({
          recipientType: "intern",
          recipientId: row.userId,
          type: "profile_completion_nudge",
          title: "Complete your profile",
          message: "Finish your onboarding to get discovered by employers.",
          dedupeKey: `profile_nudge_${row.userId}_${new Date().toDateString()}`,
        }).onConflictDoNothing();
      }
    } catch (e) {
      console.error("notification scheduler error:", e);
    }
  }, 6 * 60 * 60 * 1000);

  console.log("Schedulers started");
}
