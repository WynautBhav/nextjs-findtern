import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ title: z.string().optional(), bodyHtml: z.string() });

export async function GET(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const db = getDb();
  const [row] = await db.select().from(schema.internTerms).limit(1);
  return NextResponse.json({ terms: row });
}

export async function PUT(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const [existing] = await db.select().from(schema.internTerms).limit(1);
  if (existing) {
    await db.update(schema.internTerms).set({ title: parsed.data.title, bodyHtml: parsed.data.bodyHtml }).where(eq(schema.internTerms.id, existing.id));
  } else {
    await db.insert(schema.internTerms).values({ title: parsed.data.title ?? "Intern Terms", bodyHtml: parsed.data.bodyHtml });
  }
  return NextResponse.json({ ok: true });
}
