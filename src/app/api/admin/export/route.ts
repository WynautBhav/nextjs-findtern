import { desc, eq, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { csvFilename, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { flattenParams, parsePageRequest, searchAny } from "@/lib/admin/params";
import { requireRole } from "@/lib/security/guards";

/**
 * Admin CSV export.
 *
 * The export honours the exact filters on screen. This matters: an export that
 * ignores the filter means the person reconciling the file is working from a
 * different population than the person who set the filters, and neither can
 * tell from the file itself.
 *
 * This is a **read**, so it uses `requireRole` rather than `requireMutation` —
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

  if (!readSession(req)) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
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
    default:
      return NextResponse.json({ error: `Unknown export type "${type}"` }, { status: 400 });
  }
}

async function exportInterns(search: string, params: Record<string, string>) {
  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.users.firstName}`,
        sql`${schema.users.lastName}`,
        sql`${schema.users.email}`,
        sql`${schema.users.phoneNumber}`,
      ],
      search,
    ),
    params.status ? eq(schema.users.isActive, params.status === "active") : undefined,
    params.visibility ? eq(schema.users.profileVisibility, params.visibility) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const rows = await db
    .select({
      firstName: schema.users.firstName,
      lastName: schema.users.lastName,
      email: schema.users.email,
      countryCode: schema.users.countryCode,
      phoneNumber: schema.users.phoneNumber,
      isActive: schema.users.isActive,
      visibility: schema.users.profileVisibility,
      createdAt: schema.users.createdAt,
      hasProfile: sql<boolean>`(${schema.internOnboarding.id} is not null)`,
    })
    .from(schema.users)
    .leftJoin(schema.internOnboarding, eq(schema.internOnboarding.userId, schema.users.id))
    .where(where)
    .orderBy(desc(schema.users.createdAt))
    .limit(MAX_ROWS);

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "First name", value: (r) => r.firstName },
    { header: "Last name", value: (r) => r.lastName },
    { header: "Email", value: (r) => r.email },
    { header: "Country code", value: (r) => r.countryCode },
    { header: "Phone", value: (r) => r.phoneNumber },
    { header: "Joined", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
    { header: "Profile complete", value: (r) => (r.hasProfile ? "yes" : "no") },
    { header: "Account", value: (r) => (r.isActive ? "active" : "inactive") },
    { header: "Directory", value: (r) => r.visibility },
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
      ],
      search,
    ),
    params.setup === "complete" ? eq(schema.employers.setupCompleted, true) : undefined,
    params.setup === "incomplete" ? eq(schema.employers.setupCompleted, false) : undefined,
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
    params.status ? eq(schema.projects.status, params.status) : undefined,
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

async function exportProposals(search: string, params: Record<string, string>) {
  const db = getDb();

  const conditions: (SQL | undefined)[] = [
    searchAny(
      [
        sql`${schema.users.email}`,
        sql`${schema.employers.companyName}`,
        sql`${schema.projects.projectName}`,
      ],
      search,
    ),
    params.status ? eq(schema.proposals.status, params.status) : undefined,
    params.flow ? eq(schema.proposals.flowType, params.flow) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const rows = await db
    .select({
      internName: sql<string>`${schema.users.firstName} || ' ' || ${schema.users.lastName}`,
      internEmail: schema.users.email,
      companyName: schema.employers.companyName,
      projectName: schema.projects.projectName,
      status: schema.proposals.status,
      flowType: schema.proposals.flowType,
      createdAt: schema.proposals.createdAt,
      hiredAt: schema.proposals.hiredAt,
    })
    .from(schema.proposals)
    .innerJoin(schema.users, eq(schema.users.id, schema.proposals.internId))
    .innerJoin(schema.employers, eq(schema.employers.id, schema.proposals.employerId))
    .innerJoin(schema.projects, eq(schema.projects.id, schema.proposals.projectId))
    .where(where)
    .orderBy(desc(schema.proposals.createdAt))
    .limit(MAX_ROWS);

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Intern", value: (r) => r.internName },
    { header: "Intern email", value: (r) => r.internEmail },
    { header: "Company", value: (r) => r.companyName },
    { header: "Project", value: (r) => r.projectName },
    { header: "Status", value: (r) => r.status },
    { header: "Flow", value: (r) => r.flowType },
    { header: "Sent", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
    { header: "Hired", value: (r) => (r.hiredAt ? r.hiredAt.toISOString() : "") },
  ];

  return csvResponse(toCsv(rows, columns), csvFilename("proposals"));
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

  const statusFilter = params.status ? eq(schema.employerPayments.status, params.status) : undefined;
  const combined =
    where && statusFilter
      ? sql`${where} and ${statusFilter}`
      : (where ?? statusFilter);

  const rows = await db
    .select({
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
    })
    .from(schema.employerPayments)
    .innerJoin(schema.employers, eq(schema.employers.id, schema.employerPayments.employerId))
    .where(combined)
    .orderBy(desc(schema.employerPayments.createdAt))
    .limit(MAX_ROWS);

  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Order ID", value: (r) => r.orderId },
    { header: "Payment ID", value: (r) => r.paymentId ?? "" },
    { header: "Company", value: (r) => r.companyName },
    { header: "Email", value: (r) => r.companyEmail },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Status", value: (r) => r.status },
    { header: "Gateway", value: (r) => r.gateway },
    { header: "Paid at", value: (r) => (r.paidAt ? r.paidAt.toISOString() : "") },
    { header: "Created at", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
  ];

  return csvResponse(toCsv(rows, columns), csvFilename("payments"));
}
