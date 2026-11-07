// Pure messaging helpers. Relative imports only: node:test runs this without the @ alias.

export const MAX_BODY = 4000;
export const ONLINE_WINDOW_MS = 90_000;

/** True when `uid` is the employer or the intern of the thread. */
export function isParticipant(thread: { employerId: string; internId: string } | null | undefined, uid: string): boolean {
  return !!thread && !!uid && (thread.employerId === uid || thread.internId === uid);
}

export function otherParticipant(thread: { employerId: string; internId: string }, uid: string): string | null {
  if (thread.employerId === uid) return thread.internId;
  if (thread.internId === uid) return thread.employerId;
  return null;
}

/** Strips tags and control characters (keeps \n and \t), trims, caps at MAX_BODY. Returns "" when nothing is left. */
export function sanitizeBody(raw: string): string {
  return String(raw)
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000D\u000E-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .trim()
    .slice(0, MAX_BODY);
}

/** Online = last seen within 90 s. Computed at read time, never stored. */
export function isOnline(lastSeenAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && now - t >= 0 - 5_000 && now - t <= ONLINE_WINDOW_MS;
}

/** Unread for `uid`: messages from the other side with no read_at. */
export function unreadCount(msgs: { senderId: string; readAt: Date | string | null }[], uid: string): number {
  return msgs.reduce((n, m) => (m.senderId !== uid && !m.readAt ? n + 1 : n), 0);
}

/** Employer may open a thread only on a real proposal between the pair; an intern also where the employer already started one. */
export function canStartThread(input: {
  role: "employer" | "intern";
  hasProposal: boolean;
  proposalMatchesPair: boolean; // true when no proposalId was given, or it belongs to this pair
  employerAlreadyMessaged: boolean;
}): boolean {
  if (!input.proposalMatchesPair) return false;
  if (input.role === "employer") return input.hasProposal;
  return input.hasProposal || input.employerAlreadyMessaged;
}
