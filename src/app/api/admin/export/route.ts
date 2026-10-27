import { and, desc, eq, gte, inArray, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { INTERN_SORTS, loadInterns } from "@/lib/admin/intern-query";
import { csvFilename, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { flattenParams, parsePageRequest, periodStart, searchAny } from "@/lib/admin/params";
import { allows, EXPORT_PERMISSIONS } from "@/lib/admin/permissions";
import { activeProject, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { placeOfSupply, splitGst } from "@/lib/gst";
import { dateRangeConditions } from "@/lib/admin/date-range";
import { paymentPromo } from "@/lib/admin/payment-promo";
import { filterProposals, matchesSearch, parseIstDay, proposalTimezone, type TrackerFilters } from "@/lib/admin/tracker";
import { parseOffer } from "@/lib/offer";
import { requireRole } from "@/lib/security/guards";

/**
 * Admin CSV export.
 *
 * The export honours the exact filters on screen. This matters: an export that
 * ignores the filter means the person reconciling the file is working from a
 * different population than the person who set the filters, and neither can
 * tell from the file itself.
 *
 * This is a **read**, so it uses `requireRole` rather than `requireMutation` -
 * it issues no state change and therefore needs no CSRF token. That also keeps
 * it usable as a plain `<a download>`, which is what makes the browser's own
 * "download" affordance work.
 *
 * Hard-capped at 10,000 rows: past that the response stops being a file and
 * starts being a denial of service against the admin's own database.
 */

const MAX_ROWS = 10_000;

/** Both light and dark cookies carry the signed session, so try both. */
function readSession(req: Request) {
  const cookie = req.headers.get("cookie") ?? "";
  const guard = requireRole(cookie, ["admin"]);
  return guard.ok ? guard.session : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? "interns";

  const session = readSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }
  if (!allows(session.permissions, EXPORT_PERMISSIONS[type] ?? null)) {
    return new NextResponse("Your role doesn't include this export. Ask a super admin for access.", { status: 403 });
  }

  const params = flattenParams(Object.fromEntries(url.searchParams.entries()));
  const req2 = parsePageRequest(params);

  switch (type) {
    case "interns":
      return exportInterns(req2.search, params);
    case "companies":
      return exportCompanies(req2.search, params);
    case "projects":
      return exportProjects(req2.search, params);
    case "proposals":
      return exportProposals(req2.search, params);
    case "payments":
      return exportPayments(req2.search, params);
    case "payouts":
      return exportPayouts(req2.search, params);
    case "intern-payments":
      return exportInternPayments(req2.search, params);
    default:
      return NextResponse.json({ error: `Unknown export type "${type}"` }, { status: 400 });
  }
}

async function exportInterns(search: string, params: Record<string, string>) {
  // The list's own query (filters, sort, money facts), only without paging,
  // so the file holds exactly the rows the screen shows.
  const sortKey = INTERN_SORTS.find((k) => k === params.sort) ?? "created";
  const dir: "asc" | "desc" =
    params.dir === "asc" || params.dir === "desc"
      ? params.dir
      : sortKey === "name" || sortKey === "email" || sortKey === "next"
        ? "asc"
        : "desc";
  const { rows } = await loadInterns(params, { search, limit: MAX_ROWS, offset: 0 }, sortKey, dir);
  const rupees = (minor: number | null | undefined) => (minor ? (minor / 100).toFixed(2) : "");

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "First name", value: (r) => r.firstName },
    { header: "Last name", value: (r) => r.lastName },
    { header: "Email", value: (r) => r.email },
    { header: "Joined", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
    { header: "Profile complete", value: (r) => (r.hasProfile ? "yes" : "no") },
    { header: "Account", value: (r) => (r.isActive ? "active" : "inactive") },
    { header: "Directory", value: (r) => r.visibility },
    { header: "Open to work", value: (r) => (r.openToWork ? "yes" : "no") },
    { header: "Review", value: (r) => r.approval ?? "Pending" },
    { header: "AI interview", value: (r) => r.aiStatus },
    { header: "Findtern Score", value: (r) => (r.score != null ? r.score.toFixed(1) : "") },
    { header: "Activation fee", value: (r) => (r.feePaid ? "paid" : "unpaid") },
    { header: "Offer status", value: (r) => r.offerStatus ?? "" },
    { header: "Offer type", value: (r) => (r.hired || r.offerStatus ? (r.fullTime ? "full-time" : "internship") : "") },
    { header: "Hired", value: (r) => (r.hired ? "yes" : "no") },
    { header: "Internship status", value: (r) => r.projectStatus ?? "" },
    { header: "Next payout date", value: (r) => r.money?.nextDate ?? "" },
    { header: "Left to pay (INR)", value: (r) => rupees(r.money?.owedMinor) },
    { header: "Pending payout (INR)", value: (r) => rupees(r.money?.pendingPayoutMinor) },
  ];

  return csvResponse(toCsv(rows, columns), csvFilename("interns"));
}

async function exportCompanies(search: string, params: Record<string, string>) {
  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.employers.companyName}`,
        sql`${schema.employers.companyEmail}`,
        sql`${schema.employers.city}`,
        sql`${schema.employers.primaryContactName}`,
        sql`${schema.employers.country}`,
        sql`${schema.employers.phoneNumber}`,
      ],
      search,
    ),
    realEmployers(),
    params.status ? eq(schema.employers.isActive, params.status === "active") : undefined,
    params.setup === "complete" ? eq(schema.employers.onboardingCompleted, true) : undefined,
    params.setup === "incomplete" ? eq(schema.employers.onboardingCompleted, false) : undefined,
    // Legacy has none / applied / approved; a stored "rejected" reads as none (ADP-03).
    params.fte === "none"
      ? sql`coalesce(nullif(${schema.employers.internationalFteStatus}, ''), 'none') in ('none', 'rejected')`
      : params.fte
        ? eq(schema.employers.internationalFteStatus, params.fte)
        : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const rows = await db
    .select({
      companyName: schema.employers.companyName,
      contactName: schema.employers.name,
      email: schema.employers.companyEmail,
      phone: schema.employers.phoneNumber,
      city: schema.employers.city,
      state: schema.employers.state,
      country: schema.employers.country,
      size: schema.employers.companySize,
      setupCompleted: schema.employers.setupCompleted,
      onboardingCompleted: schema.employers.onboardingCompleted,
      internationalFteStatus: schema.employers.internationalFteStatus,
      isActive: schema.employers.isActive,
      createdAt: schema.employers.createdAt,
    })
    .from(schema.employers)
    .where(where)
    .orderBy(desc(schema.employers.createdAt))
    .limit(MAX_ROWS);

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Company", value: (r) => r.companyName },
    { header: "Contact", value: (r) => r.contactName },
    { header: "Email", value: (r) => r.email },
    { header: "Phone", value: (r) => r.phone },
    { header: "City", value: (r) => r.city },
    { header: "State", value: (r) => r.state },
    { header: "Country", value: (r) => r.country },
    { header: "Size", value: (r) => r.size },
    { header: "Setup complete", value: (r) => (r.setupCompleted ? "yes" : "no") },
    { header: "Onboarding complete", value: (r) => (r.onboardingCompleted ? "yes" : "no") },
    { header: "International FTE", value: (r) => (r.internationalFteStatus && r.internationalFteStatus !== "none" && r.internationalFteStatus !== "rejected" ? r.internationalFteStatus : "") },
    { header: "Account", value: (r) => (r.isActive ? "active" : "inactive") },
    { header: "Joined", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
  ];

  return csvResponse(toCsv(rows, columns), csvFilename("companies"));
}

async function exportProjects(search: string, params: Record<string, string>) {
  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [sql`${schema.projects.projectName}`, sql`${schema.employers.companyName}`],
      search,
    ),
    realEmployerId(schema.projects.employerId),
    // Same rule as the projects list: blank status is active; closed covers
    // legacy "inactive" and "archived" (ADP-13).
    params.status === "active" ? activeProject() : params.status === "closed" ? sql`not ${activeProject()}` : params.status ? eq(schema.projects.status, params.status) : undefined,
    params.ft === "yes" ? eq(schema.projects.fullTimeOffer, true) : undefined,
    params.ft === "no" ? eq(schema.projects.fullTimeOffer, false) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const rows = await db
    .select({
      projectName: schema.projects.projectName,
      companyName: schema.employers.companyName,
      status: schema.projects.status,
      fullTimeOffer: schema.projects.fullTimeOffer,
      locationType: schema.projects.locationType,
      city: schema.projects.city,
      skills: schema.projects.skills,
      createdAt: schema.projects.createdAt,
    })
    .from(schema.projects)
    .innerJoin(schema.employers, eq(schema.employers.id, schema.projects.employerId))
    .where(where)
    .orderBy(desc(schema.projects.createdAt))
    .limit(MAX_ROWS);

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Project", value: (r) => r.projectName },
    { header: "Company", value: (r) => r.companyName },
    { header: "Status", value: (r) => r.status ?? "" },
    { header: "Full-time", value: (r) => (r.fullTimeOffer ? "yes" : "no") },
    { header: "Location type", value: (r) => r.locationType ?? "" },
    { header: "City", value: (r) => r.city ?? "" },
    { header: "Skills", value: (r) => (r.skills ?? []).join("; ") },
    { header: "Posted", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
  ];

  return csvResponse(toCsv(rows, columns), csvFilename("projects"));
}

/**
 * Proposals, with the tracker's own filters (src/lib/admin/tracker.ts): exact
 * company / candidate ids, timezone, IST date range, status, flow, offer type
 * and the word search. Filtered in memory after one bounded query, exactly as
 * the tracker page does, so the file and the screen hold the same rows.
 */
async function exportProposals(search: string, params: Record<string, string>) {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.proposals.id,
      internId: schema.proposals.internId,
      employerId: schema.proposals.employerId,
      internName: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
      internEmail: schema.users.email,
      companyName: schema.employers.companyName,
      projectName: schema.projects.projectName,
      projectTimezone: schema.projects.timezone,
      status: schema.proposals.status,
      flowType: schema.proposals.flowType,
      currency: schema.proposals.currency,
      offerDetails: schema.proposals.offerDetails,
      createdAt: schema.proposals.createdAt,
      hiredAt: schema.proposals.hiredAt,
    })
    .from(schema.proposals)
    .innerJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .innerJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .where(
      and(
        realEmployerId(schema.proposals.employerId),
        params.status ? eq(schema.proposals.status, params.status) : undefined,
        params.flow ? eq(schema.proposals.flowType, params.flow) : undefined,
      ),
    )
    .orderBy(desc(schema.proposals.createdAt))
    .limit(MAX_ROWS);

  const filters: TrackerFilters = {
    from: parseIstDay(params.from),
    to: parseIstDay(params.to, true),
    company: params.company ?? "",
    intern: params.intern ?? "",
    tz: params.tz ?? "",
  };
  const kept = filterProposals(rows, filters).filter((p) => {
    const offer = parseOffer(p.offerDetails, p.currency);
    return (
      matchesSearch([p.internName, p.internEmail, p.companyName, p.projectName, offer.roleTitle], search) &&
      (!params.kind || (params.kind === "fulltime" ? Boolean(offer.fullTime) : !offer.fullTime))
    );
  });

  const columns: CsvColumn<(typeof kept)[number]>[] = [
    { header: "Intern", value: (r) => r.internName },
    { header: "Intern email", value: (r) => r.internEmail },
    { header: "Company", value: (r) => r.companyName },
    { header: "Project", value: (r) => r.projectName },
    { header: "Role", value: (r) => parseOffer(r.offerDetails, r.currency).roleTitle ?? "" },
    { header: "Offer type", value: (r) => (parseOffer(r.offerDetails, r.currency).fullTime ? "full-time" : "internship") },
    { header: "Timezone", value: (r) => proposalTimezone(r) ?? "" },
    { header: "Status", value: (r) => r.status },
    { header: "Flow", value: (r) => r.flowType },
    { header: "Sent", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
    { header: "Hired", value: (r) => (r.hiredAt ? r.hiredAt.toISOString() : "") },
  ];

  return csvResponse(toCsv(kept, columns), csvFilename("proposals"));
}

async function exportPayments(search: string, params: Record<string, string>) {
  const db = getDb();

  const where = searchAny(
    [
      sql`${schema.employerPayments.orderId}`,
      sql`${schema.employerPayments.paymentId}`,
      sql`${schema.employers.companyName}`,
      sql`${schema.employers.companyEmail}`,
    ],
    search,
  );

  const since = periodStart(params.period);
  const parts = [
    where,
    params.status ? eq(schema.employerPayments.status, params.status) : undefined,
    params.currency ? eq(schema.employerPayments.currency, params.currency) : undefined,
    since ? gte(schema.employerPayments.createdAt, since) : undefined,
    // The custom From/To on the ledger (ADM-07).
    ...dateRangeConditions(schema.employerPayments.createdAt, params),
  ].filter(Boolean) as SQL[];
  const combined = parts.length ? sql`${parts.reduce((acc, c) => sql`${acc} and ${c}`)}` : undefined;

  const rows = await db
    .select({
      invoiceNumber: schema.employerPayments.invoiceNumber,
      raw: schema.employerPayments.raw,
      orderId: schema.employerPayments.orderId,
      paymentId: schema.employerPayments.paymentId,
      companyName: schema.employers.companyName,
      companyEmail: schema.employers.companyEmail,
      amountMinor: schema.employerPayments.amountMinor,
      currency: schema.employerPayments.currency,
      status: schema.employerPayments.status,
      gateway: schema.employerPayments.gateway,
      paidAt: schema.employerPayments.paidAt,
      createdAt: schema.employerPayments.createdAt,
      country: schema.employers.country,
      gstin: schema.employers.gstNumber,
      pincode: schema.employers.billingPincode,
      state: schema.employers.state,
    })
    .from(schema.employerPayments)
    .innerJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
    .where(combined)
    .orderBy(desc(schema.employerPayments.createdAt))
    .limit(MAX_ROWS);

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Invoice number", value: (r) => r.invoiceNumber ?? "" },
    { header: "Order ID", value: (r) => r.orderId },
    { header: "Payment ID", value: (r) => r.paymentId ?? "" },
    { header: "Company", value: (r) => r.companyName },
    { header: "Email", value: (r) => r.companyEmail },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    // 18% GST is included in INR amounts; USD (export) carries none.
    { header: "Amount before GST", value: (r) => (gstOf(r).baseMinor / 100).toFixed(2) },
    { header: "GST", value: (r) => ((r.amountMinor - gstOf(r).baseMinor) / 100).toFixed(2) },
    { header: "Discount", value: (r) => (paymentPromo(r.raw, undefined, r.amountMinor).discountMinor / 100).toFixed(2) },
    { header: "Promo code", value: (r) => paymentPromo(r.raw).code ?? "" },
    { header: "Status", value: (r) => r.status },
    { header: "Gateway", value: (r) => r.gateway },
    { header: "Paid at", value: (r) => (r.paidAt ? r.paidAt.toISOString() : "") },
    { header: "Created at", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
  ];

  return csvResponse(toCsv(rows, columns), csvFilename("payments"));
}

function gstOf(r: { amountMinor: number; currency: string; country: string | null; gstin: string | null; pincode: string | null; state: string | null }) {
  return splitGst(r.amountMinor, placeOfSupply({ currency: r.currency, country: r.country, gstin: r.gstin, pincode: r.pincode, state: r.state }));
}

/** Stipend payouts to interns, honouring the payouts page filters. */
async function exportPayouts(search: string, params: Record<string, string>) {
  const db = getDb();
  const since = periodStart(params.period);
  // Company name too, as the payouts list searches it (ADP-27).
  const company = sql`coalesce((select e.company_name from ${schema.employers} e where e.id::text = ${schema.internPayouts.raw}->>'employerId'), '')`;
  const parts = [
    searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`coalesce(${schema.internPayouts.referenceId}, '')`, company], search),
    params.status ? eq(schema.internPayouts.status, params.status) : undefined,
    params.currency ? eq(schema.internPayouts.currency, params.currency) : undefined,
    since ? gte(schema.internPayouts.createdAt, since) : undefined,
    ...dateRangeConditions(schema.internPayouts.createdAt, params),
  ].filter(Boolean) as SQL[];
  const rows = await db
    .select({
      intern: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
      email: schema.users.email,
      amountMinor: schema.internPayouts.amountMinor,
      currency: schema.internPayouts.currency,
      status: schema.internPayouts.status,
      method: schema.internPayouts.method,
      referenceId: schema.internPayouts.referenceId,
      raw: schema.internPayouts.raw,
      notes: schema.internPayouts.notes,
      paidAt: schema.internPayouts.paidAt,
      createdAt: schema.internPayouts.createdAt,
    })
    .from(schema.internPayouts)
    .innerJoin(schema.users, eq(schema.users.id, schema.internPayouts.internId))
    .where(parts.length ? sql`${parts.reduce((acc, c) => sql`${acc} and ${c}`)}` : undefined)
    .orderBy(desc(schema.internPayouts.createdAt))
    .limit(MAX_ROWS);
  const meta = (r: (typeof rows)[number], k: string) => String((r.raw as Record<string, unknown> | null)?.[k] ?? "");
  // The payout stores the employer's id; the file needs the company name (ADM-09).
  const employerIds = [...new Set(rows.map((r) => meta(r, "employerId")).filter(Boolean))];
  const companyName = new Map<string, string>();
  if (employerIds.length) {
    const named = await db
      .select({ id: schema.employers.id, name: schema.employers.companyName })
      .from(schema.employers)
      .where(inArray(schema.employers.id, employerIds));
    for (const e of named) companyName.set(e.id, e.name);
  }
  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Intern", value: (r) => r.intern },
    { header: "Email", value: (r) => r.email },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Status", value: (r) => r.status },
    { header: "Method", value: (r) => r.method ?? "" },
    { header: "Reference", value: (r) => r.referenceId ?? "" },
    { header: "Scheduled for", value: (r) => meta(r, "scheduledFor") },
    { header: "Employer", value: (r) => companyName.get(meta(r, "employerId")) ?? "" },
    { header: "Proposal", value: (r) => meta(r, "proposalId") },
    { header: "Notes", value: (r) => r.notes ?? "" },
    { header: "Paid at", value: (r) => (r.paidAt ? r.paidAt.toISOString() : "") },
    { header: "Created at", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
  ];
  return csvResponse(toCsv(rows, columns), csvFilename("payouts"));
}

/** Intern activation-fee payments. */
async function exportInternPayments(search: string, params: Record<string, string>) {
  const db = getDb();
  const since = periodStart(params.period);
  const parts = [
    searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`${schema.internPayments.orderId}`, sql`${schema.internPayments.paymentId}`, sql`coalesce(${schema.internPayments.invoiceNumber}, '')`], search),
    params.status ? eq(schema.internPayments.status, params.status) : undefined,
    since ? gte(schema.internPayments.createdAt, since) : undefined,
    ...dateRangeConditions(schema.internPayments.createdAt, params),
  ].filter(Boolean) as SQL[];
  const rows = await db
    .select({
      invoiceNumber: schema.internPayments.invoiceNumber,
      onboardingPayment: sql<Record<string, unknown> | null>`${schema.internOnboarding.extraData}->'payment'`,
      intern: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
      email: schema.users.email,
      orderId: schema.internPayments.orderId,
      paymentId: schema.internPayments.paymentId,
      amountMinor: schema.internPayments.amountMinor,
      currency: schema.internPayments.currency,
      status: schema.internPayments.status,
      raw: schema.internPayments.raw,
      paidAt: schema.internPayments.paidAt,
      createdAt: schema.internPayments.createdAt,
    })
    .from(schema.internPayments)
    .innerJoin(schema.users, eq(schema.users.id, schema.internPayments.internId))
    .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.internPayments.internId))
    .where(parts.length ? sql`${parts.reduce((acc, c) => sql`${acc} and ${c}`)}` : undefined)
    .orderBy(desc(schema.internPayments.createdAt))
    .limit(MAX_ROWS);
  const promoOf = (r: (typeof rows)[number]) => paymentPromo(r.raw, r.onboardingPayment, r.amountMinor);
  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Invoice number", value: (r) => r.invoiceNumber ?? "" },
    { header: "Intern", value: (r) => r.intern },
    { header: "Email", value: (r) => r.email },
    { header: "Order ID", value: (r) => r.orderId },
    { header: "Payment ID", value: (r) => r.paymentId ?? "" },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    // Interns are billed in India with GST included; no state is known, so IGST.
    { header: "Amount before GST", value: (r) => (splitGst(r.amountMinor, placeOfSupply({ currency: r.currency })).baseMinor / 100).toFixed(2) },
    { header: "GST", value: (r) => ((r.amountMinor - splitGst(r.amountMinor, placeOfSupply({ currency: r.currency })).baseMinor) / 100).toFixed(2) },
    // Legacy keeps the code in the order notes or on the onboarding row (ADM-02).
    { header: "Discount", value: (r) => (promoOf(r).discountMinor / 100).toFixed(2) },
    { header: "Promo code", value: (r) => promoOf(r).code ?? "" },
    { header: "Status", value: (r) => r.status },
    { header: "Paid at", value: (r) => (r.paidAt ? r.paidAt.toISOString() : "") },
    { header: "Created at", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
  ];
  return csvResponse(toCsv(rows, columns), csvFilename("intern-payments"));
}
