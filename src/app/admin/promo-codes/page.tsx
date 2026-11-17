import { desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import type { PromoCode } from "@/lib/db/schema";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { StatCard, StatGrid } from "@/components/admin/stat-card";
import { PromoCodesManager } from "@/components/admin/promo-codes-manager";
import { getSession } from "@/lib/auth";
import { canWrite } from "@/lib/admin/permissions";
import { discountGivenByCode } from "@/lib/admin/promo-redemptions-load";
import { formatMoney, formatNumber } from "@/lib/format";

export const metadata = {
  title: "Promo Codes · Admin",
};

export default async function AdminPromoCodesPage() {
  let rows: PromoCode[] | null = null;
  let given = new Map<string, number>();
  try {
    rows = await getDb().select().from(schema.promoCodes).orderBy(desc(schema.promoCodes.createdAt));
    // One grouped query; a failure here only hides the "given" figures, never the list.
    given = await discountGivenByCode(getDb()).catch((error) => {
      console.error("[admin/promo-codes] discount totals failed", error);
      return given;
    });
  } catch (error) {
    console.error("[admin/promo-codes] load failed", error);
  }

  const header = (subtitle?: string) => (
    <AdminPageHeader
      title="Promo codes"
      subtitle={subtitle ?? "Discount codes for intern activation fees and employer orders."}
    />
  );

  if (!rows) {
    return (
      <div>
        {header()}
        <Panel>
          <AdminLoadError what="promo codes" retryHref="/admin/promo-codes" />
        </Panel>
      </div>
    );
  }

  const activeCount = rows.filter((r) => r.isActive).length;
  const totalRedemptions = rows.reduce((s, r) => s + (r.usedCount ?? 0), 0);
  const totalCodes = rows.length;
  const totalGiven = [...given.values()].reduce((a, b) => a + b, 0);
  const exhausted = rows.filter((r) => r.maxUsages && r.usedCount >= r.maxUsages).length;

  return (
    <div className="space-y-6">
      {header(`${formatNumber(activeCount)} of ${formatNumber(totalCodes)} ${totalCodes === 1 ? "code is" : "codes are"} active, with ${formatNumber(totalRedemptions)} ${totalRedemptions === 1 ? "redemption" : "redemptions"} so far.`)}

      <StatGrid cols={4}>
        <StatCard featured label="Active codes" value={formatNumber(activeCount)} hint={`${formatNumber(totalCodes)} codes in all`} />
        <StatCard label="Total redemptions" value={formatNumber(totalRedemptions)} hint="Paid orders and fees that used a code" />
        <StatCard label="Discount given" value={formatMoney(totalGiven, "INR", { zeroLabel: false })} hint="Across every redemption, in rupees" />
        <StatCard label="Used up" value={formatNumber(exhausted)} hint="Codes at their usage limit" />
      </StatGrid>

      <PromoCodesManager initialPromoCodes={rows} canWrite={canWrite((await getSession())?.permissions, "/admin/promo-codes")} discountGiven={Object.fromEntries(given)} />
    </div>
  );
}
