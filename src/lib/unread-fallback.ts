// Email fallback for unread messages and offer updates. Relative imports only (node:test, outbox seams).
import { emails, renderEmail } from "./emails.ts";
import { sendSmtpMail } from "./mailer.ts";
import { tryPublicOrigin } from "./origin.ts";
import {
  buildOutboxRows,
  insertRows,
  redactError,
  type Executor,
  type NewRowInput,
  type OutboxRow,
} from "./outbox/index.ts";
import {
  channelAllowed,
  FALLBACK_DELAY_MS,
  FALLBACK_LOOKBACK_MS,
  messageRunKey,
  offerRunKey,
  unreadRuns,
  type NotifyCategory,
  type PrefsRow,
  type UnreadMessage,
} from "./notify-prefs.ts";
import { ONLINE_WINDOW_MS } from "./messaging/logic.ts";

export const FALLBACK_CAMPAIGN = "notify-fallback";
export const MESSAGE_TEMPLATE = "message_unread";
export const OFFER_TEMPLATE = "offer_unread";
/** Notification types whose unread rows trigger the offer email. proposal_received and full_time_offer_received already email at once. */
export const OFFER_FALLBACK_TYPES = ["proposal_updated"] as const;

const SCAN_LIMIT = 2000;
type Side = "employer" | "intern";

type Candidate = { recipientId: string; recipientType: Side; category: NotifyCategory; entry: Omit<NewRowInput, "toEmail"> };

/**
 * Finds unread messages and unread offer updates older than FALLBACK_DELAY_MS and queues ONE outbox email per thread
 * (or proposal) run. Skips: a recipient whose heartbeat is live (the real heartbeat, not the show_activity toggle,
 * and nothing about it is ever shown to anyone), a recipient who switched the email off, and the sender. Safe to
 * call every tick: the idempotency key names the run (thread + recipient + earliest unread message), so repeats are
 * no-ops. Ages come from Postgres (`localtimestamp`), the same clock the heartbeat uses.
 */
export async function enqueueUnreadFallbacks(ex: Executor): Promise<{ messages: number; offers: number }> {
  const delayS = FALLBACK_DELAY_MS / 1000;
  const lookS = FALLBACK_LOOKBACK_MS / 1000;
  const now = Date.now();

  /* messages */
  const msgRows = await ex.query<{ id: string; thread_id: string; sender_id: string; age_s: number }>(
    `SELECT m.id, m.thread_id, m.sender_id, extract(epoch FROM (localtimestamp - m.created_at))::float8 AS age_s
       FROM messages m
      WHERE m.read_at IS NULL
        AND m.created_at <= localtimestamp - make_interval(secs => $1::float8)
        AND m.created_at > localtimestamp - make_interval(secs => $2::float8)
      ORDER BY m.created_at LIMIT ${SCAN_LIMIT}`,
    [delayS, lookS],
  );
  const msgs: UnreadMessage[] = msgRows.map((r) => ({ id: r.id, threadId: r.thread_id, senderId: r.sender_id, createdAt: new Date(now - Number(r.age_s) * 1000) }));
  const threadIds = [...new Set(msgs.map((m) => m.threadId))];
  const threads = threadIds.length
    ? (await ex.query<{ id: string; employer_id: string; intern_id: string }>(`SELECT id, employer_id, intern_id FROM threads WHERE id = ANY($1::varchar[])`, [threadIds])).map(
        (t) => ({ id: t.id, employerId: t.employer_id, internId: t.intern_id }),
      )
    : [];

  /* offer updates */
  const offerRows = await ex.query<{ id: string; recipient_id: string; proposal_id: string }>(
    `SELECT DISTINCT ON (n.recipient_id, n.data->>'proposalId') n.id, n.recipient_id, n.data->>'proposalId' AS proposal_id
       FROM notifications n
      WHERE n.recipient_type = 'intern' AND n.is_read = false AND n.type = ANY($3::text[])
        AND n.data->>'proposalId' IS NOT NULL
        AND n.created_at <= localtimestamp - make_interval(secs => $1::float8)
        AND n.created_at > localtimestamp - make_interval(secs => $2::float8)
      ORDER BY n.recipient_id, n.data->>'proposalId', n.created_at, n.id
      LIMIT ${SCAN_LIMIT}`,
    [delayS, lookS, [...OFFER_FALLBACK_TYPES]],
  );

  const everyone = [...new Set([...threads.flatMap((t) => [t.employerId, t.internId]), ...offerRows.map((o) => o.recipient_id)])];
  if (!everyone.length) return { messages: 0, offers: 0 };

  const live = new Set(
    (
      await ex.query<{ user_id: string }>(
        `SELECT user_id FROM user_presence WHERE user_id = ANY($1::varchar[]) AND last_seen_at > localtimestamp - make_interval(secs => $2::float8)`,
        [everyone, ONLINE_WINDOW_MS / 1000],
      )
    ).map((r) => r.user_id),
  );

  const cands: Candidate[] = [];
  for (const r of unreadRuns(msgs, threads, live, now)) {
    cands.push({
      recipientId: r.recipientId,
      recipientType: r.recipientType,
      category: "message",
      entry: { entryId: messageRunKey(r), template: MESSAGE_TEMPLATE, payload: { threadId: r.threadId, recipientId: r.recipientId, recipientType: r.recipientType, firstMessageId: r.firstMessageId } },
    });
  }
  for (const o of offerRows) {
    if (live.has(o.recipient_id)) continue;
    cands.push({
      recipientId: o.recipient_id,
      recipientType: "intern",
      category: "offer",
      entry: { entryId: offerRunKey(o.proposal_id, o.id), template: OFFER_TEMPLATE, payload: { proposalId: o.proposal_id, notificationId: o.id, recipientId: o.recipient_id, recipientType: "intern" } },
    });
  }
  if (!cands.length) return { messages: 0, offers: 0 };

  const ids = [...new Set(cands.map((c) => c.recipientId))];
  const prefs = new Map(
    (
      await ex.query<{ user_id: string; email_messages: boolean; push_messages: boolean }>(
        `SELECT user_id, email_messages, push_messages FROM notification_prefs WHERE user_id = ANY($1::varchar[])`,
        [ids],
      )
    ).map((p) => [p.user_id, { emailMessages: p.email_messages, pushMessages: p.push_messages } as PrefsRow]),
  );
  const addr = await addressesOf(ex, ids);

  const entries: NewRowInput[] = [];
  const kind = new Map<string, "messages" | "offers">();
  for (const c of cands) {
    if (!channelAllowed(prefs.get(c.recipientId) ?? null, c.category, "email")) continue;
    const to = addr.get(`${c.recipientType}:${c.recipientId}`);
    if (!to) continue;
    entries.push({ ...c.entry, toEmail: to });
    kind.set(c.entry.entryId, c.category === "message" ? "messages" : "offers");
  }
  const rows = buildOutboxRows(FALLBACK_CAMPAIGN, entries);
  const out = { messages: 0, offers: 0 };
  for (const r of rows) {
    const n = await insertRows(ex, [r]);
    out[kind.get(r.entryId)!] += n;
  }
  return out;
}

