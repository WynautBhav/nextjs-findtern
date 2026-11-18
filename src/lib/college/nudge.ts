import { and, desc, eq, gt } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { notify } from "@/lib/notify";
import { linkTo } from "@/lib/origin";
import { NUDGE_KINDS, nudgeLookbackMs, planNudge, type NudgeKind } from "./nudge-plan";
import { sendPush } from "./push";

export { NUDGE_KINDS };
export type { NudgeKind };

export async function sendNudge(input: {
  collegeId: string;
  collegeName: string;
  adminId: string;
  userId: string;
  kind: NudgeKind;
}): Promise<{ ok: true; pushed: boolean; emailed: boolean } | { ok: false; error: string; status: number }> {
  const db = getDb();
  const now = new Date();
  const [last] = await db
    .select({ createdAt: schema.collegeNudges.createdAt })
    .from(schema.collegeNudges)
    .where(
      and(
        eq(schema.collegeNudges.userId, input.userId),
        eq(schema.collegeNudges.kind, input.kind),
        gt(schema.collegeNudges.createdAt, new Date(now.getTime() - nudgeLookbackMs(input.kind))),
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
  // An online nudge emails at most once per 3 hours per student (planNudge); notify still applies the student's email preference.
  const inApp = await notify({
    to: { type: "intern", id: input.userId },
    type: `college_nudge_${input.kind}`,
    title: copy.title,
    message: copy.message,
    data: { url: copy.url },
    email,
  }).catch((err) => {
    console.error("[nudge] notify failed", err);
    return false;
  });
  const pushed = await sendPush(input.userId, { title: copy.title, body: copy.message, url: copy.url, tag: `nudge-${input.kind}` }).catch(() => 0);
  return { ok: true, pushed: pushed > 0, emailed: inApp && email !== undefined };
}
