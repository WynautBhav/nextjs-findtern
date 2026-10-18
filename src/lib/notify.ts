import { eq } from "drizzle-orm";

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
  const inserted = await db
    .insert(schema.notifications)
    .values({
      recipientType: n.to.type,
      recipientId: n.to.id,
      type: n.type,
      title: n.title,
      message: n.message,
      data: n.data ?? {},
      dedupeKey: n.dedupeKey ?? null,
    })
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
