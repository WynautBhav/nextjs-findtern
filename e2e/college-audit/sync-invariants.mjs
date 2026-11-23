// Part C of the data-sync oracle: "makes sense" invariants as SQL over the whole scratch DB (read-only).
// Each invariant = SQL that returns the VIOLATING rows (0 rows = PASS). Exported so sync-oracle.mjs can call it
// after every action batch and at every scale.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { q, rec } from "./sync-lib.mjs";

// Rows that violate an invariant in the SEEDED database (written by the seed script, not by the app) are saved by the first run
// (tag "seed", file SYNC_BASELINE) and reported as known seed artefacts afterwards; any NEW violating row fails.
const BASE_FILE = process.env.SYNC_BASELINE ?? "sync-baseline.json";
const rowKey = (r) => JSON.stringify(Object.values(r).map(String));

const ref = (child, col, parent, pcol = "id", extra = "") =>
  [`orphan:${child}.${col}->${parent}`, `SELECT c.id, c.${col} AS bad FROM ${child} c WHERE c.${col} IS NOT NULL ${extra} AND NOT EXISTS (SELECT 1 FROM ${parent} p WHERE p.${pcol} = c.${col})`];

const ORPHANS = [
  ref("college_memberships", "user_id", "users"), ref("college_memberships", "college_id", "colleges"),
  ref("college_denials", "user_id", "users"), ref("college_denials", "college_id", "colleges"),
  ref("college_leave_requests", "user_id", "users"), ref("college_leave_requests", "college_id", "colleges"), ref("college_leave_requests", "membership_id", "college_memberships"),
  ref("college_roster", "college_id", "colleges"), ref("college_admins", "college_id", "colleges"),
  ref("college_drives", "college_id", "colleges"), ref("college_drives", "order_id", "college_drive_orders"),
  ref("college_drive_employers", "drive_id", "college_drives"), ref("college_drive_employers", "employer_id", "employers"),
  ref("college_drive_meetings", "drive_id", "college_drives"), ref("college_drive_meetings", "employer_id", "employers"), ref("college_drive_meetings", "user_id", "users"),
  ref("college_drive_shortlist", "drive_id", "college_drives"), ref("college_drive_shortlist", "employer_id", "employers"), ref("college_drive_shortlist", "user_id", "users"),
  ref("college_drive_orders", "college_id", "colleges"), ref("college_drive_orders", "drive_id", "college_drives"), ref("college_drive_orders", "seat_batch_id", "college_seat_batches"),
  ref("college_seat_batches", "college_id", "colleges"), ref("college_seat_batches", "drive_order_id", "college_drive_orders"),
  ref("college_wallet_entries", "college_id", "colleges"), ref("college_wallet_entries", "intern_id", "users"), ref("college_wallet_entries", "proposal_id", "proposals"), ref("college_wallet_entries", "payout_id", "college_payouts"),
  ref("college_payouts", "college_id", "colleges"),
  ref("proposals", "intern_id", "users"), ref("proposals", "employer_id", "employers", "id", "AND c.employer_id <> 'admin'"), ref("proposals", "project_id", "projects"), ref("proposals", "interview_id", "interviews"),
  ref("interviews", "intern_id", "users"), ref("interviews", "employer_id", "employers", "id", "AND c.employer_id <> 'admin'"), ref("interviews", "project_id", "projects"),
  ref("projects", "employer_id", "employers"),
  ref("intern_payments", "intern_id", "users"), ref("employer_payments", "employer_id", "employers"),
  ref("intern_onboarding", "user_id", "users"), ref("intern_document", "user_id", "users"),
  ["orphan:notifications.recipient", `SELECT n.id, n.recipient_type||':'||n.recipient_id AS bad FROM notifications n WHERE NOT (
     (n.recipient_type IN ('intern','user','student') AND EXISTS (SELECT 1 FROM users u WHERE u.id = n.recipient_id)) OR
     (n.recipient_type = 'employer' AND EXISTS (SELECT 1 FROM employers e WHERE e.id = n.recipient_id)) OR
     (n.recipient_type = 'admin' AND EXISTS (SELECT 1 FROM admins a WHERE a.id = n.recipient_id)) OR
     (n.recipient_type IN ('college','college_admin') AND EXISTS (SELECT 1 FROM college_admins a WHERE a.id = n.recipient_id)))`],
];

