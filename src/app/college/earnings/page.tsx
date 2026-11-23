import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

import { EmptyScene, Surface } from "@/components/app/primitives";
import { CollegeHero, HeroStat, HeroStats, SplitBar } from "@/components/college/kit";
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

  const waitingMinor = s.openRequest?.amountMinor ?? 0;
  return (
    <div className="space-y-6">
      <CollegeHero title="Earnings" lede="Credited when a verified student of your college completes an internship.">
        <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
          <HeroStats cols={3} className="mt-0 grid-cols-1 lg:grid-cols-1">
            <HeroStat lead label="Balance" value={inr(s.balanceMinor)} />
          </HeroStats>
          {s.balanceMinor > 0 ? (
            <SplitBar
              label="Your balance"
              segments={[
                { label: `${inr(s.availableMinor)} available to withdraw`, value: s.availableMinor, className: "bg-accent-400" },
                { label: `${inr(waitingMinor)} waiting for payout`, value: waitingMinor, className: "bg-white/70" },
              ].map((x) => ({ ...x, hideValue: true }))}
            />
          ) : (
            <p className="text-sm text-on-dark">Your first credit arrives when one of your students finishes an internship found through Findtern.</p>
          )}
        </div>
      </CollegeHero>

      <div className="grid gap-6 lg:grid-cols-2">
        <Surface className="space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Withdraw</h2>
          <WithdrawForm key={s.availableMinor} availableMinor={s.availableMinor} blockedReason={blocked} />
        </Surface>
        <Surface className="space-y-4 p-5 sm:p-6">
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink-900">Bank account</h2>
          <BankForm bank={bank} locked={Boolean(s.openRequest)} />
        </Surface>
      </div>

      <Surface>
        <h2 className="border-b border-ink-100 px-5 py-4 text-lg font-semibold tracking-[-0.02em] text-ink-900 sm:px-6">Activity</h2>
        {rows.length === 0 ? (
          <EmptyScene
            compact
            title="No earnings activity"
            body="A credit shows up here when a verified student of your college completes an internship. Withdrawals you request show up here too."
            next={{ label: "Go to your students", href: "/college/students" }}
          />
        ) : (
          <ol className="divide-y divide-ink-100">
            {rows.map((r) => {
              const credit = r.amountMinor > 0;
              return (
                <li key={r.id} className="flex items-center gap-4 px-5 py-3.5 sm:px-6">
                  <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full ${credit ? "bg-success-soft text-success" : "bg-ink-100 text-ink-600"}`}>
                    {credit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-ink-900">
                      {r.kind === "payout" ? "Withdrawal paid" : r.kind === "payout_rejected" ? "Withdrawal declined" : r.kind === "adjustment" ? "Adjustment" : r.student}
                    </p>
                    <p className="truncate text-sm text-text-subtle">
                      {[
                        r.kind === "incentive" ? `${r.role || "Internship"} · Score ${BAND[r.bandId ?? ""] ?? "n/a"}` : r.kind === "payout" ? `Reference ${r.referenceId ?? "n/a"}` : (r.rejectReason ?? ""),
                        formatDate(r.at),
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <p className={`nums shrink-0 text-base font-semibold ${credit ? "text-success" : "text-ink-900"}`}>{credit ? "+" : ""}{inr(r.amountMinor)}</p>
                </li>
              );
            })}
          </ol>
        )}
      </Surface>
    </div>
  );
}
