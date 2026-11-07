export type OutboxStatus = "queued" | "sending" | "sent" | "failed" | "dead";

export interface OutboxRow {
  id: string;
  campaign_id: string;
  entry_id: string;
  to_email: string;
  template: string;
  payload: Record<string, unknown>;
  status: OutboxStatus;
  attempts: number;
  next_at: Date;
  last_error: string | null;
  provider_id: string | null;
  idempotency_key: string;
  sent_at: Date | null;
  updated_at: Date;
}

/** Minimal DB seam. `query` runs parameterised SQL ($1..) and returns rows. */
export interface Executor {
  query<T = OutboxRow>(text: string, params?: unknown[]): Promise<T[]>;
}
export type Sender = (row: OutboxRow) => Promise<{ providerId: string }>;

export const MAX_ATTEMPTS = 5;
export const STUCK_MS = 10 * 60 * 1000;
/** Delay after failed attempt N (1-based). The 5th failure is dead (no delay). */
export const BACKOFF_SCHEDULE_MS = [60_000, 300_000, 1_800_000, 7_200_000] as const;

export function backoffMs(attempt: number): number | null {
  if (!Number.isFinite(attempt) || attempt >= MAX_ATTEMPTS) return null;
  const i = Math.max(1, Math.floor(attempt)) - 1;
  return BACKOFF_SCHEDULE_MS[i];
}

export function nextState(a: { attempts: number; ok: boolean; now: Date }): {
  status: "sent" | "queued" | "dead";
  attempts: number;
  next_at: Date | null;
} {
  if (a.ok) return { status: "sent", attempts: a.attempts, next_at: null };
  const d = backoffMs(a.attempts);
  if (d === null) return { status: "dead", attempts: a.attempts, next_at: null };
  return { status: "queued", attempts: a.attempts, next_at: new Date(a.now.getTime() + d) };
}

export function idempotencyKey(campaignId: string, entryId: string, resendNo = 0): string {
  return `${campaignId}:${entryId}:v${resendNo}`;
}

export function redactError(err: unknown): string {
  let s = err instanceof Error ? err.message : String(err ?? "error");
  s = s
    .replace(/[^\s<>"']+@[^\s<>"']+/g, "[email]")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+\/=-]+/gi, "$1 [redacted]")
    .replace(/\bSG\.[A-Za-z0-9._-]+/g, "[token]")
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, "[token]")
    .replace(/((?:api[_-]?key|token|secret|password|pass)\s*[=:]\s*)\S+/gi, "$1[redacted]");
  return s.slice(0, 500);
}

const PLAIN_CODE_KEYS = /^(code|driveCode|drive_code|plainCode)$/i;

export interface NewRowInput {
  entryId: string;
  toEmail: string;
  template: string;
  payload: Record<string, unknown>;
}
export interface NewRow extends NewRowInput {
  campaignId: string;
  idempotencyKey: string;
}

/** Builds queued rows deduped by key. Refuses payloads carrying a plain code (store codeId). */
export function buildOutboxRows(campaignId: string, entries: NewRowInput[], resendNo = 0): NewRow[] {
  const seen = new Set<string>();
  const out: NewRow[] = [];
  for (const e of entries) {
    for (const k of Object.keys(e.payload ?? {})) {
      if (PLAIN_CODE_KEYS.test(k)) throw new Error(`payload must not contain a plain code ("${k}"); store codeId`);
    }
    const key = idempotencyKey(campaignId, e.entryId, resendNo);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, campaignId, idempotencyKey: key });
  }
  return out;
}

