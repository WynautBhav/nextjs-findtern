import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCollegeMutation } from "@/lib/college/guard";
import { decideAndNotify } from "@/lib/college/leave-decide";
import { LEAVE_BULK_MAX, LEAVE_NOTE_MAX } from "@/lib/college/leave-request";

const bodySchema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(LEAVE_BULK_MAX),
  action: z.enum(["approve", "reject"]),
  note: z.string().max(LEAVE_NOTE_MAX).optional(),
});

type Result = { id: string; ok: boolean; already?: boolean; status?: string; error?: string; code?: string };

/**
 * Approve or reject one or many leave requests (up to 100). Each id is its own transaction, so one failure never
 * undoes another; a request from another college is a 404 for that id (decideLeaveRequest scopes by college).
 */
export async function POST(req: Request) {
  const g = await requireCollegeMutation(req, "leave:decide");
  if (!g.ok) return g.response;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose 1 to 100 requests, approve or reject, and keep the note under 500 characters." }, { status: 400 });
  const { action, note } = parsed.data;
  const ids = [...new Set(parsed.data.ids)];

  const results: Result[] = [];
  for (let i = 0; i < ids.length; i += 10) {
    const settled = await Promise.allSettled(
      ids.slice(i, i + 10).map((id) => decideAndNotify({ actor: { type: "college_admin", id: g.ctx.admin.id }, collegeId: g.ctx.college.id, requestId: id, action, note })),
    );
    settled.forEach((s, j) => {
      const id = ids[i + j];
      if (s.status === "fulfilled") {
        const o = s.value;
        results.push(o.ok ? { id, ok: true, already: o.already, status: o.status } : { id, ok: false, error: o.error, code: o.code });
      } else {
        console.error("[leave-decide] one request failed", s.reason);
        results.push({ id, ok: false, error: "Could not save this one. Try again.", code: "error" });
      }
    });
  }
  const done = results.filter((r) => r.ok && !r.already);
  return NextResponse.json({
    results,
    approved: done.filter((r) => r.status === "approved").length,
    rejected: done.filter((r) => r.status === "rejected").length,
    failed: results.filter((r) => !r.ok).length,
  });
}
