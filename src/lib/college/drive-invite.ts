import { createHmac, timingSafeEqual } from "node:crypto";

import type { EmailContent } from "../emails.ts";
import { linkTo } from "../origin.ts";
import { driveWindow } from "./access.ts";

/**
 * Invites a placement officer sends to a company (the "Companies you invited" list on a drive).
 *
 * The drive's share token is stored hashed and shown once, so an invite cannot carry it. Its link instead carries an
 * HMAC of (drive, the drive's current token hash, the invited email): unguessable, good for that drive and that
 * address only, nothing stored, and issuing a new drive link (or removing the company from the list) kills it. A link
 * reissue therefore re-mails the whole list with fresh signatures (api/college/drives/[id]/link).
 *
 * An invite grants no more than the share link: both end in the same window, college and employer checks, and the share
 * link admits any signed-in company, so the invite is not tied to the address of the account that opens it.
 */

/** `unsent`: no mail has reached this address yet (daily cap, mail failure), so the next save tries again. Server-side only. */
export type Invitee = { company: string; email: string; unsent?: true };

const norm = (email: string) => email.trim().toLowerCase();

export function inviteSig(secret: string, driveId: string, tokenHash: string, email: string): string {
  if (secret.length < 32) throw new Error("invite secret must be at least 32 characters");
  return createHmac("sha256", secret).update(`drive-invite:${driveId}:${tokenHash}:${norm(email)}`, "utf8").digest("base64url");
}

export function inviteSigOk(secret: string, driveId: string, tokenHash: string, email: string, presented: string | null | undefined): boolean {
  if (!presented) return false;
  const a = Buffer.from(inviteSig(secret, driveId, tokenHash, email));
  const b = Buffer.from(presented);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The same-origin path an invite email links to. Safe as a `next=` return-to (one leading slash, no backslash). */
export function invitePath(driveId: string, email: string, sig: string): string {
  return `/drive/invite/${driveId}?${new URLSearchParams({ e: email, s: sig }).toString()}`;
}

export function isInvited(invited: Invitee[] | null | undefined, email: string): boolean {
  return (invited ?? []).some((i) => norm(i.email) === norm(email));
}

/**
 * Companies in `after` to send an invite to, once each: those `before` did not hold (by email), and those it held but
 * flagged `unsent` because no mail reached them. The browser never sends the flag, so `before` is the saved list.
 */
export function invitesToSend(before: Invitee[] | null | undefined, after: Invitee[] | null | undefined): Invitee[] {
  const reached = new Set((before ?? []).filter((i) => !i.unsent).map((i) => norm(i.email)));
  const out: Invitee[] = [];
  for (const i of after ?? []) {
    const email = norm(i.email);
    if (reached.has(email)) continue;
    reached.add(email);
    out.push({ company: i.company, email });
  }
  return out;
}

/** `list` with `unsent` set on exactly the addresses in `emails` (and cleared on the rest). */
export function withUnsent(list: Invitee[], emails: Iterable<string>): Invitee[] {
  const flagged = new Set([...emails].map(norm));
  return list.map(({ company, email }) => (flagged.has(norm(email)) ? { company, email, unsent: true as const } : { company, email }));
}

/** An ended drive refuses every join, so inviting to it would only spend the daily cap. */
export function canSendInvites(drive: { startsAt: Date; endsAt: Date; revokedAt: Date | null }, now = Date.now()): boolean {
  return driveWindow(drive, now) !== "ended";
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const when = (d: Date) => `${d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })} IST`;

export function driveInviteEmail(o: { company: string; collegeName: string; driveTitle: string; kind: string; startsAt: Date; endsAt: Date; path: string }): EmailContent {
  const college = oneLine(o.collegeName) || "A college";
  const company = oneLine(o.company);
  return {
    subject: `${college} invited you to a campus drive on Findtern`,
    preheader: `Meet ${college}'s students on video. Open ${when(o.startsAt)}.`,
    heading: "You're invited to a campus drive",
    greeting: `Hi ${company || "there"},`,
    lines: [
      `${college}'s placement office has invited ${company || "your company"} to "${oneLine(o.driveTitle)}" on Findtern.`,
      "Every student in the drive has taken Findtern's AI interview, so you can filter by score, shortlist and call them on video. If your company already has a Findtern account, sign in to enter; otherwise it takes about a minute to register.",
    ],
    facts: [
      ["College", college],
      ["Hiring for", o.kind === "full_time" ? "Full-time jobs" : "Interns and full-time"],
      ["Drive pricing", "15% off internship hires, 1% full-time fee"],
      ["Opens", when(o.startsAt)],
      ["Closes", when(o.endsAt)],
    ],
    tone: "neutral",
    status: "Invited",
    cta: (() => {
      const url = linkTo(o.path);
      return url === null ? undefined : { label: "Join the drive", url };
    })(),
    reason: `You're receiving this because ${college}'s placement office listed this address for a campus drive on Findtern.`,
  };
}
