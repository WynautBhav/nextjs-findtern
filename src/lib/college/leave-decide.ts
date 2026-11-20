import { decideLeaveRequest, type Actor, type DecideResult } from "./leave-request-db";
import { notifyStudentOfDecision } from "./leave-notify";
import type { LeaveAction } from "./leave-request";

/** Decide one request, then tell the student (only when this call is the one that decided it). */
export async function decideAndNotify(input: { actor: Actor; collegeId: string | null; requestId: string; action: LeaveAction; note?: unknown }): Promise<DecideResult> {
  const out = await decideLeaveRequest(input);
  if (out.ok && !out.already) {
    await notifyStudentOfDecision({
      userId: out.userId,
      requestId: input.requestId,
      collegeId: out.collegeId,
      status: out.status,
      note: typeof input.note === "string" && input.note.trim() ? input.note.trim() : null,
    });
  }
  return out;
}
