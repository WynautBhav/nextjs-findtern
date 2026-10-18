import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { phoneError } from "@/lib/phone";

// Optional profile fields take null so a cleared input clears the column;
// companyName and the primary phone are required and stay non-null.
const bodySchema = z.object({
  companyName: z.string().optional(),
  websiteUrl: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
  companySize: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  primaryContactName: z.string().nullable().optional(),
  primaryContactRole: z.string().nullable().optional(),
  countryCode: z.string().optional(),
  phoneNumber: z.string().optional(),
  escalationContactName: z.string().nullable().optional(),
  escalationContactRole: z.string().nullable().optional(),
  escalationContactEmail: z.string().nullable().optional(),
  escalationContactCountryCode: z.string().nullable().optional(),
  escalationContactPhone: z.string().nullable().optional(),
  gstNumber: z.string().trim().toUpperCase().nullable().optional(),
  billingPincode: z
    .string()
    .trim()
    .regex(/^([1-9]\d{5})?$/, "PIN code must be 6 digits")
    .nullable()
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["employer"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // companyEmail is the login identity; it is not editable here, because
  // changing it would skip the email verification signup requires.
  const d = parsed.data;
  const phoneProblem =
    (d.phoneNumber !== undefined && phoneError(d.countryCode ?? "+91", d.phoneNumber)) ||
    (d.escalationContactPhone && phoneError(d.escalationContactCountryCode ?? "+91", d.escalationContactPhone));
  if (phoneProblem) return NextResponse.json({ error: phoneProblem }, { status: 400 });

  const db = getDb();
  await db.update(schema.employers).set(parsed.data).where(eq(schema.employers.id, id));
  return NextResponse.json({ ok: true });
}
