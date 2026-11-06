import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { collegeBankProblem } from "@/lib/college/money";
import { requireCollegeMutation } from "@/lib/college/guard";
import { schema } from "@/lib/db";
import { withLock } from "@/lib/advisory-lock";

const bodySchema = z.object({
  holder: z.string().trim().max(120),
  bankName: z.string().trim().max(120),
  /** Blank keeps the number on file. */
  accountNumber: z.string().trim().max(30).default(""),
  confirm: z.string().trim().max(30).default(""),
  ifsc: z.string().trim().toUpperCase().max(11),
});

/** The TPO saves the college's bank account. Locked while a withdrawal is waiting, so the money can't be redirected mid-request. */
export async function PUT(req: Request) {
  const g = await requireCollegeMutation(req, "bank:update");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const b = parsed.data;
  const collegeId = g.ctx.college.id;
  const c = schema.colleges;

  const result = await withLock(`college-wallet:${collegeId}`, async (tx) => {
    const [pending] = await tx
      .select({ id: schema.collegePayouts.id })
      .from(schema.collegePayouts)
      .where(and(eq(schema.collegePayouts.collegeId, collegeId), eq(schema.collegePayouts.status, "requested")))
      .limit(1);
    if (pending) return { error: "You have a withdrawal waiting. Bank details unlock once it is paid or declined.", status: 409 };

    const [cur] = await tx.select({ number: c.bankAccountNumber }).from(c).where(eq(c.id, collegeId)).limit(1);
    const number = b.accountNumber || cur?.number || "";
    if (b.accountNumber && b.accountNumber !== b.confirm) return { error: "The account numbers don't match.", status: 400 };
    const problem = collegeBankProblem({ holder: b.holder, bankName: b.bankName, accountNumber: number, ifsc: b.ifsc });
    if (problem) return { error: problem, status: 400 };

    await tx.update(c).set({ bankAccountName: b.holder, bankName: b.bankName, bankAccountNumber: number, bankIfsc: b.ifsc }).where(eq(c.id, collegeId));
    await tx.insert(schema.collegeAuditLog).values({
      collegeId,
      actorType: "college_admin",
      actorId: g.ctx.admin.id,
      action: "bank_update",
      meta: { last4: number.slice(-4) },
    });
    return { ok: true as const, last4: number.slice(-4) };
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
