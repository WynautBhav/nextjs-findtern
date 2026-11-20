import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { emails } from "@/lib/emails";
import { notify } from "@/lib/notify";
import { mailCollegeOfficers } from "./mail";

/**
 * Best-effort messages for the leave flow. Call after the transaction has committed; neither helper throws, so a
 * failed email or notification never undoes a request or a decision.
 */

/** Active placement officers get an email for a new request (notify() has no college recipient, so no in-app bell). */
export async function notifyOfficersOfRequest(input: { userId: string; collegeId: string; collegeName: string; reason: string | null }): Promise<void> {
  try {
    const [u] = await getDb().select({ first: schema.users.firstName, last: schema.users.lastName, email: schema.users.email }).from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
    const studentName = [u?.first, u?.last].filter(Boolean).join(" ").trim() || u?.email || "A student";
    await mailCollegeOfficers(input.collegeId, emails.collegeLeaveRequested({ collegeName: input.collegeName, studentName, reason: input.reason }));
  } catch (err) {
    console.error("[leave-notify] officer email failed", err);
  }
}

/** The student's in-app notification for a decision (required category: not suppressible; no email). */
export async function notifyStudentOfDecision(input: { userId: string; requestId: string; collegeId: string; status: "approved" | "rejected"; note: string | null }): Promise<void> {
  try {
    const [c] = await getDb().select({ name: schema.colleges.name }).from(schema.colleges).where(eq(schema.colleges.id, input.collegeId)).limit(1);
    const college = c?.name ?? "your college";
    const approved = input.status === "approved";
    await notify({
      to: { type: "intern", id: input.userId },
      type: "college_leave_decided",
      title: approved ? `You left ${college}` : `Leave request not approved`,
      message: approved
        ? `${college}'s placement office approved your request. You are no longer in the college.`
        : `${college}'s placement office did not approve your request.${input.note ? ` Note: ${input.note}` : ""} You can ask again from your college settings.`,
      data: { requestId: input.requestId, status: input.status },
      dedupeKey: `college-leave:${input.requestId}`,
    });
  } catch (err) {
    console.error("[leave-notify] student notification failed", err);
  }
}
