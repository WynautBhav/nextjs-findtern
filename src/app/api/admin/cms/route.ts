import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { CMS_COLLECTIONS, CMS_TYPES, type CmsField, type CmsType } from "@/lib/admin/cms-collections";
import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const TABLES = {
  testimonial: schema.websiteHappyFaces,
  partner: schema.websitePartners,
  faq: schema.websiteFaqs,
  blog: schema.websiteBlogPosts,
  skill: schema.websiteFeaturedSkills,
} as const;

/** zod schema built from the collection's field list. */
function fieldsSchema(type: CmsType, partial: boolean) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of CMS_COLLECTIONS[type].fields as readonly CmsField[]) {
    const required = Boolean(f.required) && !partial;
    const base =
      f.kind === "number"
        ? z.coerce.number().int().min(0).max(100000)
        : f.kind === "select"
          ? z.enum(f.options as [string, ...string[]])
          : z.string().trim().max(f.kind === "textarea" ? 100_000 : 500);
    const field = required && base instanceof z.ZodString ? base.min(1, `${f.label} is required`) : base;
    shape[f.name] = required ? field : field.optional();
  }
  return z.object(shape);
}

/** Blog bodies typed as plain paragraphs become <p> blocks; HTML passes through. */
function normalise(type: CmsType, values: Record<string, unknown>) {
  const v = { ...values };
  if (type === "blog") {
    if (typeof v.body === "string" && !/<[a-z][\s\S]*>/i.test(v.body)) {
      v.body = v.body
        .split(/\n{2,}/)
        .map((p) => `<p>${p.trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>")}</p>`)
        .join("\n");
    }
    if (v.status === "published") v.publishedAt = new Date();
    if (typeof v.slug === "string" && !/^[a-z0-9-]+$/.test(v.slug)) throw new Error("Slug: lowercase letters, numbers and dashes only");
  }
  return v;
}

const typeSchema = z.object({ type: z.enum(CMS_TYPES as [CmsType, ...CmsType[]]) });

async function body(req: Request) {
  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const t = typeSchema.safeParse(raw);
  return t.success ? { type: t.data.type, raw: raw! } : null;
}

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const b = await body(req);
  if (!b) return NextResponse.json({ error: "Unknown content type" }, { status: 400 });
  const parsed = fieldsSchema(b.type, false).safeParse(b.raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const table = TABLES[b.type];
    const [item] = await getDb().insert(table).values(normalise(b.type, parsed.data) as never).returning();
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save" }, { status: 400 });
  }
}

/** Edit fields, or toggle `isActive`. */
export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const b = await body(req);
  const id = typeof b?.raw.id === "string" ? b.raw.id : null;
  if (!b || !id) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const parsed = fieldsSchema(b.type, true).extend({ isActive: z.boolean().optional() }).safeParse(b.raw);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const table = TABLES[b.type];
    await getDb()
      .update(table)
      .set({ ...normalise(b.type, parsed.data), updatedAt: new Date() } as never)
      .where(eq(table.id, id));
    revalidatePath("/", "layout");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't save" }, { status: 400 });
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
