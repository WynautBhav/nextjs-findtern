import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { csvResponse } from "@/lib/admin/csv";
import { allows, requiredPermissions } from "@/lib/admin/permissions";
import { promoRedemptionsCsv, totalDiscountInrMinor } from "@/lib/admin/promo-redemptions";
import { loadRedemptions } from "@/lib/admin/promo-redemptions-load";
import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

/**
 * Who used a promo code: JSON for the dialog, or `?format=csv` for the download. A read, so no CSRF token:
 * it stays a plain `<a download>`. Gated by the same read permission as the promo page.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  if (!allows(session.permissions, requiredPermissions(new URL(req.url).pathname, "GET"))) {
    return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });
  }

  const db = getDb();
  const [promo] = await db.select({ code: schema.promoCodes.code, usedCount: schema.promoCodes.usedCount }).from(schema.promoCodes).where(eq(schema.promoCodes.id, id)).limit(1);
  if (!promo) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const redemptions = await loadRedemptions(db, id);
  if (new URL(req.url).searchParams.get("format") === "csv") {
    return csvResponse(promoRedemptionsCsv(promo.code, redemptions), `promo-${promo.code.replace(/[^A-Za-z0-9_-]/g, "_")}-redemptions.csv`);
  }
  return NextResponse.json({ code: promo.code, usedCount: promo.usedCount, totalDiscountInrMinor: totalDiscountInrMinor(redemptions), redemptions });
}
