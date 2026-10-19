import { desc, eq, gte, sql, type SQL } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb, schema } from "@/lib/db";
import { csvFilename, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { flattenParams, parsePageRequest, periodStart, searchAny } from "@/lib/admin/params";
import { allows, EXPORT_PERMISSIONS } from "@/lib/admin/permissions";
import { aiInterviewStatus, findternScoreSql, meaningfulProfile, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { placeOfSupply, splitGst } from "@/lib/gst";
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
  const db = getDb();

  // Same filters as the intern list, so the file matches the screen.
  const profileFilled = meaningfulProfile();
  const aiStatus = aiInterviewStatus();
  const openToWork = sql<boolean>`coalesce(${schema.internOnboarding.extraData}->>'openToWork', 'true') <> 'false'`;
  const conditions: (SQL | undefined)[] = [
    eq(schema.users.role, "intern"),
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
    params.visibility === "intern_hidden"
      ? sql`not ${openToWork}`
      : params.visibility
        ? eq(schema.users.profileVisibility, params.visibility)
        : undefined,
    params.profile === "complete" ? profileFilled : undefined,
    params.profile === "incomplete" ? sql`not ${profileFilled}` : undefined,
    params.ai ? sql`${aiStatus} = ${params.ai}` : undefined,
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
      hasProfile: profileFilled,
      openToWork,
      aiStatus,
      score: findternScoreSql(),
      offers: sql<number>`(select count(*)::int from ${schema.proposals} p where p.intern_id = ${schema.users.id})`,
      hired: sql<number>`(select count(*)::int from ${schema.proposals} p where p.intern_id = ${schema.users.id} and p.status = 'hired')`,
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
    { header: "Open to work", value: (r) => (r.openToWork ? "yes" : "no") },
    { header: "AI interview", value: (r) => r.aiStatus },
    { header: "Findtern Score", value: (r) => (r.score != null ? r.score.toFixed(1) : "") },
    { header: "Offers", value: (r) => String(r.offers) },
    { header: "Hired", value: (r) => String(r.hired) },
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
    params.fte ? eq(schema.employers.internationalFteStatus, params.fte) : undefined,
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
    { header: "International FTE", value: (r) => (r.internationalFteStatus && r.internationalFteStatus !== "none" ? r.internationalFteStatus : "") },
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
    realEmployerId(schema.proposals.employerId),
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

  const since = periodStart(params.period);
  const parts = [
    where,
    params.status ? eq(schema.employerPayments.status, params.status) : undefined,
    params.currency ? eq(schema.employerPayments.currency, params.currency) : undefined,
    since ? gte(schema.employerPayments.createdAt, since) : undefined,
  ].filter(Boolean) as SQL[];
  const combined = parts.length ? sql`${parts.reduce((acc, c) => sql`${acc} and ${c}`)}` : undefined;

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
    { header: "Order ID", value: (r) => r.orderId },
    { header: "Payment ID", value: (r) => r.paymentId ?? "" },
    { header: "Company", value: (r) => r.companyName },
    { header: "Email", value: (r) => r.companyEmail },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    // 18% GST is included in INR amounts; USD (export) carries none.
    { header: "Amount before GST", value: (r) => (gstOf(r).baseMinor / 100).toFixed(2) },
    { header: "GST", value: (r) => ((r.amountMinor - gstOf(r).baseMinor) / 100).toFixed(2) },
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
  const parts = [
    searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`${schema.internPayouts.referenceId}`], search),
    params.status ? eq(schema.internPayouts.status, params.status) : undefined,
    params.currency ? eq(schema.internPayouts.currency, params.currency) : undefined,
    since ? gte(schema.internPayouts.createdAt, since) : undefined,
    params.from && !Number.isNaN(Date.parse(params.from)) ? gte(schema.internPayouts.createdAt, new Date(params.from)) : undefined,
    params.to && !Number.isNaN(Date.parse(params.to))
      ? sql`${schema.internPayouts.createdAt} < ${new Date(Date.parse(params.to) + 86_400_000)}`
      : undefined,
    params.q ? searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`${schema.internPayouts.referenceId}`], params.q) : undefined,
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
  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Intern", value: (r) => r.intern },
    { header: "Email", value: (r) => r.email },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    { header: "Status", value: (r) => r.status },
    { header: "Method", value: (r) => r.method ?? "" },
    { header: "Reference", value: (r) => r.referenceId ?? "" },
    { header: "Scheduled for", value: (r) => meta(r, "scheduledFor") },
    { header: "Employer", value: (r) => meta(r, "employerId") },
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
    searchAny([sql`${schema.users.firstName}`, sql`${schema.users.lastName}`, sql`${schema.users.email}`, sql`${schema.internPayments.orderId}`], search),
    params.status ? eq(schema.internPayments.status, params.status) : undefined,
    since ? gte(schema.internPayments.createdAt, since) : undefined,
  ].filter(Boolean) as SQL[];
  const rows = await db
    .select({
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
    .where(parts.length ? sql`${parts.reduce((acc, c) => sql`${acc} and ${c}`)}` : undefined)
    .orderBy(desc(schema.internPayments.createdAt))
    .limit(MAX_ROWS);
  const columns: CsvColumn<(typeof rows)[number]>[] = [
    { header: "Intern", value: (r) => r.intern },
    { header: "Email", value: (r) => r.email },
    { header: "Order ID", value: (r) => r.orderId },
    { header: "Payment ID", value: (r) => r.paymentId ?? "" },
    { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
    { header: "Currency", value: (r) => r.currency },
    // Interns are billed in India with GST included; no state is known, so IGST.
    { header: "Amount before GST", value: (r) => (splitGst(r.amountMinor, placeOfSupply({ currency: r.currency })).baseMinor / 100).toFixed(2) },
    { header: "GST", value: (r) => ((r.amountMinor - splitGst(r.amountMinor, placeOfSupply({ currency: r.currency })).baseMinor) / 100).toFixed(2) },
    { header: "Promo code", value: (r) => String((r.raw as Record<string, unknown> | null)?.promoCode ?? "") },
    { header: "Status", value: (r) => r.status },
    { header: "Paid at", value: (r) => (r.paidAt ? r.paidAt.toISOString() : "") },
    { header: "Created at", value: (r) => (r.createdAt ? r.createdAt.toISOString() : "") },
  ];
  return csvResponse(toCsv(rows, columns), csvFilename("intern-payments"));
}
