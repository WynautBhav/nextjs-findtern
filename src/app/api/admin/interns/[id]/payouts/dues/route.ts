import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";
import { loadPlacementDues } from "@/lib/admin/payout-list";

/**
 * One intern's stipend dues per hired placement, with the employer side
 * (months the employer has paid, what it still owes) - the table the payout
 * tools on Candidate 360 create payouts from (legacy
 * `GET /api/admin/interns/:id/employer-dues`). Read only; the guard is the
 * shared admin one, which also checks the role's interns:read permission.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireMutation({ req, roles: ["admin"] });
  if (!guard.ok) return guard.response;
  try {
    return NextResponse.json({ dues: await loadPlacementDues(id) });
  } catch (e) {
    console.error("[admin/interns/payouts/dues]", e);
    return NextResponse.json({ error: "Couldn't load the dues. Try again." }, { status: 500 });
  }
}
