import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { recordAdminAudit } from "@/lib/admin/audit";
import { getDb, schema } from "@/lib/db";
import { emails, renderEmail } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";
import { resendInvoiceRefusal } from "@/lib/invoice-resend";
import { sendSmtpMail } from "@/lib/mailer";
import { limiters } from "@/lib/security/rate-limit";

export const runtime = "nodejs";

/** Accounts re-sends an order's invoice mail to the company (one per order per 10 minutes, so the button can't be used to spam a customer). */
export async function POST(req: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const db = getDb();
  const [order] = await db
    .select({ id: schema.employerPayments.id, employerId: schema.employerPayments.employerId, status: schema.employerPayments.status, amountMinor: schema.employerPayments.amountMinor, currency: schema.employerPayments.currency, invoiceNumber: schema.employerPayments.invoiceNumber, email: schema.employers.companyEmail, name: schema.employers.name })
    .from(schema.employerPayments)
    .innerJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
    .where(eq(schema.employerPayments.orderId, orderId))
    .limit(1);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const refusal = resendInvoiceRefusal(order);
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 });
  if (!limiters.reminder.take(`invoice:${order.id}`)) return NextResponse.json({ error: "This invoice was just sent. Try again in a few minutes." }, { status: 429 });

  try {
    const mail = renderEmail(emails.invoiceCopy({ employerName: (order.name ?? "").split(" ")[0] ?? "", invoiceNumber: order.invoiceNumber!, amount: formatMoney(order.amountMinor, order.currency, { zeroLabel: false }) }));
    await sendSmtpMail({ to: order.email, ...mail });
  } catch (error) {
    console.error("[admin/orders] resend invoice failed", orderId, error);
    limiters.reminder.reset(`invoice:${order.id}`);
    return NextResponse.json({ error: "The email could not be sent. Try again." }, { status: 502 });
  }
  await recordAdminAudit(db, { adminId: guard.session.uid, action: "order.invoice_resent", targetType: "order", targetId: orderId, meta: { employerId: order.employerId, invoiceNumber: order.invoiceNumber } });
  return NextResponse.json({ ok: true });
}
