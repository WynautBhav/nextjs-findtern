import { desc } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import type { PromoCode } from "@/lib/db/schema";
import { AdminLoadError, AdminPageHeader, Panel } from "@/components/admin/panel";
import { GivenByCode } from "@/components/admin/money/pc-given-by-code";
import { PromoCodesManager } from "@/components/admin/promo-codes-manager";
import { RollingNumber } from "@/components/app/rolling-number";
import { LeadStat, Overview, Section, StatList, type StatItem } from "@/components/app/stat";
import { getSession } from "@/lib/auth";
import { canWrite } from "@/lib/admin/permissions";
import { discountGivenByCode } from "@/lib/admin/promo-redemptions-load";
import { isUsedUp, promoState } from "@/lib/admin/promo-state";
import { formatNumber } from "@/lib/format";

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

  const header = (
    <AdminPageHeader title="Promo codes" subtitle="Discount codes for intern activation fees and employer orders." />
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

  const session = await getSession();
  const permissions = session?.permissions;
  const now = new Date();
  const states = rows.map((r) => promoState(r, now));
  const countOf = (s: string) => states.filter((x) => x === s).length;
  const activeCount = countOf("active");
  const totalCodes = rows.length;
  const totalRedemptions = rows.reduce((s, r) => s + (r.usedCount ?? 0), 0);
  const totalGiven = [...given.values()].reduce((a, b) => a + b, 0);
  const usedUp = rows.filter(isUsedUp).length;
  const paused = countOf("paused");
  const expired = countOf("expired");
  const codesWithUse = rows.filter((r) => r.usedCount > 0).length;

  // One lead figure: what the codes have cost, or (before anything is redeemed) how many are live.
  const byCode = rows.map((r) => ({ id: r.id, code: r.code, minor: given.get(r.id) ?? 0 })).filter((l) => l.minor > 0);
  const lead =
    totalGiven > 0 ? (
      <>
      <LeadStat
        label="Discount given"
        value={<RollingNumber value={totalGiven / 100} currency="INR" />}
        note={`Across ${formatNumber(totalRedemptions)} ${totalRedemptions === 1 ? "redemption" : "redemptions"} on ${formatNumber(codesWithUse)} ${codesWithUse === 1 ? "code" : "codes"}. Money taken off interns' and employers' payments.`}
      />
      <GivenByCode lines={byCode} />
      </>
    ) : (
      <LeadStat
        label="Active codes"
        value={<RollingNumber value={activeCount} />}
        note={totalCodes === 0 ? "No code exists yet. Create one to start giving discounts." : `${formatNumber(totalCodes)} ${totalCodes === 1 ? "code" : "codes"} in all. No discount has been given yet.`}
        tone={activeCount > 0 ? "brand" : "ink"}
      />
    );
  // The lead is "Active codes" only before anything is given; once it is "Discount given", active codes move to the list.
  const items: (StatItem | null)[] = [
    totalGiven > 0 ? { label: "Active codes", value: formatNumber(activeCount), hint: `${formatNumber(totalCodes)} in all` } : null,
    totalRedemptions > 0 ? { label: "Redemptions", value: formatNumber(totalRedemptions), hint: "Paid orders and fees that used a code" } : null,
    usedUp > 0 ? { label: "Used up", value: formatNumber(usedUp), hint: "At their usage limit" } : null,
    paused + expired > 0
      ? { label: "Paused or expired", value: formatNumber(paused + expired), hint: [paused > 0 ? `${formatNumber(paused)} paused` : null, expired > 0 ? `${formatNumber(expired)} expired` : null].filter(Boolean).join(", ") }
      : null,
  ];
  const rest = items.filter((i): i is StatItem => i !== null);

  const manager = (
    <PromoCodesManager
      initialPromoCodes={rows}
      canWrite={canWrite(permissions, "/admin/promo-codes")}
      canMintWaiver={session?.role === "admin" && canWrite(permissions, "/api/admin/promo-codes/full-waiver")}
      discountGiven={Object.fromEntries(given)}
      nowMs={now.getTime()}
    />
  );

  return (
    <div className="space-y-10">
      {header}
      {totalCodes > 0 ? <Overview lead={lead} rest={rest.length ? <StatList items={rest} /> : undefined} /> : null}
      {totalCodes > 0 ? <Section title="All codes">{manager}</Section> : manager}
    </div>
  );
}