const STATE = [
  ["state:hired_at set but status not a hire status", `SELECT id, status FROM proposals WHERE hired_at IS NOT NULL AND status NOT IN ('processing','hired','completed')`],
  ["state:status hired/processing/completed without hired_at", `SELECT id, status FROM proposals WHERE status IN ('hired','completed') AND hired_at IS NULL`],
  ["state:hired without a paid employer payment naming it", `SELECT p.id FROM proposals p WHERE p.status IN ('hired','completed') AND p.employer_id <> 'admin'
     AND NOT EXISTS (SELECT 1 FROM employer_payments ep WHERE ep.employer_id = p.employer_id AND ep.status = 'paid' AND ep.raw->'notes'->'proposalIds' ? p.id)`],
  ["state:membership verified/claimed with left_at set AND a newer live row", `SELECT m.id FROM college_memberships m WHERE m.left_at IS NOT NULL AND m.status NOT IN ('verified','claimed')`],
  ["state:membership status outside {verified,claimed}", `SELECT id, status FROM college_memberships WHERE status NOT IN ('verified','claimed')`],
  ["state:two live memberships for one student", `SELECT user_id FROM college_memberships WHERE left_at IS NULL GROUP BY user_id HAVING count(*) > 1`],
  ["state:student has a live membership AND a denial dated after the join", `SELECT m.id FROM college_memberships m JOIN college_denials d ON d.user_id = m.user_id AND d.college_id = m.college_id WHERE m.left_at IS NULL AND d.created_at > m.joined_at`],
  ["state:offer created after the student was frozen/banned", `SELECT p.id FROM proposals p JOIN users u ON u.id = p.intern_id WHERE (u.frozen_at IS NOT NULL AND p.created_at > u.frozen_at) OR (u.banned_at IS NOT NULL AND p.created_at > u.banned_at)`],
  ["state:drive meeting accepted/answered after the drive ended or was revoked", `SELECT m.id FROM college_drive_meetings m JOIN college_drives d ON d.id = m.drive_id WHERE m.status IN ('accepted','declined') AND m.responded_at IS NOT NULL AND (m.responded_at > d.ends_at + interval '1 minute' OR (d.revoked_at IS NOT NULL AND m.responded_at > d.revoked_at + interval '1 minute'))`],
  ["state:meeting accepted but starts after the drive ended", `SELECT m.id FROM college_drive_meetings m JOIN college_drives d ON d.id = m.drive_id WHERE m.status = 'accepted' AND m.starts_at > d.ends_at + interval '1 day'`],
  ["state:two live hires for one intern", `SELECT intern_id FROM proposals WHERE status = 'hired' GROUP BY intern_id HAVING count(*) > 1`],
  ["state:two accepted offers for one intern", `SELECT intern_id FROM proposals WHERE status IN ('accepted','processing','hired') GROUP BY intern_id HAVING count(*) > 1`],
  ["state:leave request status vs decided_at", `SELECT id, status FROM college_leave_requests WHERE (status IN ('pending','requested') AND decided_at IS NOT NULL) OR (status NOT IN ('pending','requested','cancelled','withdrawn') AND decided_at IS NULL)`],
  ["state:pending leave request but membership already ended", `SELECT r.id FROM college_leave_requests r JOIN college_memberships m ON m.id = r.membership_id WHERE r.status = 'pending' AND m.left_at IS NOT NULL`],
  ["state:interview selected_slot with no slot value", `SELECT id FROM interviews WHERE (selected_slot = 1 AND slot1 IS NULL) OR (selected_slot = 2 AND slot2 IS NULL) OR (selected_slot = 3 AND slot3 IS NULL)`],
  ["state:wallet incentive for a proposal never hired", `SELECT w.id FROM college_wallet_entries w JOIN proposals p ON p.id = w.proposal_id WHERE w.kind = 'incentive' AND p.hired_at IS NULL AND p.status NOT IN ('hired','completed','processing')`],
  ["state:wallet incentive college differs from the student's college", `SELECT w.id FROM college_wallet_entries w WHERE w.kind = 'incentive' AND NOT EXISTS (SELECT 1 FROM college_memberships m WHERE m.user_id = w.intern_id AND m.college_id = w.college_id)`],
  ["state:two incentives for one proposal", `SELECT proposal_id FROM college_wallet_entries WHERE kind = 'incentive' AND proposal_id IS NOT NULL GROUP BY proposal_id HAVING count(*) > 1`],
];

