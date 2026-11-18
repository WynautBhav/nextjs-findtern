import type { EmailContent } from "../emails";

/**
 * A placement officer's chase ("you're offline during the drive", "reply to
 * your offer"). One per student per kind every NUDGE_COOLDOWN_MS, so a
 * frantic officer can't spam a student. Pure (no DB, no env): sendNudge feeds
 * it the last nudge time and the link builder, and it decides what goes out.
 */
export const NUDGE_KINDS = ["online", "offer", "interview"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];
export const NUDGE_COOLDOWN_MS = 10 * 60_000;
/** The drive-day "come online" nudge goes out by the hundred: at most one EMAIL per student per 3 hours. */
export const NUDGE_ONLINE_EMAIL_WINDOW_MS = 3 * 3_600_000;

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

/** How far back sendNudge must look for the last nudge of this kind. */
export function nudgeLookbackMs(kind: NudgeKind): number {
  return kind === "online" ? NUDGE_ONLINE_EMAIL_WINDOW_MS : NUDGE_COOLDOWN_MS;
}

export type NudgePlan =
  | { cooldown: true }
  | { cooldown: false; copy: { title: string; message: string; url: string }; email: EmailContent | undefined };

/**
 * `lastSameKindAt`: this student's most recent nudge of this kind (null if none within nudgeLookbackMs).
 * `link`: absolute URL for a path, or null when PUBLIC_ORIGIN is unset (then no email at all).
 * Inside the cooldown nothing is sent. Online nudges inside the 3-hour email window still get the bell and
 * push but no second email; offer and interview chases always email.
 */
export function planNudge(input: {
  kind: NudgeKind;
  collegeName: string;
  now: Date;
  lastSameKindAt: Date | null;
  link: (path: string) => string | null;
}): NudgePlan {
  const { kind, now, lastSameKindAt } = input;
  const age = lastSameKindAt === null ? Infinity : now.getTime() - lastSameKindAt.getTime();
  if (age < NUDGE_COOLDOWN_MS) return { cooldown: true };
  const copy = COPY[kind](input.collegeName);
  const url = input.link(copy.url);
  const emailDue = kind !== "online" || age >= NUDGE_ONLINE_EMAIL_WINDOW_MS;
  const email: EmailContent | undefined =
    url === null || !emailDue
      ? undefined
      : { subject: copy.title, heading: copy.title, greeting: "Hi,", lines: [copy.message], cta: { label: "Open Findtern", url } };
  return { cooldown: false, copy, email };
}
