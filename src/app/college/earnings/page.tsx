import { PageHead, Surface } from "@/components/app/primitives";
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
    <div className="space-y-6">
      <PageHead title="Earnings" lede="Credited when a verified student of your college completes an internship." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Surface className="p-5">
          <p className="text-sm text-text-subtle">Balance</p>
          <p className="nums text-3xl font-semibold">{inr(s.balanceMinor)}</p>
        </Surface>
        <Surface className="p-5">
          <p className="text-sm text-text-subtle">Waiting for payout</p>
          <p className="nums text-3xl font-semibold">{inr(s.openRequest?.amountMinor ?? 0)}</p>
        </Surface>
        <Surface className="p-5">
          <p className="text-sm text-text-subtle">Available to withdraw</p>
          <p className="nums text-3xl font-semibold">{inr(s.availableMinor)}</p>
        </Surface>
      </div>
      <Surface className="space-y-4 p-5">
        <h2 className="font-semibold">Withdraw</h2>
        <WithdrawForm key={s.availableMinor} availableMinor={s.availableMinor} blockedReason={blocked} />
      </Surface>
      <Surface className="space-y-4 p-5">
        <h2 className="font-semibold">Bank account</h2>
        <BankForm bank={bank} locked={Boolean(s.openRequest)} />
      </Surface>
      <Surface className="divide-y divide-ink-200/80">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-text-subtle">No activity yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {r.kind === "payout" ? "Withdrawal paid" : r.kind === "payout_rejected" ? "Withdrawal declined" : r.kind === "adjustment" ? "Adjustment" : r.student}
                </p>
                <p className="truncate text-sm text-text-subtle">
                  {r.kind === "incentive"
                    ? `${r.role || "Internship"} · Score ${BAND[r.bandId ?? ""] ?? "n/a"}`
                    : r.kind === "payout"
                      ? `Reference ${r.referenceId ?? "n/a"}`
                      : r.rejectReason ?? ""}
                </p>
                <p className="text-xs text-text-subtle">{formatDate(r.at)}</p>
              </div>
              <p className="nums shrink-0 font-semibold">{r.amountMinor > 0 ? "+" : ""}{inr(r.amountMinor)}</p>
            </div>
          ))
        )}
      </Surface>
    </div>
  );
}
