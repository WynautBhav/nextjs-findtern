"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye, FileText, Receipt, Search } from "lucide-react";

import { downloadCsv } from "@/lib/admin/csv";
import { formatDate, formatMoney } from "@/lib/format";
import { placeOfSupply, splitGst, type InvoiceBuyerProfile } from "@/lib/gst";
import { toInrMinor } from "@/lib/admin/money";
import { downloadInvoice, taxInvoiceHtml, type InvoiceSeller, invoiceNumberOf } from "@/lib/invoice";
import { StatusBadge } from "@/components/admin/status-badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** One payment row, from either employer orders or intern activation fees. */
export type AdminInvoiceRow = {
  id: string;
  /** FY serial stored at payment ("FT/2026-27/0001"); null for unpaid rows. */
  invoiceNumber?: string | null;
  orderId: string;
  paymentId?: string | null;
  amountMinor: number;
  currency: string;
  status: string;
  paidAt?: string | null;
  createdAt: string | null;
  partyId: string;
  partyName: string;
  partyEmail: string;
  buyer: InvoiceBuyerProfile;
  /** Interns this order paid for (employer orders). */
  interns?: string;
  promoCode?: string | null;
  discountMinor?: number | null;
  /** Paid, but not every proposal could be hired - accounts should refund the difference. */
  needsReview?: boolean;
  /** Paid outside this ledger (only the profile's paid flag records it). */
  flagOnly?: boolean;
};

const KINDS = {
  employer: {
    title: "All orders",
    party: "Company",
    href: (id: string) => `/admin/companies/${id}`,
    csv: "employer-orders",
    invoicePrefix: "INV",
    description: "Intern hiring services (per-hire charge and hourly engagement)",
    sac: undefined,
  },
  intern: {
    title: "Intern activation payments",
    party: "Intern",
    href: (id: string) => `/admin/interns/${id}`,
    csv: "intern-invoices",
    invoicePrefix: "FT-INT",
    description: "Candidate activation: AI interview, talent profiling and placement guarantee as per terms",
    sac: "999293",
  },
} as const;

const isPaid = (r: AdminInvoiceRow) => r.status === "paid" || r.status === "captured";

