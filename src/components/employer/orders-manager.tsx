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

import { formatCurrency, formatDate } from "@/lib/format";
import type { EmployerPayment, Proposal } from "@/lib/db/schema";

export type HiredInternItem = {
  proposal: Proposal;
  candidateName: string;
  candidateEmail?: string;
  projectName: string;
  monthlyStipend: number;
  durationMonths: number;
  startDate?: string;
};

export function OrdersManager({
  hiredCandidates,
  paymentHistory,
}: {
  hiredCandidates: HiredInternItem[];
  paymentHistory: EmployerPayment[];
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

  function downloadReceipt(payment: EmployerPayment) {
    const text = `FINDTERN PAYMENT RECEIPT
=======================
Receipt ID: REC-${payment.id.slice(0, 8).toUpperCase()}
Razorpay Order ID: ${payment.orderId}
Payment ID: ${payment.paymentId || "N/A"}
Amount: ₹${(payment.amountMinor / 100).toLocaleString("en-IN")}
Status: ${payment.status.toUpperCase()}
Date: ${payment.paidAt ? new Date(payment.paidAt).toLocaleDateString("en-IN") : "N/A"}
=======================
Findtern Private Limited
https://findtern.in`;

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receipt-${payment.orderId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Page Title & Subtitle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-ink-100 pb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink-900">
            Orders & Payments
          </h1>
          <p className="mt-1 text-sm text-text-subtle">
            Manage your hired placements, invoice downloads, and upcoming monthly stipends.
          </p>
        </div>

        <Link
          href="/employer/cart"
          className="inline-flex items-center gap-2 rounded-xl bg-brand-700 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-brand-600 transition-colors"
        >
          <CreditCard className="size-4" />
          <span>Checkout Active Hires</span>
        </Link>
      </div>

      {/* Tabs strip */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-ink-200/80 bg-white p-1 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveTab("hired")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "hired"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Hired Candidates ({hiredCandidates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("history")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "history"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Order & Invoice History ({paymentHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("upcoming")}
            className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
              activeTab === "upcoming"
                ? "bg-brand-700 text-white shadow-2xs font-semibold"
                : "text-ink-600 hover:text-ink-900"
            }`}
          >
            Upcoming Payments Schedule
          </button>
        </div>

        <div className="relative min-w-0 sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, project, or ID..."
            className="h-9 w-full rounded-xl border border-ink-200 bg-white pl-9 pr-3 text-xs text-ink-900 outline-none transition-colors placeholder:text-ink-400 focus:border-brand-600"
          />
        </div>
      </div>

      {/* Tab 1: Hired Candidates */}
      {activeTab === "hired" && (
        <div>
          {filteredHired.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-12 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <Users className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink-900">
                No hired candidates yet
              </h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-text-subtle">
                Once a candidate accepts your proposal and passes checkout, their hiring contract
                and monthly timesheets will show here.
              </p>
              <Link
                href="/employer/candidates"
                className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
              >
                <span>Browse Candidates</span>
              </Link>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredHired.map((item) => (
                <div
                  key={item.proposal.id}
                  className="rounded-2xl border border-ink-200/80 bg-white p-5 shadow-2xs transition-all hover:shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-ink-900">
                        {item.candidateName}
                      </h3>
                      <p className="text-xs text-text-subtle font-medium">
                        Role on {item.projectName}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 border border-brand-200/60 px-2.5 py-0.5 text-2xs font-semibold text-brand-700">
                      <CheckCircle2 className="size-3" />
                      <span>Hired</span>
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-ink-50/60 p-3.5 text-xs">
                    <div>
                      <p className="text-2xs uppercase tracking-wider text-ink-400 font-semibold">
                        Monthly Stipend
                      </p>
                      <p className="mt-0.5 font-semibold text-ink-900 tabular-nums">
                        ₹{item.monthlyStipend.toLocaleString("en-IN")}/mo
                      </p>
                    </div>
                    <div>
                      <p className="text-2xs uppercase tracking-wider text-ink-400 font-semibold">
                        Duration
                      </p>
                      <p className="mt-0.5 font-semibold text-ink-900">
                        {item.durationMonths} Months
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Link
                      href={`/employer/timesheets`}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:text-brand-800"
                    >
                      <span>Review Timesheets</span>
                      <ArrowUpRight className="size-3.5" />
                    </Link>

                    <Link
                      href={`/employer/proposal/${item.proposal.id}`}
                      className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-2xs font-medium text-ink-700 hover:bg-ink-50"
                    >
                      View Contract
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Order & Payment History */}
      {activeTab === "history" && (
        <div>
          {filteredHistory.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-12 text-center">
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-brand-50 text-brand-700">
                <Receipt className="size-6" />
              </div>
              <h3 className="mt-4 text-base font-semibold text-ink-900">No payment orders recorded</h3>
              <p className="mx-auto mt-1 max-w-sm text-xs text-text-subtle">
                Completed checkout transactions and platform invoices will appear in this ledger.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-2xs">
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
                    const isPaid = p.status === "paid" || p.status === "captured";
                    return (
                      <tr key={p.id} className="hover:bg-ink-50/40 transition-colors">
                        <td className="px-5 py-3.5 font-mono text-2xs text-ink-800">
                          {p.orderId}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-2xs text-text-subtle">
                          {p.paymentId || "—"}
                        </td>
                        <td className="px-5 py-3.5 font-semibold text-ink-900 tabular-nums">
                          {formatCurrency(p.amountMinor, (p.currency as "INR" | "USD") || "INR")}
                        </td>
                        <td className="px-5 py-3.5 text-text-subtle">
                          {p.paidAt ? formatDate(p.paidAt) : "Pending"}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-2xs font-semibold ${
                              isPaid
                                ? "bg-brand-50 text-brand-700 border border-brand-200/60"
                                : "bg-ink-100 text-ink-600 border border-ink-200"
                            }`}
                          >
                            {isPaid ? "Paid" : "Created"}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <button
                            type="button"
                            onClick={() => downloadReceipt(p)}
                            className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-medium text-ink-700 hover:bg-ink-50"
                          >
                            <Download className="size-3" />
                            <span>Receipt</span>
                          </button>
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
          <div className="rounded-xl border border-brand-200/70 bg-brand-50/50 p-4">
            <div className="flex items-start gap-3">
              <Calendar className="size-5 text-brand-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-semibold text-brand-900">
                  Monthly Intern Stipend Settlement Schedule
                </h4>
                <p className="mt-0.5 text-2xs text-brand-800/80 leading-relaxed">
                  Findtern handles automatic escrow and verified monthly timesheet payouts. Dues
                  become payable each calendar cycle following timesheet approval.
                </p>
              </div>
            </div>
          </div>

          {hiredCandidates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 p-12 text-center">
              <Clock className="mx-auto size-8 text-ink-400" />
              <h3 className="mt-3 text-sm font-semibold text-ink-900">
                No active billing schedules
              </h3>
              <p className="mt-1 text-xs text-text-subtle">
                Once interns are active on placements, your upcoming monthly stipend schedule will
                populate here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-ink-200/80 bg-white shadow-2xs">
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
                  {hiredCandidates.map((item) => (
                    <tr key={item.proposal.id} className="hover:bg-ink-50/40">
                      <td className="px-5 py-3.5 font-medium text-ink-900">
                        {item.candidateName}
                      </td>
                      <td className="px-5 py-3.5 text-text-subtle">
                        {item.projectName}
                      </td>
                      <td className="px-5 py-3.5 text-text-subtle">
                        1st of Next Month
                      </td>
                      <td className="px-5 py-3.5 font-semibold text-ink-900 tabular-nums">
                        ₹{item.monthlyStipend.toLocaleString("en-IN")}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center rounded-full bg-accent-100/60 px-2 py-0.5 text-2xs font-semibold text-accent-700 border border-accent-300/50">
                          Upcoming
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <Link
                          href="/employer/cart"
                          className="inline-flex items-center gap-1 rounded-lg bg-brand-700 px-3 py-1 text-2xs font-semibold text-white hover:bg-brand-600 transition-colors"
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
