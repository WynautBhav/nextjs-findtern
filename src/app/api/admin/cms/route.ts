import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { CMS_COLLECTIONS, CMS_TYPES, validateCmsValues, type CmsType, type CmsValues } from "@/lib/admin/cms-collections";
import { CMS_TABLES } from "@/lib/admin/cms-tables";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { isUniqueViolation } from "@/lib/promo";

const DUPLICATE_SLUG = "Another post already uses this slug. Pick a different one.";

const TABLES = CMS_TABLES;

/** Blog bodies typed as plain paragraphs become <p> blocks; HTML passes through. */
function normalise(type: CmsType, values: CmsValues, prevStatus?: string | null) {
  const v: Record<string, unknown> = { ...values };
  if (type === "blog") {
    // `body` is NOT NULL; legacy let a post be saved without one (ADM-23).
    if ("body" in v && v.body == null) v.body = "";
    if (typeof v.body === "string" && v.body && !/<[a-z][\s\S]*>/i.test(v.body)) {
      v.body = v.body
        .split(/\n{2,}/)
        .map((p) => `<p>${p.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
        .join("\n");
    }
    // Stamp the publish date only when a post goes live, and clear it when it
    // goes back to draft. Re-stamping on every save moved fixed-typo posts to
    // the top of the blog.
    if (typeof v.status === "string") {
      const wasLive = String(prevStatus ?? "").toLowerCase() === "published";
      if (v.status === "published" && !wasLive) v.publishedAt = new Date();
      if (v.status !== "published") v.publishedAt = null;
    }
  }
  return v;
}

const typeSchema = z.object({ type: z.enum(CMS_TYPES as [CmsType, ...CmsType[]]) });

async function body(req: Request) {
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const t = typeSchema.safeParse(raw);
  return t.success ? { type: t.data.type, raw: raw! } : null;
}

function failed(e: unknown) {
  if (isUniqueViolation(e)) return NextResponse.json({ error: DUPLICATE_SLUG }, { status: 409 });
  console.error("[admin/cms]", e);
  return NextResponse.json({ error: "Couldn't save. Nothing was changed; try again." }, { status: 500 });
}

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const b = await body(req);
  if (!b) return NextResponse.json({ error: "Unknown content type" }, { status: 400 });
  const checked = validateCmsValues(b.type, b.raw, { partial: false });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const values = normalise(b.type, checked.values);
  if (b.type === "blog" && values.body == null) values.body = "";
  try {
    const table = TABLES[b.type];
    const [item] = await getDb().insert(table).values(values as never).returning();
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, item: { id: (item as { id: string }).id } }, { status: 201 });
  } catch (e) {
    return failed(e);
  }
}

/** Edit the fields sent (only those), or toggle `isActive`. */
export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const b = await body(req);
  const id = typeof b?.raw.id === "string" ? b.raw.id : null;
  if (!b || !id) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (b.raw.isActive !== undefined && typeof b.raw.isActive !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const db = getDb();
  const table = TABLES[b.type];
  let prev: { slug?: string; status?: string } | undefined;
  if (b.type === "blog") {
    [prev] = await db
      .select({ slug: schema.websiteBlogPosts.slug, status: schema.websiteBlogPosts.status })
      .from(schema.websiteBlogPosts)
      .where(eq(schema.websiteBlogPosts.id, id))
      .limit(1);
    if (!prev) return NextResponse.json({ error: "This post no longer exists." }, { status: 404 });
  }

  const checked = validateCmsValues(b.type, b.raw, { partial: true, previousSlug: prev?.slug ?? null });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const values = normalise(b.type, checked.values, prev?.status);
  if (typeof b.raw.isActive === "boolean" && CMS_COLLECTIONS[b.type].toggle) values.isActive = b.raw.isActive;
  if (Object.keys(values).length === 0) return NextResponse.json({ ok: true, unchanged: true });

  try {
    const updated = await db
      .update(table)
      .set({ ...values, updatedAt: new Date() } as never)
      .where(eq(table.id, id))
      .returning({ id: table.id });
    if (!updated.length) return NextResponse.json({ error: "This item no longer exists." }, { status: 404 });
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failed(e);
  }
}

export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const b = await body(req);
  const id = typeof b?.raw.id === "string" ? b.raw.id : null;
  if (!b || !id) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const table = TABLES[b.type];
  await getDb().delete(table).where(eq(table.id, id));
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