const DATES = [
  ["dates:created_at after updated_at", `SELECT 'proposals' t, id FROM proposals WHERE created_at > updated_at UNION ALL SELECT 'interviews', id FROM interviews WHERE created_at > updated_at
     UNION ALL SELECT 'projects', id FROM projects WHERE created_at > updated_at UNION ALL SELECT 'drive_orders', id FROM college_drive_orders WHERE created_at > updated_at
     UNION ALL SELECT 'drives', id FROM college_drives WHERE created_at > updated_at UNION ALL SELECT 'employer_payments', id FROM employer_payments WHERE created_at > updated_at
     UNION ALL SELECT 'intern_payments', id FROM intern_payments WHERE created_at > updated_at UNION ALL SELECT 'onboarding', id FROM intern_onboarding WHERE created_at > updated_at`],
  ["dates:drive starts after it ends", `SELECT id FROM college_drives WHERE starts_at >= ends_at`],
  ["dates:membership left_at before joined_at / decided before joined", `SELECT id FROM college_memberships WHERE left_at < joined_at OR decided_at < joined_at`],
  ["dates:leave decided before requested", `SELECT id FROM college_leave_requests WHERE decided_at < requested_at`],
  ["dates:hired_at before offer created", `SELECT id FROM proposals WHERE hired_at < created_at`],
  ["dates:employer payment paid before the offer it pays was created", `SELECT ep.id FROM employer_payments ep JOIN proposals p ON ep.raw->'notes'->'proposalIds' ? p.id WHERE ep.paid_at IS NOT NULL AND ep.paid_at < p.created_at`],
  ["dates:offer start date before offer creation day (IST)", `SELECT id, offer_details->>'startDate' sd FROM proposals WHERE status = 'sent' AND offer_details->>'startDate' ~ '^\\d{4}-\\d{2}-\\d{2}' AND (offer_details->>'startDate')::date < ((created_at + interval '330 minutes')::date) - 1`],
  ["dates:paid_at before created_at (seat batch / drive order)", `SELECT id FROM college_seat_batches WHERE paid_at < created_at UNION ALL SELECT id FROM college_drive_orders WHERE paid_at < created_at`],
  ["dates:meeting starts before the drive starts", `SELECT m.id FROM college_drive_meetings m JOIN college_drives d ON d.id = m.drive_id WHERE m.starts_at < d.starts_at - interval '1 day'`],
  ["dates:responded before created (drive meeting)", `SELECT id FROM college_drive_meetings WHERE responded_at < created_at`],
];

