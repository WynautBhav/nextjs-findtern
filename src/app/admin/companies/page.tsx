import { and, asc, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { q } from "@/lib/college/sql";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { companyMoney } from "@/lib/admin/company-money";
import { flattenParams, parsePageRequest, searchAny, toPage, toQueryString } from "@/lib/admin/params";
import { activeProject, inrMinorSql, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, parseSort } from "@/components/admin/data-table";
import { CompanyActiveToggle, CompanyFteSelect } from "@/components/admin/company-controls";
import { getSession } from "@/lib/auth";
import { fteOf } from "@/lib/admin/fte";
import { canWrite } from "@/lib/admin/permissions";
import { StatusBadge } from "@/components/admin/status-badge";
import { ButtonAnchor } from "@/components/ui/button";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";

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
  const mayWrite = canWrite((await getSession())?.permissions, "/admin/companies");
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
              hiredAt: schema.proposals.hiredAt,
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
  const headerWith = (subtitle?: string) => (
    <AdminPageHeader
      title="Companies"
      subtitle={subtitle}
      action={
        <ButtonAnchor href={exportHref} variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
          <Download className="size-4" aria-hidden />
          Export CSV
        </ButtonAnchor>
      }
    />
  );

  const header = headerWith();
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

  // Onboarding is a set of views (the counts were stat tiles); the rest stay filters.
  const viewHref = (setup: string) => `/admin/companies${toQueryString({ ...params, setup, page: "" })}`;
  const views: AdminTabItem[] = [
    { key: "", label: "All companies", count: loaded.totalCompanies, href: viewHref("") },
    { key: "complete", label: "Onboarded", count: loaded.setupComplete, href: viewHref("complete") },
    { key: "incomplete", label: "Onboarding pending", count: Math.max(0, loaded.totalCompanies - loaded.setupComplete), href: viewHref("incomplete") },
  ];
  const activeView = params.setup === "complete" || params.setup === "incomplete" ? params.setup : "";

  return (
    <div className="space-y-4">
      {headerWith(
        `${formatNumber(loaded.totalCompanies)} companies, ${formatNumber(loaded.withHires)} have hired and ${formatNumber(loaded.activeProjects)} projects are open to candidates.`,
      )}

      <AdminTabs items={views} active={activeView} label="Company views" />

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
        searchPlaceholder="Search company, contact, phone or city…"
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
            // Contact and place ride in the sub line (the table had 13 columns); phone is its tooltip.
            header: "Company",
            sort: "name",
            cell: (row) => {
              const where = [row.city, row.country].filter(Boolean).join(", ");
              const sub = [row.primaryContactName || row.name || row.companyEmail, where].filter(Boolean).join(" · ");
              const phone = `${row.countryCode ?? ""} ${row.phoneNumber ?? ""}`.trim();
              return (
                <div className="min-w-0 lg:max-w-72">
                  <IdentityCell
                    name={row.companyName}
                    id={row.id}
                    href={`/admin/companies/${row.id}`}
                    sub={<span title={[sub, phone].filter(Boolean).join(" · ")}>{sub}</span>}
                  />
                  {row.onboardingCompleted ? null : (
                    <div className="mt-1.5 pl-[3.25rem]">
                      <StatusBadge tone="warning" label="Onboarding" dot={false} className="h-5" />
                    </div>
                  )}
                </div>
              );
            },
          },
          { header: "Projects", sort: "projects", align: "right", cell: (row) => row.projectCount },
          { header: "Proposals", sort: "proposals", align: "right", cell: (row) => row.proposalCount },
          { header: "Hires", sort: "hires", align: "right", cell: (row) => row.hireCount },
          {
            header: "Paid",
            sort: "paid",
            align: "right",
            cell: (row) => {
              const m = money.get(row.id);
              return Number(row.paidTotal) > 0 ? (
                <div>
                  <p className="font-medium text-ink-900">{formatMoney(Number(row.paidTotal), "INR")}</p>
                  {m?.lastPaymentAt ? <p className="text-xs text-text-subtle">last {formatDate(m.lastPaymentAt)}</p> : null}
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
                  {m.nextDueDate ? <p className="text-xs text-text-subtle">next {formatDate(m.nextDueDate)}</p> : null}
                </div>
              ) : (
                <span className="text-text-subtle">–</span>
              );
            },
          },
          {
            header: "Account",
            cell: (row) => (mayWrite ? <CompanyActiveToggle id={row.id} isActive={row.isActive} compact /> : <span>{row.isActive ? "Active" : "Inactive"}</span>),
          },
          {
            header: "International FTE",
            cell: (row) => (mayWrite ? <CompanyFteSelect id={row.id} value={row.internationalFteStatus} pill /> : <span>{{ none: "Not approved", applied: "Applied", approved: "Approved" }[fteOf(row.internationalFteStatus)]}</span>),
          },
          {
            header: "Joined",
            sort: "joined",
            cell: (row) => <span className="nums whitespace-nowrap text-text-subtle">{formatDate(row.createdAt)}</span>,
          },
        ]}
      />
    </div>
  );
}
