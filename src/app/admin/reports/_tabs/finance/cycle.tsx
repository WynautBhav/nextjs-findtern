import { Panel, PanelHeader } from "@/components/admin/panel";
import { SimpleTable } from "@/components/admin/reports/simple-table";
import { financeFor } from "@/lib/admin/reports/finance-load";
import type { OrderStatusKey } from "@/lib/admin/reports/finance";
import { formatMoney, formatNumber } from "@/lib/format";

import type { TabProps } from "../types";
import { inr } from "./glance";

const STATUS: [OrderStatusKey, string][] = [["paid", "Paid"], ["partially_refunded", "Partly refunded"], ["refunded", "Refunded"], ["unpaid", "Not paid yet"], ["failed", "Failed"]];

/** The cycle: money from employers, money from interns, money to interns; then by currency and waived orders. */
export default async function Cycle({ window: w }: TabProps) {
  const d = await financeFor(w);
  const f = d.figures;
  const p = d.payouts;
  const cell = (c: { count: number; inrMinor: number }) => (c.count ? `${formatNumber(c.count)} · ${inr(c.inrMinor)}` : "-");
  const orderRows = (side: "employer" | "intern") => {
    const s = f[side];
    const rows = STATUS.map(([k, label]) => [label, cell(s.byStatus[k])]);
    if (s.byStatus.other.count) rows.push(["Other", cell(s.byStatus.other)]);
    return rows;
  };

  return (
    <div className="space-y-5 lg:space-y-6" data-rp="finance-cycle">
      <div className="grid gap-5 lg:grid-cols-2 lg:gap-6">
        <Panel>
          <PanelHeader title="From employers" description="Orders placed by companies (test employers excluded). Count and value in rupees." />
          <SimpleTable caption="Employer orders by status" head={["Order status", "Orders"]} right={[1]} minWidth="" maxHeight="max-h-none" rows={[...orderRows("employer"), ["All orders", cell(f.employer.orders)]]} empty={{ title: "No orders", body: "No employer order in this period." }} />
          <p className="nums px-[var(--admin-pad-panel)] pb-4 pt-2 text-sm text-text-subtle">Collected {inr(f.employer.collected.inrMinor)} from {formatNumber(f.employer.collected.count)} orders.</p>
        </Panel>
        <Panel>
          <PanelHeader title="From interns" description="Activation fees paid by interns. College-drive waivers are not money and are not counted." />
          <SimpleTable caption="Intern activation fees by status" head={["Fee status", "Fees"]} right={[1]} minWidth="" maxHeight="max-h-none" rows={[...orderRows("intern"), ["All fees", cell(f.intern.fees)]]} empty={{ title: "No fees", body: "No intern activation fee in this period." }} />
          <p className="nums px-[var(--admin-pad-panel)] pb-4 pt-2 text-sm text-text-subtle">Received {inr(f.intern.collected.inrMinor)} from {formatNumber(f.intern.collected.count)} interns{f.waived.collegeDrive ? ` · ${formatNumber(f.waived.collegeDrive)} fees covered by a college drive` : ""}.</p>
        </Panel>
        <Panel className="lg:col-span-2">
          <PanelHeader title="To interns" description="Payouts to interns: stipends and completion bonuses, by status." />
          <SimpleTable
            caption="Payouts to interns by status"
            head={["Payout", "Paid", "Pending", "Failed"]}
            right={[1, 2, 3]}
            minWidth=""
            maxHeight="max-h-none"
            rows={[
              ["Stipends", cell(p.stipend.paid), cell(p.stipend.pending), cell(p.stipend.failed)],
              ["Completion bonuses", cell(p.completionBonus.paid), cell(p.completionBonus.pending), cell(p.completionBonus.failed)],
            ]}
            empty={{ title: "No payouts", body: "No payout to an intern in this period." }}
          />
          <p className="nums px-[var(--admin-pad-panel)] pb-4 pt-2 text-sm text-text-subtle">Paid out {inr(p.paidOutMinor)} · pending {inr(p.pendingMinor)}. Same as the Payouts page.</p>
        </Panel>
      </div>

      <div className="grid gap-5 lg:gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Panel>
          <PanelHeader title="By currency" description="Money actually received: employer orders and intern fees. Dollar payments are also shown in rupees at ₹100 per $1." />
          <SimpleTable
            caption="Transactions by currency"
            head={["Currency", "Transactions", "Value", "In rupees"]}
            right={[1, 2, 3]}
            minWidth=""
            maxHeight="max-h-none"
            rows={[
              ["Rupees (INR)", formatNumber(f.currency.INR.count), formatMoney(f.currency.INR.minor, "INR", { zeroLabel: "₹0" }), inr(f.currency.INR.minor)],
              ["Dollars (USD)", formatNumber(f.currency.USD.count), formatMoney(f.currency.USD.minor, "USD", { zeroLabel: "$0" }), inr(f.currency.USD.inrEquivalentMinor)],
              ["Both", formatNumber(f.currency.INR.count + f.currency.USD.count), "", inr(f.currency.INR.minor + f.currency.USD.inrEquivalentMinor)],
            ]}
            empty={{ title: "No transactions", body: "No payment received in this period." }}
          />
          <p className="px-[var(--admin-pad-panel)] pb-4 pt-2 text-sm text-text-subtle">
            College seat sales ({formatNumber(d.college.count)} · {inr(d.college.inrMinor)}) are also part of Collected above, in rupees.
          </p>
        </Panel>
        <Panel data-rp="waived">
          <PanelHeader title="Waived orders" description="Fully waived by a promo code. Complimentary: no money moved, so they are left out of every collected figure." />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-[var(--admin-pad-panel)] pb-5 pt-3 text-sm">
            <div>
              <dt className="text-text-subtle">Waived orders</dt>
              <dd className="nums mt-0.5 text-2xl font-semibold text-foreground">{formatNumber(f.waived.count)}</dd>
              <dd className="text-xs text-text-subtle">{formatNumber(f.waived.employer)} employer · {formatNumber(f.waived.intern)} intern</dd>
            </div>
            <div>
              <dt className="text-text-subtle">Value waived</dt>
              <dd className="nums mt-0.5 text-2xl font-semibold text-foreground">{f.waived.listInrMinor === null ? "Not recorded" : inr(f.waived.listInrMinor)}</dd>
              <dd className="text-xs text-text-subtle">what they would have cost</dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
