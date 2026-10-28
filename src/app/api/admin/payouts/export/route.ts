import { NextResponse } from "next/server";

import { csvFilename, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { flattenParams } from "@/lib/admin/params";
import { allows, EXPORT_PERMISSIONS } from "@/lib/admin/permissions";
import {
  DUE_FILTERS,
  filterDues,
  loadPayouts,
  loadPlacementDues,
  PAYOUT_SORTS,
  payoutSourceLabel,
  type DueFilter,
  type PayoutSort,
  type PlacementDueRow,
  type PayoutRow,
} from "@/lib/admin/payout-list";
import { todayIst } from "@/lib/timesheet-days";
import { requireRole } from "@/lib/security/guards";

/**
 * CSV of the /admin/payouts lists, with exactly the filters on screen.
 *
 * `view=payouts` (default) is the disbursements ledger, with the company
 * name rather than its id in the Employer column (ADM-09); `view=dues` is
 * the employer-dues table, one row per hired placement (ADM-01).
 *
 * A read, so no CSRF: it works as a plain download link. The session and
 * the role's export permission are checked here.
 */
const MAX_ROWS = 10_000;

const money = (minor: number) => (minor / 100).toFixed(2);
const day = (d: Date | string | null | undefined) => {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : todayIst(t); // the IST calendar day
};

export async function GET(req: Request) {
  const guard = requireRole(req.headers.get("cookie") ?? "", ["admin"]);
  if (!guard.ok) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!allows(guard.session.permissions, EXPORT_PERMISSIONS.payouts ?? null)) {
    return new NextResponse("Your role doesn't include this export. Ask a super admin for access.", { status: 403 });
  }

  const url = new URL(req.url);
  const params = flattenParams(Object.fromEntries(url.searchParams.entries()));

  if (params.view === "dues") {
    const filter = (DUE_FILTERS as readonly string[]).includes(params.due ?? "") ? (params.due as DueFilter) : "all";
    const rows = filterDues(await loadPlacementDues(), filter, params.q ?? "");
    const columns: CsvColumn<PlacementDueRow>[] = [
      { header: "Intern", value: (r) => r.internName },
      { header: "Employer", value: (r) => r.companyName },
      { header: "Project", value: (r) => r.projectName },
      { header: "Start date", value: (r) => r.startDate ?? "" },
      { header: "Months paid", value: (r) => r.paidMonths },
      { header: "Months total", value: (r) => r.months },
      { header: "Monthly stipend (INR)", value: (r) => money(r.monthlyShareMinor) },
      { header: "Total stipend (INR)", value: (r) => money(r.totalShareMinor) },
      { header: "Paid (INR)", value: (r) => money(r.paidMinor) },
      { header: "Due (INR)", value: (r) => money(r.remainingMinor) },
      { header: "Next payment", value: (r) => r.nextDate ?? "" },
      { header: "Payout pending", value: (r) => (r.pending ? "yes" : "no") },
      { header: "Employer months paid", value: (r) => r.employer?.paidMonths ?? "" },
      { header: "Employer due (INR)", value: (r) => (r.employer ? money(r.employer.dueInrMinor) : "") },
    ];
    return csvResponse(toCsv(rows, columns), csvFilename("employer-dues"));
  }

  const sort = (PAYOUT_SORTS as readonly string[]).includes(params.sort ?? "") ? (params.sort as PayoutSort) : "scheduled";
  const { rows } = await loadPayouts(params, { offset: 0, limit: MAX_ROWS + 1, sort, dir: params.dir === "asc" ? "asc" : "desc" });
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `More than ${MAX_ROWS} payouts match. Narrow the filters (dates, status) and export again.` },
      { status: 413 },
    );
  }
  const columns: CsvColumn<PayoutRow>[] = [
    { header: "Intern", value: (r) => r.internName },
    { header: "Email", value: (r) => r.internEmail ?? "" },
    { header: "Employer", value: (r) => r.companyName ?? "" },
    { header: "Project", value: (r) => r.projectName ?? "" },
    { header: "Source", value: (r) => payoutSourceLabel(r.source) },
    { header: "Amount", value: (r) => money(r.amountMinor) },
    { header: "Currency", value: (r) => r.currency },
    { header: "INR value", value: (r) => money(r.inrMinor) },
    { header: "Status", value: (r) => r.status },
    { header: "Method", value: (r) => r.method ?? "" },
    { header: "Reference", value: (r) => r.referenceId ?? "" },
    { header: "Scheduled for", value: (r) => r.scheduledFor ?? "" },
    { header: "Paid at", value: (r) => day(r.paidAt) },
    { header: "Created at", value: (r) => day(r.createdAt) },
    { header: "Role", value: (r) => r.notes ?? "" },
    { header: "Ops note", value: (r) => r.opsNote ?? "" },
  ];
  return csvResponse(toCsv(rows, columns), csvFilename("payouts"));
}
