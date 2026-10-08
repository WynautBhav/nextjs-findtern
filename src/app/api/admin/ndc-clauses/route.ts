import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  title: z.string().min(1),
  bodyHtml: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function GET(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const rows = await db.select().from(schema.internNonDisclosureClauses).orderBy(asc(schema.internNonDisclosureClauses.sortOrder));
  return NextResponse.json({ clauses: rows });
}

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [clause] = await db.insert(schema.internNonDisclosureClauses).values(parsed.data).returning();
  return NextResponse.json({ clause }, { status: 201 });
}
