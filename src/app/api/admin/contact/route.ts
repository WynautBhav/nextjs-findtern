import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb, schema } from "@/lib/db";
import { allows } from "@/lib/admin/permissions";
import { requireMutation } from "@/lib/guards-mutation";
import { normalizePhone, phoneError } from "@/lib/phone";

/**
 * Admin correction of a user's contact details - the fix for "they typed a
 * wrong number and we cannot reach them about an offer". Same phone rule as
 * signup (lib/phone), uniqueness checked before the write, and every change
 * audit-logged with the before and after values.
 */

const bodySchema = z.object({
  targetType: z.enum(["intern", "employer"]),
  targetId: z.string().min(1),
  name: z.string().trim().min(2).max(80).optional(),
  firstName: z.string().trim().min(1).max(60).optional(),
  lastName: z.string().trim().min(1).max(60).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  countryCode: z.string().trim().optional(),
  phoneNumber: z.string().trim().optional(),
});

export async function PATCH(req: Request) {
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const d = parsed.data;
  // The permission must match the kind of account being edited: changing a
  // login email is an account takeover path.
  if (!allows(guard.session.permissions, [d.targetType === "intern" ? "interns:write" : "companies:write"])) {
    return NextResponse.json({ error: "Your role doesn't allow this" }, { status: 403 });
  }
  const db = getDb();

  if (d.phoneNumber !== undefined) {
    const problem = phoneError(d.countryCode ?? "+91", d.phoneNumber);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }
  const phone = d.phoneNumber !== undefined ? normalizePhone(d.phoneNumber) : undefined;

  if (d.targetType === "intern") {
    const t = schema.users;
    const [before] = await db.select().from(t).where(eq(t.id, d.targetId)).limit(1);
    if (!before) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (d.email && d.email !== before.email) {
      const [taken] = await db.select({ id: t.id }).from(t).where(and(eq(t.email, d.email), ne(t.id, d.targetId))).limit(1);
      if (taken) return NextResponse.json({ error: "Email already belongs to another account" }, { status: 409 });
    }
    if (phone) {
      const code = d.countryCode ?? before.countryCode;
      const [taken] = await db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.countryCode, code), eq(t.phoneNumber, phone), ne(t.id, d.targetId)))
        .limit(1);
      if (taken) return NextResponse.json({ error: "Phone number already belongs to another account" }, { status: 409 });
    }
    const set = {
      ...(d.firstName ? { firstName: d.firstName } : {}),
      ...(d.lastName ? { lastName: d.lastName } : {}),
      ...(d.email ? { email: d.email } : {}),
      ...(d.countryCode ? { countryCode: d.countryCode } : {}),
      ...(phone ? { phoneNumber: phone } : {}),
    };
    await db.update(t).set(set).where(eq(t.id, d.targetId));
    await audit(db, guard.session.uid, d.targetType, d.targetId, before, set);
  } else {
    const t = schema.employers;
    const [before] = await db.select().from(t).where(eq(t.id, d.targetId)).limit(1);
    if (!before) return NextResponse.json({ error: "Company not found" }, { status: 404 });
    if (d.email && d.email !== before.companyEmail) {
      const [taken] = await db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.companyEmail, d.email), ne(t.id, d.targetId)))
        .limit(1);
      if (taken) return NextResponse.json({ error: "Email already belongs to another company" }, { status: 409 });
    }
    if (phone) {
      const code = d.countryCode ?? before.countryCode;
      const [taken] = await db
        .select({ id: t.id })
        .from(t)
        .where(and(eq(t.countryCode, code), eq(t.phoneNumber, phone), ne(t.id, d.targetId)))
        .limit(1);
      if (taken) return NextResponse.json({ error: "Phone number already belongs to another company" }, { status: 409 });
    }
    const set = {
      ...(d.name ? { name: d.name } : {}),
      ...(d.email ? { companyEmail: d.email } : {}),
      ...(d.countryCode ? { countryCode: d.countryCode } : {}),
      ...(phone ? { phoneNumber: phone } : {}),
    };
    await db.update(t).set(set).where(eq(t.id, d.targetId));
    await audit(db, guard.session.uid, d.targetType, d.targetId, before, set);
  }

  return NextResponse.json({ ok: true });
}

async function audit(
  db: ReturnType<typeof getDb>,
  adminId: string,
  targetType: string,
  targetId: string,
  before: Record<string, unknown>,
  set: Record<string, unknown>,
) {
  const changes = Object.fromEntries(Object.keys(set).map((k) => [k, { from: before[k] ?? null, to: set[k] }]));
  await db.insert(schema.adminAuditLog).values({ adminId, action: "contact.update", targetType, targetId, meta: changes });
}
