import Link from "next/link";
import { CircleCheck, CircleSlash, CircleX, Clock, Gift } from "lucide-react";

import { Pill, type Tone } from "@/components/app/primitives";
import { InvoiceRowActions } from "@/components/admin/invoice-actions";
import { Ledger, Money, type LedgerColumn } from "@/components/admin/money/ledger";
import { displayInvoiceNumber, gatewayLabel, INVOICE_KINDS, type AdminInvoiceRow } from "@/lib/admin/invoice-rows";
import { formatDate, formatMoney } from "@/lib/format";
import { placeOfSupply, splitGst } from "@/lib/gst";
import type { InvoiceSeller } from "@/lib/invoice";
import { cn } from "@/lib/utils";

/**
 * Intern activation fees as a ruled ledger: who, the invoice number, the order and payment, what was charged (GST
 * inside it), the promo code and what it took off, the state (a word and an icon) and the date. The actions are the
 * same two as ever: print the tax invoice, and the payment details.
 */

type Chip = { label: string; tone: Tone; icon: React.ReactNode; className?: string };

/** The state of one row, in words: a 100%-code activation is "Free with a code", never just "Paid ₹0". */
export function invoiceChip(r: AdminInvoiceRow): Chip {
  if (r.flagOnly) return { label: "Marked paid", tone: "neutral", icon: <CircleCheck aria-hidden /> };
  if (r.status === "paid") {
    return r.amountMinor === 0 ? { label: "Free with a code", tone: "neutral", icon: <Gift aria-hidden /> } : { label: "Paid", tone: "live", icon: <CircleCheck aria-hidden /> };
  }
  if (r.status === "created") return { label: "Pending", tone: "waiting", icon: <Clock aria-hidden /> };
  if (r.status === "failed") return { label: "Failed", tone: "neutral", icon: <CircleX aria-hidden />, className: "bg-danger-soft text-danger" };
  if (r.status === "cancelled") return { label: "Cancelled", tone: "closed", icon: <CircleSlash aria-hidden /> };
  return { label: r.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), tone: "neutral", icon: <CircleSlash aria-hidden /> };
}

/** Why a row has no invoice number, in a phrase. */
function noInvoiceNote(r: AdminInvoiceRow): string {
  if (r.flagOnly) return "marked paid by an admin";
  if (r.status === "paid") return r.amountMinor === 0 ? "free, so no tax invoice" : "";
  return "not paid";
}

const money = (minor: number, currency: string) => formatMoney(minor, currency === "USD" ? "USD" : "INR", { zeroLabel: false });
const gstOf = (r: AdminInvoiceRow) => r.amountMinor - splitGst(r.amountMinor, placeOfSupply({ ...r.buyer, currency: r.currency })).baseMinor;

export function InternInvoiceLedger({ rows, seller }: { rows: AdminInvoiceRow[]; seller: InvoiceSeller }) {
  const k = INVOICE_KINDS.intern;
  const columns: LedgerColumn<AdminInvoiceRow>[] = [
    {
      key: "who",
      header: "Intern",
      primary: true,
      cell: (r) => (
        <span className="block min-w-0 md:max-w-40">
          <Link href={`${k.hrefBase}/${r.partyId}`} className="block truncate font-medium text-ink-900 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700">
            {r.partyName}
          </Link>
          <span className="block truncate text-xs text-ink-600" title={r.partyEmail}>
            {r.partyEmail}
          </span>
        </span>
      ),
    },
    {
      key: "invoice",
      header: "Invoice",
      cell: (r) => {
        const n = displayInvoiceNumber(r, k.invoicePrefix);
        return (
          <span className="block min-w-0 md:max-w-36">
            {n ? <span className="nums block whitespace-nowrap">{n}</span> : <span className="block text-ink-600" title={noInvoiceNote(r) || undefined}>none</span>}
            <span className="nums block truncate text-xs text-ink-600" title={r.orderId}>
              {r.flagOnly ? "no order" : r.orderId}
            </span>
          </span>
        );
      },
    },
    {
      key: "ref",
      header: "Payment",
      // On a phone the order id is already under the invoice number; the gateway and payment id are in the details.
      hideOnCard: true,
      cell: (r) => (
        <span className="block min-w-0 md:max-w-32">
          <span className="block truncate text-ink-900">{gatewayLabel(r.gateway)}</span>
          <span className="nums block truncate text-xs text-ink-600" title={r.paymentId ?? undefined}>
            {r.paymentId ?? "no payment id"}
          </span>
        </span>
      ),
    },
    {
      key: "amount",
      header: "Charged",
      align: "right",
      cell: (r) => (
        <span className="block whitespace-nowrap">
          <Money minor={r.amountMinor} className="font-semibold" />
          {r.amountMinor > 0 && r.status === "paid" ? <span className="nums block text-xs text-ink-600">GST in it {money(gstOf(r), r.currency)}</span> : null}
        </span>
      ),
    },
    {
      key: "promo",
      header: "Promo code",
      cell: (r) =>
        r.promoCode || (r.discountMinor ?? 0) > 0 ? (
          <span className="block whitespace-nowrap">
            <span className="font-medium text-ink-900">{r.promoCode ?? r.discountLabel}</span>
            <span className="nums block text-xs text-ink-600">{(r.discountMinor ?? 0) > 0 ? `took off ${money(r.discountMinor ?? 0, r.currency)}` : "discount not recorded"}</span>
          </span>
        ) : (
          <span className="text-ink-600">–</span>
        ),
    },
    {
      key: "status",
      header: "State and date",
      cell: (r) => {
        const c = invoiceChip(r);
        return (
          <span className="block">
            <Pill tone={c.tone} icon={c.icon} className={cn("whitespace-nowrap", c.className)}>
              {c.label}
            </Pill>
            <span className="nums mt-1 block whitespace-nowrap text-xs text-ink-600">
              {r.paidAt ? "paid " : "started "}
              {formatDate(r.paidAt ?? r.createdAt)}
            </span>
          </span>
        );
      },
    },
    { key: "actions", header: "Actions", align: "right", cell: (r) => <InvoiceRowActions row={r} kind="intern" seller={seller} /> },
  ];
  return <Ledger columns={columns} rows={rows} rowKey={(r) => r.id} caption="Intern activation payments" />;
}
