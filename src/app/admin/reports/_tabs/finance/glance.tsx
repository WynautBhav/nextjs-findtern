import { StatStrip } from "@/components/admin/reports/stat-strip";
import { statDelta } from "@/lib/admin/reports/growth";
import { financeFor } from "@/lib/admin/reports/finance-load";
import { formatMoney, formatNumber } from "@/lib/format";

import type { TabProps } from "../types";

/** A real minus sign glued to the figure, never a hyphen that can wrap off it. */
export const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "₹0" }).replace(/^[-–−]\s*/, "\u2212");

/** Finance at a glance: what came in, what went back, what went out, in the period. */
export default async function Glance({ window: w }: TabProps) {
  const d = await financeFor(w);
  const f = d.figures;
  const label = w.kind === "all" ? "all time" : w.label.toLowerCase();
  const received = d.received.receivedMinor;
  const prevReceived = d.receivedPrev ? d.receivedPrev.receivedMinor : null;
  const net = received - f.refundedMinor;
  const paidOut = d.payouts.stipend.paid.inrMinor;

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="finance-glance">
      <StatStrip
        label="Finance at a glance"
        stats={[
          { label: "Collected", value: inr(received), note: `${label}: orders, activation fees and college seats, gross of refunds`, accent: true, ...statDelta(received, prevReceived) },
          { label: "Net collected", value: inr(net), note: `after ${inr(f.refundedMinor)} refunded`, negative: net < 0 },
          { label: "Employer orders", value: formatNumber(f.employer.orders.count), note: `${formatNumber(f.employer.collected.count)} collected for ${inr(f.employer.collected.inrMinor)}` },
          { label: "Intern activation fees", value: formatNumber(f.intern.collected.count), note: `${inr(f.intern.collected.inrMinor)} received${f.intern.notCollected.count ? ` · ${formatNumber(f.intern.notCollected.count)} not paid` : ""}` },
          { label: "Stipends paid to interns", value: inr(paidOut), note: `${formatNumber(d.payouts.stipend.paid.count)} payouts · ${inr(d.payouts.stipend.pending.inrMinor)} pending` },
          { label: "Refunds", value: inr(f.refundedMinor), note: "refunds dated in this period" },
        ]}
      />
      <StatStrip
        label="Adjustments and tax"
        stats={[
          { label: "Promo discounts given", value: inr(f.discountMinor.total), note: "on paid orders and fees, waived ones included" },
          { label: "Waived orders", value: formatNumber(f.waived.count), note: "fully waived by a promo code; not in collected" },
          { label: "GST collected", value: inr(f.gstMinor), note: "18% inside rupee orders and fees (college seats not included)" },
          { label: "Dollar payments", value: formatMoney(f.currency.USD.minor, "USD", { zeroLabel: "$0" }), note: `${formatNumber(f.currency.USD.count)} payments · ${inr(f.currency.USD.inrEquivalentMinor)} at ₹100 per $1` },
        ]}
      />
    </div>
  );
}
