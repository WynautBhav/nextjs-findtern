import { and, eq, gt } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { origin } from "@/lib/emails";
import { notify } from "@/lib/notify";
import { sendPush } from "./push";

/**
 * A placement officer's chase ("you're offline during the drive", "reply to
 * your offer"). One per student per kind every NUDGE_COOLDOWN_MS, so a
 * frantic officer can't spam a student.
 */
export const NUDGE_KINDS = ["online", "offer", "interview"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];
export const NUDGE_COOLDOWN_MS = 10 * 60_000;

const COPY: Record<NudgeKind, (college: string) => { title: string; message: string; url: string }> = {
  online: (c) => ({
    title: `${c} placement drive is live`,
    message: "Your placement cell asks you to open Findtern, so employers in the drive can reach you for a call.",
    url: "/intern/dashboard",
  }),
  offer: (c) => ({
    title: `${c}: an offer is waiting for your reply`,
    message: "Please accept or decline it. A quick answer, either way, lets the employer move on.",
    url: "/intern/proposals",
  }),
  interview: (c) => ({
    title: `${c}: take your AI interview`,
    message: "Your score is what employers in the drive filter on. It takes about an hour.",
    url: "/intern/dashboard",
  }),
};

export async function sendNudge(input: {
  collegeId: string;
  collegeName: string;
  adminId: string;
  userId: string;
  kind: NudgeKind;
}): Promise<{ ok: true; pushed: boolean } | { ok: false; error: string; status: number }> {
  const db = getDb();
  const since = new Date(Date.now() - NUDGE_COOLDOWN_MS);
  const [recent] = await db
    .select({ id: schema.collegeNudges.id })
    .from(schema.collegeNudges)
    .where(
      and(
        eq(schema.collegeNudges.userId, input.userId),
        eq(schema.collegeNudges.kind, input.kind),
        gt(schema.collegeNudges.createdAt, since),
      ),
    )
    .limit(1);
  if (recent) return { ok: false, error: "Already nudged in the last 10 minutes.", status: 429 };

  await db.insert(schema.collegeNudges).values({
    collegeId: input.collegeId,
    adminId: input.adminId,
    userId: input.userId,
    kind: input.kind,
  });
  const copy = COPY[input.kind](input.collegeName);
  await notify({
    to: { type: "intern", id: input.userId },
    type: `college_nudge_${input.kind}`,
    title: copy.title,
    message: copy.message,
    data: { url: copy.url },
    // Drive-day "come online" nudges go out by the hundred and are stale in
    // minutes: bell + push only. Offer and interview chases also email.
    email:
      input.kind === "online"
        ? undefined
        : { subject: copy.title, heading: copy.title, greeting: "Hi,", lines: [copy.message], cta: { label: "Open Findtern", url: `${origin()}${copy.url}` } },
  }).catch((err) => console.error("[nudge] notify failed", err));
  const pushed = await sendPush(input.userId, { title: copy.title, body: copy.message, url: copy.url, tag: `nudge-${input.kind}` }).catch(() => 0);
  return { ok: true, pushed: pushed > 0 };
}
