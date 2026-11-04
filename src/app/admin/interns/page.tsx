import { Download } from "lucide-react";
import { cookies } from "next/headers";
import Link from "next/link";

import { RatingsImport } from "@/components/admin/ratings-import";
import { formatDate, formatIstStamp, formatMoney } from "@/lib/format";
import { getSession } from "@/lib/auth";
import { allows, BANK_EXPORT_PERMISSIONS } from "@/lib/admin/permissions";
import {
  AI_STATUS_LABEL,
  INTERN_COLUMNS,
  aiStatusLabel,
  colsFromCookie,
  internshipLabel,
  liveLabel,
  needsBank,
  needsBankExport,
  offerTypeLabel,
  parseCols,
  type InternColKey,
} from "@/lib/admin/intern-columns";
import { InternColumnsMenu } from "@/components/admin/intern-columns-menu";
import { flattenParams, parsePageRequest, toPage, toQueryString } from "@/lib/admin/params";
import { INTERN_SORTS as SORTS, loadInterns, type InternRow as Row } from "@/lib/admin/intern-query";
import { matchesDue, todayIstIso } from "@/lib/admin/intern-list";
import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, type Column } from "@/components/admin/data-table";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { StatusBadge } from "@/components/admin/status-badge";
import { BulkSelectProvider, RowCheckbox, SelectAllCheckbox, type BulkActionSpec } from "@/components/admin/bulk-select";
import {
  AccountActiveCell,
  InternApprovalCell,
  InternRatingsCell,
  InternVisibilityCell,
} from "@/components/admin/intern-row-controls";
import { ADMIN_PILL_SECONDARY, ADMIN_SURFACE } from "@/components/admin/surface";
import { buttonClass } from "@/components/ui/button";

/**
 * Candidate directory - the screen an admin actually lives in.
 *
 * Every row is editable in place (review status, ratings, visibility,
 * account), and carries the money and offer facts legacy showed (ADP-02):
 * offer type and status, internship status, activation fee, what is owed and
 * when the next stipend falls due. Bulk show / hide / activate stay in the
 * selection bar.
 */

