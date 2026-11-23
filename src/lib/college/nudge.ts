import { and, desc, eq, gt } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { notifyDetailed } from "@/lib/notify";
import { linkTo } from "@/lib/origin";
import { NUDGE_COOLDOWN_MS, NUDGE_KINDS, planNudge, type NudgeKind } from "./nudge-plan";
import { sendPush } from "./push";

export { NUDGE_KINDS };
export type { NudgeKind };

export async function sendNudge(input: {
  collegeId: string;
  collegeName: string;
  adminId: string;
  userId: string;
  kind: NudgeKind;
}): Promise<{ ok: true; pushed: boolean; emailed: boolean; emailFailed: boolean } | { ok: false; error: string; status: number }> {
  const db = getDb();
  const now = new Date();
  // A disabled or banned account is not written to at all: no nudge row, no bell, no push, no email.
  const [target] = await db.select({ isActive: schema.users.isActive }).from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
  if (!target?.isActive) return { ok: false, error: "This account is not active.", status: 404 };
  const [last] = await db
    .select({ createdAt: schema.collegeNudges.createdAt })
    .from(schema.collegeNudges)
    .where(
      and(
        eq(schema.collegeNudges.userId, input.userId),
        eq(schema.collegeNudges.kind, input.kind),
        gt(schema.collegeNudges.createdAt, new Date(now.getTime() - NUDGE_COOLDOWN_MS)),
      ),
    )
    .orderBy(desc(schema.collegeNudges.createdAt))
    .limit(1);
  const plan = planNudge({ kind: input.kind, collegeName: input.collegeName, now, lastSameKindAt: last?.createdAt ?? null, link: (path) => linkTo(path) });
  if (plan.cooldown) return { ok: false, error: "Already nudged in the last 10 minutes.", status: 429 };

  await db.insert(schema.collegeNudges).values({
    collegeId: input.collegeId,
    adminId: input.adminId,
    userId: input.userId,
    kind: input.kind,
  });
  const { copy, email } = plan;
  // The nudge row is committed: with no PUBLIC_ORIGIN the student gets the bell and push, not an email.
  // Every nudge past the 10-minute cooldown emails right here in the request (nudge types are "required": the
  // bell and the mail ignore preferences). `emailed` is true only when SMTP accepted the mail.
  const { emailed, emailFailed } = await notifyDetailed({
    to: { type: "intern", id: input.userId },
    type: `college_nudge_${input.kind}`,
    title: copy.title,
    message: copy.message,
    data: { url: copy.url },
    email,
  }).catch((err) => {
    console.error("[nudge] notify failed", err);
    return { inApp: false, emailed: false, emailFailed: false };
  });
  const pushed = await sendPush(input.userId, { title: copy.title, body: copy.message, url: copy.url, tag: `nudge-${input.kind}` }).catch(() => 0);
  return { ok: true, pushed: pushed > 0, emailed, emailFailed };
}
