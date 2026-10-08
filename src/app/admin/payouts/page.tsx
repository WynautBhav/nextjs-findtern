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
import { AdminPageHeader, AdminEmpty, Panel, PanelHeader, PanelBody } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { StatusBadge } from "@/components/admin/status-badge";

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
    <div className="space-y-6">
      <AdminPageHeader
        title="Payouts & Financial Dues"
        subtitle="Operational ledger for intern stipend disbursements and employer receivable dues."
        action={
          <div className="flex items-center gap-2">
            <span className="text-2xs font-medium text-ink-500">Live Dues Engine</span>
          </div>
        }
      />

      <StatGrid cols={3}>
        <StatCard
          label="Total Payouts Logged"
          value={payouts.length}
          hint="All recorded candidate disbursement rows"
          icon={CreditCard}
          tone="brand"
        />
        <StatCard
          label="Disbursed to Interns"
          value={formatMoney(paidMinor, "INR")}
          hint="Total cleared via bank reference"
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Pending Disbursements"
          value={formatMoney(pendingMinor, "INR")}
          hint={`${pending.length} pending candidate transfers`}
          icon={AlertCircle}
          tone={pendingMinor > 0 ? "warning" : "neutral"}
        />
      </StatGrid>

      {/* Tabs */}
      <div className="inline-flex rounded-xl border border-ink-200/80 bg-white p-1 shadow-2xs">
        <Link
          href="/admin/payouts?tab=payouts"
          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            currentTab === "payouts"
              ? "bg-brand-700 text-white font-semibold shadow-2xs"
              : "text-ink-600 hover:text-ink-900"
          }`}
        >
          Intern Disbursements ({payouts.length})
        </Link>
        <Link
          href="/admin/payouts?tab=dues"
          className={`rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors ${
            currentTab === "dues"
              ? "bg-brand-700 text-white font-semibold shadow-2xs"
              : "text-ink-600 hover:text-ink-900"
          }`}
        >
          Employer Dues Ledger ({acceptedProposals.length})
        </Link>
      </div>

      {currentTab === "payouts" ? (
        <Panel>
          <PanelHeader
            title="Intern Disbursements"
            description="Recent candidate stipend payouts. Transfer validation is completed on the intern's dossier."
          />
          <PanelBody className="p-0">
            {payouts.length === 0 ? (
              <AdminEmpty
                title="No disbursements recorded"
                body="Disbursements will appear here once candidates complete verified monthly timesheets."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-ink-100 bg-ink-50/70 text-ink-600 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Candidate</th>
                      <th className="px-5 py-3">Amount</th>
                      <th className="px-5 py-3">Method</th>
                      <th className="px-5 py-3">Reference ID</th>
                      <th className="px-5 py-3">Date</th>
                      <th className="px-5 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {payouts.map((p) => (
                      <tr key={p.id} className="hover:bg-ink-50/60 transition-colors">
                        <td className="px-5 py-3.5">
                          <Link
                            href={`/admin/interns/${p.internId}`}
                            className="font-medium text-ink-900 underline-offset-4 hover:underline"
                          >
                            {internNames.get(p.internId) ?? "Candidate"}
                          </Link>
                          {p.notes ? (
                            <p className="mt-0.5 text-2xs text-ink-500 truncate max-w-xs">{p.notes}</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3.5 font-semibold tabular-nums text-ink-900">
                          {formatMoney(p.amountMinor, (p.currency ?? "INR") as "INR" | "USD")}
                        </td>
                        <td className="px-5 py-3.5 text-ink-600 uppercase text-2xs">
                          {p.method}
                        </td>
                        <td className="px-5 py-3.5 font-mono text-2xs text-ink-600">
                          {p.referenceId ?? "—"}
                        </td>
                        <td className="px-5 py-3.5 text-text-subtle">
                          {p.createdAt ? formatDate(p.createdAt) : "—"}
                        </td>
                        <td className="px-5 py-3.5">
                          <StatusBadge status={p.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </PanelBody>
        </Panel>
      ) : (
        <Panel>
          <PanelHeader
            title="Employer Dues Ledger"
            description="Active hired candidate placements and monthly recurring employer stipend obligations."
          />
          <PanelBody className="p-0">
            {acceptedProposals.length === 0 ? (
              <AdminEmpty
                title="No active employer obligations"
                body="Hired proposals ready for installment billing will be tracked in this ledger."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-ink-100 bg-ink-50/70 text-ink-600 uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="px-5 py-3">Company</th>
                      <th className="px-5 py-3">Project</th>
                      <th className="px-5 py-3">Start Date</th>
                      <th className="px-5 py-3">Monthly Obligation</th>
                      <th className="px-5 py-3">Hired Status</th>
                      <th className="px-5 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-100">
                    {acceptedProposals.map((row) => {
                      const offer = (row.proposal.offerDetails ?? {}) as Record<string, unknown>;
                      const monthly =
                        typeof offer.monthlyAmount === "number"
                          ? offer.monthlyAmount
                          : typeof offer.hourlyRate === "number" && typeof offer.monthlyHours === "number"
                          ? offer.hourlyRate * offer.monthlyHours
                          : 15000;

                      return (
                        <tr key={row.proposal.id} className="hover:bg-ink-50/60 transition-colors">
                          <td className="px-5 py-3.5 font-semibold text-ink-900">
                            {row.companyName}
                          </td>
                          <td className="px-5 py-3.5 text-text-subtle">
                            {row.projectName ?? "General Project"}
                          </td>
                          <td className="px-5 py-3.5 text-text-subtle">
                            {typeof offer.startDate === "string" ? offer.startDate : "Immediate"}
                          </td>
                          <td className="px-5 py-3.5 font-semibold text-ink-900 tabular-nums">
                            ₹{monthly.toLocaleString("en-IN")}/mo
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="inline-flex items-center rounded-full bg-brand-50 border border-brand-200/60 px-2.5 py-0.5 text-2xs font-semibold text-brand-700">
                              Active Placement
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <Link
                              href={`/admin/transactions`}
                              className="rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-2xs font-medium text-ink-700 hover:bg-ink-50"
                            >
                              View Transactions
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}