const MONEY = [
  ["money:seat batch amount != seats * unit price", `SELECT id, seats, unit_price_minor, amount_minor FROM college_seat_batches WHERE drive_order_id IS NULL AND amount_minor::bigint <> seats::bigint * unit_price_minor * 118 / 100 AND amount_minor::bigint <> seats::bigint * unit_price_minor`],
  ["money:drive order amount != slots * fee", `SELECT id FROM college_drive_orders WHERE amount_minor::bigint <> slots::bigint * fee_per_student_minor * 118 / 100 AND amount_minor::bigint <> slots::bigint * fee_per_student_minor`],
  ["money:drive order credit above amount, or negative", `SELECT id FROM college_drive_orders WHERE credit_minor > amount_minor OR credit_minor < 0 OR amount_minor < 0`],
  ["money:paid drive order's seat batch amount != amount - credit", `SELECT o.id FROM college_drive_orders o JOIN college_seat_batches b ON b.id = o.seat_batch_id WHERE b.amount_minor <> o.amount_minor - o.credit_minor`],
  ["money:negative amounts anywhere", `SELECT id FROM college_seat_batches WHERE amount_minor < 0 OR unit_price_minor < 0 OR seats < 0 UNION ALL SELECT id FROM employer_payments WHERE amount_minor < 0 UNION ALL SELECT id FROM intern_payments WHERE amount_minor < 0 UNION ALL SELECT id FROM college_payouts WHERE amount_minor <= 0 UNION ALL SELECT id FROM college_wallet_entries WHERE kind = 'incentive' AND amount_minor <= 0`],
  ["money:paid seat batch with amount>0 has no serial (or amount=0 has one)", `SELECT id FROM college_seat_batches WHERE status = 'paid' AND drive_order_id IS NOT NULL AND ((amount_minor > 0 AND invoice_number IS NULL) OR (amount_minor = 0 AND invoice_number IS NOT NULL))`],
  ["money:unpaid seat batch carries a serial", `SELECT id FROM college_seat_batches WHERE status <> 'paid' AND invoice_number IS NOT NULL`],
  ["money:invoice serial duplicated across seat batches / employer / intern payments", `SELECT invoice_number FROM (SELECT invoice_number FROM college_seat_batches UNION ALL SELECT invoice_number FROM employer_payments UNION ALL SELECT invoice_number FROM intern_payments) x WHERE invoice_number IS NOT NULL GROUP BY invoice_number HAVING count(*) > 1`],
  ["money:wallet entries paid out exceed what the payouts record", `SELECT p.id FROM college_payouts p WHERE p.status = 'paid' AND p.amount_minor <> coalesce((SELECT sum(amount_minor) FROM college_wallet_entries w WHERE w.payout_id = p.id AND w.kind = 'incentive'), p.amount_minor)`],
  ["money:payouts requested/paid exceed total incentives for the college", `SELECT c.id FROM colleges c WHERE coalesce((SELECT sum(amount_minor) FROM college_payouts p WHERE p.college_id = c.id AND p.status IN ('requested','paid','processing')),0) > coalesce((SELECT sum(amount_minor) FROM college_wallet_entries w WHERE w.college_id = c.id AND w.kind = 'incentive'),0)`],
  ["money:non-INR/non-USD currency on a proposal", `SELECT id, currency FROM proposals WHERE currency NOT IN ('INR','USD')`],
  ["money:proposal offer total <> hourlyRate*monthlyHours*months? (monthlyAmount vs hourly*hours)", `SELECT id FROM proposals WHERE (offer_details->>'hourlyRate') ~ '^\\d+(\\.\\d+)?$' AND (offer_details->>'monthlyHours') ~ '^\\d+$' AND (offer_details->>'monthlyAmount') ~ '^\\d+(\\.\\d+)?$' AND abs((offer_details->>'hourlyRate')::numeric * (offer_details->>'monthlyHours')::numeric - (offer_details->>'monthlyAmount')::numeric) > 1`],
];

