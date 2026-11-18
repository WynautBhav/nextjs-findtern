// Email fallback for unread offer updates. Relative imports only (node:test, outbox seams).
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
  offerRunKey,
  type NotifyCategory,
  type PrefsRow,
} from "./notify-prefs.ts";
import { ONLINE_WINDOW_MS } from "./presence-logic.ts";

export const FALLBACK_CAMPAIGN = "notify-fallback";
/** Employer–intern Messages is gone. Rows still queued with this template are closed as skipped, never sent. */
export const MESSAGE_TEMPLATE = "message_unread";
export const OFFER_TEMPLATE = "offer_unread";
/** Notification types whose unread rows trigger the offer email. proposal_received and full_time_offer_received already email at once. */
export const OFFER_FALLBACK_TYPES = ["proposal_updated"] as const;

const SCAN_LIMIT = 2000;
type Side = "employer" | "intern";

type Candidate = { recipientId: string; recipientType: Side; category: NotifyCategory; entry: Omit<NewRowInput, "toEmail"> };

/**
 * Finds unread offer updates older than FALLBACK_DELAY_MS and queues ONE outbox email per proposal run. Skips: a
 * recipient whose heartbeat is live (the real heartbeat, not the show_activity toggle, and nothing about it is ever
 * shown to anyone), a recipient who switched the email off. Safe to call every tick: the idempotency key names the
 * run (proposal + recipient + earliest unread notification), so repeats are no-ops. Ages come from Postgres
 * (`localtimestamp`), the same clock the heartbeat uses.
 */
export async function enqueueUnreadFallbacks(ex: Executor): Promise<{ offers: number }> {
  const delayS = FALLBACK_DELAY_MS / 1000;
  const lookS = FALLBACK_LOOKBACK_MS / 1000;

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

  const everyone = [...new Set(offerRows.map((o) => o.recipient_id))];
  if (!everyone.length) return { offers: 0 };

  const live = new Set(
    (
      await ex.query<{ user_id: string }>(
        `SELECT user_id FROM user_presence WHERE user_id = ANY($1::varchar[]) AND last_seen_at > localtimestamp - make_interval(secs => $2::float8)`,
        [everyone, ONLINE_WINDOW_MS / 1000],
      )
    ).map((r) => r.user_id),
  );

  const cands: Candidate[] = [];
  for (const o of offerRows) {
    if (live.has(o.recipient_id)) continue;
    cands.push({
      recipientId: o.recipient_id,
      recipientType: "intern",
      category: "offer",
      entry: { entryId: offerRunKey(o.proposal_id, o.id), template: OFFER_TEMPLATE, payload: { proposalId: o.proposal_id, notificationId: o.id, recipientId: o.recipient_id, recipientType: "intern" } },
    });
  }
  if (!cands.length) return { offers: 0 };

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
  for (const c of cands) {
    if (!channelAllowed(prefs.get(c.recipientId) ?? null, c.category, "email")) continue;
    const to = addr.get(`${c.recipientType}:${c.recipientId}`);
    if (!to) continue;
    entries.push({ ...c.entry, toEmail: to });
  }
  const rows = buildOutboxRows(FALLBACK_CAMPAIGN, entries);
  let offers = 0;
  for (const r of rows) offers += await insertRows(ex, [r]);
  return { offers };
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
    const p = row.payload as { recipientId?: string; recipientType?: Side; proposalId?: string; notificationId?: string };
    // A message-unread row queued before Messages was removed: close it, never mail a link to a page that redirects.
    if (row.template === MESSAGE_TEMPLATE) return { providerId: `skipped:removed:${row.idempotency_key}` };
    const rid = p.recipientId;
    const side = p.recipientType;
    if (!rid || (side !== "intern" && side !== "employer")) throw new Error("Malformed fallback row");

    const [pref] = await ex.query<{ email_messages: boolean }>(`SELECT email_messages FROM notification_prefs WHERE user_id = $1`, [rid]);
    if (pref && !pref.email_messages) return { providerId: `skipped:prefs:${row.idempotency_key}` };

    const origin = tryPublicOrigin();
    if (!origin) throw new Error("PUBLIC_ORIGIN is not set");
    const settingsUrl = `${origin}${side === "intern" ? "/intern/settings" : "/employer/account"}#notifications`;
    const [who] =
      side === "intern"
        ? await ex.query<{ name: string | null }>(`SELECT first_name AS name FROM users WHERE id = $1`, [rid])
        : await ex.query<{ name: string | null }>(`SELECT split_part(coalesce(name, ''), ' ', 1) AS name FROM employers WHERE id = $1`, [rid]);
    const name = (who?.name ?? "").trim();

    if (row.template !== OFFER_TEMPLATE) throw new Error("Unsupported outbox row");
    if (!p.notificationId || !p.proposalId) throw new Error("Malformed fallback row");
    const [n] = await ex.query<{ is_read: boolean }>(`SELECT is_read FROM notifications WHERE id = $1 AND recipient_id = $2`, [p.notificationId, rid]);
    if (!n || n.is_read) return { providerId: `skipped:read:${row.idempotency_key}` };
    const content = emails.unreadOffer({ name, url: `${origin}/intern/proposals/${encodeURIComponent(p.proposalId)}`, settingsUrl });
    const res = await mail({ to: row.to_email, ...renderEmail(content) });
    if (!res.ok) throw new Error(res.error);
    return { providerId: `${res.mode}:${row.idempotency_key}` };
  } catch (e) {
    throw new Error(redactError(e));
  }
}
