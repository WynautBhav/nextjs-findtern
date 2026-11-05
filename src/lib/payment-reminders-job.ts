import { and, eq, inArray, like, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";
import { billingPlanOf, istDay } from "@/lib/billing-plan";
import { reminderDue, reminderEmail, reminderKey } from "@/lib/payment-reminders";

/**
 * Sends today's stipend reminders (days -15, -12, -9, -6, -3, -2, -1, the due day, then overdue). Idempotent: `notify` writes a
 * notification row with a per-hire/month/send-day dedupe key and mails only when that row is new, so reruns (cron + scheduler, retries) never double-send.
 */
export async function sendPaymentReminders(now = new Date()): Promise<{ sent: number }> {
  const db = getDb();
  const today = istDay(now)!;
  const hired = await db.select().from(schema.proposals).where(eq(schema.proposals.status, "hired"));
  if (!hired.length) return { sent: 0 };
  // Paid orders of the hiring employers only (not the whole table), then keep just the post-paid hires.
  const orders = await db
    .select({ employerId: schema.employerPayments.employerId, status: schema.employerPayments.status, raw: schema.employerPayments.raw, paidAt: schema.employerPayments.paidAt })
    .from(schema.employerPayments)
    .where(and(inArray(schema.employerPayments.employerId, [...new Set(hired.map((h) => h.employerId))]), sql`lower(${schema.employerPayments.status}) = 'paid'`));
  const hires = hired.filter((h) => billingPlanOf(h.id, orders.filter((o) => o.employerId === h.employerId)) === "postpaid");
  if (!hires.length) return { sent: 0 };
  const employerIds = [...new Set(hires.map((h) => h.employerId))];
  const [users, employers, keys] = await Promise.all([
    db.select({ id: schema.users.id, first: schema.users.firstName, last: schema.users.lastName }).from(schema.users).where(inArray(schema.users.id, [...new Set(hires.map((h) => h.internId))])),
    db.select({ id: schema.employers.id, name: schema.employers.name, isActive: schema.employers.isActive }).from(schema.employers).where(inArray(schema.employers.id, employerIds)),
    // Leads with recipient_type + recipient_id so the unique index serves it.
    db
      .select({ k: schema.notifications.dedupeKey })
      .from(schema.notifications)
      .where(and(eq(schema.notifications.recipientType, "employer"), inArray(schema.notifications.recipientId, employerIds), like(schema.notifications.dedupeKey, "payment_reminder:%"))),
  ]);
  const sent = new Set(keys.map((r) => r.k ?? ""));
  const intern = new Map(users.map((u) => [u.id, `${u.first ?? ""} ${u.last ?? ""}`.trim() || "your intern"]));
  const employer = new Map(employers.map((e) => [e.id, e]));
  let n = 0;
  for (const h of hires) {
    const emp = employer.get(h.employerId);
    if (!emp?.isActive) continue;
    const r = reminderDue(h, orders.filter((o) => o.employerId === h.employerId), sent, today);
    if (!r) continue;
    const mail = reminderEmail(r, { name: emp.name ?? "", intern: intern.get(h.internId) ?? "your intern" });
    const key = reminderKey(h.id, r.k, r.type, r.offset);
    const ok = await notify({
      to: { type: "employer", id: h.employerId },
      type: "payment_reminder",
      title: mail.heading,
      message: mail.lines[0],
      data: { proposalId: h.id, month: r.k, reminder: r.type, dueOn: r.dueOn },
      dedupeKey: key,
      email: mail,
    }).catch((e) => (console.error("[payment-reminders]", key, e), false));
    if (!ok) continue;
    n++;
    // The intern hears once, with the hire's first reminder of whatever type (the key dedupes the rest).
    await notify({
      to: { type: "intern", id: h.internId },
      type: "stipend_pending",
      title: `Your month ${r.k} stipend`,
      message: `Your month ${r.k} stipend will be paid once the employer pays.`,
      data: { proposalId: h.id, month: r.k },
      dedupeKey: `stipend_pending:${h.id}:${r.k}`,
    }).catch(() => false);
  }
  return { sent: n };
}
