import { NextResponse } from "next/server";
import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { getDb, schema } from "@/lib/db";
import { slugify } from "@/lib/college/slug";

const bodySchema = z.object({
  name: z.string().trim().min(3).max(200),
  city: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(80).optional().default(""),
  aisheCode: z.string().trim().regex(/^[CUS]-\d{3,6}$/i, "AISHE codes look like U-0657 or C-12345").optional().or(z.literal("")),
  emailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like jklu.edu.in")).max(10).default([]),
  logoUrl: z.string().trim().url().max(500).optional().or(z.literal("")),
  isPartner: z.boolean().default(true),
  showOnWebsite: z.boolean().default(false),
});

/** Add a college (usually a new partner). Students can pick it at once. */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the details" }, { status: 400 });
  const d = parsed.data;
  const [row] = await getDb()
    .insert(schema.colleges)
    .values({
      name: d.name,
      city: d.city || null,
      state: d.state || null,
      aisheCode: d.aisheCode ? d.aisheCode.toUpperCase() : null,
      slug: `${slugify(d.name)}-${Math.random().toString(36).slice(2, 6)}`,
      emailDomains: d.emailDomains,
      logoUrl: d.logoUrl || null,
      isPartner: d.isPartner,
      showOnWebsite: d.showOnWebsite,
    })
    .onConflictDoNothing()
    .returning({ id: schema.colleges.id });
  if (!row) return NextResponse.json({ error: "A college with that AISHE code already exists" }, { status: 409 });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