const COUNTS = [
  ["counts:drive order issued/redeemed negative or redeemed > issued", `SELECT id FROM college_drive_orders WHERE issued_count < 0 OR redeemed_count < 0 OR redeemed_count > issued_count OR issued_count > slots`],
  ["counts:seats used by live verified members exceed seats paid (per college)", `SELECT c.id, c.name FROM colleges c WHERE (SELECT count(*) FROM college_memberships m WHERE m.college_id = c.id AND m.left_at IS NULL AND m.status = 'verified' AND m.verified_by IN ('college_code','promo','drive_code')) > coalesce((SELECT sum(seats) FROM college_seat_batches b WHERE b.college_id = c.id AND b.status = 'paid'),0) + 0`],
];

const UNIQ = [
  ["unique:users.email (case-insensitive)", `SELECT lower(email) FROM users GROUP BY 1 HAVING count(*) > 1`],
  ["unique:employers.company_email", `SELECT lower(company_email) FROM employers GROUP BY 1 HAVING count(*) > 1`],
  ["unique:phone across interns", `SELECT country_code, phone_number FROM users WHERE phone_number IS NOT NULL AND phone_number <> '' GROUP BY 1,2 HAVING count(*) > 1`],
  ["unique:phone shared between an intern and an employer", `SELECT u.phone_number FROM users u JOIN employers e ON e.phone_number = u.phone_number AND coalesce(e.country_code,'') = coalesce(u.country_code,'') WHERE u.phone_number <> ''`],
  ["unique:college code / slug / aishe", `SELECT code FROM colleges WHERE code IS NOT NULL GROUP BY 1 HAVING count(*) > 1 UNION ALL SELECT slug FROM colleges GROUP BY 1 HAVING count(*) > 1 UNION ALL SELECT aishe_code FROM colleges WHERE aishe_code IS NOT NULL AND aishe_code <> '' GROUP BY 1 HAVING count(*) > 1`],
  ["unique:roster email per college", `SELECT college_id, lower(email) FROM college_roster GROUP BY 1,2 HAVING count(*) > 1`],
  ["unique:college_admins.email", `SELECT lower(email) FROM college_admins GROUP BY 1 HAVING count(*) > 1`],
  ["unique:notification dedupe_key per recipient", `SELECT recipient_id, dedupe_key FROM notifications WHERE dedupe_key IS NOT NULL GROUP BY 1,2 HAVING count(*) > 1`],
];

const ENUMS = [
  ["enum:proposals.status", `SELECT id, status FROM proposals WHERE status NOT IN ('draft','sent','interview_scheduled','accepted','processing','hired','completed','rejected','withdrawn','expired','cancelled','declined')`],
  ["enum:interviews.status", `SELECT id, status FROM interviews WHERE status NOT IN ('pending','waiting','proposed','scheduled','completed','missed','cancelled','declined','rejected','expired','rescheduled','no_show')`],
  ["enum:college_drive_meetings.status", `SELECT id, status FROM college_drive_meetings WHERE status NOT IN ('requested','accepted','declined','expired','cancelled')`],
  ["enum:college_seat_batches.status", `SELECT id, status FROM college_seat_batches WHERE status NOT IN ('pending','paid','cancelled','void')`],
  ["enum:college_drive_orders.status", `SELECT id, status FROM college_drive_orders WHERE status NOT IN ('pending','paid','cancelled','void','expired')`],
  ["enum:college_leave_requests.status", `SELECT id, status FROM college_leave_requests WHERE status NOT IN ('pending','requested','approved','denied','rejected','cancelled','withdrawn')`],
  ["enum:college_payouts.status", `SELECT id, status FROM college_payouts WHERE status NOT IN ('requested','processing','paid','rejected','cancelled')`],
  ["enum:projects.status", `SELECT id, status FROM projects WHERE status NOT IN ('draft','pending','submitted','active','published','rejected','closed','paused','taken_down','completed','expired')`],
  ["enum:users.profile_visibility", `SELECT id FROM users WHERE profile_visibility NOT IN ('live','hidden','paused')`],
  ["enum:college_drives.kind", `SELECT id, kind FROM college_drives WHERE kind NOT IN ('internship','full_time')`],
  ["enum:wallet kind", `SELECT id, kind FROM college_wallet_entries WHERE kind NOT IN ('incentive','adjustment','payout','reversal')`],
];

