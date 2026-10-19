import { eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { applyRatings, RATINGS_TEMPLATE, RATINGS_TEMPLATE_ROWS, readRatingsRows, readRatingsSheet, type RatingsRow } from "@/lib/admin/ratings";
import { isXlsx, readXlsxRows, writeXlsx } from "@/lib/admin/xlsx";
import { afterRatingsSaved } from "@/lib/admin/score-live";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

/** The sheet template (legacy column names): Excel by default, `?format=csv` for CSV. */
export async function GET(req: Request) {
  if (new URL(req.url).searchParams.get("format") !== "csv") {
    return new Response(new Uint8Array(writeXlsx(RATINGS_TEMPLATE_ROWS, "ratings")), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": 'attachment; filename="ratings-template.xlsx"',
      },
    });
  }
  return new Response(RATINGS_TEMPLATE, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="ratings-template.csv"',
    },
  });
}

/** Bulk AI-interview ratings from an .xlsx or CSV sheet, matched by intern email. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > 5_000_000) return NextResponse.json({ error: "Sheet too large" }, { status: 413 });

  let rows: RatingsRow[];
  if (isXlsx(bytes)) {
    try {
      rows = readRatingsRows(readXlsxRows(bytes));
    } catch {
      return NextResponse.json({ error: "Could not read that Excel file. Save it as .xlsx or CSV and try again." }, { status: 400 });
    }
  } else {
    rows = readRatingsSheet(new TextDecoder().decode(bytes));
  }
  const db = getDb();
  const emails = rows.filter((r) => !r.error).map((r) => r.email);
  const users = emails.length
    ? await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(inArray(sql<string>`lower(${schema.users.email})`, emails))
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
    const prevExtra = (onb.extraData as Record<string, unknown>) ?? {};
    const nextExtra = applyRatings(prevExtra, r.updates, r.score);
    await db.update(schema.internOnboarding).set({ extraData: nextExtra }).where(eq(schema.internOnboarding.id, onb.id));
    await afterRatingsSaved(onb.userId, prevExtra, nextExtra);
    updated++;
  }
  return NextResponse.json({ updated, failures });
}
