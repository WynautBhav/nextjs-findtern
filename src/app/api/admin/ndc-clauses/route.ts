import { asc } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  title: z.string().min(1),
  bodyHtml: z.string().min(1),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

export async function GET() {
  // Read-only: no CSRF needed. src/proxy.ts enforces admin permissions on /api/admin.
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
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
  revalidatePath("/", "layout"); // the public NDA page reads these
  return NextResponse.json({ clause }, { status: 201 });
}
