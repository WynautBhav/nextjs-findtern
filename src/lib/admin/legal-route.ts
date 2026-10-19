import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getSession } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

type LegalTable = typeof schema.websiteTerms | typeof schema.internTerms | typeof schema.employerTerms;

// Both required, as in legacy: a blank body would publish empty terms.
const bodySchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  bodyHtml: z.string().refine((v) => v.replace(/<[^>]*>/g, "").trim().length > 0, "Terms text is required"),
});

/**
 * GET/PUT handlers for one admin-edited legal document. Shared so the three
 * terms routes agree: the newest row is the live one (legacy read the newest),
 * every save stamps `updatedAt` (the public "last updated" date), and the
 * public pages are revalidated at once instead of serving stale terms.
 */
export function legalDocRoute(table: LegalTable, defaultTitle: string) {
  async function GET() {
    // Read-only: no CSRF needed. src/proxy.ts enforces admin permissions on /api/admin.
    const session = await getSession();
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const [row] = await getDb().select().from(table).orderBy(desc(table.updatedAt), desc(table.createdAt)).limit(1);
    return NextResponse.json({ terms: row });
  }

  async function PUT(req: Request) {
    const guard = await requireMutation({ req, roles: ["admin"] });
    if (!guard.ok) return guard.response;

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({ title: defaultTitle })));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }

    const db = getDb();
    const [existing] = await db.select({ id: table.id }).from(table).orderBy(desc(table.updatedAt), desc(table.createdAt)).limit(1);
    const values = { title: parsed.data.title, bodyHtml: parsed.data.bodyHtml, updatedAt: new Date() };
    if (existing) await db.update(table).set(values).where(eq(table.id, existing.id));
    else await db.insert(table).values(values);
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  }

  return { GET, PUT };
}
