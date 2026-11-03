import { Download } from "lucide-react";

import { RatingsImport } from "@/components/admin/ratings-import";
import { formatDate, formatMoney } from "@/lib/format";
import { flattenParams, parsePageRequest, toPage, toQueryString } from "@/lib/admin/params";
import { INTERN_SORTS as SORTS, loadInterns, type InternRow as Row } from "@/lib/admin/intern-query";
import { matchesDue, todayIstIso } from "@/lib/admin/intern-list";
import { AdminLoadError, AdminPageHeader } from "@/components/admin/panel";
import { AdminTabs, type AdminTabItem } from "@/components/admin/admin-tabs";
import { DataTable, IdentityCell, type Column } from "@/components/admin/data-table";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { StatusBadge, humanizeStatus } from "@/components/admin/status-badge";
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

const AI_STATUS_LABEL: Record<string, string> = {
  not_applied: "Not applied",
  applied: "Applied",
  scheduled: "Scheduled",
  sent: "Sent",
  expired: "Expired",
  completed: "Completed",
};


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
  const exportHref = `/api/admin/export?type=interns&${new URLSearchParams(params).toString()}`;

  const headerWith = (subtitle?: string) => (
    <AdminPageHeader
      title="Candidates"
      subtitle={subtitle}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <RatingsImport />
          <a href={exportHref} className={buttonClass({ variant: "outline", className: ADMIN_PILL_SECONDARY })}>
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        </div>
      }
    />
  );
  const header = headerWith();

  let data: Awaited<ReturnType<typeof loadInterns>>;
  try {
    data = await loadInterns(params, { search: req.search, limit: req.perPage, offset: req.offset }, sortKey, dir);
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

  const columns: Column<Row>[] = [
    {
      header: <SelectAllCheckbox ids={rows.map((r) => r.id)} noun="candidates" />,
      headerClassName: "w-10",
      cell: (row) => <RowCheckbox id={row.id} label={`${row.firstName} ${row.lastName}`.trim()} />,
      className: "w-10",
    },
    {
      header: "Candidate",
      sort: "name",
      cell: (row) => {
        const name = `${row.firstName} ${row.lastName}`.trim();
        return (
          <div className="min-w-0 lg:max-w-60">
            <IdentityCell
              name={name}
              id={row.id}
              href={`/admin/interns/${row.id}`}
              sub={<span title={row.email}>{row.email}</span>}
            />
            {/* Only the exceptions: a complete, paid profile is the norm. */}
            {!row.hasProfile || (row.hasProfile && !row.feePaid) || (!row.openToWork && row.visibility !== "hidden") ? (
              <div className="mt-1.5 flex flex-wrap gap-1 pl-[3.25rem]">
                {!row.hasProfile ? <StatusBadge tone="warning" label="Profile incomplete" dot={false} className="h-5" /> : null}
                {row.hasProfile && !row.feePaid ? <StatusBadge tone="warning" label="Fee unpaid" dot={false} className="h-5" /> : null}
                {!row.openToWork && row.visibility !== "hidden" ? <StatusBadge tone="neutral" label="Hidden by candidate" dot={false} className="h-5" /> : null}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      header: "Score",
      sort: "score",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          {row.hasOnboarding ? (
            <InternRatingsCell
              internId={row.id}
              name={`${row.firstName} ${row.lastName}`.trim()}
              ratings={row.ratings ?? {}}
              score={row.score}
            />
          ) : (
            <span className="text-text-subtle">No profile</span>
          )}
          {/* Only when it is not done: "Completed" under every score was noise. */}
          {row.aiStatus !== "completed" ? (
            <span className="max-w-28 whitespace-normal text-xs text-text-subtle">AI interview: {AI_STATUS_LABEL[row.aiStatus] ?? humanizeStatus(row.aiStatus)}</span>
          ) : null}
        </div>
      ),
    },
    {
      header: "Review",
      cell: (row) =>
        row.hasOnboarding ? <InternApprovalCell internId={row.id} value={row.approval ?? "Pending"} pill /> : <span className="text-text-subtle">-</span>,
    },
    {
      header: "Offer",
      cell: (row) =>
        row.offerStatus ? (
          <div className="flex flex-col items-start gap-1 whitespace-nowrap">
            <StatusBadge value={row.hired ? "hired" : row.offerStatus} />
            {row.hired || row.fullTime ? (
              <span className="text-xs text-text-subtle">
                {row.fullTime ? "Full-time" : "Internship"}
                {row.hired ? ` · ${row.projectStatus === "completed" ? "Completed" : "Ongoing"}` : ""}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-text-subtle">No offers</span>
        ),
    },
    {
      // Owed and when, in one column (they were two, and the table ran past 1440).
      header: "Stipend",
      sort: "owed",
      align: "right",
      cell: (row) =>
        row.money && (row.money.owedMinor > 0 || row.money.pendingPayoutMinor > 0 || row.money.nextDate) ? (
          <div className="flex flex-col items-end gap-1 whitespace-nowrap">
            <span className="font-semibold text-ink-900">{formatMoney(row.money.owedMinor, "INR", { zeroLabel: "₹0" })} due</span>
            {row.money.pendingPayoutMinor > 0 ? (
              <span className="text-xs text-text-subtle">{formatMoney(row.money.pendingPayoutMinor, "INR")} pending</span>
            ) : null}
            {row.money.nextDate ? (
              <span className="nums flex items-center gap-1.5 text-xs text-text-subtle">
                {matchesDue(row.money.nextDate, "overdue", today) ? <StatusBadge tone="danger" label="Overdue" /> : null}
                next {formatDate(row.money.nextDate)}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="text-text-subtle">–</span>
        ),
    },
    {
      // One line per row: a state pill and an icon button for each of
      // visibility and account (buttons keep their names: Hide/Show, Deactivate/Activate).
      header: "Access",
      cell: (row) => (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <InternVisibilityCell internId={row.id} live={row.visibility !== "hidden"} compact />
          <AccountActiveCell id={row.id} kind="intern" active={row.isActive} compact />
        </div>
      ),
    },
    {
      header: "Joined",
      sort: "created",
      cell: (row) => <span className="nums whitespace-nowrap text-text-subtle">{row.createdAt ? formatDate(row.createdAt) : "-"}</span>,
    },
  ];

  return (
    <div>
      {headerWith(finding)}
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
