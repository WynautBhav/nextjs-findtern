// Pure notification-preference rules. Relative imports only: node:test runs this without the @ alias.
import { ONLINE_WINDOW_MS } from "./messaging/logic.ts";

/**
 * Which notifications a person may turn off.
 *
 * - `required`: payments, invoices, stipends, security, interviews, timesheets, hires, new proposals and full-time offers, everything not listed below.
 *   Never suppressible. A type we have not classified is `required`: fail closed, so a new money email can never be
 *   switched off by accident.
 * - `message` / `offer`: the unread-message and unread-offer reminder emails (and proposal updates). The first email about a new proposal or offer is `required`.
 * - `tips`: nudges and suggestions (profile views, weekly tip, talent spotlight, cart reminder, profile nudges).
 */
export type NotifyCategory = "required" | "message" | "offer" | "tips";
export type NotifyChannel = "email" | "inApp";

/**
 * The stored row (`notification_prefs`, two switches, no migration). `emailMessages` is the email switch for
 * messages and offers; `pushMessages` is the switch for tips and nudges (their in-app row and their email).
 */
export type PrefsRow = { emailMessages: boolean; pushMessages: boolean };

const MESSAGE_TYPES = new Set(["message_unread"]);
// proposal_received and full_time_offer_received are NOT here: the first email about a proposal or offer is core hiring
// mail, so the email switch cannot silence it. Only the unread reminders (and proposal updates) are optional.
const OFFER_TYPES = new Set(["proposal_updated", "offer_unread"]);
const TIPS_TYPES = new Set([
  "weekly_hire_tip",
  "talent_spotlight",
  "cart_inactivity",
  "profile_completion_nudge",
  "employer_profile_completion_nudge",
  "monthly_profile_views",
]);

export function categoryOf(type: string): NotifyCategory {
  if (MESSAGE_TYPES.has(type)) return "message";
  if (OFFER_TYPES.has(type)) return "offer";
  if (TIPS_TYPES.has(type)) return "tips";
  return "required";
}

export const isSuppressible = (category: NotifyCategory) => category !== "required";

/**
 * May this notification use this channel for this person? No row means the defaults (everything on), which is how
 * every user behaved before preferences existed. Messages and offers are actionable, so they always appear in the
 * app; only their email is optional. Tips and nudges are optional on both channels.
 */
export function channelAllowed(prefs: PrefsRow | null | undefined, category: NotifyCategory, channel: NotifyChannel): boolean {
  if (category === "required" || !prefs) return true;
  if (category === "tips") return prefs.pushMessages;
  return channel === "email" ? prefs.emailMessages : true;
}

/* ── Unread fallback ─────────────────────────────────────────────────── */

/** How long a message or offer may sit unread before we email. */
export const FALLBACK_DELAY_MS = 15 * 60_000;
/**
 * Threads quiet for longer than this are never emailed (no backlog blast on the first run). It must be longer than the
 * scan period: on Vercel the scan runs from a daily cron, and a window shorter than a day leaves gaps. Mail is still sent
 * once per thread and recipient per unread run (the idempotency key names the run), so a wide window does not repeat mail.
 */
export const FALLBACK_LOOKBACK_HOURS = 48;
export const FALLBACK_LOOKBACK_MS = FALLBACK_LOOKBACK_HOURS * 3_600_000;

/**
 * Kill switch for the unread message / offer email fallback: only `NOTIFY_FALLBACK=1` turns it on, default OFF. It gates
 * the scan that queues the mail. Preferences (settings UI, notify() honouring them) do not depend on it.
 */
export function fallbackEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.NOTIFY_FALLBACK?.trim() === "1";
}

/** After a full batch the drain is assumed to continue; a tick within this long of one does not scan again. */
export const SCAN_CONTINUE_MS = 60_000;

/**
 * Runs the unread scan once per drain, not once per batch. A drain is a run of back-to-back ticks while batches come
 * back full (see drainOutbox); the first tick scans, and ticks that follow a full batch within SCAN_CONTINUE_MS do not.
 * A short batch ends the drain, so the next tick scans again. Lives here, not in the drain loop, so it works for the
 * in-process 30 s scheduler and the cron drain alike.
 */
export function makeScanGate(batchSize: number, clock: () => number = Date.now) {
  let fullAt = -Infinity;
  return {
    shouldScan: () => clock() - fullAt > SCAN_CONTINUE_MS,
    recordBatch: (r: { sent: number; retried: number; dead: number }) => {
      fullAt = r.sent + r.retried + r.dead >= batchSize ? clock() : -Infinity;
    },
  };
}

export type UnreadMessage = { id: string; threadId: string; senderId: string; createdAt: Date | string };
export type ThreadSides = { id: string; employerId: string; internId: string };
export type UnreadRun = {
  threadId: string;
  recipientId: string;
  recipientType: "employer" | "intern";
  /** Earliest unread message: it names the run, so the key stays put while the person has not read. */
  firstMessageId: string;
  count: number;
};

/**
 * One run per thread and recipient: every unread message from the other side, once the earliest is older than the
 * delay. The recipient is never the sender. `online` is the recipient's real heartbeat (not the show_activity
 * toggle): someone looking at the app right now is not emailed.
 */
export function unreadRuns(
  messages: UnreadMessage[],
  threads: ThreadSides[],
  online: ReadonlySet<string>,
  now = Date.now(),
): UnreadRun[] {
  const sides = new Map(threads.map((t) => [t.id, t]));
  const byRun = new Map<string, { first: UnreadMessage; firstAt: number; count: number; run: Omit<UnreadRun, "firstMessageId" | "count"> }>();
  for (const m of messages) {
    const t = sides.get(m.threadId);
    if (!t) continue;
    let recipientId: string;
    let recipientType: "employer" | "intern";
    if (m.senderId === t.employerId) [recipientId, recipientType] = [t.internId, "intern"];
    else if (m.senderId === t.internId) [recipientId, recipientType] = [t.employerId, "employer"];
    else continue;
    if (recipientId === m.senderId) continue;
    const at = new Date(m.createdAt).getTime();
    if (!Number.isFinite(at)) continue;
    const k = `${m.threadId}:${recipientId}`;
    const cur = byRun.get(k);
    if (!cur) byRun.set(k, { first: m, firstAt: at, count: 1, run: { threadId: m.threadId, recipientId, recipientType } });
    else {
      cur.count++;
      if (at < cur.firstAt || (at === cur.firstAt && m.id < cur.first.id)) {
        cur.first = m;
        cur.firstAt = at;
      }
    }
  }
  return [...byRun.values()]
    .filter((r) => now - r.firstAt >= FALLBACK_DELAY_MS && !online.has(r.run.recipientId))
    .map((r) => ({ ...r.run, firstMessageId: r.first.id, count: r.count }));
}

export const messageRunKey = (r: Pick<UnreadRun, "threadId" | "recipientId" | "firstMessageId">) =>
  `message_unread:${r.threadId}:${r.recipientId}:${r.firstMessageId}`;

export const offerRunKey = (proposalId: string, firstNotificationId: string) => `offer_unread:${proposalId}:${firstNotificationId}`;

/** Is this heartbeat live? Same window as the rest of presence; ignores the show_activity toggle on purpose. */
export function heartbeatLive(lastSeenAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastSeenAt) return false;
  const t = new Date(lastSeenAt).getTime();
  return Number.isFinite(t) && now - t >= -5_000 && now - t <= ONLINE_WINDOW_MS;
}