export function AdminInvoicesView({
  kind,
  rows,
  seller,
}: {
  kind: keyof typeof KINDS;
  rows: AdminInvoiceRow[];
  seller: InvoiceSeller;
}) {
  const k = KINDS[kind];
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [currency, setCurrency] = useState("all");
  const [promo, setPromo] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AdminInvoiceRow | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return rows.filter(
      (r) =>
        (!q || [r.orderId, r.paymentId ?? "", r.partyName, r.partyEmail].some((v) => v.toLowerCase().includes(q))) &&
        (status === "all" || (status === "paid" ? isPaid(r) : r.status === status)) &&
        (currency === "all" || r.currency === currency) &&
        (promo === "all" || (promo === "with" ? Boolean(r.promoCode) : !r.promoCode)) &&
        inDateRange(r.paidAt ?? r.createdAt, from, to),
    );
  }, [rows, search, status, currency, promo, from, to]);

  // One currency: USD converted at ₹100/$ (adding cents to paise overstated nothing and understated USD).
  const paidMinor = rows.filter(isPaid).reduce((s, r) => s + toInrMinor(r.amountMinor, r.currency), 0);
  const pendingMinor = rows.filter((r) => !isPaid(r)).reduce((s, r) => s + toInrMinor(r.amountMinor, r.currency), 0);
  const gstBase = (r: AdminInvoiceRow) => splitGst(r.amountMinor, placeOfSupply({ ...r.buyer, currency: r.currency })).baseMinor;

  function exportCsv() {
    downloadCsv(k.csv, filtered, [
      { header: "Order ID", value: (r) => r.orderId },
      { header: "Payment ID", value: (r) => r.paymentId },
      { header: k.party, value: (r) => r.partyName },
      { header: "Email", value: (r) => r.partyEmail },
      ...(kind === "employer" ? [{ header: "Interns", value: (r: AdminInvoiceRow) => r.interns ?? "" }] : []),
      { header: "Amount", value: (r) => (r.amountMinor / 100).toFixed(2) },
      { header: "Currency", value: (r) => r.currency },
      // 18% GST is included in INR amounts; USD (export) carries none.
      { header: "Amount before GST", value: (r) => (gstBase(r) / 100).toFixed(2) },
      { header: "GST", value: (r) => ((r.amountMinor - gstBase(r)) / 100).toFixed(2) },
      { header: "Promo code", value: (r) => r.promoCode ?? "" },
      { header: "Status", value: (r) => r.status },
      { header: "Needs review", value: (r) => (r.needsReview ? "yes" : "") },
      { header: "Paid At", value: (r) => r.paidAt },
      { header: "Created At", value: (r) => r.createdAt },
    ]);
  }

  async function printInvoice(r: AdminInvoiceRow) {
    const html = taxInvoiceHtml({
      invoiceNo: invoiceNumberOf(r, k.invoicePrefix),
      date: r.paidAt || r.createdAt ? new Date((r.paidAt ?? r.createdAt)!) : new Date(),
      orderId: r.orderId,
      paymentId: r.paymentId,
      currency: r.currency,
      amountMinor: r.amountMinor,
      description: k.description,
      seller,
      buyer: { ...r.buyer, place: placeOfSupply({ ...r.buyer, currency: r.currency }) },
      sac: k.sac,
      items: r.interns ? r.interns.split("; ").filter(Boolean) : undefined,
      promo: r.promoCode ? { code: r.promoCode, discountMinor: r.discountMinor } : null,
    });
    await downloadInvoice(html, `Invoice-${r.orderId.slice(-8).toUpperCase()}.pdf`);
  }

  const money = (r: AdminInvoiceRow) => formatMoney(r.amountMinor, r.currency, { zeroLabel: false });
  const select = "rounded-xl border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 focus:border-brand-500 focus:outline-hidden";

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Metric label="Payments" value={String(rows.length)} />
        <Metric label="Collected (USD at ₹100/$)" value={formatMoney(paidMinor, "INR", { zeroLabel: false })} tone="text-brand-700" />
        <Metric label="Not collected (USD at ₹100/$)" value={formatMoney(pendingMinor, "INR", { zeroLabel: false })} tone="text-amber-700" />
      </div>

      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
        <div className="flex flex-col justify-between gap-4 border-b border-ink-100 pb-5 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-bold text-ink-900">{k.title}</h3>
            <p className="text-xs text-text-subtle">{filtered.length} found</p>
          </div>
          <button
            type="button"
            onClick={exportCsv}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
          >
            <Download className="size-3.5" /> Export CSV
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search by ${k.party.toLowerCase()}, email, order or payment ID`}
              aria-label="Search payments"
              className="w-full rounded-xl border border-ink-200 bg-white py-2 pl-9 pr-4 text-xs focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} aria-label="Currency" className={select}>
            <option value="all">All currencies</option>
            <option value="INR">INR</option>
            <option value="USD">USD</option>
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status" className={select}>
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="created">Pending</option>
            <option value="failed">Failed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select value={promo} onChange={(e) => setPromo(e.target.value)} aria-label="Promo code" className={select}>
            <option value="all">Any promo</option>
            <option value="with">With promo code</option>
            <option value="without">Without promo code</option>
          </select>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" className={select} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" className={select} />
        </div>

        <div className="mt-5 overflow-x-auto rounded-xl border border-ink-100">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ink-100 bg-ink-50/70 font-semibold text-ink-700">
              <tr>
                <th className="px-5 py-3">Order ID</th>
                <th className="px-5 py-3">{k.party}</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Payment ID</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-ink-500">
                    <Receipt className="mx-auto mb-2 size-8 text-ink-300" />
                    <p className="text-xs font-medium">Nothing matches these filters</p>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-ink-50/40">
                    <td className="px-5 py-3.5 font-mono font-semibold text-ink-900">{r.orderId}</td>
                    <td className="px-5 py-3.5">
                      <Link href={k.href(r.partyId)} className="font-semibold text-ink-900 hover:text-brand-700 hover:underline">
                        {r.partyName}
                      </Link>
                      <p className="text-2xs text-text-subtle">{r.partyEmail}</p>
                    </td>
                    <td className="px-5 py-3.5 font-bold tabular-nums text-ink-900">{money(r)}</td>
                    <td className="px-5 py-3.5 font-mono text-2xs text-text-subtle">{r.paymentId || "-"}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-flex flex-wrap items-center gap-1">
                        <StatusBadge value={isPaid(r) ? "paid" : r.status} />
                        {r.needsReview ? <StatusBadge tone="danger" label="Needs review" /> : null}
                        {r.flagOnly ? <StatusBadge tone="neutral" label="Marked paid" /> : null}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 tabular-nums text-text-subtle">{formatDate(r.paidAt ?? r.createdAt)}</td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => printInvoice(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-brand-200 bg-white px-2.5 py-1 text-2xs font-semibold text-brand-700 hover:bg-brand-50"
                        >
                          <Download className="size-3" /> Invoice
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelected(r)}
                          className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-semibold text-ink-700 hover:bg-brand-50"
                        >
                          <Eye className="size-3" /> View
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-ink-900">
              <FileText className="size-4 text-brand-600" /> Payment details
            </DialogTitle>
            <DialogDescription className="text-xs text-text-subtle">{k.description}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 pt-2 text-xs">
              <dl className="space-y-2 rounded-xl border border-ink-100 bg-ink-50/60 p-4">
                <Row label="Order ID"><span className="font-mono font-bold">{selected.orderId}</span></Row>
                <Row label="Payment ID"><span className="font-mono">{selected.paymentId || "Not captured"}</span></Row>
                <Row label={k.party}>{selected.partyName}</Row>
                <Row label="Status"><StatusBadge value={selected.status} /></Row>
                <Row label="Amount"><span className="text-sm font-bold text-brand-800">{money(selected)}</span></Row>
                <Row label="Date">{formatDate(selected.paidAt ?? selected.createdAt)}</Row>
              </dl>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => printInvoice(selected)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  <Download className="size-3.5" /> Tax invoice
                </button>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-xl border border-ink-200 px-4 py-2 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({ label, value, tone = "text-ink-900" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-ink-100 bg-white p-5 shadow-2xs">
      <p className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">{label}</p>
      <p className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-ink-100 pb-2 last:border-0 last:pb-0">
      <dt className="text-text-subtle">{label}</dt>
      <dd className="text-ink-900">{children}</dd>
    </div>
  );
}

/** `YYYY-MM-DD` bounds, inclusive; empty bounds are open. */
function inDateRange(at: string | null | undefined, from: string, to: string): boolean {
  if (!from && !to) return true;
  if (!at) return false;
  const day = at.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}
