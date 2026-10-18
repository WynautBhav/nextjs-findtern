import type { Metadata } from "next";
import Link from "next/link";
import { desc, inArray, eq } from "drizzle-orm";
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { formatMoney, formatDate } from "@/lib/format";
import { AdminPageHeader, AdminEmpty, Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";
import { cn } from "@/lib/utils";
import { parseOffer } from "@/lib/offer";

export const metadata: Metadata = { title: "Payouts & Financial Dues" };

export default async function AdminPayouts({
  searchParams,
}: {
  searchParams?: Promise<{ tab?: string }>;
}) {
  const params = await searchParams;
  const currentTab = params?.tab === "dues" ? "dues" : "payouts";

  const db = getDb();

  // 1. Load intern payouts
  const payouts = await db
    .select()
    .from(schema.internPayouts)
    .orderBy(desc(schema.internPayouts.createdAt))
    .limit(200);

  const internIds = Array.from(new Set(payouts.map((p) => p.internId)));
  const internNames = new Map<string, string>();
  if (internIds.length > 0) {
    const rows = await db
      .select({
        id: schema.users.id,
        first: schema.users.firstName,
        last: schema.users.lastName,
      })
      .from(schema.users)
      .where(inArray(schema.users.id, internIds));
    for (const r of rows) internNames.set(r.id, `${r.first} ${r.last}`.trim());
  }

  // 2. Load employer dues
  const acceptedProposals = await db
    .select({
      proposal: schema.proposals,
      companyName: schema.employers.companyName,
      projectName: schema.projects.projectName,
    })
    .from(schema.proposals)
    .innerJoin(schema.employers, eq(schema.proposals.employerId, schema.employers.id))
    .leftJoin(schema.projects, eq(schema.proposals.projectId, schema.projects.id))
    .where(eq(schema.proposals.status, "accepted"))
    .orderBy(desc(schema.proposals.createdAt))
    .limit(100);

  const pending = payouts.filter((p) => p.status !== "paid");
  const paidMinor = payouts
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + (p.amountMinor ?? 0), 0);
  const pendingMinor = pending.reduce((sum, p) => sum + (p.amountMinor ?? 0), 0);

  return (
    <div className="apple-admin space-y-4">
      <AdminPageHeader
        title="Intern Disbursements"
        subtitle="Money out to interns, money in from employers."
      />

      <StatGrid cols={3}>
        <StatCard
          label="Payouts logged"
          value={payouts.length.toLocaleString("en-IN")}
          hint="All recorded disbursement rows"
          icon={CreditCard}
          tone="brand"
        />
        <StatCard
          label="Disbursed"
          value={formatMoney(paidMinor, "INR", { zeroLabel: "₹0" })}
          hint="Cleared via bank reference"
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Pending"
          value={formatMoney(pendingMinor, "INR", { zeroLabel: "₹0" })}
          hint={`${pending.length} transfers waiting`}
          icon={AlertCircle}
          tone={pendingMinor > 0 ? "warning" : "neutral"}
        />
      </StatGrid>

      <div
        role="tablist"
        aria-label="Ledger view"
        className="grid grid-cols-2 gap-0.5 self-start rounded-[10px] bg-ink-100 p-1 sm:inline-grid sm:grid-cols-2"
      >
        {(
          [
            { key: "payouts", label: `Disbursements · ${payouts.length}` },
            { key: "dues", label: `Employer dues · ${acceptedProposals.length}` },
          ] as const
        ).map((tab) => (
          <Link
            key={tab.key}
            role="tab"
            aria-selected={currentTab === tab.key}
            href={`/admin/payouts?tab=${tab.key}`}
            className={cn(
              "apple-spring apple-pressable inline-flex min-h-11 items-center justify-center rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.01em] tabular-nums",
              currentTab === tab.key
                ? "bg-white text-ink-900 shadow-xs"
                : "text-ink-500 hover:text-ink-800",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {currentTab === "payouts" ? (
        <Panel className="overflow-hidden bg-white">
          {payouts.length === 0 ? (
            <AdminEmpty
              title="No disbursements yet"
              body="Payouts appear here once candidates complete verified monthly timesheets."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {payouts.map((p) => {
                const name = internNames.get(p.internId) ?? "Candidate";
                return (
                  <li
                    key={p.id}
                    className="apple-spring flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50/70 sm:px-5"
                  >
                    <span
                      aria-hidden
                      className="grid size-10 shrink-0 place-items-center rounded-full bg-brand-100 text-[13px] font-semibold text-brand-800"
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/admin/interns/${p.internId}`}
                        className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-900 underline-offset-4 hover:underline"
                      >
                        {name}
                      </Link>
                      <span className="mt-0.5 block truncate text-[13px] tabular-nums text-text-subtle">
                        {p.method}
                        {p.referenceId ? ` · ${p.referenceId}` : ""}
                        {p.createdAt ? ` · ${formatDate(p.createdAt)}` : ""}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-[17px] font-semibold tabular-nums text-ink-900">
                        {formatMoney(p.amountMinor, (p.currency ?? "INR") as "INR" | "USD", { zeroLabel: "₹0" })}
                      </span>
                      <StatusBadge status={p.status} />
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ) : (
        <Panel className="overflow-hidden bg-white">
          {acceptedProposals.length === 0 ? (
            <AdminEmpty
              title="No employer dues"
              body="Hired placements ready for installment billing will appear here."
            />
          ) : (
            <ul className="divide-y divide-ink-100">
              {acceptedProposals.map((row) => {
                const offer = parseOffer(row.proposal.offerDetails, row.proposal.currency);

                return (
                  <li
                    key={row.proposal.id}
                    className="apple-spring flex items-center gap-3 px-4 py-3.5 hover:bg-ink-50/70 sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
                        {row.companyName}
                        <span aria-hidden className="mx-1.5 text-ink-300">→</span>
                        <span className="font-medium text-ink-700">
                          {row.projectName ?? "General project"}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[13px] text-text-subtle">
                        Starts {offer.startDate ?? "immediately"} · Active placement
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-right">
                        <span className="block text-[17px] font-semibold tabular-nums text-ink-900">
                          {offer.monthlyMinor != null ? formatMoney(offer.monthlyMinor, offer.currency) : "—"}
                          <span className="text-[13px] font-normal text-text-subtle">/mo</span>
                        </span>
                      </span>
                      <Link
                        href="/admin/transactions"
                        className="apple-spring apple-pressable hidden min-h-11 items-center rounded-[10px] border border-ink-200 bg-white px-3 text-[13px] font-medium text-ink-700 hover:bg-ink-50 sm:inline-flex"
                      >
                        Transactions
                      </Link>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}
    </div>
  );
}
