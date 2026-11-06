import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock } from "@/lib/advisory-lock";
import { recordAdminAudit } from "@/lib/admin/audit";
import { allows } from "@/lib/admin/permissions";
import { settleProblem } from "@/lib/college/money";
import { mailCollegeOfficers } from "@/lib/college/mail";
import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { formatMoney } from "@/lib/format";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("paid"), referenceId: z.string().trim().min(1).max(64) }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3).max(300) }),
]);

/** Thrown inside the wallet transaction so the whole settle rolls back. */
class SettleRefused extends Error {}

type Ctx = { params: Promise<{ id: string; payoutId: string }> };

/** Admin pays a withdrawal by bank transfer and records it (one debit), or declines it (no debit). */
export async function POST(req: Request, ctx: Ctx) {
  const g = await requireMutation({ req, roles: ["admin"] });
  if (!g.ok) return g.response;
  if (!allows(g.session.permissions, ["transactions:write"])) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A bank reference (paid) or a reason of 3 to 300 characters (reject) is required" }, { status: 400 });
  const body = parsed.data;
  const { id, payoutId } = await ctx.params;
  const p = schema.collegePayouts;
  const now = new Date();

  let out;
  try {
    out = await withLock(`college-wallet:${id}`, async (tx) => {
      // Conditional on still being requested, so a double click or two admins settle it once.
      const [row] = await tx
        .update(p)
        .set(
          body.action === "paid"
            ? { status: "paid", paidAt: now, referenceId: body.referenceId, updatedAt: now }
            : { status: "rejected", notes: body.reason, updatedAt: now },
        )
        .where(and(eq(p.id, payoutId), eq(p.collegeId, id), eq(p.status, "requested")))
        .returning({ amountMinor: p.amountMinor });
      if (!row) {
        const [existing] = await tx.select({ status: p.status }).from(p).where(and(eq(p.id, payoutId), eq(p.collegeId, id))).limit(1);
        return existing ? { error: `Already ${existing.status}`, status: 409 } : { error: "Unknown payout", status: 404 };
      }
      if (body.action === "paid") {
        // Re-check the balance under the wallet lock: earlier withdrawals or adjustments may have used it since the request was made.
        const [bal] = await tx
          .select({ balance: sql<number>`coalesce(sum(${schema.collegeWalletEntries.amountMinor}), 0)::int` })
          .from(schema.collegeWalletEntries)
          .where(eq(schema.collegeWalletEntries.collegeId, id));
        const short = settleProblem(Number(bal?.balance ?? 0), row.amountMinor);
        if (short) throw new SettleRefused(short); // rolls the status change back too
        await tx.insert(schema.collegeWalletEntries).values({
          collegeId: id,
          kind: "payout",
          amountMinor: -row.amountMinor,
          payoutId,
          createdBy: g.session.uid,
        });
      }
      await recordAdminAudit(
        tx,
        {
          adminId: g.session.uid,
          action: body.action === "paid" ? "college.payout_paid" : "college.payout_reject",
          targetType: "college_payout",
          targetId: payoutId,
          meta: { collegeId: id, amountMinor: row.amountMinor, ...(body.action === "paid" ? { referenceId: body.referenceId } : { reason: body.reason }) },
        },
        { strict: true },
      );
      return { ok: true as const, amountMinor: row.amountMinor };
    });
  } catch (e) {
    if (e instanceof SettleRefused) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: out.status });

  const [college] = await getDb().select({ name: schema.colleges.name }).from(schema.colleges).where(eq(schema.colleges.id, id)).limit(1);
  const collegeName = college?.name ?? "your college";
  const amount = formatMoney(out.amountMinor, "INR");
  await mailCollegeOfficers(
    id,
    body.action === "paid"
      ? emails.collegePayoutPaid({ collegeName, amount, referenceId: body.referenceId })
      : emails.collegePayoutRejected({ collegeName, amount, reason: body.reason }),
  );
  return NextResponse.json({ ok: true });
}
