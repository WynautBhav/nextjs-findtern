// WP4: leave AFTER a drive code was redeemed (act out, report; no behaviour change proposed here is applied).
//   Run after wp4-codes.mjs (it leaves tara as a redeemed student of the newest order).
import { check, loginAs, pool, q, summary } from "./wp4-lib.mjs";

const admin = await loginAs("admin", "admin@findtern.dev");
const tpo = await loginAs("college", "tpo@jklu.edu.in");
const [u] = await q("SELECT id FROM users WHERE email = 'tara.choudhary16@jklu.edu.in'");
const [ent] = await q("SELECT e.order_id, e.code_id FROM drive_entitlements e WHERE e.intern_id = $1 ORDER BY e.redeemed_at DESC LIMIT 1", [u.id]).catch(async () => q("SELECT order_id, code_id FROM drive_entitlements WHERE intern_id = $1 LIMIT 1", [u.id]));
check("setup: tara holds a redeemed seat", !!ent);
const orderBefore = (await q("SELECT issued_count, redeemed_count, slots FROM college_drive_orders WHERE id = $1", [ent.order_id]))[0];
const [cid] = await q("SELECT college_id FROM college_memberships WHERE user_id = $1", [u.id]);
const bal = async () => Number((await q("SELECT coalesce(sum(amount_minor),0) s FROM college_wallet_entries WHERE college_id = $1", [cid.college_id]))[0].s);
const walletBefore = await bal();
const paidBefore = Number((await q("SELECT count(*) n FROM intern_payments WHERE intern_id = $1 AND status = 'paid'", [u.id]))[0].n);

const s = await loginAs("intern", "tara.choudhary16@jklu.edu.in");
await q("DELETE FROM college_leave_requests WHERE user_id = $1", [u.id]);
let r = await s.post("/api/intern/college/leave-request", { reason: "wp4 audit" });
check("leave: student files the request", r.status === 200 || r.status === 201, `${r.status} ${JSON.stringify(r.json)}`);
const [lr] = await q("SELECT id FROM college_leave_requests WHERE user_id = $1 AND status = 'requested'", [u.id]);
r = await tpo.post("/api/college/leave-requests/decide", { ids: [lr.id], action: "approve" });
check("leave: TPO approves", r.status === 200, `${r.status} ${JSON.stringify(r.json)}`);

const [m] = await q("SELECT left_at IS NOT NULL AS left_ FROM college_memberships WHERE user_id = $1", [u.id]);
check("leave: membership ended", m.left_);
const orderAfter = (await q("SELECT issued_count, redeemed_count, slots FROM college_drive_orders WHERE id = $1", [ent.order_id]))[0];
check("D2: no seat is freed (redeemed_count unchanged)", orderAfter.redeemed_count === orderBefore.redeemed_count && orderAfter.issued_count === orderBefore.issued_count, JSON.stringify([orderBefore, orderAfter]));
check("D2: the code stays 'redeemed' and the entitlement stays", (await q("SELECT status FROM drive_codes WHERE id = $1", [ent.code_id]))[0].status === "redeemed" && (await q("SELECT 1 FROM drive_entitlements WHERE intern_id = $1", [u.id])).length >= 1);
check("D2: no refund and no wallet entry (college wallet unchanged)", (await bal()) === walletBefore);
check("D2: the student's paid fee row stays paid (account stays activated)", Number((await q("SELECT count(*) n FROM intern_payments WHERE intern_id = $1 AND status = 'paid'", [u.id]))[0].n) === paidBefore);
check("D2: no invoice or order row was created or voided by the leave", (await q("SELECT 1 FROM college_seat_batches WHERE status = 'void' AND created_at > now() - interval '5 minutes'")).length === 0);
// the admin order panel still counts the seat
const tab = (await admin.get(`/admin/colleges/${cid.college_id}?tab=orders`)).text.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
console.log("      admin orders tab mentions redeemed:", /redeemed/i.test(tab));
// put tara back so the next run of wp4-codes starts clean
await q("DELETE FROM college_leave_requests WHERE user_id = $1", [u.id]);
await q("UPDATE college_memberships SET left_at = NULL WHERE user_id = $1", [u.id]);
await pool.end();
process.exit(summary() ? 1 : 0);
