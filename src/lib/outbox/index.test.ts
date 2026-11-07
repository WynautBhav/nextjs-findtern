import test from "node:test";
import assert from "node:assert/strict";
import {
  backoffMs, nextState, idempotencyKey, redactError, buildOutboxRows, claimBatch, processBatch, processBatchTx, resend,
  CLAIM_SQL, MAX_ATTEMPTS, type Executor, type OutboxRow,
} from "./index.ts";

// In-memory fake emulating the claim, finish, select and insert statements (SKIP LOCKED: claim is atomic).
function fake(rows: OutboxRow[]): Executor & { rows: OutboxRow[] } {
  const ex = {
    rows,
    async query(sql: string, p: unknown[] = []) {
      if (sql === CLAIM_SQL) {
        const [limit, now, stuck] = p as [number, Date, Date];
        const hit = rows
          .filter((r) => (r.status === "queued" && r.next_at <= now) || (r.status === "sending" && r.updated_at <= stuck))
          .sort((a, b) => +a.next_at - +b.next_at).slice(0, limit);
        for (const r of hit) { r.status = "sending"; r.attempts++; r.updated_at = now; }
        return hit.map((r) => ({ ...r })) as never;
      }
      if (sql.startsWith("UPDATE email_outbox SET status=$2")) {
        const [id, status, next, err, pid, sent, upd] = p as [string, OutboxRow["status"], Date | null, string | null, string | null, Date | null, Date];
        const r = rows.find((x) => x.id === id)!;
        Object.assign(r, { status, next_at: next ?? r.next_at, last_error: err, provider_id: pid ?? r.provider_id, sent_at: sent, updated_at: upd });
        return [] as never;
      }
      if (sql.startsWith("SELECT * FROM")) return rows.filter((r) => r.id === p[0]).map((r) => ({ ...r })) as never;
      if (sql.startsWith("SELECT MAX")) {
        const ns = rows.filter((r) => r.campaign_id === p[0] && r.entry_id === p[1]).map((r) => Number(/:v(\d+)$/.exec(r.idempotency_key)![1]));
        return [{ n: ns.length ? Math.max(...ns) : null }] as never;
      }
      if (sql.startsWith("INSERT")) {
        const key = p[5] as string;
        if (rows.some((r) => r.idempotency_key === key)) return [] as never;
        const id = `n${rows.length}`;
        rows.push(mk(id, { campaign_id: p[0] as string, entry_id: p[1] as string, idempotency_key: key }));
        return [{ id }] as never;
      }
      throw new Error("unexpected sql");
    },
  };
  return ex as never;
}
const T0 = new Date("2026-01-01T00:00:00Z");
function mk(id: string, o: Partial<OutboxRow> = {}): OutboxRow {
  return { id, campaign_id: "c", entry_id: id, to_email: "a@b.co", template: "drive_code", payload: { codeId: "x" },
    status: "queued", attempts: 0, next_at: T0, last_error: null, provider_id: null, idempotency_key: `c:${id}:v0`,
    sent_at: null, updated_at: T0, ...o };
}
const later = new Date(T0.getTime() + 1000);

test("backoff schedule and dead after 5", () => {
  assert.deepEqual([1, 2, 3, 4].map(backoffMs), [60_000, 300_000, 1_800_000, 7_200_000]);
  assert.equal(backoffMs(MAX_ATTEMPTS), null);
  assert.equal(nextState({ attempts: 4, ok: false, now: T0 }).status, "queued");
  assert.equal(nextState({ attempts: 5, ok: false, now: T0 }).status, "dead");
  assert.equal(nextState({ attempts: 2, ok: true, now: T0 }).status, "sent");
  assert.equal(+nextState({ attempts: 1, ok: false, now: T0 }).next_at! - +T0, 60_000);
});

