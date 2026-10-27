import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { requireCollegeMutation } from "@/lib/college/guard";
import { verifyFromRoster } from "@/lib/college/membership";
import { parseRoster } from "@/lib/college/roster";
import { getDb, schema } from "@/lib/db";

const bodySchema = z.object({ csv: z.string().min(1).max(2_000_000) });

/**
 * Import the college's student list (CSV pasted or uploaded as text). Rows are
 * upserted by email; nothing is deleted, so a partial file can't wipe a roster.
 */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "roster:import");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Paste or upload a CSV" }, { status: 400 });

  const { rows, errors } = parseRoster(parsed.data.csv);
  if (rows.length === 0) return NextResponse.json({ error: errors[0] ?? "No rows found", errors }, { status: 400 });

  const db = getDb();
  for (let i = 0; i < rows.length; i += 500) {
    await db
      .insert(schema.collegeRoster)
      .values(rows.slice(i, i + 500).map((r) => ({ ...r, collegeId: g.ctx.college.id })))
      .onConflictDoUpdate({
        target: [schema.collegeRoster.collegeId, schema.collegeRoster.email],
        set: {
          name: sql`excluded.name`,
          rollNo: sql`excluded.roll_no`,
          year: sql`excluded.year`,
          branch: sql`excluded.branch`,
        },
      });
  }
  const verified = await verifyFromRoster(g.ctx.college.id);
  return NextResponse.json({ imported: rows.length, verified, errors: errors.slice(0, 20) });
}