const TXT = (t, cols) => cols.map((c) => `SELECT '${t}.${c}' f, id, ${c}::text v FROM ${t} WHERE ${c} IS NOT NULL AND (${c}::text ~* '(^|[^a-z])(undefined|NaN|\\[object Object\\])([^a-z]|$)' OR ${c}::text = 'null' OR ${c}::text ~ '\\s{2,}' OR ${c}::text <> btrim(${c}::text) OR (${c}::text = '' AND '${c}' NOT IN ('note','reason','decision_note','notes','bio','message')))`).join(" UNION ALL ");
const TEXT = [
  ["text:users name/email", TXT("users", ["first_name", "last_name", "email", "phone_number"])],
  ["text:employers", TXT("employers", ["company_name", "name", "company_email", "city", "gst_number"])],
  ["text:colleges", TXT("colleges", ["name", "city", "state", "code"])],
  ["text:roster", TXT("college_roster", ["name", "email", "branch", "roll_no"])],
  ["text:projects", TXT("projects", ["project_name", "city"])],
  ["text:memberships branch", TXT("college_memberships", ["branch"])],
  ["text:notifications", TXT("notifications", ["title", "message"])],
  ["text:onboarding city/state", TXT("intern_onboarding", ["city", "state"])],
  ["text:cgpa range 0-10, <=2 decimals (academics.score where scoreType=cgpa)", `SELECT user_id id, extra_data->'academics'->>'score' v FROM intern_onboarding WHERE extra_data->'academics'->>'scoreType' = 'cgpa' AND extra_data->'academics'->>'score' IS NOT NULL AND extra_data->'academics'->>'score' <> '' AND (NOT (extra_data->'academics'->>'score' ~ '^\\d{1,2}(\\.\\d{1,2})?$') OR (extra_data->'academics'->>'score')::numeric > 10)`],
  ["text:year of membership outside 1-6", `SELECT id, year FROM college_memberships WHERE year IS NOT NULL AND year NOT BETWEEN 1 AND 6`],
  ["text:semester outside 1-12 (non-numeric allowed only for not-applicable)", `SELECT user_id id, extra_data->'academics'->>'currentSemester' v FROM intern_onboarding WHERE extra_data->'academics'->>'currentSemester' IS NOT NULL AND extra_data->'academics'->>'currentSemester' <> '' AND extra_data->'academics'->>'currentSemester' !~ '^([1-9]|1[0-2])$' AND lower(extra_data->'academics'->>'currentSemester') NOT IN ('na','n/a','not_applicable','not applicable')`],
  ["text:skills contain empty/duplicate entries", `SELECT user_id id FROM intern_onboarding WHERE jsonb_typeof(skills) = 'array' AND (EXISTS (SELECT 1 FROM jsonb_array_elements_text(skills) s WHERE btrim(s) = '') OR (SELECT count(*) FROM jsonb_array_elements_text(skills)) <> (SELECT count(DISTINCT lower(s)) FROM jsonb_array_elements_text(skills) s))`],
  ["text:phone digits only, 4-15 chars", `SELECT id, phone_number FROM users WHERE phone_number IS NOT NULL AND phone_number <> '' AND phone_number !~ '^\\d{4,15}$'`],
  ["text:email shape", `SELECT id, email FROM users WHERE email !~ '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' OR email <> lower(email)`],
];

export const INVARIANTS = [...ORPHANS, ...STATE, ...DATES, ...MONEY, ...COUNTS, ...UNIQ, ...ENUMS, ...TEXT];

