import type { EmailContent } from "../emails";

/**
 * A placement officer's chase ("you're offline during the drive", "reply to
 * your offer"). One per student per kind every NUDGE_COOLDOWN_MS, so a
 * frantic officer can't spam a student. Pure (no DB, no env): sendNudge feeds
 * it the last nudge time and the link builder, and it decides what goes out.
 */
export const NUDGE_KINDS = ["online", "offer", "interview", "meeting", "meeting_reminder", "open_to_work"] as const;
export type NudgeKind = (typeof NUDGE_KINDS)[number];
export const NUDGE_COOLDOWN_MS = 10 * 60_000;

/** Every nudge lands on the dashboard, where the control it is about glows (bug sheet 25 Nov). */
export function nudgeHref(kind: NudgeKind): string {
  return `/intern/dashboard?nudge=${kind}`;
}

const isKind = (v: unknown): v is NudgeKind => typeof v === "string" && (NUDGE_KINDS as readonly string[]).includes(v);

/**
 * The nudge kinds whose control glows on the dashboard: the one in the link (`?nudge=`, from the bell, push or email)
 * and any still-unread nudge notification (the caller passes recent unread types). Anything else is ignored.
 */
export function nudgeGlow(param: unknown, unreadTypes: readonly string[]): Set<NudgeKind> {
  const out = new Set<NudgeKind>();
  for (const v of Array.isArray(param) ? param : [param]) if (isKind(v)) out.add(v);
  for (const t of unreadTypes) {
    const kind = t.startsWith("college_nudge_") ? t.slice("college_nudge_".length) : null;
    if (isKind(kind)) out.add(kind);
  }
  return out;
}

const COPY: Record<NudgeKind, (college: string) => { title: string; message: string; url: string }> = {
  online: (c) => ({
    title: `${c} placement drive is live`,
    message: "Your placement cell asks you to open Findtern, so employers in the drive can reach you for a call.",
    url: nudgeHref("online"),
  }),
  offer: (c) => ({
    title: `${c}: an offer is waiting for your reply`,
    message: "Please accept or decline it. A quick answer, either way, lets the employer move on.",
    url: nudgeHref("offer"),
  }),
  meeting: (c) => ({
    title: `${c}: an employer asked you for a call`,
    message: "Open Findtern and accept or decline the meeting request. Employers in the drive are waiting.",
    url: nudgeHref("meeting"),
  }),
  meeting_reminder: (c) => ({
    title: `${c}: you have a meeting booked`,
    message: "Your meeting with an employer in the drive is booked. Open Findtern before it starts and join on time.",
    url: nudgeHref("meeting_reminder"),
  }),
  open_to_work: (c) => ({
    title: `${c}: turn on "Open to work"`,
    message: "While it is off, employers in the placement drive cannot find you. Turn it on from your dashboard.",
    url: nudgeHref("open_to_work"),
  }),
  interview: (c) => ({
    title: `${c}: take your AI interview`,
    message: "Your score is what employers in the drive filter on. It takes about an hour.",
    url: nudgeHref("interview"),
  }),
};

export type NudgeResult = { ok: true; pushed: boolean; emailed: boolean; emailFailed: boolean } | { ok: false };
export type NudgeTally = { sent: number; pushed: number; emailed: number; emailFailed: number; skipped: number };

/**
 * The officer-facing counts. `emailed`: accepted by SMTP. `emailFailed`: SMTP errored or refused. A nudge that
 * was neither (cooldown excluded, no link, MAIL_MODE=log, no address) counts in `sent` only. `skipped` covers
 * students outside the college's view, the cooldown and nudges that threw before anything was written.
 */
export function tallyNudges(results: NudgeResult[], notVisible = 0): NudgeTally {
  const t: NudgeTally = { sent: 0, pushed: 0, emailed: 0, emailFailed: 0, skipped: notVisible };
  for (const r of results) {
    if (!r.ok) t.skipped++;
    else {
      t.sent++;
      if (r.pushed) t.pushed++;
      if (r.emailed) t.emailed++;
      if (r.emailFailed) t.emailFailed++;
    }
  }
  return t;
}

export type NudgePlan =
  | { cooldown: true }
  | { cooldown: false; copy: { title: string; message: string; url: string }; email: EmailContent | undefined };

/**
 * `lastSameKindAt`: this student's most recent nudge of this kind (null if none within NUDGE_COOLDOWN_MS).
 * `link`: absolute URL for a path, or null when PUBLIC_ORIGIN is unset (then no email at all).
 * Inside the cooldown nothing is sent. Past it, every kind gets bell, push and email (when `link` yields a URL).
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
  const email: EmailContent | undefined =
    url === null
      ? undefined
      : { subject: copy.title, heading: copy.title, greeting: "Hi,", lines: [copy.message], cta: { label: "Open Findtern", url } };
  return { cooldown: false, copy, email };
}
