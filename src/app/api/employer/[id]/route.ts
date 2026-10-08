import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({
  companyName: z.string().optional(),
  websiteUrl: z.string().optional(),
  companyEmail: z.string().optional(),
  logoUrl: z.string().optional(),
  companySize: z.string().optional(),
  country: z.string().optional(),
  state: z.string().optional(),
  city: z.string().optional(),
  primaryContactName: z.string().optional(),
  primaryContactRole: z.string().optional(),
  countryCode: z.string().optional(),
  phoneNumber: z.string().optional(),
  escalationContactName: z.string().optional(),
  escalationContactRole: z.string().optional(),
  escalationContactEmail: z.string().optional(),
  escalationContactCountryCode: z.string().optional(),
  escalationContactPhone: z.string().optional(),
  gstNumber: z.string().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const db = getDb();
  await db.update(schema.employers).set(parsed.data).where(eq(schema.employers.id, id));
  return NextResponse.json({ ok: true });
}
