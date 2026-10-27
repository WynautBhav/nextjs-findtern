import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { requireMutation } from "@/lib/guards-mutation";
import { normalizePhone, phoneError } from "@/lib/phone";
import { phoneInUseAnywhere } from "@/lib/phone-owner";

const bodySchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(1).max(60),
  countryCode: z.string().trim().regex(/^\+\d{1,4}$/),
  phoneNumber: z.string().trim(),
});

/** An intern edits their own name and phone (legacy PUT /api/users/:id). */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["intern"], ownerId: id });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check your name and phone" }, { status: 400 });
  const b = parsed.data;
  const phoneProblem = phoneError(b.countryCode, b.phoneNumber);
  if (phoneProblem) return NextResponse.json({ error: phoneProblem }, { status: 400 });
  const phone = normalizePhone(b.phoneNumber);

  const db = getDb();
  // One phone per person across roles and contact numbers, country code
  // included (INT-05, INT-36). The intern's own rows are skipped, so saving
  // an unchanged number is fine.
  if (await phoneInUseAnywhere(b.countryCode, phone, { userId: id })) {
    return NextResponse.json({ error: "This phone number is already in use." }, { status: 409 });
  }

  await db
    .update(schema.users)
    .set({ firstName: b.firstName, lastName: b.lastName, countryCode: b.countryCode, phoneNumber: phone })
    .where(eq(schema.users.id, id));
  return NextResponse.json({ ok: true });
}