/** Invoice serials: per Indian FY (paid_at, IST) the serials of DDMMYY-NN numbers are unique, gapless from 1 and equal invoice_counters.last. */
async function invoiceSerials(tag, area, base, nextBase) {
  const rows = await q(`SELECT n, paid_at FROM (SELECT invoice_number n, paid_at FROM college_seat_batches UNION ALL SELECT invoice_number, paid_at FROM employer_payments UNION ALL SELECT invoice_number, paid_at FROM intern_payments) x WHERE n ~ '^\\d{6}-\\d+$'`);
  const counters = Object.fromEntries((await q(`SELECT fy, last FROM invoice_counters`)).map((c) => [c.fy, Number(c.last)]));
  const byFy = new Map();
  for (const r of rows) {
    const d = new Date(new Date(r.paid_at).getTime() + 330 * 60000); const y = d.getUTCMonth() >= 3 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
    const fy = `${y}-${String((y + 1) % 100).padStart(2, "0")}`; (byFy.get(fy) ?? byFy.set(fy, []).get(fy)).push(Number(r.n.split("-")[1]));
  }
  let bad = [];
  for (const [fy, list] of byFy) {
    const set = new Set(list); const max = Math.max(...list);
    if (set.size !== list.length) bad.push(`${fy}: duplicate serial`);
    for (let i = (base.__counters?.[fy] ?? 0) + 1; i <= max; i++) if (!set.has(i)) bad.push(`${fy}: serial ${i} missing (gap)`);
    if ((counters[fy] ?? 0) !== max) bad.push(`${fy}: counter ${counters[fy] ?? 0} != max serial ${max}`);
  }
  for (const [fy, last] of Object.entries(counters)) if (!byFy.has(fy) && last > 0) bad.push(`${fy}: counter ${last} but no invoice has that FY`);
  if (nextBase) { nextBase["invoice serials"] = bad; nextBase.__counters = counters; }
  const fresh = bad.filter((b) => !(base["invoice serials"] ?? []).includes(b) && !(b.endsWith("but no invoice has that FY") && base.__counters));
  rec(area, `${tag}:money:invoice serials unique, gapless, == counter (per FY)`, "invoice serials unique, gapless per FY, equal invoice_counters" + (bad.length - fresh.length ? " [known seed artefact: counter 1 for the seeded SEED-001 batch]" : ""), fresh.length === 0, fresh.join("; "));
  return bad.length ? [{ name: "invoice serials", count: bad.length, fresh: fresh.length, sample: bad }] : [];
}

/** Runs every invariant; tag = e.g. "seed" / "after-entry" / "scale-500". Returns [{name, rows}] for the violations. */
export async function runInvariants(tag, { area = "C" } = {}) {
  const bad = [];
  const saveBase = tag === "seed";
  const base = !saveBase && existsSync(BASE_FILE) ? JSON.parse(readFileSync(BASE_FILE, "utf8")) : {};
  const nextBase = {};
  for (const [name, sql] of INVARIANTS) {
    let rows;
    try { rows = await q(sql); } catch (e) { rec(area, `${tag}:${name}`, name + " (SQL ERROR)", false, e.message); bad.push({ name, rows: [`SQL error: ${e.message}`] }); continue; }
    if (saveBase) nextBase[name] = rows.map(rowKey);
    const known = new Set(base[name] ?? []);
    const fresh = rows.filter((r) => !known.has(rowKey(r)));
    const ok = fresh.length === 0;
    rec(area, `${tag}:${name}`, name + (rows.length - fresh.length ? ` [${rows.length - fresh.length} known seed artefact row(s)]` : ""), ok, `${fresh.length} violating row(s), e.g. ${JSON.stringify(fresh.slice(0, 3))}`);
    if (rows.length) bad.push({ name, count: rows.length, fresh: fresh.length, sample: rows.slice(0, 5) });
  }
  bad.push(...(await invoiceSerials(tag, area, base, saveBase ? nextBase : null)));
  if (saveBase) writeFileSync(BASE_FILE, JSON.stringify(nextBase));
  return bad;
}