const FILTERS: ToolbarFilter[] = [
  {
    key: "approval",
    label: "Review",
    options: [
      { value: "Pending", label: "Pending" },
      { value: "Approved", label: "Approved" },
      { value: "Rejected", label: "Rejected" },
    ],
  },
  {
    key: "hired",
    label: "Hired",
    options: [
      { value: "yes", label: "Hired" },
      { value: "no", label: "Not hired" },
    ],
  },
  {
    key: "offer",
    label: "Offer type",
    options: [
      { value: "internship", label: "Internship" },
      { value: "full_time", label: "Full-time" },
    ],
  },
  {
    key: "due",
    label: "Next payout",
    options: [
      { value: "overdue", label: "Overdue" },
      { value: "week", label: "Due this week" },
      { value: "month", label: "Due this month" },
      { value: "has", label: "Has a date" },
      { value: "none", label: "No date" },
    ],
  },
  {
    key: "payment",
    label: "Activation fee",
    options: [
      { value: "paid", label: "Paid" },
      { value: "unpaid", label: "Unpaid" },
    ],
  },
  {
    key: "ai",
    label: "AI interview",
    options: Object.entries(AI_STATUS_LABEL).map(([value, label]) => ({ value, label })),
  },
  {
    key: "score",
    label: "Score",
    options: [
      { value: "scored", label: "Scored" },
      { value: "none", label: "Not scored" },
    ],
  },
  {
    key: "profile",
    label: "Profile",
    options: [
      { value: "complete", label: "Complete" },
      { value: "incomplete", label: "Incomplete" },
    ],
  },
  {
    key: "visibility",
    label: "Visibility",
    options: [
      { value: "live", label: "Live" },
      { value: "hidden", label: "Hidden by admin" },
      { value: "intern_hidden", label: "Hidden by candidate" },
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
    key: "sort",
    label: "Sort",
    allLabel: "Newest first",
    options: [
      { value: "name", label: "Name" },
      { value: "email", label: "Email" },
      { value: "score", label: "Score" },
      { value: "owed", label: "Left to pay" },
      { value: "next", label: "Next payout date" },
    ],
  },
];

const ACTIONS: BulkActionSpec[] = [
  {
    label: "Show",
    endpoint: "/api/admin/interns/visibility",
    payload: { visibility: "live" },
    icon: "eye",
    confirm: "Make {n} intern(s) visible in the public directory and employer search?",
  },
  {
    label: "Hide",
    endpoint: "/api/admin/interns/visibility",
    payload: { visibility: "hidden" },
    icon: "eye-off",
    confirm: "Hide {n} intern(s) from the public directory? Their accounts stay active.",
  },
  {
    label: "Activate",
    endpoint: "/api/admin/interns/status",
    payload: { isActive: true },
    icon: "check",
    confirm: "Activate {n} account(s)?",
  },
  {
    label: "Deactivate",
    endpoint: "/api/admin/interns/status",
    payload: { isActive: false },
    icon: "ban",
    tone: "danger",
    confirm: "Deactivate {n} account(s)? They will not be able to sign in.",
  },
];

export default async function AdminInterns({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = flattenParams(await searchParams);
  const req = parsePageRequest(params);
  const sortKey = SORTS.find((k) => k === params.sort) ?? "created";
  const dir: "asc" | "desc" = params.dir === "asc" || params.dir === "desc" ? params.dir : sortKey === "name" || sortKey === "email" || sortKey === "next" ? "asc" : "desc";
  const session = await getSession();
  const adminUid = session?.uid ?? "";
  const cols = parseCols(params.cols ?? colsFromCookie((await cookies()).get("ft_admin_intern_cols")?.value, adminUid));
  const has = (k: InternColKey) => cols.has(k);
  const visible = INTERN_COLUMNS.filter((c) => has(c.key)).map((c) => c.key);
  const canBankExport = allows(session?.permissions, BANK_EXPORT_PERMISSIONS);
  const bankBlocked = needsBankExport(cols) && !canBankExport;
  const filterParams = Object.fromEntries(Object.entries(params).filter(([k]) => k !== "cols"));
  const exportHref = `/api/admin/export?${new URLSearchParams({ ...filterParams, type: "interns", cols: visible.join(",") }).toString()}`;

  const headerWith = (subtitle?: string, noRows = false) => (
    <AdminPageHeader
      title="Candidates"
      subtitle={subtitle}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <RatingsImport />
          <Link href="/admin/interns/ai-reports" className={buttonClass({ variant: "outline", className: ADMIN_PILL_SECONDARY })}>
            AI reports
          </Link>
          {noRows || bankBlocked ? (
            <button type="button" disabled className={buttonClass({ variant: "outline", className: ADMIN_PILL_SECONDARY })}>
              <Download className="size-4" aria-hidden />
              Export
            </button>
          ) : (
            <a href={exportHref} className={buttonClass({ variant: "outline", className: ADMIN_PILL_SECONDARY })}>
              <Download className="size-4" aria-hidden />
              Export
            </a>
          )}
          {bankBlocked ? (
            <p className="w-full text-xs text-text-subtle">
              Exporting account numbers needs the Record payouts permission. Hide Account number to export the rest.
            </p>
          ) : null}
        </div>
      }
    />
  );
  const header = headerWith();

  let data: Awaited<ReturnType<typeof loadInterns>>;
  try {
    data = await loadInterns(params, { search: req.search, limit: req.perPage, offset: req.offset }, sortKey, dir, { bank: needsBank(cols) });
  } catch (err) {
    console.error("[admin/interns] list query failed", err);
    return (
      <div>
        {header}
        <div className={ADMIN_SURFACE}>
          <AdminLoadError what="the candidate list" retryHref="/admin/interns" />
        </div>
      </div>
    );
  }

  const { rows, total, signups, incomplete } = data;
  const page = toPage(rows, total, req.page, req.perPage);
  const today = todayIstIso();

  // Saved views: shortcuts onto the same URL filters the toolbar sets. Other
  // filters, search and sort are kept; the page resets.
  const viewHref = (patch: Record<string, string>) =>
    `/admin/interns${toQueryString({ ...params, approval: "", profile: "", hired: "", ...patch, page: "" })}`;
  const views: AdminTabItem[] = [
    { key: "all", label: "All candidates", count: signups, href: viewHref({}) },
    { key: "pending", label: "Pending review", href: viewHref({ approval: "Pending" }) },
    { key: "incomplete", label: "Incomplete profile", count: incomplete, href: viewHref({ profile: "incomplete" }) },
    { key: "hired", label: "Hired", href: viewHref({ hired: "yes" }) },
  ];
  const activeView =
    params.approval === "Pending" && !params.profile && !params.hired
      ? "pending"
      : params.profile === "incomplete" && !params.approval && !params.hired
        ? "incomplete"
        : params.hired === "yes" && !params.approval && !params.profile
          ? "hired"
          : !params.approval && !params.profile && !params.hired
            ? "all"
            : "";
  const finding =
    incomplete > 0
      ? `${incomplete.toLocaleString("en-IN")} of ${signups.toLocaleString("en-IN")} candidates have not finished onboarding, so employers can't see them yet.`
      : `${signups.toLocaleString("en-IN")} candidates.`;

  const money = (row: Row, pick: (m: NonNullable<Row["money"]>) => number) => (
    <span className="whitespace-nowrap">{formatMoney(row.money ? pick(row.money) : 0, "INR", { zeroLabel: "₹0" })}</span>
  );
  const text = (value: string) => value || <span className="text-text-subtle">–</span>;
  const nameOf = (row: Row) => `${row.firstName} ${row.lastName}`.trim();

  // Cells for every optional column; the catalog decides which render and in what order.
  const cells: Record<InternColKey, Omit<Column<Row>, "header" | "sort">> = {
    email: { cell: (row) => <span title={row.email}>{row.email}</span> },
    phone: { cell: (row) => text(row.phone) },
    interview: {
      cell: (row) => (
        <div className="flex flex-col items-start gap-0.5 whitespace-nowrap">
          <span>{aiStatusLabel(row.aiStatus)}</span>
          {(row.aiStatus === "scheduled" || row.aiStatus === "completed") && row.interviewAt ? (
            <span className="nums text-xs text-text-subtle">{formatIstStamp(row.interviewAt).slice(0, 16)} IST</span>
          ) : null}
        </div>
      ),
    },
    score: {
      cell: (row) =>
        row.hasOnboarding ? (
          <InternRatingsCell internId={row.id} name={nameOf(row)} ratings={row.ratings ?? {}} score={row.score} />
        ) : (
          <span className="text-text-subtle">No profile</span>
        ),
    },
    profile: { cell: (row) => (row.hasProfile ? "Complete" : <StatusBadge tone="warning" label="Incomplete" dot={false} />) },
    onboarded: { cell: (row) => (row.hired ? "Onboarded" : "Not onboarded") },
    pending: { numeric: true, cell: (row) => money(row, (m) => m.pendingPayoutMinor) },
    next: {
      cell: (row) =>
        row.money?.nextDate ? (
          <span className="nums flex items-center gap-1.5 whitespace-nowrap">
            {matchesDue(row.money.nextDate, "overdue", today) ? <StatusBadge tone="danger" label="Overdue" /> : null}
            {formatDate(row.money.nextDate)}
          </span>
        ) : (
          <span className="text-text-subtle">–</span>
        ),
    },
    total: { numeric: true, cell: (row) => money(row, (m) => m.totalMinor) },
    paid: { numeric: true, cell: (row) => money(row, (m) => m.paidMinor) },
    left: { numeric: true, cell: (row) => money(row, (m) => m.owedMinor) },
    live: {
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <InternVisibilityCell internId={row.id} live={row.visibility !== "hidden"} compact />
          {row.visibility !== "hidden" && !row.openToWork ? <span className="text-xs text-text-subtle">{liveLabel(row)}</span> : null}
        </div>
      ),
    },
    offerType: { cell: (row) => text(offerTypeLabel(row)) },
    internship: { cell: (row) => text(internshipLabel(row)) },
    fee: { cell: (row) => (row.feePaid ? "Paid" : <StatusBadge tone="warning" label="Unpaid" dot={false} />) },
    offerStatus: {
      cell: (row) => (row.offerStatus ? <StatusBadge value={row.hired ? "hired" : row.offerStatus} /> : <span className="text-text-subtle">–</span>),
    },
    bankHolder: { cell: (row) => text(row.bank?.holder ?? "") },
    bankAccount: { cell: (row) => text(row.bank?.account ?? "") },
    bankIfsc: { cell: (row) => text(row.bank?.ifsc ?? "") },
    bankName: { cell: (row) => text(row.bank?.name ?? "") },
    bankUpi: { cell: (row) => text(row.bank?.upi ?? "") },
    account: { cell: (row) => <AccountActiveCell id={row.id} kind="intern" active={row.isActive} compact /> },
    review: {
      cell: (row) =>
        row.hasOnboarding ? <InternApprovalCell internId={row.id} value={row.approval ?? "Pending"} pill /> : <span className="text-text-subtle">-</span>,
    },
    joined: { cell: (row) => <span className="nums whitespace-nowrap text-text-subtle">{row.createdAt ? formatDate(row.createdAt) : "-"}</span> },
  };

  const columns: Column<Row>[] = [
    {
      header: <SelectAllCheckbox ids={rows.map((r) => r.id)} noun="candidates" />,
      headerClassName: "w-10",
      cell: (row) => <RowCheckbox id={row.id} label={nameOf(row)} />,
      className: "w-10",
    },
    {
      header: "Candidate",
      sort: "name",
      className: "lg:sticky lg:left-0 z-[1] bg-[color:var(--admin-panel)]",
      headerClassName: "lg:sticky lg:left-0 z-[1] bg-[color:var(--admin-panel)]",
      cell: (row) => (
        <div className="min-w-0 lg:max-w-60">
          <IdentityCell
            name={nameOf(row)}
            id={row.id}
            href={`/admin/interns/${row.id}`}
            sub={has("email") ? undefined : <span title={row.email}>{row.email}</span>}
          />
          {/* Only the exceptions, and only while their own column is hidden. */}
          {(!has("profile") && !row.hasProfile) || (!has("fee") && row.hasProfile && !row.feePaid) || (!has("live") && !row.openToWork && row.visibility !== "hidden") ? (
            <div className="mt-1.5 flex flex-wrap gap-1 pl-[3.25rem]">
              {!has("profile") && !row.hasProfile ? <StatusBadge tone="warning" label="Profile incomplete" dot={false} className="h-5" /> : null}
              {!has("fee") && row.hasProfile && !row.feePaid ? <StatusBadge tone="warning" label="Fee unpaid" dot={false} className="h-5" /> : null}
              {!has("live") && !row.openToWork && row.visibility !== "hidden" ? <StatusBadge tone="neutral" label="Hidden by candidate" dot={false} className="h-5" /> : null}
            </div>
          ) : null}
        </div>
      ),
    },
    ...INTERN_COLUMNS.filter((c) => has(c.key)).map((c) => ({
      header:
        c.key === "pending" ? (
          <span title="Payouts already created and not yet marked paid. For what is still owed over the placement, see Left to pay.">{c.label}</span>
        ) : c.key === "left" ? (
          <span title="Paid is every payout made. Left is what is still owed on placements, so Total minus Paid can differ from Left.">{c.label}</span>
        ) : (
          c.label
        ),
      label: c.label,
      sort: c.sort,
      ...cells[c.key],
    })),
  ];

  return (
    <div>
      {headerWith(finding, total === 0)}
      <div className="space-y-4">
        <AdminTabs items={views} active={activeView} label="Candidate views" />
        <BulkSelectProvider actions={ACTIONS} noun="interns">
          <DataTable<Row>
            basePath="/admin/interns"
            params={params}
            page={page.page}
            pages={page.pages}
            total={page.total}
            perPage={page.perPage}
            rows={rows}
            columns={columns}
            noun="candidates"
            caption="Candidates"
            searchPlaceholder="Search name, email or phone…"
            filters={FILTERS}
            extraControls={<InternColumnsMenu visible={visible} adminUid={adminUid} />}
            rowClassName="group/row"
            empty={{
              title: "No candidates match",
              body: "Try a different search, or clear the filters to see everyone.",
              action: { href: "/admin/interns", label: "Clear filters" },
            }}
          />
        </BulkSelectProvider>
      </div>
    </div>
  );
}
