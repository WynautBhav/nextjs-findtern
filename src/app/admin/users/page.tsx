import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { getSession } from "@/lib/auth";
import { allows } from "@/lib/admin/permissions";
import { flattenParams, parsePageRequest, toPage, toQueryString } from "@/lib/admin/params";
import { accountViews } from "@/lib/admin/account-views";
import { loadAccounts, USER_SORTS, type AccountRow, type UserSort } from "@/lib/admin/users-list";
import { formatDate } from "@/lib/format";
import { AdminLoadError, AdminPageHeader, PageLead } from "@/components/admin/panel";
import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, type Column } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { AccountActiveCell } from "@/components/admin/intern-row-controls";
import { ADMIN_SURFACE } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Registered Users",
  robots: { index: false, follow: false },
};

const KIND_LABEL = { intern: "Candidate", employer: "Company", admin: "Staff" } as const;

/**
 * Every account that can sign in, in one list. Candidates and companies can
 * be activated or deactivated in the row; staff accounts are managed on
 * Roles and Access and are only listed for people who manage staff
 * (roles:write) - users:read alone is about candidates and companies.
 */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const session = await getSession();
  const showStaff = allows(session?.permissions, ["roles:write"]);
  const canWrite = allows(session?.permissions, ["interns:write"]);
  const canWriteCompanies = allows(session?.permissions, ["companies:write"]);
  const sort: UserSort = USER_SORTS.find((k) => k === params.sort) ?? "created";
  const dir = params.dir === "asc" || params.dir === "desc" ? params.dir : sort === "created" ? "desc" : "asc";
  const exportHref = `/api/admin/users/export?${new URLSearchParams(params).toString()}`;

  let data: Awaited<ReturnType<typeof loadAccounts>> | null = null;
  try {
    data = await loadAccounts(params, { showStaff, sort, dir, limit: req.perPage, offset: req.offset });
  } catch (err) {
    console.error("[admin/users] list query failed", err);
  }

  const header = (
    <AdminPageHeader
      title="Users"
      action={
        <a href={exportHref} className={buttonClass({ variant: "outline" })}>
          <Download className="size-4" aria-hidden />
          Export CSV
        </a>
      }
    />
  );

  if (!data) {
    return (
      <div>
        {header}
        <div className={ADMIN_SURFACE}>
          <AdminLoadError what="the user list" retryHref="/admin/users" />
        </div>
      </div>
    );
  }

  const filters: ToolbarFilter[] = [
    {
      key: "status",
      label: "Account",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
    {
      key: "verified",
      label: "Email",
      options: [
        { value: "yes", label: "Verified" },
        { value: "no", label: "Not verified" },
      ],
    },
  ];

  // The account type is a set of views, not a facet: tabs with the unfiltered counts.
  const roleHref = (role: string) => `/admin/users${toQueryString({ ...params, role, page: "" })}`;
  const kinds = data.byKind;
  // "Everyone" is built from the same counts as the other tabs, so the four always add up.
  const viewCounts = accountViews(kinds, showStaff);
  const views: AdminTabItem[] = viewCounts.map((v) => ({ key: v.key, label: v.label, count: v.count, href: roleHref(v.key) }));
  const everyone = viewCounts[0].count;
  const attention: { label: string; value: number; href: string }[] = [
    ...(data.unverified ? [{ label: "Email not verified", value: data.unverified, href: `/admin/users${toQueryString({ verified: "no" })}` }] : []),
    ...(data.inactive ? [{ label: "Deactivated, cannot sign in", value: data.inactive, href: `/admin/users${toQueryString({ status: "inactive" })}` }] : []),
  ];
  const activeRole = views.some((v) => v.key === params.role) ? (params.role ?? "") : "";

  const columns: Column<AccountRow>[] = [
    {
      header: "Name",
      sort: "name",
      cell: (row) => {
        const href = row.kind === "intern" ? `/admin/interns/${row.id}` : row.kind === "employer" ? `/admin/companies/${row.id}` : undefined;
        return (
          <IdentityCell
            name={row.name}
            id={row.id}
            href={href}
            sub={row.company && row.company !== row.name ? row.company : undefined}
            className="lg:max-w-64"
          />
        );
      },
    },
    {
      header: "Email",
      sort: "email",
      cell: (row) => (
        <span className="flex max-w-72 items-center gap-2">
          <span className="truncate" title={row.email}>
            {row.email}
          </span>
          {!row.emailVerified ? <StatusBadge tone="warning" label="Unverified" dot={false} className="h-5" /> : null}
        </span>
      ),
    },
    { header: "Phone", cell: (row) => <span className="nums whitespace-nowrap">{row.phone || "-"}</span> },
    { header: "Type", cell: (row) => <span className="text-ink-700">{KIND_LABEL[row.kind]}</span> },
    {
      header: "Account",
      cell: (row) =>
        row.kind === "admin" ? (
          <Link
            href="/admin/roles"
            className="inline-flex h-8 items-center rounded-md px-2 text-sm font-medium text-brand-800 underline decoration-brand-300 underline-offset-4 hover:decoration-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-lg:min-h-11"
          >
            Manage in Roles
          </Link>
        ) : (row.kind === "intern" ? canWrite : canWriteCompanies) ? (
          <AccountActiveCell id={row.id} kind={row.kind} active={row.isActive} />
        ) : (
          <StatusBadge value={row.isActive ? "active" : "inactive"} />
        ),
    },
    {
      header: "Registered",
      sort: "created",
      cell: (row) => <span className="nums whitespace-nowrap text-text-subtle">{formatDate(row.createdAt)}</span>,
    },
  ];

  const page = toPage(data.rows, data.total, req.page, req.perPage);

  return (
    <div>
      {header}
      <PageLead
        value={everyone.toLocaleString("en-IN")}
        label="accounts can sign in"
        note={`${kinds.intern.toLocaleString("en-IN")} candidates, ${kinds.employer.toLocaleString("en-IN")} companies${showStaff ? `, ${kinds.admin} staff` : ""}.`}
        aside={
          attention.length ? (
            <ul className="w-full sm:w-auto sm:min-w-72 divide-y divide-ink-200 border-y border-ink-200">
              {attention.map((a) => (
                <li key={a.label}>
                  <Link href={a.href} className="-mx-2 flex min-h-10 items-baseline justify-between gap-4 rounded-md px-2 py-2 text-ink-700 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/40">
                    {a.label}
                    <span className="nums font-display text-lg font-semibold text-ink-900">{a.value}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : undefined
        }
      />
      <div className="space-y-4">
      <AdminTabs items={views} active={activeRole} label="Account types" />
      <DataTable<AccountRow>
        basePath="/admin/users"
        params={params}
        page={page.page}
        pages={page.pages}
        total={page.total}
        perPage={page.perPage}
        rows={data.rows}
        columns={columns}
        noun="accounts"
        caption="Registered accounts"
        searchPlaceholder="Search name, email or company"
        filters={filters}
        empty={{
          title: "No accounts match",
          body: "Try a different search, or clear the filters to see everyone.",
          action: { href: "/admin/users", label: "Clear filters" },
        }}
      />
      </div>
    </div>
  );
}
