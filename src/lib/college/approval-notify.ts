import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";
import { decideStudent, type ApprovalAction, type ApprovalResult, type DecideInput } from "./approvals";

/**
 * Decide, then tell the student in the app (after the commit; never throws). The student always hears that a
 * college added or removed them: an officer accepting an old account is the one join the student did not start.
 */
export async function decideStudentAndNotify(input: DecideInput): Promise<ApprovalResult> {
  const out = await decideStudent(input);
  if (out.ok && !out.already) await notifyStudent(input.collegeId, out.userId, out.action);
  return out;
}

const COPY: Record<ApprovalAction, (college: string) => { title: string; message: string }> = {
  accept: (c) => ({
    title: `${c} added you to its students`,
    message: `${c}'s placement office confirmed you as its student on Findtern. They can now see your profile, score and AI interview report, and employers in the college's campus drives can find you. Not your college? Send a leave request from your college settings.`,
  }),
  restore: (c) => ({ title: `${c} added you back`, message: `${c}'s placement office added you back to its students on Findtern.` }),
  deny: (c) => ({
    title: `${c} removed you from its students`,
    message: `${c}'s placement office removed you from its students on Findtern. Your own account, profile and score are unchanged. If this is a mistake, ask your placement office to add you back.`,
  }),
};

async function notifyStudent(collegeId: string, userId: string, action: ApprovalAction): Promise<void> {
  try {
    const [c] = await getDb().select({ name: schema.colleges.name }).from(schema.colleges).where(eq(schema.colleges.id, collegeId)).limit(1);
    const copy = COPY[action](c?.name ?? "Your college");
    await notify({ to: { type: "intern", id: userId }, type: "college_membership_decided", ...copy, data: { collegeId, action } });
  } catch (err) {
    console.error("[approval-notify] student notification failed", err);
  }
}
