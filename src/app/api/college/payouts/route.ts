import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock } from "@/lib/advisory-lock";
import { requireCollegeMutation } from "@/lib/college/guard";
import { mailFindternAdmin } from "@/lib/college/mail";
import { availableMinor, withdrawalProblem } from "@/lib/college/money";
import { schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { isUniqueViolation } from "@/lib/promo";

const bodySchema = z.object({ amountMinor: z.number() });

/** The TPO asks to withdraw part or all of the wallet. Checked against the balance under the wallet lock. */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "payout:request");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  const { amountMinor } = parsed.data;
  const { college, admin } = g.ctx;
  const w = schema.collegeWalletEntries;
  const p = schema.collegePayouts;

  try {
    const problem = await withLock(`college-wallet:${college.id}`, async (tx) => {
      const [[bal], [open], [bank]] = await Promise.all([
        tx.select({ sum: sql<number>`coalesce(sum(${w.amountMinor}), 0)::int` }).from(w).where(eq(w.collegeId, college.id)),
        tx.select({ amountMinor: p.amountMinor }).from(p).where(and(eq(p.collegeId, college.id), eq(p.status, "requested"))).limit(1),
        tx.select({ n: schema.colleges.bankAccountNumber, i: schema.colleges.bankIfsc }).from(schema.colleges).where(eq(schema.colleges.id, college.id)).limit(1),
      ]);
      if (open) return "You already have a withdrawal waiting";
      const bad = withdrawalProblem({
        amountMinor,
        availableMinor: availableMinor(bal?.sum ?? 0, 0),
        hasBank: Boolean(bank?.n && bank?.i),
      });
      if (bad) return bad;
      await tx.insert(p).values({ collegeId: college.id, amountMinor, status: "requested", requestedBy: admin.id });
      return null;
    });
    if (problem) return NextResponse.json({ error: problem }, { status: problem.startsWith("You already") ? 409 : 400 });
  } catch (err) {
    // The unique index is the backstop if two requests ever slip past the lock.
    if (isUniqueViolation(err)) return NextResponse.json({ error: "You already have a withdrawal waiting" }, { status: 409 });
    throw err;
  }
  await mailFindternAdmin(emails.collegePayoutRequested({ collegeName: college.name, amount: formatMoney(amountMinor, "INR") }));
  return NextResponse.json({ ok: true });
}
