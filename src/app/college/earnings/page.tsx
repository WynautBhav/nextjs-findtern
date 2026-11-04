import { desc, eq, sql } from "drizzle-orm";

import { PageHead, Surface } from "@/components/app/primitives";
import { getDb, schema } from "@/lib/db";
import { requireCollegeContext } from "@/lib/college/scope";
import { formatDate, formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";

const BAND: Record<string, string> = { standard: "Below 6", skilled: "6 to 8", assured: "8 and above" };

/** Read-only ledger of the college's incentive credits. No company name (owner answer 26). */
export default async function EarningsPage() {
  const ctx = await requireCollegeContext();
  const w = schema.collegeWalletEntries;
  const rows = await getDb()
    .select({
      id: w.id,
      amount: w.amountMinor,
      band: w.bandId,
      at: w.createdAt,
      student: sql<string>`coalesce(u.first_name || ' ' || u.last_name, 'Student')`,
      role: sql<string | null>`p.offer_details->>'roleTitle'`,
    })
    .from(w)
    .leftJoin(sql`users u`, sql`u.id = ${w.internId}`)
    .leftJoin(sql`proposals p`, sql`p.id = ${w.proposalId}`)
    .where(eq(w.collegeId, ctx.college.id))
    .orderBy(desc(w.createdAt));
  const balance = rows.reduce((a, r) => a + r.amount, 0);

  return (
    <div className="space-y-6">
      <PageHead title="Earnings" lede="Credited when a verified student of your college completes an internship." />
      <Surface className="p-5">
        <p className="text-sm text-text-subtle">Balance</p>
        <p className="nums text-3xl font-semibold">{formatMoney(balance, "INR", { zeroLabel: false })}</p>
        <p className="mt-1 text-sm text-text-subtle">Payouts open soon. Your balance is safe.</p>
      </Surface>
      <Surface className="divide-y divide-ink-200/80">
        {rows.length === 0 ? (
          <p className="p-5 text-sm text-text-subtle">No credits yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="flex items-start justify-between gap-3 p-4">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.student}</p>
                <p className="truncate text-sm text-text-subtle">{r.role || "Internship"} · Score {BAND[r.band ?? ""] ?? "n/a"}</p>
                <p className="text-xs text-text-subtle">{formatDate(r.at)}</p>
              </div>
              <p className="nums shrink-0 font-semibold">+{formatMoney(r.amount, "INR", { zeroLabel: false })}</p>
            </div>
          ))
        )}
      </Surface>
    </div>
  );
}