test("idempotency key stable and distinct per resend", () => {
  assert.equal(idempotencyKey("c", "e", 0), idempotencyKey("c", "e", 0));
  assert.notEqual(idempotencyKey("c", "e", 0), idempotencyKey("c", "e", 1));
  assert.equal(idempotencyKey("c", "e", 2), "c:e:v2");
});

test("redactError strips emails and tokens", () => {
  const s = redactError(new Error("550 bob@x.com rejected, Bearer abc.def key=SG.abcdef12345 token=hunter2"));
  assert.ok(!/bob@x\.com|abc\.def|SG\.|hunter2/.test(s), s);
});

test("buildOutboxRows dedupes and refuses plain code", () => {
  const e = { entryId: "e1", toEmail: "a@b.co", template: "drive_code", payload: { codeId: "k" } };
  assert.equal(buildOutboxRows("c", [e, e]).length, 1);
  assert.throws(() => buildOutboxRows("c", [{ ...e, payload: { code: "ABC123" } }]));
});

test("two concurrent workers never process a row twice", async () => {
  const ex = fake(Array.from({ length: 10 }, (_, i) => mk(`r${i}`)));
  const seen: string[] = [];
  const sender = async (r: OutboxRow) => { await Promise.resolve(); seen.push(r.id); return { providerId: "p" }; };
  await Promise.all([processBatch(ex, sender, { now: later, limit: 6 }), processBatch(ex, sender, { now: later, limit: 6 })]);
  assert.equal(seen.length, 10);
  assert.equal(new Set(seen).size, 10);
  assert.ok(ex.rows.every((r) => r.status === "sent"));
});

test("failure retries then dies; stuck sending reclaimed", async () => {
  const ex = fake([mk("a", { status: "sending", attempts: 1, updated_at: T0 })]);
  assert.equal((await claimBatch(ex, { now: new Date(T0.getTime() + 5 * 60_000) })).length, 0);
  const r = await claimBatch(ex, { now: new Date(T0.getTime() + 11 * 60_000) });
  assert.equal(r.length, 1);
  assert.equal(r[0].attempts, 2);
  const ex2 = fake([mk("b", { attempts: 4 })]);
  const out = await processBatch(ex2, async () => { throw new Error("x@y.com down"); }, { now: later });
  assert.equal(out.dead, 1);
  assert.equal(ex2.rows[0].status, "dead");
  assert.ok(!ex2.rows[0].last_error!.includes("@"));
});

test("resend creates a new row with next key", async () => {
  const ex = fake([mk("a", { status: "sent" })]);
  const id = await resend(ex, "a");
  assert.ok(id);
  assert.equal(ex.rows.length, 2);
  assert.equal(ex.rows[0].status, "sent");
  assert.equal(ex.rows[1].idempotency_key, "c:a:v1");
  await resend(ex, "a");
  assert.equal(ex.rows[2].idempotency_key, "c:a:v2");
});

test("the claim is committed before any send, and each result in its own transaction", async () => {
  const ex = fake([mk("a"), mk("b")]);
  const log: string[] = [];
  const run = async <T,>(fn: (e: Executor) => Promise<T>) => {
    log.push("tx:begin");
    const out = await fn(ex);
    log.push("tx:commit");
    return out;
  };
  await processBatchTx(run, async (r) => { log.push(`send:${r.id}`); return { providerId: "p" }; }, { now: later });
  assert.deepEqual(log, ["tx:begin", "tx:commit", "send:a", "tx:begin", "tx:commit", "send:b", "tx:begin", "tx:commit"]);
});

test("if writing a result fails, the claimed row stays 'sending' (reclaimed later), never back to queued", async () => {
  const ex = fake([mk("a")]);
  let n = 0;
  const run = async <T,>(fn: (e: Executor) => Promise<T>) => {
    n += 1;
    if (n === 2) throw new Error("db down");
    return fn(ex);
  };
  await assert.rejects(processBatchTx(run, async () => ({ providerId: "p" }), { now: later }));
  assert.equal(ex.rows[0].status, "sending");
});
