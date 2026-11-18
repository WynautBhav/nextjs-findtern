import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { windowWords } from "@/components/admin/money/rp-parts";
import { financeFor } from "@/lib/admin/reports/finance-load";
import { formatMoney, formatNumber } from "@/lib/format";

import { changeSentence } from "../overview/growth";
import type { TabProps } from "../types";

/** A real minus sign glued to the figure, never a hyphen that can wrap off it. */
export const inr = (m: number) => formatMoney(m, "INR", { zeroLabel: "₹0" }).replace(/^[-–−]\s*/, "−");

/** Finance: ONE lead figure (collected), the quiet list of what went back and out, and the adjustments and tax. */
export default async function Glance({ window: w }: TabProps) {
  const d = await financeFor(w);
  const f = d.figures;
  const label = windowWords(w);
  const received = d.received.receivedMinor;
  const prevReceived = d.receivedPrev ? d.receivedPrev.receivedMinor : null;
  const net = received - f.refundedMinor;

  return (
    <div className="space-y-10 lg:space-y-12" data-rp="finance-glance">
      <Overview
        lead={
          <LeadStat
            label={`Collected, ${label}`}
            value={inr(received)}
            note={`Employer orders, intern activation fees and college seats, gross of refunds. ${changeSentence(received, prevReceived)}`.trim()}
          />
        }
        rest={
          <StatList
            items={[
              { label: "Net of refunds", value: inr(net), hint: `Collected less the ${inr(f.refundedMinor)} refunded.` },
              { label: "Stipends paid to interns", value: inr(d.payouts.stipend.paid.inrMinor), hint: `${formatNumber(d.payouts.stipend.paid.count)} payouts made; ${inr(d.payouts.stipend.pending.inrMinor)} still pending.` },
              { label: "Refunds", value: inr(f.refundedMinor), hint: "Refunds dated in this period." },
              { label: "GST collected", value: inr(f.gstMinor), hint: "18% inside rupee orders and fees; college seats not included." },
            ]}
          />
        }
      />
      <Section title="Adjustments" hint="What was given back before the money moved, and what came in as dollars.">
        <StatList
          items={[
            { label: "Promo discounts given", value: inr(f.discountMinor.total), hint: "On paid orders and fees, waived ones included." },
            { label: "Dollar payments", value: formatMoney(f.currency.USD.minor, "USD", { zeroLabel: "$0" }), hint: `${formatNumber(f.currency.USD.count)} payments, ${inr(f.currency.USD.inrEquivalentMinor)} at ₹100 per $1.` },
          ]}
        />
      </Section>
    </div>
  );
}