/** `intern:<id>` and `employer:<id>` to an address, active accounts only. */
async function addressesOf(ex: Executor, ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const u = await ex.query<{ id: string; email: string | null }>(`SELECT id, email FROM users WHERE id = ANY($1::varchar[]) AND is_active IS NOT FALSE`, [ids]);
  for (const r of u) if (r.email) m.set(`intern:${r.id}`, r.email);
  const e = await ex.query<{ id: string; email: string | null }>(`SELECT id, company_email AS email FROM employers WHERE id = ANY($1::varchar[]) AND is_active IS NOT FALSE`, [ids]);
  for (const r of e) if (r.email) m.set(`employer:${r.id}`, r.email);
  return m;
}

/* ── Sending ─────────────────────────────────────────────────────────── */

type Mail = (o: { to: string; subject: string; text: string; html: string }) => Promise<{ ok: true; mode: string } | { ok: false; error: string }>;

/**
 * Sends one queued fallback row. Re-checks at send time, because the row may have waited behind a retry: if the
 * person has read it meanwhile, or switched the email off, nothing is sent and the row is closed as `skipped:*`.
 */
export async function sendUnreadRow(ex: Executor, row: OutboxRow, mail: Mail = sendSmtpMail): Promise<{ providerId: string }> {
  try {
    const p = row.payload as { threadId?: string; recipientId?: string; recipientType?: Side; proposalId?: string; notificationId?: string };
    const isMessage = row.template === MESSAGE_TEMPLATE;
    const rid = p.recipientId;
    const side = p.recipientType;
    if (!rid || (side !== "intern" && side !== "employer")) throw new Error("Malformed fallback row");

    const [pref] = await ex.query<{ email_messages: boolean }>(`SELECT email_messages FROM notification_prefs WHERE user_id = $1`, [rid]);
    if (pref && !pref.email_messages) return { providerId: `skipped:prefs:${row.idempotency_key}` };

    const origin = tryPublicOrigin();
    if (!origin) throw new Error("PUBLIC_ORIGIN is not set");
    const base = side === "intern" ? "/intern" : "/employer";
    const settingsUrl = `${origin}${side === "intern" ? "/intern/settings" : "/employer/account"}#notifications`;
    const [who] =
      side === "intern"
        ? await ex.query<{ name: string | null }>(`SELECT first_name AS name FROM users WHERE id = $1`, [rid])
        : await ex.query<{ name: string | null }>(`SELECT split_part(coalesce(name, ''), ' ', 1) AS name FROM employers WHERE id = $1`, [rid]);
    const name = (who?.name ?? "").trim();

    let content;
    if (isMessage) {
      if (!p.threadId) throw new Error("Malformed fallback row");
      const [c] = await ex.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM messages m JOIN threads t ON t.id = m.thread_id
          WHERE m.thread_id = $1 AND m.read_at IS NULL AND m.sender_id <> $2 AND (t.employer_id = $2 OR t.intern_id = $2)`,
        [p.threadId, rid],
      );
      if (!c || c.n < 1) return { providerId: `skipped:read:${row.idempotency_key}` };
      content = emails.unreadMessages({ name, count: c.n, from: side === "intern" ? "an employer" : "a candidate", url: `${origin}${base}/messages/${encodeURIComponent(p.threadId)}`, settingsUrl });
    } else if (row.template === OFFER_TEMPLATE) {
      if (!p.notificationId || !p.proposalId) throw new Error("Malformed fallback row");
      const [n] = await ex.query<{ is_read: boolean }>(`SELECT is_read FROM notifications WHERE id = $1 AND recipient_id = $2`, [p.notificationId, rid]);
      if (!n || n.is_read) return { providerId: `skipped:read:${row.idempotency_key}` };
      content = emails.unreadOffer({ name, url: `${origin}/intern/proposals/${encodeURIComponent(p.proposalId)}`, settingsUrl });
    } else {
      throw new Error("Unsupported outbox row");
    }
    const res = await mail({ to: row.to_email, ...renderEmail(content) });
    if (!res.ok) throw new Error(res.error);
    return { providerId: `${res.mode}:${row.idempotency_key}` };
  } catch (e) {
    throw new Error(redactError(e));
  }
}
