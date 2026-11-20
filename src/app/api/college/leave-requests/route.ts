import { NextResponse } from "next/server";

import { requireCollegeRead } from "@/lib/college/guard";
import { leaveRequestsForCollege } from "@/lib/college/leave-request-read";

/** Pending leave requests plus the 50 most recent decided ones, for the officer's own college only. */
export async function GET() {
  const g = await requireCollegeRead();
  if (!g.ok) return g.response;
  const requests = await leaveRequestsForCollege(g.ctx.college.id);
  return NextResponse.json({ requests, pending: requests.filter((r) => r.status === "requested").length });
}
