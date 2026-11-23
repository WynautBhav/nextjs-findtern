import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { recordAdminAudit } from "@/lib/admin/audit";
import { withLock } from "@/lib/advisory-lock";
import { withFreshCollegeCode } from "@/lib/college/code";
import { duplicateProbe } from "@/lib/college/create-dup";
import { requireMutation } from "@/lib/guards-mutation";
import { CACHE_TAGS, purgeServerCache } from "@/lib/server-cache";
import { getDb, schema } from "@/lib/db";
import { GSTIN_FORMAT, GSTIN_HINT } from "@/lib/gstin";
import { gstinStateError } from "@/lib/gst";
import { isSafeLink } from "@/lib/safe-url";
import { slugify } from "@/lib/college/slug";

const bodySchema = z.object({
  name: z.string().trim().min(3).max(200),
  city: z.string().trim().max(80).optional().default(""),
  state: z.string().trim().max(80).optional().default(""),
  gstin: z.string().trim().toUpperCase().regex(GSTIN_FORMAT, GSTIN_HINT).optional().or(z.literal("")),
  aisheCode: z.string().trim().regex(/^[CUS]-\d{3,6}$/i, "AISHE codes look like U-0657 or C-12345").optional().or(z.literal("")),
  emailDomains: z.array(z.string().trim().toLowerCase().regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Enter a domain like jklu.edu.in")).max(10).default([]),
  logoUrl: z.string().trim().url().max(500).refine((u) => isSafeLink(u), "Logo link must start with http:// or https://").optional().or(z.literal("")),
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
  const stateProblem = gstinStateError(d.gstin, d.state);
  if (stateProblem) return NextResponse.json({ error: stateProblem }, { status: 400 });
  // A clash on the AISHE code answers 409 below; a clash on the random Findtern code is retried with a new one.
  // Same name and city is the same college (see duplicateProbe for when the check applies): the check and the insert
  // run under one lock, so a double click or two tabs make one college (the AISHE index catches the coded case).
  const probe = duplicateProbe(d);
  const nameKey = d.name.toLowerCase().replace(/\s+/g, " ");
  const cityKey = d.city.toLowerCase();
  const made = await withLock(`college-create:${nameKey}|${cityKey}`, async (tx) => {
    if (probe) {
      const samePayload = probe.payload ? sql` and coalesce(${schema.colleges.gstin}, '') = ${probe.payload.gstin} and ${schema.colleges.emailDomains} = ${JSON.stringify(probe.payload.domains)}::jsonb` : sql``;
      const [same] = await tx
        .select({ id: schema.colleges.id })
        .from(schema.colleges)
        .where(sql`regexp_replace(lower(${schema.colleges.name}), '[[:space:]]+', ' ', 'g') = ${probe.nameKey} and coalesce(lower(${schema.colleges.city}), '') = ${probe.cityKey}${samePayload}`)
        .limit(1);
      if (same) return { refused: "same_name" as const };
    }
    // Each try is a savepoint, so a duplicate random code does not abort the outer transaction.
    const [created] = await withFreshCollegeCode((code) => tx.transaction((sp) => sp
    .insert(schema.colleges)
    .values({
      code,
      name: d.name,
      city: d.city || null,
      state: d.state || null,
      gstin: d.gstin || null,
      aisheCode: d.aisheCode ? d.aisheCode.toUpperCase() : null,
      slug: `${slugify(d.name)}-${Math.random().toString(36).slice(2, 6)}`,
      emailDomains: d.emailDomains,
      logoUrl: d.logoUrl || null,
      isPartner: d.isPartner,
      showOnWebsite: d.showOnWebsite,
    })
    .onConflictDoNothing({ target: schema.colleges.aisheCode, where: sql`${schema.colleges.aisheCode} is not null` })
    .returning({ id: schema.colleges.id })));
    return created ? { id: created.id } : { refused: "aishe" as const };
  });
  if ("refused" in made && made.refused === "same_name") return NextResponse.json({ error: "A college with this name and city already exists. Find it in the list and edit it instead." }, { status: 409 });
  if ("refused" in made) return NextResponse.json({ error: "A college with that AISHE code already exists" }, { status: 409 });
  const row = made;
  purgeServerCache(CACHE_TAGS.colleges);
  await recordAdminAudit(getDb(), { adminId: guard.session.uid, action: "college.create", targetType: "college", targetId: row.id, meta: { name: d.name, isPartner: d.isPartner } });
  return NextResponse.json({ id: row.id }, { status: 201 });
}
