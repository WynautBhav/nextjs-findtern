import { and, asc, eq, inArray, or, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { isPayrollFullTime, parseOffer } from "@/lib/offer";
import { realJoiningDay } from "@/lib/intern-offer-view";
import { MANUAL_INVOICE_KIND } from "@/lib/payroll-invoice";
import { payrollInvoiceHtml, type InvoiceWire } from "@/lib/invoice-premium";
import { manualInvoiceFacts, manualInvoiceStatus, payrollInvoiceInputOf, type ManualInvoiceRow } from "@/lib/payroll-invoice-view";
import type { InvoiceSeller } from "@/lib/invoice";
import { payrollPeriods, type PayrollInvoiceDto, type PayrollPlacementDto } from "@/lib/admin/payroll-view";

/**
 * Every hired USD full-time placement (Findtern runs its payroll), with its timesheets and the invoices staff issued
 * for it. Read-only. The invoice pages are rendered here, on the server, so the seller's env never reaches the client.
 */
export async function loadPayrollPlacements(seller: InvoiceSeller & { wire?: InvoiceWire }): Promise<PayrollPlacementDto[]> {
  const db = getDb();
  const pr = schema.proposals;
  const rows = await db
    .select({
      proposal: pr,
      first: schema.users.firstName,
      last: schema.users.lastName,
      employer: schema.employers,
      projectName: schema.projects.projectName,
    })
    .from(pr)
    .innerJoin(schema.employers, eq(schema.employers.id, pr.employerId))
    .leftJoin(schema.users, eq(schema.users.id, pr.internId))
    .leftJoin(schema.projects, eq(schema.projects.id, pr.projectId))
    .where(and(eq(pr.currency, "USD"), or(eq(pr.status, "hired"), sql`${pr.hiredAt} is not null`), sql`${pr.offerDetails}->'fullTimeOffer' is not null`))
    .orderBy(asc(schema.employers.companyName), asc(pr.hiredAt));

  const placements = rows.filter((r) => isPayrollFullTime(parseOffer(r.proposal.offerDetails, r.proposal.currency)));
  if (placements.length === 0) return [];
  const ids = placements.map((r) => r.proposal.id);

  const P = schema.employerPayments;
  const [sheets, invoices] = await Promise.all([
    db.select().from(schema.timesheets).where(inArray(schema.timesheets.proposalId, ids)),
    db.select().from(P).where(sql`${P.raw}->>'kind' = ${MANUAL_INVOICE_KIND}`),
  ]);

  return placements.map((r) => {
    const offer = parseOffer(r.proposal.offerDetails, r.proposal.currency);
    const intern = `${r.first ?? ""} ${r.last ?? ""}`.trim() || "Intern";
    const role = offer.roleTitle || r.projectName || "Full-time role";
    const mine = invoices.filter((i) => manualInvoiceFacts(i.raw)?.proposalId === r.proposal.id);
    const toRow = (i: (typeof invoices)[number]): ManualInvoiceRow => ({ id: i.id, invoiceNumber: i.invoiceNumber, status: i.status, createdAt: i.createdAt, paidAt: i.paidAt, amountMinor: i.amountMinor, raw: i.raw });
    const toDto = (row: ManualInvoiceRow): PayrollInvoiceDto | null => {
      const input = payrollInvoiceInputOf(row, { intern: { name: intern, role }, seller, liveBuyer: r.employer });
      const facts = manualInvoiceFacts(row.raw);
      if (!input || !facts) return null;
      return {
        id: row.id,
        number: input.invoiceNo,
        status: manualInvoiceStatus(row.status),
        periodStart: facts.period.start,
        periodEnd: facts.period.end,
        totalMinor: row.amountMinor,
        issuedAt: input.issuedOn.toISOString(),
        dueOn: facts.dueOn,
        paidAt: row.paidAt ? row.paidAt.toISOString() : null,
        wireReference: facts.wireReference,
        html: payrollInvoiceHtml(input),
      };
    };
    return {
      proposalId: r.proposal.id,
      employerId: r.proposal.employerId,
      company: r.employer.companyName || "Company",
      intern,
      role,
      joining: realJoiningDay(offer),
      annualCtcMinor: offer.fullTime?.annualCtcMinor ?? null,
      overtimeRateMinor: offer.fullTime?.overtimeRateMinor ?? null,
      periods: payrollPeriods({
        sheets: sheets.filter((s) => s.proposalId === r.proposal.id).map((s) => ({ id: s.id, status: s.status, entries: s.entries, periodStart: s.periodStart, periodEnd: s.periodEnd })),
        invoices: mine.map(toRow),
        annualCtcMinor: offer.fullTime?.annualCtcMinor ?? null,
        overtimeRateMinor: offer.fullTime?.overtimeRateMinor ?? null,
        toDto,
      }),
    };
  });
}
