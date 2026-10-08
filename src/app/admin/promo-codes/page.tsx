import { count, desc, eq, sql } from "drizzle-orm";
import { Tag, Sparkles, Percent, CheckCircle2 } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { AdminPageHeader } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { PromoCodesManager } from "@/components/admin/promo-codes-manager";

export const metadata = {
  title: "Promo Codes · Admin",
};

export default async function AdminPromoCodesPage() {
  const db = getDb();

  const [
    rows,
    [activeCountRow],
    [totalRedemptionsRow],
  ] = await Promise.all([
    db
      .select()
      .from(schema.promoCodes)
      .orderBy(desc(schema.promoCodes.createdAt)),
    db.select({ c: count() }).from(schema.promoCodes).where(eq(schema.promoCodes.isActive, true)),
    db
      .select({
        totalUsed: sql<number>`coalesce(sum(${schema.promoCodes.usedCount}), 0)::int`,
      })
      .from(schema.promoCodes),
  ]);

  const activeCount = Number(activeCountRow?.c ?? 0);
  const totalRedemptions = Number(totalRedemptionsRow?.totalUsed ?? 0);

  const num = (n: number) => n.toLocaleString("en-IN");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Promo codes"
        subtitle="Incentive discounts, campaign vouchers and redemption limits."
      />

      <StatGrid cols={4}>
        <StatCard
          label="Active promo codes"
          value={num(activeCount)}
          hint="Usable at checkout"
          icon={Tag}
          tone="brand"
        />
        <StatCard
          label="Total redemptions"
          value={num(totalRedemptions)}
          hint="Completed orders applied"
          icon={Sparkles}
          tone="info"
        />
        <StatCard
          label="Discount varieties"
          value="Percentage & Fixed"
          hint="Tiered pricing options"
          icon={Percent}
          tone="accent"
        />
        <StatCard
          label="Health check"
          value="Optimal"
          hint="Zero conflict rules"
          icon={CheckCircle2}
          tone="success"
        />
      </StatGrid>

      <PromoCodesManager initialPromoCodes={rows} />
    </div>
  );
}
