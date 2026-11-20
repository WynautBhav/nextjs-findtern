import { and, asc, eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { employerNoShow, isMeetingLinkLive } from "@/lib/employer-interview-rules";
import { interviewLifecycle } from "@/lib/interview-lifecycle";
import { safeMeetingHref } from "@/lib/interview-join";

import { DISCLAIMER_VERSION, type GateRole } from "./gate.ts";

type Db = ReturnType<typeof getDb>;
type Interview = typeof schema.interviews.$inferSelect;

/** "closed": cancelled, unbooked, over or an employer no-show. "pending": booked but the Meet link is not ready. */
export type MeetingGateState = "ready" | "pending" | "closed";

export const meetingGateState = (iv: Interview): MeetingGateState => {
  if (iv.status !== "scheduled" || !iv.selectedSlot || interviewLifecycle(iv).expired || employerNoShow(iv)) return "closed";
  return isMeetingLinkLive(iv) && safeMeetingHref(iv.meetingLink) ? "ready" : "pending";
};

/** The meeting behind a token for a signed-in party; null for an unknown token or anyone who is not one of the two sides (the same answer, so tokens cannot be probed). */
export async function loadGateMeeting(db: Db, token: string, who: { role: GateRole; uid: string }): Promise<{ iv: Interview; state: MeetingGateState } | null> {
  const [iv] = await db.select().from(schema.interviews).where(eq(schema.interviews.gateToken, token)).limit(1);
  if (!iv || (who.role === "employer" ? iv.employerId : iv.internId) !== who.uid) return null;
  return { iv, state: meetingGateState(iv) };
}

const mine = (interviewId: string, who: { role: GateRole; uid: string }) =>
  and(eq(schema.meetingGateAcceptances.interviewId, interviewId), eq(schema.meetingGateAcceptances.userType, who.role), eq(schema.meetingGateAcceptances.userId, who.uid));

/** True when this person already agreed to the CURRENT disclaimer version for this meeting. */
export async function hasAccepted(db: Db, interviewId: string, who: { role: GateRole; uid: string }, version: string = DISCLAIMER_VERSION): Promise<boolean> {
  const rows = await db.select({ v: schema.meetingGateAcceptances.disclaimerVersion }).from(schema.meetingGateAcceptances).where(mine(interviewId, who));
  return rows.some((r) => r.v === version);
}

/** Records the agreement; a repeat of the same version keeps the first row. */
export async function recordAcceptance(db: Db, input: { interviewId: string; who: { role: GateRole; uid: string }; ipHash: string | null; version?: string }): Promise<void> {
  await db
    .insert(schema.meetingGateAcceptances)
    .values({ interviewId: input.interviewId, userType: input.who.role, userId: input.who.uid, disclaimerVersion: input.version ?? DISCLAIMER_VERSION, ipHash: input.ipHash })
    .onConflictDoNothing();
}

/** Admin view: who agreed to what, when. The IP hash is not returned. */
export async function listAcceptances(db: Db, interviewId: string) {
  return db
    .select({ userType: schema.meetingGateAcceptances.userType, userId: schema.meetingGateAcceptances.userId, version: schema.meetingGateAcceptances.disclaimerVersion, acceptedAt: schema.meetingGateAcceptances.acceptedAt })
    .from(schema.meetingGateAcceptances)
    .where(eq(schema.meetingGateAcceptances.interviewId, interviewId))
    .orderBy(asc(schema.meetingGateAcceptances.acceptedAt));
}
