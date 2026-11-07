import { NextResponse } from "next/server";

import { getSession } from "@/lib/auth";import { z } from "zod";

import { requireMutation } from "@/lib/guards-mutation";
import { createOrder, errorResponse, listOrders, readDenied, validateOrderInput } from "@/lib/drives/admin-db";
import { parseIdempotencyKey } from "@/lib/drives/admin-rules";

type Ctx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  slots: z.number(),
  feePerStudentMinor: z.number(),
  creditMinor: z.number().optional(),
  codeValidUntil: z.string(),
  driveId: z.string().min(1).max(64).optional(),
});

export async function GET(req: Request, ctx: Ctx) {
  const session = await getSession();
  if (!session || session.role !== "admin") return NextResponse.json({ error: session ? "Insufficient role" : "Unauthenticated" }, { status: session ? 403 : 401 });
  const denied = readDenied(req, session.permissions);
  if (denied) return denied;
  try {
    return NextResponse.json({ orders: await listOrders((await ctx.params).id) });
  } catch (e) {
    return errorResponse(e);
  }
}

/** Raise a pending drive order. A carried-over seat credit is a signed line on this order; old rows are never edited. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  const key = parseIdempotencyKey(req.headers.get("idempotency-key"));
  if (!key.ok) return NextResponse.json({ error: "Idempotency-Key must be 8 to 128 letters, digits or - _ . :" }, { status: 400 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter slots, a fee and a code validity date." }, { status: 400 });
  const b = parsed.data;
  const v = validateOrderInput({ slots: b.slots, feePerStudentMinor: b.feePerStudentMinor, creditMinor: b.creditMinor, codeValidUntil: new Date(b.codeValidUntil) }, new Date());
  if (!v.ok) return NextResponse.json({ error: v.errors.join(". ") }, { status: 400 });
  try {
    const { id } = await ctx.params;
    const out = await createOrder({ collegeId: id, driveId: b.driveId ?? null, value: v.value, adminId: g.session.uid, key: key.key });
    return NextResponse.json({ ok: true, order: out.order, replayed: out.replayed }, { status: out.replayed ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
