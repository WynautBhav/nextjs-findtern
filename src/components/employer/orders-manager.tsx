"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  Receipt,
  Search,
  Users,
} from "lucide-react";
import { FullTimeOfferButton } from "@/components/employer/full-time-offer-button";
import { PageHeader } from "@/components/layout/page-header";

import { formatCurrency, formatDate, formatMoney } from "@/lib/format";
import type { EmployerPayment, Proposal } from "@/lib/db/schema";
import { placeOfSupply, type InvoiceBuyerProfile } from "@/lib/gst";
import { downloadInvoice, invoiceNumberOf, taxInvoiceHtml, type InvoiceSeller } from "@/lib/invoice";
import { downloadCsv } from "@/lib/admin/csv";

export type HiredInternItem = {
  proposal: Proposal;
  candidateName: string;
  candidateEmail?: string;
  projectName: string;
  /** Minor units of `currency`; null when the offer has none. */
  monthlyStipend: number | null;
  currency: "INR" | "USD";
  durationMonths: number;
  startDate?: string;
  /** True for a paid placement that can still get a full-time offer. */
  canOfferFullTime?: boolean;
};

/** A monthly-plan placement with months still owed. */
export type UpcomingDue = HiredInternItem & { monthsPaid: number; nextDue: string | null };

/**
 * One line per placement the order paid for (from the order notes), instead
 * of one generic line. Falls back to the generic text for old orders.
 */
function invoiceLines(payment: EmployerPayment, labels: Record<string, string>): string[] {
  const raw = (payment.raw ?? {}) as Record<string, unknown>;
  const notes = ((raw.notes ?? (raw.order as Record<string, unknown> | undefined)?.notes) ?? {}) as Record<string, unknown>;
  let ids: unknown = notes.proposalIds ?? notes.proposal_ids ?? [];
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  return (Array.isArray(ids) ? ids : []).map((id) => labels[String(id)]).filter(Boolean);
}

/** Promo the order used, as the order route stored it. */
function invoicePromo(payment: EmployerPayment): { code: string; discountMinor: number | null } | null {
  const raw = (payment.raw ?? {}) as { promo?: { promoCode?: string; discountMinor?: number }; promoCode?: string };
  const code = raw.promo?.promoCode ?? raw.promoCode;
  return code ? { code, discountMinor: raw.promo?.discountMinor ?? null } : null;
}

function invoiceDescription(payment: EmployerPayment, labels: Record<string, string>): string {
  const raw = (payment.raw ?? {}) as Record<string, unknown>;
  const notes = ((raw.notes ?? (raw.order as Record<string, unknown> | undefined)?.notes) ?? {}) as Record<string, unknown>;
  let ids: unknown = notes.proposalIds ?? notes.proposal_ids ?? [];
  if (typeof ids === "string") {
    try {
      ids = JSON.parse(ids);
    } catch {
      ids = [];
    }
  }
  const lines = (Array.isArray(ids) ? ids : []).map((id) => labels[String(id)]).filter(Boolean);
  const monthly = notes.paymentMode === "monthly";
  if (lines.length === 0) return "Intern hiring services (per-hire charge and hourly engagement)";
  return `Intern hiring services${monthly ? " - monthly instalment" : ""}: ${lines.join("; ")}`;
}

/** The stored order status as the employer should read it. */
function paymentStatusLabel(status: string): { label: string; paid: boolean } {
  if (status === "paid" || status === "captured") return { label: "Paid", paid: true };
  if (status === "failed") return { label: "Failed", paid: false };
  if (status === "cancelled" || status === "canceled") return { label: "Cancelled", paid: false };
  return { label: "Pending", paid: false };
}

