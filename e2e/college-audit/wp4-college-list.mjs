// WP4: "add students from the college's own list": same rules as a file, over-allocation, wrong-college order id, double confirm.
//   source ~/.cache/findtern-college-audit/env.sh; use_wp 4; node e2e/college-audit/wp4-college-list.mjs
import { check, loginAs, pool, q, summary } from "./wp4-lib.mjs";

const admin = await loginAs("admin", "admin@findtern.dev");
const [jklu] = await q("SELECT id FROM colleges WHERE slug = 'jklu'");
const [other] = await q("SELECT id FROM colleges WHERE slug = 'jecrc-university'");
const key = () => `wp4l-${Math.random().toString(36).slice(2)}-${Date.now()}`;
const until = new Date(Date.now() + 30 * 86400_000).toISOString();
const np = await admin.post(`/api/admin/colleges/${other.id}/drive-orders`, { slots: 2, feePerStudentMinor: 94400, creditMinor: 0, codeValidUntil: until }, { "idempotency-key": key() });
check("order for a non-partner college is refused (4xx)", np.status >= 400 && np.status < 500, `${np.status} ${JSON.stringify(np.json)}`);
await q("UPDATE colleges SET is_partner = true WHERE id = $1", [other.id]);
const mk = async (cid, slots) => (await admin.post(`/api/admin/colleges/${cid}/drive-orders`, { slots, feePerStudentMinor: 94400, creditMinor: 0, codeValidUntil: until }, { "idempotency-key": key() })).json.order.id;

// a college with no list yet -> 409 with the officer-facing hint
const orderOther = await mk(other.id, 2);
await admin.post(`/api/admin/drive-orders/${orderOther}/payment`, { method: "bank", reference: "L-0" }, { "idempotency-key": key() });
let r = await admin.post(`/api/admin/drive-orders/${orderOther}/imports`, { source: "college_list" });
check("college list: a college with no list -> 409 'has not added its student list'", r.status === 409 && /student list/i.test(r.json?.error ?? ""), `${r.status} ${JSON.stringify(r.json)}`);

// JKLU: list has 540 rows; order of 5 slots -> 5 valid, rest over allocation, nothing issued before confirm
const order = await mk(jklu.id, 5);
await admin.post(`/api/admin/drive-orders/${order}/payment`, { method: "bank", reference: "L-1" }, { "idempotency-key": key() });
r = await admin.post(`/api/admin/drive-orders/${order}/imports`, { source: "college_list" });
check("college list: preview 200", r.status === 200, `${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
check("college list: exactly 5 valid, the rest over allocation, none issued yet", r.json.counts.valid === 5 && r.json.counts.over_allocation === r.json.counts.total - r.json.counts.valid - r.json.counts.invalid - r.json.counts.duplicate, JSON.stringify(r.json.counts));
check("college list: no code exists before confirm", (await q("SELECT 1 FROM drive_codes WHERE order_id = $1", [order])).length === 0);
const r2 = await admin.post(`/api/admin/drive-orders/${order}/imports`, { source: "college_list" });
check("college list: the same list again returns the same import (replayed)", r2.json.importId === r.json.importId && r2.json.replayed === true, JSON.stringify([r.json.importId, r2.json.importId, r2.json.replayed]));
const c = await admin.post(`/api/admin/imports/${r.json.importId}/confirm`, {}, { "idempotency-key": key() });
check("college list: confirm 200 and exactly 5 codes", c.status === 200 && (await q("SELECT 1 FROM drive_codes WHERE order_id = $1", [order])).length === 5, `${c.status} ${JSON.stringify(c.json).slice(0, 200)}`);
const entries = await q("SELECT college_email_norm e FROM drive_roster_entries WHERE order_id = $1 AND state = 'valid'", [order]);
const roster = new Set((await q("SELECT email FROM college_roster WHERE college_id = $1", [jklu.id])).map((x) => x.email));
check("college list: every issued row is on THIS college's list only", entries.length === 5 && entries.every((x) => roster.has(x.e)));
// the same list on a full order returns the already-confirmed import (same file, same order = same import), it does not issue again
const r3 = await admin.post(`/api/admin/drive-orders/${order}/imports`, { source: "college_list" });
check("college list: repeating it on a full order is a replay of the confirmed import, no new codes", r3.status === 200 && r3.json.replayed === true && r3.json.importId === r.json.importId && (await q("SELECT 1 FROM drive_codes WHERE order_id = $1", [order])).length === 5, JSON.stringify(r3.json?.counts));
// another order's id with a wrong source
check("college list: unknown source -> 400", (await admin.post(`/api/admin/drive-orders/${order}/imports`, { source: "x" })).status === 400);
{
  const x = await admin.post(`/api/admin/drive-orders/00000000-0000-0000-0000-000000000000/imports`, { source: "college_list" });
  check("college list: unknown order id is refused (4xx; the message wrongly says 'no list yet', WP4-08 cosmetic)", x.status >= 400 && x.status < 500, `${x.status}`);
}
await q("UPDATE colleges SET is_partner = false WHERE id = $1", [other.id]);
await pool.end();
process.exit(summary() ? 1 : 0);
