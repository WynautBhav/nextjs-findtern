import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ title: z.string().optional(), bodyHtml: z.string() });

export async function GET() {
  // Read-only: no CSRF needed. src/proxy.ts enforces admin permissions on /api/admin.
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const [row] = await db.select().from(schema.websiteTerms).limit(1);
  return NextResponse.json({ terms: row });
}

export async function PUT(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [existing] = await db.select().from(schema.websiteTerms).limit(1);
  if (existing) {
    await db.update(schema.websiteTerms).set({ title: parsed.data.title, bodyHtml: parsed.data.bodyHtml }).where(eq(schema.websiteTerms.id, existing.id));
  } else {
    await db.insert(schema.websiteTerms).values({ title: parsed.data.title ?? "Terms and Conditions", bodyHtml: parsed.data.bodyHtml });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
