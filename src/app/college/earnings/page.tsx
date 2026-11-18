import { EmptyScene, PageHead } from "@/components/app/primitives";
import { DataTable } from "@/components/app/data-table";
import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList } from "@/components/app/stat";
import { BankForm } from "@/components/college/bank-form";
import { WithdrawForm } from "@/components/college/withdraw-form";
import { collegeBank } from "@/lib/college/bank-read";
import { requireCollegeContext } from "@/lib/college/scope";
import { walletLedger, walletSummary } from "@/lib/college/wallet-read";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const BAND: Record<string, string> = { standard: "Below 6", skilled: "6 to 8", assured: "8 and above" };
const inr = (n: number) => formatMoney(n, "INR", { zeroLabel: false });

/** The college's wallet: incentive credits, withdrawals, bank. No company name (owner answer 26). */
export default async function EarningsPage() {
  const ctx = await requireCollegeContext();
  const [s, rows, bank] = await Promise.all([walletSummary(ctx.college.id), walletLedger(ctx.college.id), collegeBank(ctx.college.id)]);
  const blocked = s.openRequest
    ? "A withdrawal is waiting for Findtern to pay."
    : !bank
      ? "Add your bank account to withdraw."
      : s.availableMinor <= 0
        ? "Nothing available to withdraw yet."
        : null;

  return (
    <div className="space-y-8">
      <PageHead title="Earnings" lede="Credited when a verified student of your college completes an internship." />
      <Overview
        lead={
          <LeadStat
            label="Available to withdraw"
            value={<RollingNumber value={s.availableMinor / 100} currency="INR" />}
            note={blocked ?? "Ready to withdraw to your bank account."}
          />
        }
        rest={
          <StatList
            items={[
              ...(s.balanceMinor !== s.availableMinor ? [{ label: "Balance", value: inr(s.balanceMinor) }] : []),
              { label: "Waiting for payout", value: s.openRequest ? inr(s.openRequest.amountMinor) : "None" },
            ]}
          />
        }
      />
      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-2">
        <Section title="Withdraw">
          <WithdrawForm key={s.availableMinor} availableMinor={s.availableMinor} blockedReason={blocked} />
        </Section>
        <Section title="Bank account">
          <BankForm bank={bank} locked={Boolean(s.openRequest)} />
        </Section>
      </div>
      <Section title="Activity">
        <DataTable
          caption="Earnings activity"
          rows={rows}
          rowKey={(r) => r.id}
          empty={
            <EmptyScene
              compact
              title="No earnings activity"
              body="A credit shows up here when a verified student of your college completes an internship. Withdrawals you request show up here too."
              next={{ label: "Go to your students", href: "/college" }}
            />
          }
          columns={[
            {
              key: "what",
              header: "Entry",
              primary: true,
              cell: (r) => (
                <>
                  <span className="block font-medium text-ink-900">
                    {r.kind === "payout" ? "Withdrawal paid" : r.kind === "payout_rejected" ? "Withdrawal declined" : r.kind === "adjustment" ? "Adjustment" : r.student}
                  </span>
                  <span className="block text-xs font-normal text-ink-600">
                    {r.kind === "incentive"
                      ? `${r.role || "Internship"} · Score ${BAND[r.bandId ?? ""] ?? "n/a"}`
                      : r.kind === "payout"
                        ? `Reference ${r.referenceId ?? "n/a"}`
                        : r.rejectReason ?? ""}
                  </span>
                </>
              ),
            },
            { key: "date", header: "Date", cell: (r) => formatDate(r.at) },
            { key: "amt", header: "Amount", align: "right", cell: (r) => <span className="money font-semibold">{r.amountMinor > 0 ? "+" : ""}{inr(r.amountMinor)}</span> },
          ]}
        />
      </Section>
    </div>
  );
}
