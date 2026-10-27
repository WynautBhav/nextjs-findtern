import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";

import { getSession } from "@/lib/auth";
import { allows } from "@/lib/admin/permissions";
import { flattenParams, parsePageRequest, toPage } from "@/lib/admin/params";
import { loadAccounts, USER_SORTS, type AccountRow, type UserSort } from "@/lib/admin/users-list";
import { formatDate } from "@/lib/format";
import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { DataTable, type Column } from "@/components/admin/data-table";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { AccountActiveCell } from "@/components/admin/intern-row-controls";
import { Pill } from "@/components/app/primitives";
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
          ? `${counts.intern.toLocaleString("en-IN")} candidates, ${counts.employer.toLocaleString("en-IN")} companies${showStaff ? `, ${counts.admin} staff` : ""}. Activate or deactivate an account in its row.`
          : "Every account that can sign in."
      }
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
        <div className="apple-panel bg-white">
          <AdminLoadError what="the user list" retryHref="/admin/users" />
        </div>
      </div>
    );
  }

  const filters: ToolbarFilter[] = [
    {
      key: "role",
      label: "Type",
      options: [
        { value: "intern", label: "Candidates" },
        { value: "employer", label: "Companies" },
        ...(showStaff ? [{ value: "admin", label: "Staff" }] : []),
      ],
    },
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

  const columns: Column<AccountRow>[] = [
    {
      header: "Name",
      sort: "name",
      cell: (row) => {
        const href = row.kind === "intern" ? `/admin/interns/${row.id}` : row.kind === "employer" ? `/admin/companies/${row.id}` : null;
        return (
          <div className="min-w-48">
            {href ? (
              <Link href={href} className="font-semibold text-ink-900 underline-offset-4 hover:underline">
                {row.name}
              </Link>
            ) : (
              <span className="font-semibold text-ink-900">{row.name}</span>
            )}
            {row.company && row.company !== row.name ? <p className="text-sm text-ink-600">{row.company}</p> : null}
          </div>
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
          {!row.emailVerified ? <Pill tone="waiting">Unverified</Pill> : null}
        </span>
      ),
    },
    { header: "Phone", cell: (row) => <span className="nums whitespace-nowrap">{row.phone || "-"}</span> },
    {
      header: "Type",
      cell: (row) => <Pill tone={row.kind === "intern" ? "new" : row.kind === "employer" ? "neutral" : "live"}>{KIND_LABEL[row.kind]}</Pill>,
    },
    {
      header: "Account",
      cell: (row) =>
        row.kind === "admin" ? (
          <Link href="/admin/roles" className="text-sm font-medium text-brand-700 underline-offset-4 hover:underline">
            Manage in Roles
          </Link>
        ) : (row.kind === "intern" ? canWrite : canWriteCompanies) ? (
          <AccountActiveCell id={row.id} kind={row.kind} active={row.isActive} />
        ) : (
          <Pill tone={row.isActive ? "live" : "closed"}>{row.isActive ? "Active" : "Inactive"}</Pill>
        ),
    },
    {
      header: "Registered",
      sort: "created",
      cell: (row) => <span className="nums whitespace-nowrap text-ink-600">{formatDate(row.createdAt)}</span>,
    },
  ];

  const page = toPage(data.rows, data.total, req.page, req.perPage);

  return (
    <div>
      {header}
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
  );
}
