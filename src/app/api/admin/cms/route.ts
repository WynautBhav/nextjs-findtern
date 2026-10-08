import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const createFaqSchema = z.object({
  type: z.literal("faq"),
  question: z.string().min(2),
  answer: z.string().min(2),
  category: z.string().min(1),
  sortOrder: z.number().default(0),
});

const createPartnerSchema = z.object({
  type: z.literal("partner"),
  name: z.string().min(2),
  logoUrl: z.string().min(2),
  href: z.string().optional(),
  sortOrder: z.number().default(0),
});

const createTestimonialSchema = z.object({
  type: z.literal("testimonial"),
  name: z.string().min(2),
  title: z.string().min(2),
  company: z.string().min(2),
  quote: z.string().min(5),
  avatarUrl: z.string().optional(),
  sortOrder: z.number().default(0),
});

const postSchema = z.discriminatedUnion("type", [
  createFaqSchema,
  createPartnerSchema,
  createTestimonialSchema,
]);

const patchSchema = z.object({
  type: z.enum(["faq", "partner", "testimonial", "pricing"]),
  id: z.string().min(1),
  isActive: z.boolean(),
});

const deleteSchema = z.object({
  type: z.enum(["faq", "partner", "testimonial", "pricing"]),
  id: z.string().min(1),
});

export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  if (parsed.data.type === "faq") {
    const [row] = await db.insert(schema.websiteFaqs).values({
      question: parsed.data.question,
      answer: parsed.data.answer,
      category: parsed.data.category,
      sortOrder: parsed.data.sortOrder,
    }).returning();
    return NextResponse.json({ ok: true, item: row }, { status: 201 });
  }

  if (parsed.data.type === "partner") {
    const [row] = await db.insert(schema.websitePartners).values({
      name: parsed.data.name,
      logoUrl: parsed.data.logoUrl,
      href: parsed.data.href || null,
      sortOrder: parsed.data.sortOrder,
    }).returning();
    return NextResponse.json({ ok: true, item: row }, { status: 201 });
  }

  if (parsed.data.type === "testimonial") {
    const [row] = await db.insert(schema.websiteHappyFaces).values({
      name: parsed.data.name,
      title: parsed.data.title,
      company: parsed.data.company,
      quote: parsed.data.quote,
      avatarUrl: parsed.data.avatarUrl || null,
      sortOrder: parsed.data.sortOrder,
    }).returning();
    return NextResponse.json({ ok: true, item: row }, { status: 201 });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const { type, id, isActive } = parsed.data;

  if (type === "faq") {
    await db.update(schema.websiteFaqs).set({ isActive, updatedAt: new Date() }).where(eq(schema.websiteFaqs.id, id));
  } else if (type === "partner") {
    await db.update(schema.websitePartners).set({ isActive, updatedAt: new Date() }).where(eq(schema.websitePartners.id, id));
  } else if (type === "testimonial") {
    await db.update(schema.websiteHappyFaces).set({ isActive, updatedAt: new Date() }).where(eq(schema.websiteHappyFaces.id, id));
  } else if (type === "pricing") {
    await db.update(schema.pricingPlans).set({ isActive, updatedAt: new Date() }).where(eq(schema.pricingPlans.id, id));
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  const { type, id } = parsed.data;

  if (type === "faq") {
    await db.delete(schema.websiteFaqs).where(eq(schema.websiteFaqs.id, id));
  } else if (type === "partner") {
    await db.delete(schema.websitePartners).where(eq(schema.websitePartners.id, id));
  } else if (type === "testimonial") {
    await db.delete(schema.websiteHappyFaces).where(eq(schema.websiteHappyFaces.id, id));
  } else if (type === "pricing") {
    await db.delete(schema.pricingPlans).where(eq(schema.pricingPlans.id, id));
  }

  return NextResponse.json({ ok: true });
}
