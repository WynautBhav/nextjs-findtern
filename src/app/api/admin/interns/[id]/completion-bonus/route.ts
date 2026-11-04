import { NextResponse } from "next/server";
import { z } from "zod";

import { withLock } from "@/lib/advisory-lock";
import { completeInternship, notifyCompleted } from "@/lib/admin/complete-internship";
import { afterRatingsSaved } from "@/lib/admin/score-live";
import { requireMutation } from "@/lib/guards-mutation";

const bodySchema = z.object({ proposalId: z.string().min(1).max(80) });

const REFUSED = {
  not_found: ["Hire not found", 404],
  not_hired: ["Only a hired proposal can be completed", 409],
  incomplete: ["Every month's timesheet must be approved first", 409],
  already: ["This internship is already completed", 409],
  ended: ["This placement ended early", 409],
  full_time: ["Full-time offers have no completion bonus", 409],
} as const;

/**
 * Manual "mark completed": same function as the final timesheet approval, so it
 * is gated on every month being approved and can never grant twice.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const { proposalId } = parsed.data;

  const r = await withLock(`complete:${proposalId}`, (tx) => completeInternship(tx, proposalId, guard.session.uid, id));
  if (!r.completed) return NextResponse.json({ error: REFUSED[r.reason][0] }, { status: REFUSED[r.reason][1] });

  await afterRatingsSaved(id, r.prev, r.next);
  await notifyCompleted(proposalId, r);
  return NextResponse.json({ ok: true, findternScore: r.next.findternScore ?? null, bonusMinor: r.amountMinor });
}
