import { Section, StatList } from "@/components/app/stat";
import { Ledger } from "@/components/admin/money/ledger";
import { countOrNone } from "@/components/admin/money/rp-parts";
import { financeFor } from "@/lib/admin/reports/finance-load";
import type { OrderStatusKey } from "@/lib/admin/reports/finance";
import { formatMoney, formatNumber } from "@/lib/format";

import type { TabProps } from "../types";
import { inr } from "./glance";

const STATUS: [OrderStatusKey, string][] = [["paid", "Paid"], ["partially_refunded", "Partly refunded"], ["refunded", "Refunded"], ["unpaid", "Not paid yet"], ["failed", "Failed"]];
type C = { count: number; inrMinor: number };
type Row = { label: string; c: C };
const none = <span className="text-ink-600">none</span>;
const count = (c: C) => (c.count ? formatNumber(c.count) : none);
const value = (c: C) => (c.count ? inr(c.inrMinor) : none);

/** The cycle: money from employers, money from interns, money to interns; then by currency and waived orders. All ruled ledgers. */
export default async function Cycle({ window: w }: TabProps) {
  const d = await financeFor(w);
  const f = d.figures;
  const p = d.payouts;
  const rows = (side: "employer" | "intern"): Row[] => {
    const s = f[side];
    const out: Row[] = STATUS.map(([k, label]) => ({ label, c: s.byStatus[k] }));
    if (s.byStatus.other.count) out.push({ label: "Other", c: s.byStatus.other });
    return out;
  };
  const stages = (title: string, all: string, side: "employer" | "intern", total: C, hint: string, foot: string) => (
    <Section title={title} hint={hint}>
      <Ledger
        caption={title}
        rows={rows(side)}
        rowKey={(r) => r.label}
        empty={<p className="border-y border-ink-200 py-4 text-sm text-ink-700">Nothing in this period.</p>}
        columns={[
          { key: "s", header: "Status", primary: true, cell: (r) => r.label },
          { key: "n", header: side === "employer" ? "Orders" : "Fees", align: "right", cell: (r) => count(r.c) },
          { key: "v", header: "Value", align: "right", cell: (r) => value(r.c) },
        ]}
        footer={[all, count(total), value(total)]}
      />
      <p className="nums mt-3 text-sm text-ink-700">{foot}</p>
    </Section>
  );
  const payout = (c: C) => (c.count ? (
    <span>
      {inr(c.inrMinor)}
      <span className="block text-xs text-ink-600">{formatNumber(c.count)} {c.count === 1 ? "payout" : "payouts"}</span>
    </span>
  ) : none);

  return (
    <div className="space-y-10 lg:space-y-12" data-rp="finance-cycle">
      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-2">
        {stages("From employers", "All orders", "employer", f.employer.orders, "Orders placed by companies (test employers excluded), count and value in rupees.", `Collected ${inr(f.employer.collected.inrMinor)} from ${formatNumber(f.employer.collected.count)} orders.`)}
        {stages("From interns", "All fees", "intern", f.intern.fees, "Activation fees paid by interns. College-drive waivers are not money and are not counted.", `Received ${inr(f.intern.collected.inrMinor)} from ${formatNumber(f.intern.collected.count)} interns${f.waived.collegeDrive ? `; ${formatNumber(f.waived.collegeDrive)} ${f.waived.collegeDrive === 1 ? "fee was" : "fees were"} covered by a college drive` : ""}.`)}
      </div>

      <Section title="To interns" hint="Payouts to interns: stipends and completion bonuses, by status.">
        <Ledger
          caption="Payouts to interns by status"
          rows={[
            { label: "Stipends", ...p.stipend },
            { label: "Completion bonuses", ...p.completionBonus },
          ]}
          rowKey={(r) => r.label}
          columns={[
            { key: "k", header: "Payout", primary: true, cell: (r) => r.label },
            { key: "a", header: "Paid", align: "right", cell: (r) => payout(r.paid) },
            { key: "b", header: "Pending", align: "right", cell: (r) => payout(r.pending) },
            { key: "c", header: "Failed", align: "right", cell: (r) => payout(r.failed) },
          ]}
        />
        <p className="mt-3 text-sm text-ink-700">Same figures as the Payouts page.</p>
      </Section>

      <div className="grid gap-x-12 gap-y-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title="By currency" hint="Money actually received: employer orders and intern fees. Dollar payments are also shown in rupees at ₹100 per $1.">
          <Ledger
            caption="Transactions by currency"
            rows={[
              { label: "Rupees (INR)", n: f.currency.INR.count, own: formatMoney(f.currency.INR.minor, "INR", { zeroLabel: "₹0" }), inr: f.currency.INR.minor },
              { label: "Dollars (USD)", n: f.currency.USD.count, own: formatMoney(f.currency.USD.minor, "USD", { zeroLabel: "$0" }), inr: f.currency.USD.inrEquivalentMinor },
            ]}
            rowKey={(r) => r.label}
            columns={[
              { key: "k", header: "Currency", primary: true, cell: (r) => r.label },
              { key: "n", header: "Transactions", align: "right", cell: (r) => (r.n ? formatNumber(r.n) : none) },
              { key: "o", header: "Value", align: "right", cell: (r) => (r.n ? r.own : none) },
              { key: "r", header: "In rupees", align: "right", cell: (r) => (r.n ? inr(r.inr) : none) },
            ]}
            footer={["Both", formatNumber(f.currency.INR.count + f.currency.USD.count), "", inr(f.currency.INR.minor + f.currency.USD.inrEquivalentMinor)]}
          />
          <p className="nums mt-3 text-sm text-ink-700">College seat sales ({formatNumber(d.college.count)}, {inr(d.college.inrMinor)}) are also part of Collected, in rupees.</p>
        </Section>
        <Section title="Waived orders" hint="Fully waived by a promo code. Complimentary: no money moved, so they are left out of every collected figure.">
          <div data-rp="waived">
            <StatList
              items={[
                { label: "Waived orders", value: countOrNone(f.waived.count), hint: `${formatNumber(f.waived.employer)} employer, ${formatNumber(f.waived.intern)} intern.` },
                { label: "Value waived", value: f.waived.listInrMinor === null ? "Not recorded" : inr(f.waived.listInrMinor), hint: "What they would have cost." },
              ]}
            />
          </div>
        </Section>
      </div>
    </div>
  );
}