export function OrdersManager({
  hiredCandidates,
  upcomingDues,
  lineLabels,
  paymentHistory,
  seller,
  buyer,
  employerId,
  fteStatus,
  timezone,
}: {
  employerId: string;
  fteStatus: string;
  /** The company's timezone, from its location. */
  timezone?: string;
  hiredCandidates: HiredInternItem[];
  upcomingDues: UpcomingDue[];
  /** proposalId → line label, to itemise each invoice. */
  lineLabels: Record<string, string>;
  paymentHistory: EmployerPayment[];
  seller: InvoiceSeller;
  buyer: InvoiceBuyerProfile;
}) {
  const [activeTab, setActiveTab] = useState<"hired" | "history" | "upcoming">("hired");
  const [search, setSearch] = useState("");

  const filteredHired = hiredCandidates.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      item.candidateName.toLowerCase().includes(q) ||
      item.projectName.toLowerCase().includes(q)
    );
  });

  const filteredHistory = paymentHistory.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (p.orderId && p.orderId.toLowerCase().includes(q)) ||
      (p.paymentId && p.paymentId.toLowerCase().includes(q))
    );
  });

  async function downloadTaxInvoice(payment: EmployerPayment) {
    const currency = payment.currency || "INR";
    const html = taxInvoiceHtml({
      invoiceNo: invoiceNumberOf(payment),
      date: payment.paidAt ? new Date(payment.paidAt) : new Date(),
      orderId: payment.orderId,
      paymentId: payment.paymentId,
      currency,
      amountMinor: payment.amountMinor,
      description: invoiceDescription(payment, lineLabels),
      // One line per placement the order paid for, plus the promo row.
      items: invoiceLines(payment, lineLabels),
      promo: invoicePromo(payment),
      seller,
      buyer: { ...buyer, place: placeOfSupply({ ...buyer, currency }) },
    });
    await downloadInvoice(html, `Invoice-${invoiceNumberOf(payment).replace(/\//g, "-")}.pdf`);
  }

  function exportTimesheetsCsv() {
    downloadCsv("hired-candidates", filteredHired, [
      { header: "Candidate Name", value: (h) => h.candidateName },
      { header: "Candidate Email", value: (h) => h.candidateEmail },
      { header: "Project Name", value: (h) => h.projectName },
      { header: "Monthly Stipend", value: (h) => (h.monthlyStipend != null ? h.monthlyStipend / 100 : "") },
      { header: "Currency", value: (h) => h.currency },
      { header: "Duration (Months)", value: (h) => h.durationMonths },
      { header: "Start Date", value: (h) => h.startDate || "Immediate" },
      { header: "Status", value: () => "Hired" },
    ]);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders & Payments"
        subtitle="Manage your hired placements, invoice downloads, and upcoming monthly stipends."
        action={
          <Link
            href="/employer/cart"
            className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[10px] bg-brand-700 px-4 text-xs font-semibold text-white shadow-xs hover:bg-brand-600"
          >
            <CreditCard className="size-4" />
            <span>Checkout Active Hires</span>
          </Link>
        }
      />

      {/* Tabs strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex max-w-full min-w-0 overflow-x-auto rounded-[10px] border border-ink-200/80 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab("hired")}
            className={`apple-spring apple-pressable min-h-11 shrink-0 whitespace-nowrap rounded-[10px] px-3.5 text-xs font-medium tabular-nums ${
              activeTab === "hired"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Hired ({hiredCandidates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`apple-spring apple-pressable min-h-11 shrink-0 whitespace-nowrap rounded-[10px] px-3.5 text-xs font-medium tabular-nums ${
              activeTab === "history"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Invoices ({paymentHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("upcoming")}
            className={`apple-spring apple-pressable min-h-11 shrink-0 whitespace-nowrap rounded-[10px] px-3.5 text-xs font-medium ${
              activeTab === "upcoming"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Upcoming
          </button>
        </div>

        <div className="relative min-w-0 sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, project, or ID..."
            className="apple-spring min-h-11 w-full rounded-[10px] border border-ink-200 bg-white pl-9 pr-3 text-[14px] text-ink-900 outline-none placeholder:text-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>
      </div>

      {/* Tab 1: Hired Candidates */}
      {activeTab === "hired" && (
        <div>
          {filteredHired.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-ink-200/70 bg-white/60 p-12 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-[10px] bg-brand-50 text-brand-700">
                <Users className="size-6" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-ink-900">
                No hired candidates yet
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-xs text-text-subtle">
                Once a candidate accepts your proposal and passes checkout, their hiring contract
                and monthly timesheets will show here.
              </p>
              <Link
                href="/employer/candidates"
                className="apple-spring apple-pressable mt-5 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-xs font-semibold text-white hover:bg-brand-600"
              >
                <span>Browse Candidates</span>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-text-subtle">
                  Showing {filteredHired.length} hired talent engagement{filteredHired.length === 1 ? "" : "s"}.
                </p>
                <button
                  type="button"
                  onClick={exportTimesheetsCsv}
                  className="apple-spring apple-pressable inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-ink-200 bg-white px-3 text-xs font-semibold text-ink-700 shadow-2xs hover:border-brand-400 hover:text-brand-800"
                >
                  <Download className="size-3.5" />
                  <span>Export Timesheet CSV</span>
                </button>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {filteredHired.map((item) => (
                <div
                  key={item.proposal.id}
                  className="apple-spring rounded-[20px] border border-ink-200/70 bg-white p-5 shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)] space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-ink-900">
                        {item.candidateName}
                      </h2>
                      <p className="text-xs text-text-subtle font-medium">
                        Role on {item.projectName}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200/60 px-2.5 py-0.5 text-xs font-semibold text-brand-700">
                      <CheckCircle2 className="size-3" />
                      <span>Hired</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-[10px] bg-ink-50/60 p-3.5 text-xs">
                    <div>
                      <p className="text-2xs uppercase tracking-wider text-ink-600 font-semibold">
                        Monthly Stipend
                      </p>
                      <p className="mt-0.5 font-semibold text-ink-900 tabular-nums">
                        {item.monthlyStipend != null ? `${formatMoney(item.monthlyStipend, item.currency)}/mo` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wider text-ink-600 font-semibold">
                        Duration
                      </p>
                      <p className="mt-0.5 font-semibold tabular-nums text-ink-900">
                        {item.durationMonths} Months
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Link
                      href={`/employer/timesheets`}
                      className="apple-spring inline-flex min-h-11 items-center gap-1 rounded-[10px] text-xs font-semibold text-brand-700 hover:text-brand-800"
                    >
                      <span>Review Timesheets</span>
                      <ArrowUpRight className="size-3.5" />
                    </Link>

                    <span className="flex items-center gap-2">
                      {item.canOfferFullTime ? (
                        <FullTimeOfferButton
                          employerId={employerId}
                          proposalId={item.proposal.id}
                          candidate={item.candidateName}
                          fteStatus={fteStatus}
                          timezone={timezone}
                        />
                      ) : null}
                      <Link
                        href={`/employer/proposal/${item.proposal.id}`}
                        className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center rounded-[10px] border border-ink-200 bg-white px-3 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                      >
                        View contract
                      </Link>
                    </span>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Order & Payment History */}
      {activeTab === "history" && (
        <div>
          {filteredHistory.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-ink-200/70 bg-white/60 p-12 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-[10px] bg-brand-50 text-brand-700">
                <Receipt className="size-6" />
              </div>
              <h2 className="mt-4 text-base font-semibold text-ink-900">No payment orders recorded</h2>
              <p className="mx-auto mt-1 max-w-sm text-xs text-text-subtle">
                Completed checkout transactions and platform invoices will appear in this ledger.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink-200/70 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
                  <tr>
                    <th className="px-5 py-3">Order ID</th>
                    <th className="px-5 py-3">Payment ID</th>
                    <th className="px-5 py-3">Amount</th>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filteredHistory.map((p) => {
                    const { label: statusLabel, paid: isPaid } = paymentStatusLabel(p.status);
                    return (
                      <tr key={p.id} className="apple-spring hover:bg-ink-50/40">
                        <td className="px-5 py-3.5 font-mono text-xs tabular-nums text-ink-800">
                          {p.orderId}
                          {p.invoiceNumber ? (
                            <span className="mt-0.5 block font-sans text-2xs font-semibold text-ink-600">
                              Invoice {p.invoiceNumber}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-xs text-text-subtle">
                          {p.paymentId || "-"}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-ink-900 tabular-nums">
                          {formatCurrency(p.amountMinor, (p.currency as "INR" | "USD") || "INR")}
                        </td>
                        <td className="px-5 py-3.5 tabular-nums text-text-subtle">
                          {p.paidAt ? formatDate(p.paidAt) : "Pending"}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                              isPaid
                                ? "bg-brand-50 text-brand-700 border border-brand-200/60"
                                : "bg-ink-100 text-ink-600 border border-ink-200"
                            }`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {/* A tax invoice exists only for money received. */}
                          {isPaid ? (
                            <button
                              type="button"
                              onClick={() => downloadTaxInvoice(p)}
                              className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1 rounded-[10px] border border-ink-200 bg-white px-2.5 text-xs font-medium text-ink-700 hover:border-ink-300 hover:bg-ink-50"
                            >
                              <Download className="size-3" />
                              <span>Tax Invoice</span>
                            </button>
                          ) : (
                            <span className="text-xs text-text-subtle">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Upcoming Payments Schedule */}
      {activeTab === "upcoming" && (
        <div className="space-y-4">
          <div className="rounded-[10px] border border-brand-200/70 bg-brand-50/50 p-4">
            <div className="flex items-start gap-3">
              <Calendar className="size-5 text-brand-700 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-xs font-semibold text-brand-900">
                  Monthly Intern Stipend Settlement Schedule
                </h3>
                <p className="mt-0.5 text-xs text-brand-800/80 leading-relaxed">
                  Findtern handles automatic escrow and verified monthly timesheet payouts. Dues
                  become payable each calendar cycle following timesheet approval.
                </p>
              </div>
            </div>
          </div>

          {upcomingDues.length === 0 ? (
            <div className="rounded-[20px] border border-dashed border-ink-200/70 bg-white/60 p-12 text-center">
              <Clock className="mx-auto size-8 text-ink-400" />
              <h2 className="mt-3 text-sm font-semibold text-ink-900">
                No active billing schedules
              </h2>
              <p className="mt-1 text-xs text-text-subtle">
                Once interns are active on placements, your upcoming monthly stipend schedule will
                populate here.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-[20px] border border-ink-200/70 bg-white shadow-[0_1px_2px_rgb(7_47_36/0.04),0_8px_24px_rgb(7_47_36/0.06)]">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
                  <tr>
                    <th className="px-5 py-3">Candidate</th>
                    <th className="px-5 py-3">Project</th>
                    <th className="px-5 py-3">Next Due Date</th>
                    <th className="px-5 py-3">Installment Due</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {upcomingDues.map((item) => (
                    <tr key={item.proposal.id} className="apple-spring hover:bg-ink-50/40">
                      <td className="px-5 py-3.5 font-medium text-ink-900">
                        {item.candidateName}
                      </td>
                      <td className="px-5 py-3.5 text-text-subtle">
                        {item.projectName}
                      </td>
                      <td className="px-5 py-3.5 tabular-nums text-text-subtle">
                        {item.nextDue ? formatDate(item.nextDue) : "On payment"}
                        <span className="block text-[11px]">
                          Month {item.monthsPaid + 1} of {item.durationMonths}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-ink-900 tabular-nums">
                        {item.monthlyStipend != null ? formatMoney(item.monthlyStipend, item.currency) : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center rounded-full bg-accent-100/60 px-2 py-0.5 text-xs font-semibold text-accent-700 border border-accent-300/50">
                          Upcoming
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href="/employer/checkout"
                          className="apple-spring apple-pressable inline-flex min-h-11 items-center justify-center gap-1 rounded-[10px] bg-brand-700 px-3 text-xs font-semibold text-white hover:bg-brand-600"
                        >
                          <span>Pay Installment</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
