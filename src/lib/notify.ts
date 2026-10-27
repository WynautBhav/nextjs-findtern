import { and, eq, inArray, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { renderEmail, type EmailContent } from "@/lib/emails";
import { sendSmtpMail, type SmtpAttachment } from "@/lib/mailer";

/**
 * One call per event: the in-app notification (durable record) and,
 * optionally, the email. A repeated `dedupeKey` is a no-op for both, so
 * scheduled jobs can call this freely. Email is best-effort: a mail failure
 * never undoes the action that triggered it.
 */
export async function notify(n: {
  to: { type: "intern" | "employer"; id: string };
  type: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  dedupeKey?: string;
  email?: EmailContent;
  attachments?: SmtpAttachment[];
}): Promise<void> {
  const db = getDb();
  const { type, data } = legacyShape(n.to.type, n.type, n.data ?? {});
  const inserted = await db
    .insert(schema.notifications)
    .values({
      recipientType: n.to.type,
      recipientId: n.to.id,
      type,
      title: n.title,
      message: n.message,
      data,
      dedupeKey: n.dedupeKey ?? null,
    })
    // Conflict-safe against the dedupe index (DB-16): a key the legacy app
    // or another tick already wrote is a quiet no-op, never an error.
    .onConflictDoNothing()
    .returning({ id: schema.notifications.id });
  if (inserted.length === 0 || !n.email) return;

  try {
    const address = await emailOf(n.to.type, n.to.id);
    if (!address) return;
    const mail = renderEmail(n.email);
    await sendSmtpMail({ to: address, ...mail, attachments: n.attachments });
  } catch (err) {
    console.error(`[notify] ${n.type} email failed`, err);
  }
}

/**
 * An intern's answer to an offer, as the employer is told about it, in the
 * legacy row shape (DB-15): legacy files these as `proposal_status` /
 * `full_time_offer_status` with the new status in `data.status`, and only
 * those types open the proposal from the legacy employer header. Same text,
 * same data, so both apps link it while they share the table.
 */
const LEGACY_DECISION_TYPE = /^(proposal|full_time_offer)_(accepted|rejected)$/;

function legacyShape(
  recipient: "intern" | "employer",
  type: string,
  data: Record<string, unknown>,
): { type: string; data: Record<string, unknown> } {
  const m = recipient === "employer" ? LEGACY_DECISION_TYPE.exec(type) : null;
  if (!m) return { type, data };
  return {
    type: m[1] === "proposal" ? "proposal_status" : "full_time_offer_status",
    data: { ...data, status: data.status ?? m[2], ...(m[1] === "full_time_offer" ? { isFullTimeOffer: true } : {}) },
  };
}

async function emailOf(type: "intern" | "employer", id: string): Promise<string | null> {
  const db = getDb();
  if (type === "intern") {
    const [u] = await db.select({ email: schema.users.email }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return u?.email ?? null;
  }
  const [e] = await db
    .select({ email: schema.employers.companyEmail })
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);
  return e?.email ?? null;
}

/** First name for an intern greeting; legacy greets interns by first name/initial. */
export async function internFirstName(id: string): Promise<string> {
  const [u] = await getDb().select({ f: schema.users.firstName }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return (u?.f ?? "").trim();
}

export async function employerNames(id: string): Promise<{ contact: string; company: string }> {
  const [e] = await getDb()
    .select({ name: schema.employers.name, company: schema.employers.companyName })
    .from(schema.employers)
    .where(eq(schema.employers.id, id))
    .limit(1);
  return { contact: (e?.name ?? "").split(" ")[0] ?? "", company: e?.company ?? "A company on Findtern" };
}

/** Offer notifications that ask the intern to act. */
const OFFER_ACTION_TYPES = ["proposal_received", "proposal_updated", "full_time_offer_received"];

/**
 * Mark the intern's "you have an offer" notifications read once the offer is
 * no longer open (answered, expired, withdrawn, closed by Findtern). They
 * used to sit unread under "Needs you" for an offer that needed nothing.
 */
export async function resolveOfferNotifications(internId: string, proposalIds: string[]): Promise<void> {
  const ids = [...new Set(proposalIds.filter(Boolean))];
  if (ids.length === 0) return;
  const db = getDb();
  await db
    .update(schema.notifications)
    .set({ isRead: true, readAt: new Date() })
    .where(
      and(
        eq(schema.notifications.recipientType, "intern"),
        eq(schema.notifications.recipientId, internId),
        eq(schema.notifications.isRead, false),
        inArray(schema.notifications.type, OFFER_ACTION_TYPES),
        inArray(sql`${schema.notifications.data}->>'proposalId'`, ids),
      ),
    );
}