/** Insert SQL for NewRow; ON CONFLICT makes re-runs no-ops. */
export async function insertRows(ex: Executor, rows: NewRow[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    const res = await ex.query<{ id: string }>(
      `INSERT INTO email_outbox (campaign_id, entry_id, to_email, template, payload, idempotency_key)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
      [r.campaignId, r.entryId, r.toEmail, r.template, JSON.stringify(r.payload), r.idempotencyKey],
    );
    n += res.length;
  }
  return n;
}

export const CLAIM_SQL = `UPDATE email_outbox SET status='sending', attempts = attempts+1, updated_at=$2
WHERE id IN (
  SELECT id FROM email_outbox
  WHERE (status='queued' AND next_at <= $2) OR (status='sending' AND updated_at <= $3)
  ORDER BY next_at FOR UPDATE SKIP LOCKED LIMIT $1
) RETURNING *`;

export async function claimBatch(ex: Executor, o: { limit?: number; now?: Date } = {}): Promise<OutboxRow[]> {
  const now = o.now ?? new Date();
  return ex.query(CLAIM_SQL, [o.limit ?? 50, now, new Date(now.getTime() - STUCK_MS)]);
}

export const FINISH_SQL = `UPDATE email_outbox SET status=$2, next_at=COALESCE($3, next_at), last_error=$4,
provider_id=COALESCE($5, provider_id), sent_at=$6, updated_at=$7 WHERE id=$1`;

/** Runs `fn` in one short transaction of its own. */
export type TxRunner = <T>(fn: (ex: Executor) => Promise<T>) => Promise<T>;

/**
 * The claim commits first (rows become 'sending'), each send happens outside any transaction, and each result
 * is written in its own short transaction. So a crash never un-claims rows, no locks or connection are held
 * during SMTP, and a crash after a successful send leaves the row 'sending' until it is reclaimed after
 * STUCK_MS: at-least-once delivery. A repeat is harmless: the email carries the same personal code.
 */
export async function processBatchTx(
  run: TxRunner,
  sender: Sender,
  o: { now?: Date; limit?: number } = {},
): Promise<{ sent: number; retried: number; dead: number }> {
  const now = o.now ?? new Date();
  const rows = await run((ex) => claimBatch(ex, { limit: o.limit, now }));
  const c = { sent: 0, retried: 0, dead: 0 };
  for (const row of rows) {
    let providerId: string | null = null;
    let err: string | null = null;
    try {
      providerId = (await sender(row)).providerId;
    } catch (e) {
      err = redactError(e);
    }
    const s = nextState({ attempts: row.attempts, ok: err === null, now });
    await run((ex) => ex.query(FINISH_SQL, [row.id, s.status, s.next_at, err, providerId, s.status === "sent" ? now : null, now]));
    if (s.status === "sent") c.sent++;
    else if (s.status === "dead") c.dead++;
    else c.retried++;
  }
  return c;
}

/** Same as processBatchTx on one executor (tests, scripts). */
export function processBatch(ex: Executor, sender: Sender, o: { now?: Date; limit?: number } = {}) {
  return processBatchTx((fn) => fn(ex), sender, o);
}

/** Creates a NEW row with the next resend key; never mutates the original. Returns new id or null. */
export async function resend(ex: Executor, outboxId: string): Promise<string | null> {
  const [orig] = await ex.query(`SELECT * FROM email_outbox WHERE id=$1`, [outboxId]);
  if (!orig) return null;
  const m = /^(.*):v(\d+)$/.exec(orig.idempotency_key);
  const base = m ? m[1] : orig.idempotency_key;
  let no = (m ? Number(m[2]) : 0) + 1;
  const [maxRow] = await ex.query<{ n: number | null }>(
    `SELECT MAX(substring(idempotency_key from ':v([0-9]+)$')::int) AS n FROM email_outbox WHERE campaign_id=$1 AND entry_id=$2`,
    [orig.campaign_id, orig.entry_id],
  );
  if (maxRow?.n != null && maxRow.n >= no) no = maxRow.n + 1;
  const rows = await ex.query<{ id: string }>(
    `INSERT INTO email_outbox (campaign_id, entry_id, to_email, template, payload, idempotency_key)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id`,
    [orig.campaign_id, orig.entry_id, orig.to_email, orig.template, JSON.stringify(orig.payload), `${base}:v${no}`],
  );
  return rows[0]?.id ?? null;
}
