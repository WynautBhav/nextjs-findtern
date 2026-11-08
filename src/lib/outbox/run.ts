import { processBatchTx, type Sender } from "./index.ts";

export const BATCH_SIZE = 50;

/** Skips a call while a previous one is still running in this process. */
export function makeGuard() {
  let busy = false;
  return async function run<T>(fn: () => Promise<T>): Promise<{ skipped: true } | { skipped: false; value: T }> {
    if (busy) return { skipped: true };
    busy = true;
    try {
      return { skipped: false, value: await fn() };
    } finally {
      busy = false;
    }
  };
}
const guard = makeGuard();

export type TickResult = { skipped: boolean; sent: number; retried: number; dead: number };

/**
 * Claims and sends one batch. Safe from two places at once: overlapping ticks in this process skip,
 * and across processes `FOR UPDATE SKIP LOCKED` gives each row to one claimer.
 */
export async function runOutboxTick(sender?: Sender): Promise<TickResult> {
  const r = await guard(async () => {
    const [{ withPgTransaction, asRowsExecutor }, { sendDriveCodeRow }] = await Promise.all([
      import("../db/pg-tx.ts"),
      import("./send-db.ts"),
    ]);
    return processBatchTx((fn) => withPgTransaction((c) => fn(asRowsExecutor(c))), sender ?? sendDriveCodeRow, { limit: BATCH_SIZE });
  });
  return r.skipped ? { skipped: true, sent: 0, retried: 0, dead: 0 } : { skipped: false, ...r.value };
}

export const DRAIN_BUDGET_MS = 30_000;
export const DRAIN_MAX_BATCHES = 20;
export type DrainResult = TickResult & { batches: number; stoppedBy: "empty" | "budget" | "max_batches" | "busy" };

/**
 * Runs ticks back to back until a batch comes back short (nothing more is due), the time budget is spent
 * (checked before each batch, so a batch may overrun it) or `maxBatches` is reached. A cron that fires once
 * a day then still clears a backlog of more than one batch. Rows that just failed are not due again until their
 * backoff passes, so the loop cannot spin on them.
 */
export async function drainOutbox(
  tick: () => Promise<TickResult>,
  o: { budgetMs?: number; maxBatches?: number; clock?: () => number } = {},
): Promise<DrainResult> {
  const clock = o.clock ?? Date.now;
  const budget = o.budgetMs ?? DRAIN_BUDGET_MS;
  const max = o.maxBatches ?? DRAIN_MAX_BATCHES;
  const started = clock();
  const out: DrainResult = { skipped: false, sent: 0, retried: 0, dead: 0, batches: 0, stoppedBy: "max_batches" };
  while (out.batches < max) {
    if (out.batches > 0 && clock() - started >= budget) return { ...out, stoppedBy: "budget" };
    const r = await tick();
    if (r.skipped) return { ...out, skipped: out.batches === 0, stoppedBy: "busy" };
    out.batches += 1;
    out.sent += r.sent;
    out.retried += r.retried;
    out.dead += r.dead;
    if (r.sent + r.retried + r.dead < BATCH_SIZE) return { ...out, stoppedBy: "empty" };
  }
  return out;
}

export function runOutboxDrain(o?: Parameters<typeof drainOutbox>[1]): Promise<DrainResult> {
  return drainOutbox(() => runOutboxTick(), o);
}

/* ── Pure campaign helpers ───────────────────────────────────────────── */

export type PlanEntry = { entryId: string; email: string; codeId: string | null; codeStatus: string | null };
export type ExistingRow = { entryId: string; status: string };

/** Entries that have an issued code and no queued, sending or sent mail. Dead or failed rows do not block a new send. */
export function planRecipients(entries: PlanEntry[], existing: ExistingRow[]) {
  const blocked = new Set(existing.filter((r) => ["queued", "sending", "sent"].includes(r.status)).map((r) => r.entryId));
  const seen = new Set<string>();
  const out: { entryId: string; toEmail: string; codeId: string }[] = [];
  for (const e of entries) {
    if (!e.codeId || e.codeStatus !== "issued" || !e.email || blocked.has(e.entryId) || seen.has(e.entryId)) continue;
    seen.add(e.entryId);
    out.push({ entryId: e.entryId, toEmail: e.email, codeId: e.codeId });
  }
  return out;
}

/** A row can be resent when it finished (sent, failed or dead) and no sibling for the same entry is still in flight. */
export function canResend(row: { status: string }, siblings: { status: string }[]): { ok: true } | { ok: false; reason: string } {
  if (!["sent", "failed", "dead"].includes(row.status)) return { ok: false, reason: "That email is still waiting to be sent." };
  if (siblings.some((s) => s.status === "queued" || s.status === "sending")) return { ok: false, reason: "A resend is already queued." };
  return { ok: true };
}

export function shapeCounts(rows: { status: string; n: number | string }[]) {
  const c = { queued: 0, sent: 0, failed: 0, dead: 0, total: 0 };
  for (const r of rows) {
    const n = Number(r.n) || 0;
    const k = r.status === "sending" ? "queued" : (r.status as keyof typeof c);
    if (k in c && k !== "total") c[k] += n;
    c.total += n;
  }
  return { ...c, percentDone: c.total ? Math.round(((c.sent + c.dead + c.failed) / c.total) * 100) : 0 };
}

export function maskEmail(email: string): string {
  const [u = "", d = ""] = email.split("@");
  return `${u.slice(0, 2)}${"*".repeat(Math.max(1, Math.min(u.length - 2, 6)))}@${d}`;
}
