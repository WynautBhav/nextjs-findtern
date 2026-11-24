import { NextResponse } from "next/server";

import { requireMutation } from "@/lib/guards-mutation";

/**
 * Employers can no longer reschedule a meeting (owner, 24 Nov 2026): no new times for a booked, lapsed, requested or open
 * meeting. To meet again they cancel and book a new one. Interns could not reschedule already (request-reschedule). The
 * route stays so an old page or a direct call gets an explicit 403 ("employer_reschedule_removed") and nothing changes.
 */
export async function POST(req: Request) {
  const guard = await requireMutation({ req, roles: ["employer"] });
  if (!guard.ok) return guard.response;
  return NextResponse.json(
    { error: "Meetings can't be rescheduled. Cancel this one and book a new meeting instead.", code: "employer_reschedule_removed" },
    { status: 403 },
  );
}
