import Link from "next/link";
import { Download } from "lucide-react";

import { RatingsImport } from "@/components/admin/ratings-import";
import { formatDate, formatMoney } from "@/lib/format";
import { flattenParams, parsePageRequest, toPage } from "@/lib/admin/params";
import { INTERN_SORTS as SORTS, loadInterns, type InternRow as Row } from "@/lib/admin/intern-query";
import { matchesDue, todayIstIso } from "@/lib/admin/intern-list";
import { AdminLoadError, AdminPageHeader, AttentionBanner } from "@/components/admin/panel";
import { DataTable, type Column } from "@/components/admin/data-table";
import type { ToolbarFilter } from "@/components/admin/table-toolbar";
import { StatusBadge, humanizeStatus } from "@/components/admin/status-badge";
import { BulkSelectProvider, RowCheckbox, SelectAllCheckbox, type BulkActionSpec } from "@/components/admin/bulk-select";
import {
  AccountActiveCell,
  InternApprovalCell,
  InternRatingsCell,
  InternVisibilityCell,
} from "@/components/admin/intern-row-controls";
import { buttonClass } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

  const header = (
    <AdminPageHeader
      title="Candidates"
      subtitle="Every registered candidate: review status, scores, offers, stipends and visibility, editable in the row."
      action={
        <div className="flex flex-wrap items-center gap-2">
          <RatingsImport />
          <a href={exportHref} className={buttonClass({ variant: "outline" })}>
            <Download className="size-4" aria-hidden />
            Export CSV
          </a>
        </div>
      }
    />
  );

  let data: Awaited<ReturnType<typeof loadInterns>>;
  try {
    data = await loadInterns(params, { search: req.search, limit: req.perPage, offset: req.offset }, sortKey, dir);
  } catch (err) {
    console.error("[admin/interns] list query failed", err);
    return (
      <div>
        {header}
        <div className="apple-panel bg-white">
          <AdminLoadError what="the candidate list" retryHref="/admin/interns" />
        </div>
      </div>
    );
  }

  const { rows, total, signups, incomplete } = data;
  const page = toPage(rows, total, req.page, req.perPage);
  const today = todayIstIso();

  const columns: Column<Row>[] = [
    {
      header: <SelectAllCheckbox ids={rows.map((r) => r.id)} noun="candidates" />,
      headerClassName: "w-10",
      cell: (row) => <RowCheckbox id={row.id} />,
      className: "w-10",
    },
    {
      header: "Candidate",
      sort: "name",
      cell: (row) => (
        <div className="flex min-w-56 items-center gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">
            {row.firstName.charAt(0)}
            {row.lastName.charAt(0)}
          </span>
          <div className="min-w-0">
            <Link
              href={`/admin/interns/${row.id}`}
              className="block max-w-64 truncate font-semibold text-ink-900 underline-offset-4 hover:underline"
              title={`${row.firstName} ${row.lastName}`}
            >
              {row.firstName} {row.lastName}
            </Link>
            <p className="max-w-64 truncate text-sm text-ink-600" title={row.email}>
              {row.email}
            </p>
          </div>
        </div>
      ),
    },
    {
      header: "Joined",
      sort: "created",
      cell: (row) => <span className="nums whitespace-nowrap text-ink-600">{row.createdAt ? formatDate(row.createdAt) : "-"}</span>,
    },
    {
      header: "Score",
      sort: "score",
      cell: (row) => (
        <div className="flex min-w-32 flex-col items-start gap-1">
          {row.hasOnboarding ? (
            <InternRatingsCell
              internId={row.id}
              name={`${row.firstName} ${row.lastName}`.trim()}
              ratings={row.ratings ?? {}}
              score={row.score}
            />
          ) : (
            <span className="text-ink-600">No profile</span>
          )}
          <span className="text-xs text-ink-600">AI interview: {AI_STATUS_LABEL[row.aiStatus] ?? humanizeStatus(row.aiStatus)}</span>
        </div>
      ),
    },
    {
      header: "Review",
      cell: (row) =>
        row.hasOnboarding ? <InternApprovalCell internId={row.id} value={row.approval ?? "Pending"} /> : <span className="text-text-subtle">-</span>,
    },
    {
      header: "Offer",
      cell: (row) =>
        row.offerStatus ? (
          <div className="flex flex-col items-start gap-1 whitespace-nowrap">
            <StatusBadge value={row.hired ? "hired" : row.offerStatus} />
            {row.hired || row.fullTime ? (
              <span className="text-xs text-ink-600">
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
      header: "Next payout",
      sort: "next",
      cell: (row) =>
        row.money?.nextDate ? (
          <div className="flex flex-col items-start gap-1 whitespace-nowrap">
            <span className="nums text-ink-800">{formatDate(row.money.nextDate)}</span>
            {matchesDue(row.money.nextDate, "overdue", today) ? (
              <StatusBadge tone="danger" label="Overdue" />
            ) : null}
          </div>
        ) : (
          <span className="text-text-subtle">-</span>
        ),
    },
    {
      header: "Left to pay",
      sort: "owed",
      align: "right",
      cell: (row) =>
        row.money && (row.money.owedMinor > 0 || row.money.pendingPayoutMinor > 0) ? (
          <div className="whitespace-nowrap">
            <span className="font-semibold text-ink-900">{formatMoney(row.money.owedMinor, "INR", { zeroLabel: "₹0" })}</span>
            {row.money.pendingPayoutMinor > 0 ? (
              <span className="block text-xs text-ink-600">{formatMoney(row.money.pendingPayoutMinor, "INR")} pending</span>
            ) : null}
          </div>
        ) : (
          <span className="text-text-subtle">-</span>
        ),
    },
    {
      header: "Visibility",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <InternVisibilityCell internId={row.id} live={row.visibility !== "hidden"} />
          {!row.openToWork && row.visibility !== "hidden" ? <span className="text-xs text-ink-600">Hidden by candidate</span> : null}
        </div>
      ),
    },
    {
      header: "Account",
      cell: (row) => (
        <div className="flex flex-col items-start gap-1">
          <AccountActiveCell id={row.id} kind="intern" active={row.isActive} />
          <span className="whitespace-nowrap text-xs text-ink-600">
            {row.hasProfile ? "Profile complete" : <span className="text-accent-700">Profile incomplete</span>} ·{" "}
            {row.feePaid ? "fee paid" : "fee unpaid"}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div>
      {header}
      <div className="space-y-4">
        <AttentionBanner count={incomplete} total={signups} noun="interns" href="/admin/interns?profile=incomplete" />
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
            renderRow={(row) => (
              <TableRow key={row.id} className="group/row border-ink-100 align-top hover:bg-ink-50/60">
                {columns.map((column, i) => (
                  <TableCell
                    key={i}
                    className={cn("px-3 py-3 text-sm text-ink-700", column.align === "right" && "nums text-right", column.className)}
                  >
                    {column.cell(row, i)}
                  </TableCell>
                ))}
              </TableRow>
            )}
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
