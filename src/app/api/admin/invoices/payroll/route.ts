import { randomUUID } from "node:crypto";

import { and, eq, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { isHiredProposal } from "@/lib/hire-status";
import { invoiceBuyerPatch } from "@/lib/invoice-buyer";
import { assignInvoiceNumber } from "@/lib/invoice-number";
import { isPayrollFullTime, parseOffer } from "@/lib/offer";
import { MANUAL_INVOICE_KIND, PAYROLL_LINE_KEYS, passThroughOf, validateIssue } from "@/lib/payroll-invoice";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const bodySchema = z.object({
  proposalId: z.string().min(1).max(64),
  period: z.object({ start: day, end: day }),
  lines: z
    .array(
      z.object({
        key: z.enum(PAYROLL_LINE_KEYS),
        label: z.string().trim().min(1).max(120),
        detail: z.string().trim().max(200).optional(),
        amountMinor: z.number().int().min(0).max(1_000_000_000),
      }),
    )
    .min(1)
    .max(12),
  dueOn: day,
  note: z.string().trim().max(500).optional(),
});

/**
 * Issue the monthly payroll invoice of a USD full-time hire. The invoice is an `employer_payments` row
 * (`raw.kind = "manual_invoice"`, status "created") numbered at issue; from then on it is immutable: the only
 * later changes are "paid" and "void" (./[id]). The company pays by wire, never through checkout, so nothing
 * here touches the settlement that hires or grants.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  if (!allows(guard.session.permissions, ["transactions:write"])) {
    return NextResponse.json({ error: "Issuing an invoice needs the Accounts permission (transactions:write)" }, { status: 403 });
  }
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the invoice lines, period and due date." }, { status: 400 });
  const b = parsed.data;

  const db = getDb();
  const issue = () => db.transaction(async (tx) => {
    // Locking the placement serialises two admins issuing the same month; the unique index is the backstop.
    const [proposal] = await tx.select().from(schema.proposals).where(eq(schema.proposals.id, b.proposalId)).for("update").limit(1);
    if (!proposal) return { error: "Unknown placement", status: 404 } as const;
    const offer = parseOffer(proposal.offerDetails, proposal.currency);
    if (!isHiredProposal(proposal) || !isPayrollFullTime(offer)) {
      return { error: "Payroll invoices are for hired full-time placements with a USD offer.", status: 409 } as const;
    }
    const checked = validateIssue({ lines: b.lines, currency: proposal.currency ?? "", period: b.period, dueOn: b.dueOn });
    if (!checked.ok) return { error: checked.error, status: 400 } as const;

    // The period must be exactly one of this placement's approved timesheet months: no overlapping or
    // made-up range can bill the same days twice, and only hours the company approved are invoiced.
    const T = schema.timesheets;
    const [sheet] = await tx
      .select({ id: T.id })
      .from(T)
      .where(
        and(
          eq(T.proposalId, proposal.id),
          eq(T.status, "approved"),
          sql`to_char(${T.periodStart}, 'YYYY-MM-DD') = ${b.period.start}`,
          sql`to_char(${T.periodEnd}, 'YYYY-MM-DD') = ${b.period.end}`,
        ),
      )
      .limit(1);
    if (!sheet) return { error: "Pick a month with an approved timesheet; the period must match it exactly.", status: 409 } as const;

    const P = schema.employerPayments;
    const [dupe] = await tx
      .select({ id: P.id })
      .from(P)
      .where(
        and(
          eq(P.employerId, proposal.employerId),
          sql`${P.raw}->>'kind' = ${MANUAL_INVOICE_KIND}`,
          sql`${P.raw}->>'proposalId' = ${proposal.id}`,
          sql`${P.raw}->'period'->>'start' = ${b.period.start}`,
          ne(P.status, "void"),
        ),
      )
      .limit(1);
    if (dupe) return { error: "This placement already has an invoice for that month. Void it first to issue another.", status: 409 } as const;

    const [employer] = await tx.select().from(schema.employers).where(eq(schema.employers.id, proposal.employerId)).limit(1);
    const now = new Date();
    const [row] = await tx
      .insert(P)
      .values({
        employerId: proposal.employerId,
        gateway: "manual",
        orderId: `manual_${randomUUID()}`,
        amountMinor: checked.totalMinor,
        currency: "USD",
        status: "created",
        raw: {
          kind: MANUAL_INVOICE_KIND,
          invoiceType: "payroll",
          proposalId: proposal.id,
          period: b.period,
          lines: b.lines,
          dueOn: b.dueOn,
          note: b.note ?? "",
          passThroughMinor: passThroughOf(b.lines),
          issuedBy: guard.session.uid,
          issuedAt: now.toISOString(),
          ...invoiceBuyerPatch(employer),
        },
      })
      .returning({ id: P.id });
    const invoiceNumber = await assignInvoiceNumber("employer", row.id, now, tx);
    await recordAdminAudit(
      tx,
      {
        adminId: guard.session.uid,
        action: "invoice.payroll_issued",
        targetType: "employer_payments",
        targetId: row.id,
        meta: { proposalId: proposal.id, employerId: proposal.employerId, period: b.period, totalMinor: checked.totalMinor, invoiceNumber },
      },
      { strict: true },
    );
    return { id: row.id, invoiceNumber, totalMinor: checked.totalMinor } as const;
  });

  let result: Awaited<ReturnType<typeof issue>>;
  try {
    result = await issue();
  } catch (err) {
    // The unique index (drizzle/0049) caught a second invoice for the same month that slipped past the check.
    if ((err as { code?: string })?.code === "23505" || (err as { cause?: { code?: string } })?.cause?.code === "23505") {
      return NextResponse.json({ error: "This placement already has an invoice for that month. Void it first to issue another." }, { status: 409 });
    }
    throw err;
  }
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result, { status: 201 });
}
