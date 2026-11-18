import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { getSession } from "@/lib/auth";
import { allows } from "@/lib/admin/permissions";
import { flattenParams, parsePageRequest, toPage, toQueryString } from "@/lib/admin/params";
import { loadAccounts, USER_SORTS, type AccountRow, type UserSort } from "@/lib/admin/users-list";
import { formatDate } from "@/lib/format";
import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, type Column } from "@/components/admin/data-table";
import { StatusBadge } from "@/components/admin/status-badge";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { AccountActiveCell } from "@/components/admin/intern-row-controls";
import { ADMIN_PILL_SECONDARY, ADMIN_SURFACE } from "@/components/admin/surface";
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

  const counts = data?.byKind;
  const header = (
    <AdminPageHeader
      title="Users"
      subtitle={
        counts
          ? `${counts.intern.toLocaleString("en-IN")} candidates and ${counts.employer.toLocaleString("en-IN")} companies${showStaff ? `, ${counts.admin} staff` : ""}. Activate or deactivate an account in its row.`
          : "Every account that can sign in."
      }
      action={
        <a href={exportHref} className={buttonClass({ variant: "outline", className: ADMIN_PILL_SECONDARY })}>
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
  const views: AdminTabItem[] = [
    { key: "", label: "Everyone", count: kinds.intern + kinds.employer + (showStaff ? kinds.admin : 0), href: roleHref("") },
    { key: "intern", label: "Candidates", count: kinds.intern, href: roleHref("intern") },
    { key: "employer", label: "Companies", count: kinds.employer, href: roleHref("employer") },
    ...(showStaff ? [{ key: "admin", label: "Staff", count: kinds.admin, href: roleHref("admin") }] : []),
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
    {
      header: "Type",
      cell: (row) => <StatusBadge tone={row.kind === "intern" ? "info" : row.kind === "employer" ? "neutral" : "success"} label={KIND_LABEL[row.kind]} dot={false} />,
    },
    {
      header: "Account",
      cell: (row) =>
        row.kind === "admin" ? (
          <Link
            href="/admin/roles"
            className="inline-flex h-8 items-center rounded-full bg-[color:var(--admin-panel-2)] px-3 text-xs font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring max-lg:min-h-11"
          >
            Manage in Roles
          </Link>
        ) : (row.kind === "intern" ? canWrite : canWriteCompanies) ? (
          <AccountActiveCell id={row.id} kind={row.kind} active={row.isActive} compact />
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
        searchPlaceholder="Search name, email, phone or company…"
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
