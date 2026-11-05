import { eq, like } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { scoreOf } from "@/lib/employer-candidates";
import { emails } from "@/lib/emails";
import { formatDate, formatMoney } from "@/lib/format";
import { notify } from "@/lib/notify";
import { istDay } from "@/lib/billing-plan";
import { reminderDue, reminderKey } from "@/lib/payment-reminders";

/**
 * Sends today's month-end stipend reminders. Idempotent: `notify` writes a notification row with a
 * per-hire/month/type dedupe key and mails only when that row is new, so reruns (cron + scheduler, retries) never double-send.
 */
export async function sendPaymentReminders(now = new Date()): Promise<{ sent: number }> {
  const db = getDb();
  const today = istDay(now)!;
  const hires = await db.select().from(schema.proposals).where(eq(schema.proposals.status, "hired"));
  if (!hires.length) return { sent: 0 };
  const [orders, onboarding, users, employers, keys] = await Promise.all([
    db.select({ employerId: schema.employerPayments.employerId, status: schema.employerPayments.status, raw: schema.employerPayments.raw, paidAt: schema.employerPayments.paidAt }).from(schema.employerPayments),
    db.select({ userId: schema.internOnboarding.userId, extraData: schema.internOnboarding.extraData }).from(schema.internOnboarding),
    db.select({ id: schema.users.id, first: schema.users.firstName, last: schema.users.lastName }).from(schema.users),
    db.select({ id: schema.employers.id, name: schema.employers.name, isActive: schema.employers.isActive }).from(schema.employers),
    db.select({ k: schema.notifications.dedupeKey }).from(schema.notifications).where(like(schema.notifications.dedupeKey, "payment_reminder:%")),
  ]);
  const sent = new Set(keys.map((r) => r.k ?? ""));
  const score = new Map(onboarding.map((o) => [o.userId, scoreOf({ extraData: o.extraData } as Parameters<typeof scoreOf>[0])]));
  const intern = new Map(users.map((u) => [u.id, `${u.first ?? ""} ${u.last ?? ""}`.trim() || "your intern"]));
  const employer = new Map(employers.map((e) => [e.id, e]));
  let n = 0;
  for (const h of hires) {
    const emp = employer.get(h.employerId);
    if (!emp?.isActive) continue;
    const r = reminderDue({ ...h, score: score.get(h.internId) ?? 0 }, orders.filter((o) => o.employerId === h.employerId), sent, today);
    if (!r) continue;
    const amount = formatMoney(r.amountMinor, r.currency, { decimals: 0 });
    const mail = emails.paymentReminder({ name: emp.name ?? "", type: r.type, k: r.k, amount, dueOn: formatDate(r.dueOn), dueToday: r.dueToday, intern: intern.get(h.internId)! });
    const key = reminderKey(h.id, r.k, r.type);
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
    // The intern hears once, ahead of the first reminder only.
    if (r.type === "upcoming")
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
