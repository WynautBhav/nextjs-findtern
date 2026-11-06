import type { Metadata } from "next";

import { DataTable, IdentityCell, type Column } from "@/components/admin/data-table";
import { AdminEmpty, AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { RefundActions } from "@/components/admin/refund-actions";
import { StatusBadge, humanizeStatus, type StatusTone } from "@/components/admin/status-badge";
import { flattenParams, parsePageRequest, type RawSearchParams } from "@/lib/admin/params";
import { allows } from "@/lib/admin/permissions";
import { getSession } from "@/lib/auth";
import { REFUND_STATUS_LABELS, REVIEW_REASON_LABELS, displayStatus, refundCandidates, type RefundCandidate } from "@/lib/college/refund";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "College refunds" };
export const dynamic = "force-dynamic";

const BASE = "/admin/colleges/refunds";

const STATUS_TONE: Record<string, StatusTone> = {
  eligible: "info",
  requires_review: "warning",
  pending: "neutral",
  initiated: "info",
  refunded: "success",
  failed: "danger",
  rejected: "neutral",
  none: "neutral",
};

const STATUS_FILTER = [
  ...Object.entries(REFUND_STATUS_LABELS).map(([value, label]) => ({ value, label })),
  { value: "none", label: "Not refundable" },
];

const inr = (minor: number) => formatMoney(minor, "INR", { zeroLabel: false, decimals: 2 });

function eligibility(c: RefundCandidate): { label: string; detail?: string } {
  if (c.decision.kind === "eligible") return { label: "Eligible" };
  if (c.decision.kind === "requires_review") return { label: "Needs review", detail: REVIEW_REASON_LABELS[c.decision.reason] };
  return { label: "Not refundable", detail: c.decision.error };
}

/**
 * Activation-fee refunds for students of partner colleges (directive §4, OA6): what each paid, whether the AI
 * interview is taken, and the refund's state at Razorpay. Accounts' page: reading needs transactions:read,
 * acting transactions:write (the API checks it again).
 */
export default async function AdminCollegeRefunds({ searchParams }: { searchParams?: Promise<RawSearchParams> }) {
  const params = flattenParams(await searchParams);
  const perms = (await getSession())?.permissions;
  if (!allows(perms, ["transactions:read"])) {
    return (
      <Panel>
        <AdminEmpty title="Refunds are Accounts' page" body="Your role can't see payments. Ask a super admin for transactions access." />
      </Panel>
    );
  }
  const canAct = allows(perms, ["transactions:write"]);
  const req = parsePageRequest(params);

  let all: RefundCandidate[];
  try {
    all = await refundCandidates({ status: params.status || undefined });
  } catch (e) {
    console.error("[admin refunds]", e);
    return (
      <div className="space-y-4">
        <AdminPageHeader title="College refunds" />
        <Panel>
          <AdminLoadError what="the refund list" retryHref={BASE} />
        </Panel>
      </div>
    );
  }
  const needle = req.search.trim().toLowerCase();
  const rows = needle
    ? all.filter((c) => [c.studentName, c.registeredEmail, c.collegeEmail, c.collegeName, c.paymentId, c.orderId, c.phone].some((v) => v?.toLowerCase().includes(needle)))
    : all;
  const pages = Math.max(1, Math.ceil(rows.length / req.perPage));
  const page = Math.min(req.page, pages);
  const shown = rows.slice((page - 1) * req.perPage, page * req.perPage);
  const needReview = all.filter((c) => displayStatus(c) === "requires_review").length;

  const columns: Column<RefundCandidate>[] = [
    {
      header: "Student",
      className: "max-w-64",
      cell: (c) => <IdentityCell name={c.studentName} id={c.internId} size="sm" href={`/admin/interns/${c.internId}`} sub={c.registeredEmail} />,
    },
    {
      header: "College",
      cell: (c) => (
        <span className="block min-w-0">
          <span className="block truncate text-sm text-foreground">{c.collegeName}</span>
          <span className="block truncate text-xs text-text-subtle">{c.collegeEmail ?? "Not on the roster"}</span>
        </span>
      ),
    },
    { header: "Phone", cell: (c) => <span className="nums whitespace-nowrap text-sm">{c.phone ?? "-"}</span> },
    {
      header: "Transaction",
      cell: (c) => (
        <span className="block">
          <span className="block font-mono text-xs text-foreground">{c.paymentId ?? c.orderId}</span>
          <span className="block text-xs text-text-subtle">
            {c.paidAt ? formatDate(c.paidAt) : "-"} · {c.gateway === "razorpay" ? "Razorpay" : humanizeStatus(c.gateway)}
          </span>
        </span>
      ),
    },
    { header: "Amount", numeric: true, cell: (c) => <span className="nums whitespace-nowrap">{inr(c.refund?.amountMinor ?? c.amountMinor)}</span> },
    { header: "AI interview", cell: (c) => <span className="whitespace-nowrap text-sm">{humanizeStatus(c.interviewStatus)}</span> },
    {
      header: "Eligibility",
      cell: (c) => {
        const e = eligibility(c);
        return (
          <span className="block max-w-56">
            <span className="block text-sm text-foreground">{e.label}</span>
            {e.detail ? <span className="block text-xs text-text-subtle">{e.detail}</span> : null}
          </span>
        );
      },
    },
    {
      header: "Refund",
      cell: (c) => {
        const s = displayStatus(c);
        const sub = c.refund?.lastError ?? (c.refund?.manualReference ? `Ref ${c.refund.manualReference}` : null) ?? c.refund?.gatewayRefundId ?? (c.refund?.status === "rejected" ? c.refund.reviewReason : null);
        return c.refund ? (
          <span className="block max-w-60">
            <StatusBadge tone={STATUS_TONE[s]} label={REFUND_STATUS_LABELS[c.refund.status]} />
            {sub ? <span className="mt-1 block text-xs text-text-subtle [overflow-wrap:anywhere]">{sub}</span> : null}
          </span>
        ) : (
          <span className="text-sm text-text-subtle">Not opened</span>
        );
      },
    },
    ...(canAct
      ? [
          {
            header: "",
            label: "Action",
            cell: (c: RefundCandidate) => (
              <RefundActions
                row={{
                  internPaymentId: c.internPaymentId,
                  studentName: c.studentName,
                  collegeName: c.collegeName,
                  amountMinor: c.amountMinor,
                  decision: c.decision.kind,
                  refund: c.refund ? { id: c.refund.id, status: c.refund.status, amountMinor: c.refund.amountMinor } : null,
                }}
              />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="College refunds"
        subtitle={`Students of partner colleges who paid the activation fee themselves. A refund returns what they paid while the AI interview is not taken, and uses one college seat.${needReview ? ` ${needReview} need${needReview === 1 ? "s" : ""} review.` : ""}`}
      />
      <DataTable<RefundCandidate>
        basePath={BASE}
        params={params}
        page={page}
        pages={pages}
        total={rows.length}
        perPage={req.perPage}
        rows={shown}
        columns={columns}
        rowKey={(c) => c.internPaymentId}
        noun="payments"
        caption="Activation payments by students of partner colleges, with refund status"
        searchPlaceholder="Student, email, phone, college or payment id"
        filters={[{ key: "status", label: "Refund", allLabel: "Every status", options: STATUS_FILTER }]}
        empty={
          params.status || needle
            ? { title: "No payment matches", body: "Clear the filter or search to see every payment." }
            : { title: "No paid activations from college students", body: "A student shows here once they are on a partner college's roster or verified with it and have paid the activation fee." }
        }
      />
    </div>
  );
}
