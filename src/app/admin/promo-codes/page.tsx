import { desc } from "drizzle-orm";
import { CheckCircle2, Percent, Sparkles, Tag } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import type { PromoCode } from "@/lib/db/schema";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { PromoCodesManager } from "@/components/admin/promo-codes-manager";
import { formatNumber } from "@/lib/format";

export const metadata = {
  title: "Promo Codes · Admin",
};

export default async function AdminPromoCodesPage() {
  let rows: PromoCode[] | null = null;
  try {
    rows = await getDb().select().from(schema.promoCodes).orderBy(desc(schema.promoCodes.createdAt));
  } catch (error) {
    console.error("[admin/promo-codes] load failed", error);
  }

  const header = (
    <AdminPageHeader
      title="Promo codes"
      subtitle="Discount codes for the intern activation fee and employer checkout: value, who can use them, limits and dates."
    />
  );

  if (!rows) {
    return (
      <div>
        {header}
        <Panel>
          <AdminLoadError what="promo codes" retryHref="/admin/promo-codes" />
        </Panel>
      </div>
    );
  }

  const activeCount = rows.filter((r) => r.isActive).length;
  const totalRedemptions = rows.reduce((s, r) => s + (r.usedCount ?? 0), 0);
  const totalCodes = rows.length;
  const exhausted = rows.filter((r) => r.maxUsages && r.usedCount >= r.maxUsages).length;

  return (
    <div className="space-y-6">
      {header}

      <StatGrid cols={4}>
        <StatCard label="Active codes" value={formatNumber(activeCount)} hint={`${formatNumber(totalCodes)} codes in all`} icon={Tag} />
        <StatCard label="Total redemptions" value={formatNumber(totalRedemptions)} hint="Paid orders and fees that used a code" icon={Sparkles} />
        <StatCard
          label="Uses per code"
          value={totalCodes ? (totalRedemptions / totalCodes).toFixed(1) : "-"}
          hint="Average across every code"
          icon={Percent}
        />
        <StatCard label="Used up" value={formatNumber(exhausted)} hint="Codes at their usage limit" icon={CheckCircle2} />
      </StatGrid>

      <PromoCodesManager initialPromoCodes={rows} />
    </div>
  );
}
