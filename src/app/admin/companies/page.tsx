import Link from "next/link";
import { and, count, desc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { Building2, CheckCircle2, Briefcase, FileCheck, Download } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { companyMoney } from "@/lib/admin/company-money";
import { flattenParams, parsePageRequest, searchAny, toPage } from "@/lib/admin/params";
import { activeProject, realEmployerId, realEmployers } from "@/lib/admin/scope";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { DataTable } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";

export default async function AdminCompaniesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);

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
      req.search,
    ),
    // The internal "admin" and AI-interview employers are not companies.
    realEmployers(),
    params.status ? eq(schema.employers.isActive, params.status === "active") : undefined,
    // Legacy status: Complete = onboarded (first project created), Pending = not yet.
    params.setup === "complete" ? eq(schema.employers.onboardingCompleted, true) : undefined,
    params.setup === "incomplete" ? eq(schema.employers.onboardingCompleted, false) : undefined,
    params.fte ? eq(schema.employers.internationalFteStatus, params.fte) : undefined,
  ].filter(Boolean) as SQL[];

  const where = conditions.length
    ? sql`${conditions.reduce((acc, c) => sql`${acc} and ${c}`)}`
    : undefined;

  const projectCountSubquery = sql<number>`(
    select count(*)::int from ${schema.projects} p where p.employer_id = ${schema.employers.id}
  )`;

  const [
    rows,
    [totalRow],
    [totalCompaniesMetric],
    [setupCompleteMetric],
    [activeProjectsMetric],
    [gstRegisteredMetric],
  ] = await Promise.all([
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
        companySize: schema.employers.companySize,
        primaryContactName: schema.employers.primaryContactName,
        primaryContactRole: schema.employers.primaryContactRole,
        gstNumber: schema.employers.gstNumber,
        onboardingCompleted: schema.employers.onboardingCompleted,
        internationalFteStatus: schema.employers.internationalFteStatus,
        isActive: schema.employers.isActive,
        createdAt: schema.employers.createdAt,
        projectCount: projectCountSubquery,
      })
      .from(schema.employers)
      .where(where)
      .orderBy(desc(schema.employers.createdAt))
      .limit(req.perPage)
      .offset(req.offset),
    db.select({ c: count() }).from(schema.employers).where(where),
    db.select({ c: count() }).from(schema.employers).where(realEmployers()),
    db.select({ c: count() }).from(schema.employers).where(sql`${realEmployers()} and ${schema.employers.onboardingCompleted} = true`),
    db.select({ c: count() }).from(schema.projects).where(sql`${activeProject()} and ${realEmployerId(schema.projects.employerId)}`),
    db.select({ c: count() }).from(schema.employers).where(sql`${realEmployers()} and ${schema.employers.gstNumber} is not null`),
  ]);

  // Money columns for this page only: what each company paid last, what it
  // still owes and when the next payment is due.
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

  const page = toPage(rows, Number(totalRow?.c ?? 0), req.page, req.perPage);
  const totalCount = Number(totalCompaniesMetric?.c ?? 0);
  const setupCount = Number(setupCompleteMetric?.c ?? 0);
  const activeProjectsCount = Number(activeProjectsMetric?.c ?? 0);
  const gstCount = Number(gstRegisteredMetric?.c ?? 0);

  const exportHref = `/api/admin/export?type=companies&${new URLSearchParams(params).toString()}`;

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Hiring Partners"
        subtitle="Directory of hiring partners, organizational profiles and projects."
        action={
          <a
            href={exportHref}
            className="apple-spring apple-pressable inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-[14px] font-medium text-ink-700 hover:bg-ink-50"
          >
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        }
      />

      <StatGrid cols={4}>
        <StatCard
          label="Registered companies"
          value={formatNumber(totalCount)}
          hint="Total employer accounts"
          icon={Building2}
          tone="brand"
        />
        <StatCard
          label="Onboarding completed"
          value={formatNumber(setupCount)}
          hint={`${totalCount > 0 ? Math.round((setupCount / totalCount) * 100) : 0}% completion rate`}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Active projects"
          value={formatNumber(activeProjectsCount)}
          hint="Currently accepting applicants"
          icon={Briefcase}
          tone="info"
          href="/admin/projects"
        />
        <StatCard
          label="Tax verified"
          value={formatNumber(gstCount)}
          hint="Registered GST records"
          icon={FileCheck}
          tone="accent"
        />
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
        caption="Registered employers directory"
        searchPlaceholder="Search company, contact, phone, or location…"
        filters={[
          {
            key: "status",
            label: "Status",
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
              { value: "applied", label: "Applied" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Declined" },
            ],
          },
        ]}
        columns={[
          {
            header: "Company",
            cell: (row) => (
              <Link
                href={`/admin/companies/${row.id}`}
                className="group flex items-center gap-2.5"
              >
                <span
                  aria-hidden
                  className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-xs font-semibold text-brand-700 transition group-hover:bg-brand-100"
                >
                  {row.companyName.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink-900 group-hover:text-brand-700 group-hover:underline">
                    {row.companyName}
                  </p>
                  <p className="truncate text-xs text-text-subtle">
                    {row.city ? `${row.city}${row.state ? `, ${row.state}` : ""}` : "Location unlisted"}
                  </p>
                </div>
              </Link>
            ),
          },
          {
            header: "Primary contact",
            cell: (row) => (
              <div className="min-w-0">
                <p className="truncate font-medium text-ink-800">
                  {row.primaryContactName || row.name || "Unassigned"}
                </p>
                <p className="truncate text-xs text-text-subtle">{row.companyEmail}</p>
              </div>
            ),
          },
          {
            header: "Phone",
            cell: (row) => (
              <span className="text-xs text-ink-700 tabular-nums">
                {row.countryCode} {row.phoneNumber}
              </span>
            ),
          },
          {
            header: "Projects",
            align: "right",
            cell: (row) => (
              <span className="font-semibold text-ink-800 tabular-nums">
                {row.projectCount}
              </span>
            ),
          },
          {
            header: "Last payment",
            cell: (row) => {
              const m = money.get(row.id);
              return m?.lastPaymentAt ? (
                <div className="text-xs tabular-nums">
                  <p className="font-medium text-ink-800">{formatMoney(m.lastPaymentInrMinor ?? 0, "INR")}</p>
                  <p className="text-text-subtle">{formatDate(m.lastPaymentAt)}</p>
                </div>
              ) : (
                <span className="text-[13px] text-text-subtle">None</span>
              );
            },
          },
          {
            header: "Next due",
            cell: (row) => {
              const due = money.get(row.id)?.nextDueDate;
              return due ? (
                <span className="text-xs tabular-nums text-ink-700">{formatDate(due)}</span>
              ) : (
                <span className="text-[13px] text-text-subtle">None</span>
              );
            },
          },
          {
            header: "Amount left",
            align: "right",
            cell: (row) => {
              const left = money.get(row.id)?.amountLeftInrMinor ?? 0;
              return left > 0 ? (
                <span className="font-semibold tabular-nums text-ink-800">{formatMoney(left, "INR")}</span>
              ) : (
                <span className="text-[13px] text-text-subtle">Nothing due</span>
              );
            },
          },
          {
            header: "GST status",
            cell: (row) =>
              row.gstNumber ? (
                <span className="font-mono text-xs text-ink-700">{row.gstNumber}</span>
              ) : (
                <span className="text-[13px] text-text-subtle">Unlisted</span>
              ),
          },
          {
            header: "Onboarding",
            cell: (row) => (
              <StatusBadge
                tone={row.onboardingCompleted ? "success" : "warning"}
                label={row.onboardingCompleted ? "Complete" : "Pending"}
              />
            ),
          },
          {
            header: "International FTE",
            cell: (row) =>
              row.internationalFteStatus && row.internationalFteStatus !== "none" ? (
                <StatusBadge value={row.internationalFteStatus} />
              ) : (
                <span className="text-[13px] text-text-subtle">None</span>
              ),
          },
          {
            header: "Account",
            cell: (row) => <StatusBadge value={row.isActive ? "active" : "inactive"} />,
          },
          {
            header: "Joined",
            cell: (row) => (
              <span className="text-xs text-text-subtle">
                {row.createdAt ? formatDate(row.createdAt.toISOString()) : "None"}
              </span>
            ),
          },
          {
            header: "Action",
            align: "right",
            cell: (row) => (
              <Link
                href={`/admin/companies/${row.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-sand-300 bg-sand-50/80 px-2.5 py-1 text-xs font-medium text-ink-700 transition hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                View 360
              </Link>
            ),
          },
        ]}
      />
    </div>
  );
}
