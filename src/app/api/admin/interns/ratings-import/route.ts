import { eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

import { applyRatings, RATINGS_TEMPLATE, readRatingsSheet } from "@/lib/admin/ratings";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/** The sheet template (legacy column names). */
export async function GET() {
  return new Response(RATINGS_TEMPLATE, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="ratings-template.csv"',
    },
  });
}

/** Bulk AI-interview ratings from a CSV sheet, matched by intern email. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const text = await req.text();
  if (text.length > 2_000_000) return NextResponse.json({ error: "Sheet too large" }, { status: 413 });

  const rows = readRatingsSheet(text);
  const db = getDb();
  const emails = rows.filter((r) => !r.error).map((r) => r.email);
  const users = emails.length
    ? await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users).where(inArray(schema.users.email, emails))
    : [];
  const byEmail = new Map(users.map((u) => [u.email.toLowerCase(), u.id]));

  let updated = 0;
  const failures: { row: number; email: string; reason: string }[] = [];
  for (const r of rows) {
    if (r.error) {
      failures.push({ row: r.row, email: r.email, reason: r.error });
      continue;
    }
    const uid = byEmail.get(r.email);
    const [onb] = uid
      ? await db.select().from(schema.internOnboarding).where(eq(schema.internOnboarding.userId, uid)).limit(1)
      : [];
    if (!onb) {
      failures.push({ row: r.row, email: r.email, reason: uid ? "No profile yet" : "User not found" });
      continue;
    }
    await db
      .update(schema.internOnboarding)
      .set({ extraData: applyRatings((onb.extraData as Record<string, unknown>) ?? {}, r.updates, r.score) })
      .where(eq(schema.internOnboarding.id, onb.id));
    updated++;
  }
  return NextResponse.json({ updated, failures });
}
