import Link from "next/link";
import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { companyMoney } from "@/lib/admin/company-money";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { activeProject, inrMinorSql, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable, parseSort } from "@/components/admin/data-table";
import { CompanyActiveToggle, CompanyFteSelect } from "@/components/admin/company-controls";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor } from "@/components/ui/button";

/**
 * Companies (legacy admin-companies.tsx). Money per company is computed for
 * the rows on screen; counts and paid totals are SQL so they can be sorted
 * (ADP-09). Account status and International FTE are edited in the row.
 */

const SORTS = ["name", "joined", "country", "projects", "proposals", "hires", "paid"] as const;

const projectCount = sql<number>`(select count(*)::int from ${schema.projects} p where p.employer_id = ${q(schema.employers, schema.employers.id)})`;
const proposalCount = sql<number>`(select count(*)::int from ${schema.proposals} p where p.employer_id = ${q(schema.employers, schema.employers.id)})`;
const hireCount = sql<number>`(select count(*)::int from ${schema.proposals} p where p.employer_id = ${q(schema.employers, schema.employers.id)} and p.status = 'hired')`;
const paidTotal = sql<number>`(select coalesce(sum(${inrMinorSql(sql`ep.amount_minor`, sql`ep.currency`)}), 0)::bigint from ${schema.employerPayments} ep where ep.employer_id = ${q(schema.employers, schema.employers.id)} and ep.status = 'paid')`;

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const sort = parseSort(params, SORTS, { key: "joined", dir: "desc" });

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
      req.search,
    ),
    // The internal "admin" and AI-interview employers are not companies.
    realEmployers(),
    params.status ? eq(schema.employers.isActive, params.status === "active") : undefined,
    // Legacy status: Complete = onboarded (first project created), Pending = not yet.
    params.setup === "complete" ? eq(schema.employers.onboardingCompleted, true) : undefined,
    params.setup === "incomplete" ? eq(schema.employers.onboardingCompleted, false) : undefined,
    // "none" also covers the "rejected" an earlier build wrote (ADP-03).
    params.fte === "none"
      ? sql`coalesce(${schema.employers.internationalFteStatus}, 'none') not in ('applied', 'approved')`
      : params.fte
        ? eq(schema.employers.internationalFteStatus, params.fte)
        : undefined,
  ];
  const where = and(...conditions.filter((c): c is SQL => Boolean(c)));

  const sortExpr: Record<(typeof SORTS)[number], SQL> = {
    name: sql`lower(${schema.employers.companyName})`,
    joined: sql`${schema.employers.createdAt}`,
    country: sql`lower(coalesce(${schema.employers.country}, ''))`,
    projects: projectCount,
    proposals: proposalCount,
    hires: hireCount,
    paid: paidTotal,
  };
  const order = sort.dir === "asc" ? asc(sortExpr[sort.key]) : desc(sortExpr[sort.key]);

  const db = getDb();
  let loaded;
  try {
    const [rows, [totalRow], [totalCompanies], [setupComplete], [activeProjects], [withHires]] = await Promise.all([
      db
        .select({
          id: schema.employers.id,
          name: schema.employers.name,
          companyName: schema.employers.companyName,
          companyEmail: schema.employers.companyEmail,
          countryCode: schema.employers.countryCode,
          phoneNumber: schema.employers.phoneNumber,
          city: schema.employers.city,
          state: schema.employers.state,
          country: schema.employers.country,
          primaryContactName: schema.employers.primaryContactName,
          gstNumber: schema.employers.gstNumber,
          onboardingCompleted: schema.employers.onboardingCompleted,
          internationalFteStatus: schema.employers.internationalFteStatus,
          isActive: schema.employers.isActive,
          createdAt: schema.employers.createdAt,
          projectCount,
          proposalCount,
          hireCount,
          paidTotal,
        })
        .from(schema.employers)
        .where(where)
        .orderBy(order, desc(schema.employers.createdAt))
        .limit(req.perPage)
        .offset(req.offset),
      db.select({ c: count() }).from(schema.employers).where(where),
      db.select({ c: count() }).from(schema.employers).where(realEmployers()),
      db.select({ c: count() }).from(schema.employers).where(and(realEmployers(), eq(schema.employers.onboardingCompleted, true))),
      db.select({ c: count() }).from(schema.projects).where(and(activeProject(), realEmployerId(schema.projects.employerId))),
      db
        .select({ c: sql<number>`count(distinct ${schema.proposals.employerId})` })
        .from(schema.proposals)
        .where(and(eq(schema.proposals.status, "hired"), realEmployerId(schema.proposals.employerId))),
    ]);

    // Money columns for this page only: what each company still owes and when.
    const pageIds = rows.map((r) => r.id);
    const [moneyProposals, moneyPayments] = pageIds.length
      ? await Promise.all([
          db
            .select({
              id: schema.proposals.id,
              employerId: schema.proposals.employerId,
              internId: schema.proposals.internId,
              status: schema.proposals.status,
              offerDetails: schema.proposals.offerDetails,
              currency: schema.proposals.currency,
            })
            .from(schema.proposals)
            .where(and(inArray(schema.proposals.employerId, pageIds), inArray(schema.proposals.status, ["accepted", "processing", "hired"]))),
          db
            .select({
              employerId: schema.employerPayments.employerId,
              status: schema.employerPayments.status,
              amountMinor: schema.employerPayments.amountMinor,
              currency: schema.employerPayments.currency,
              paidAt: schema.employerPayments.paidAt,
              createdAt: schema.employerPayments.createdAt,
              raw: schema.employerPayments.raw,
            })
            .from(schema.employerPayments)
            .where(and(inArray(schema.employerPayments.employerId, pageIds), eq(schema.employerPayments.status, "paid"))),
        ])
      : [[], []];
    const internIds = [...new Set(moneyProposals.map((p) => p.internId))];
    const scoreRows = internIds.length
      ? await db
          .select({ userId: schema.internOnboarding.userId, extraData: schema.internOnboarding.extraData })
          .from(schema.internOnboarding)
          .where(inArray(schema.internOnboarding.userId, internIds))
      : [];
    const scores = new Map(
      scoreRows.map((r) => [r.userId, Number(((r.extraData ?? {}) as Record<string, unknown>).findternScore) || 0]),
    );
    const money = companyMoney(pageIds, moneyProposals, moneyPayments, (id) => scores.get(id) ?? 0);

    loaded = {
      rows,
      money,
      total: Number(totalRow?.c ?? 0),
      totalCompanies: Number(totalCompanies?.c ?? 0),
      setupComplete: Number(setupComplete?.c ?? 0),
      activeProjects: Number(activeProjects?.c ?? 0),
      withHires: Number(withHires?.c ?? 0),
    };
  } catch (error) {
    console.error("[admin/companies]", error);
    loaded = null;
  }

  const exportHref = `/api/admin/export?type=companies&${new URLSearchParams(params).toString()}`;
  const header = (
    <AdminPageHeader
      title="Companies"
      subtitle="Every hiring company: who to contact, what they've posted, what they've paid and what they still owe."
      action={
        <ButtonAnchor href={exportHref} variant="outline" size="sm">
          <Download className="size-4" aria-hidden />
          Export CSV
        </ButtonAnchor>
      }
    />
  );

  if (!loaded) {
    return (
      <div className="space-y-6">
        {header}
        <Panel>
          <AdminLoadError what="the company list" retryHref="/admin/companies" />
        </Panel>
      </div>
    );
  }

  const { rows, money } = loaded;
  const page = toPage(rows, loaded.total, req.page, req.perPage);

  return (
    <div className="space-y-6">
      {header}

      <StatGrid cols={4}>
        <StatCard label="Companies" value={formatNumber(loaded.totalCompanies)} hint="Employer accounts, test accounts excluded" tone="neutral" />
        <StatCard
          label="Onboarded"
          value={formatNumber(loaded.setupComplete)}
          hint={`${loaded.totalCompanies > 0 ? Math.round((loaded.setupComplete / loaded.totalCompanies) * 100) : 0}% have posted a first project`}
          tone="neutral"
          href="/admin/companies?setup=complete"
        />
        <StatCard label="Active projects" value={formatNumber(loaded.activeProjects)} hint="Open to candidates now" tone="neutral" href="/admin/projects?status=active" />
        <StatCard label="Companies that hired" value={formatNumber(loaded.withHires)} hint="At least one paid hire" tone="neutral" href="/admin/companies?sort=hires&dir=desc" />
      </StatGrid>

      <DataTable
        basePath="/admin/companies"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={rows}
        noun="companies"
        caption="Hiring companies"
        searchPlaceholder="Search company, contact, phone, city or country…"
        empty={
          req.search || params.status || params.setup || params.fte
            ? { title: "No company matches", body: "Nothing matches this search and these filters. Clear a filter to widen it.", action: { href: "/admin/companies", label: "Clear filters" } }
            : { title: "No companies yet", body: "Companies appear here as soon as an employer signs up." }
        }
        filters={[
          {
            key: "status",
            label: "Account",
            options: [
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ],
          },
          {
            key: "setup",
            label: "Onboarding",
            options: [
              { value: "complete", label: "Complete" },
              { value: "incomplete", label: "Pending" },
            ],
          },
          {
            key: "fte",
            label: "International FTE",
            options: [
              { value: "none", label: "Not approved" },
              { value: "applied", label: "Applied" },
              { value: "approved", label: "Approved" },
            ],
          },
        ]}
        columns={[
          {
            header: "Company",
            sort: "name",
            cell: (row) => (
              <Link href={`/admin/companies/${row.id}`} className="group block min-w-0 max-w-64">
                <p className="truncate font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">{row.companyName}</p>
                <p className="truncate text-xs text-ink-600">{row.primaryContactName || row.name || row.companyEmail}</p>
              </Link>
            ),
          },
          {
            header: "Location",
            sort: "country",
            cell: (row) => (
              <div className="min-w-0 max-w-44">
                <p className="truncate">{row.country || "-"}</p>
                {row.city ? <p className="truncate text-xs text-ink-600">{[row.city, row.state].filter(Boolean).join(", ")}</p> : null}
              </div>
            ),
          },
          {
            header: "Phone",
            cell: (row) => (
              <span className="nums whitespace-nowrap">
                {row.countryCode} {row.phoneNumber}
              </span>
            ),
          },
          { header: "Projects", sort: "projects", align: "right", cell: (row) => row.projectCount },
          { header: "Proposals", sort: "proposals", align: "right", cell: (row) => row.proposalCount },
          { header: "Hires", sort: "hires", align: "right", cell: (row) => row.hireCount },
          {
            header: "Billed",
            align: "right",
            cell: (row) => {
              const billed = Number(row.paidTotal) + (money.get(row.id)?.amountLeftInrMinor ?? 0);
              return billed > 0 ? formatMoney(billed, "INR") : <span className="text-text-subtle">-</span>;
            },
          },
          {
            header: "Paid",
            sort: "paid",
            align: "right",
            cell: (row) => {
              const m = money.get(row.id);
              return Number(row.paidTotal) > 0 ? (
                <div>
                  <p className="font-medium text-ink-900">{formatMoney(Number(row.paidTotal), "INR")}</p>
                  {m?.lastPaymentAt ? <p className="text-xs text-ink-600">last {formatDate(m.lastPaymentAt)}</p> : null}
                </div>
              ) : (
                <span className="text-text-subtle">-</span>
              );
            },
          },
          {
            header: "Still due",
            align: "right",
            cell: (row) => {
              const m = money.get(row.id);
              return m && m.amountLeftInrMinor > 0 ? (
                <div>
                  <p className="font-semibold text-ink-900">{formatMoney(m.amountLeftInrMinor, "INR")}</p>
                  {m.nextDueDate ? <p className="text-xs text-ink-600">next {formatDate(m.nextDueDate)}</p> : null}
                </div>
              ) : (
                <span className="text-text-subtle">Nothing</span>
              );
            },
          },
          {
            header: "Onboarding",
            cell: (row) => <StatusBadge tone={row.onboardingCompleted ? "success" : "warning"} label={row.onboardingCompleted ? "Complete" : "Pending"} />,
          },
          {
            header: "International FTE",
            cell: (row) => <CompanyFteSelect id={row.id} value={row.internationalFteStatus} />,
          },
          {
            header: "Account",
            cell: (row) => <CompanyActiveToggle id={row.id} isActive={row.isActive} />,
          },
          { header: "Joined", sort: "joined", cell: (row) => <span className="nums whitespace-nowrap">{formatDate(row.createdAt)}</span> },
        ]}
      />
    </div>
  );
}
