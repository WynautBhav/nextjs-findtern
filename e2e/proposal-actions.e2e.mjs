/**
 * Edit / withdraw of a proposal in every state, called directly on the routes (the server decides, not the button), and the
 * offer-letter upload type. Seeds tagged rows by SQL into a LOCAL database and removes them after.
 *
 *   E2E_BASE=http://localhost:3571 E2E_DATABASE_URL=postgresql://findtern:findtern_dev@127.0.0.1:5435/findtern_n27 \
 *     node --test e2e/proposal-actions.e2e.mjs
 *
 * The state table is src/lib/proposal-permissions.ts. Needs hiring@northwind.dev and admin@findtern.dev (password Findtern@2026).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import sharp from "sharp";
import { testDatabaseUrl } from "./lib/env.mjs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3571";
const DB = testDatabaseUrl(process.env.E2E_DATABASE_URL);
const PASSWORD = "Findtern@2026";
const TAG = "e2eProposalActions";

let pool, emp, adm, employerId, tplId, interns, n = 0;
const q = async (sql, params) => (await pool.query(sql, params)).rows;
const ip = () => `10.${1 + Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 256)}.${1 + Math.floor(Math.random() * 250)}`;

async function login(path, email) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip() }, body: JSON.stringify({ email, password: PASSWORD }) });
  assert.equal(res.status, 200, `login ${email}`);
  const jar = new Map(res.headers.getSetCookie().map((c) => c.split(";")[0].split(/=(.*)/s).slice(0, 2)));
  return { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join("; "), csrf: jar.has("ft_csrf") ? decodeURIComponent(jar.get("ft_csrf")) : "", ip: ip() };
}
const call = async (s, method, path, body, headers = {}, raw = false) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    redirect: "manual",
    headers: { "content-type": "application/json", origin: BASE, cookie: s.cookie, "x-forwarded-for": s.ip, "x-csrf-token": s.csrf, ...headers },
    body: raw ? body : body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const withdraw = (s, id) => call(s, "PATCH", `/api/proposals/${id}/status`, { status: "withdrawn" });
const edit = (s, id, offer) => call(s, "PATCH", `/api/proposals/${id}`, offer);

async function clean() {
  const tagged = (await q(`select id from proposals where offer_details->>'${TAG}' = '1'`)).map((r) => r.id);
  if (tagged.length) {
    await q("delete from notifications where data->>'proposalId' = any($1)", [tagged]);
    await q("delete from proposals where id = any($1)", [tagged]);
  }
}

const FT = { jobTitle: "Engineer", jobMode: "remote", jobLocationCity: "", jobLocationState: "", timezone: "Asia/Kolkata", shiftFrom: "09:00", shiftTo: "18:00", ctcCurrency: "INR", annualCtc: 600000, offerLetterKey: "k.letter.pdf" };

/** A tagged copy of an internship offer in `status` (or a full-time one), for a candidate with no other northwind proposal. */
async function seed(status, { fullTime = false, hired = false, expiredReason } = {}) {
  const id = (await q("select gen_random_uuid()::text id"))[0].id;
  const startDate = (await q("select to_char((now() at time zone 'Asia/Kolkata')::date + 30, 'YYYY-MM-DD') d"))[0].d;
  const extra = { [TAG]: "1", startDate, ...(expiredReason ? { expiredReason } : {}), ...(fullTime ? { fullTimeOffer: { ...FT, offerLetterUrl: "https://x/api/proposals/x/offer-letter", createdAt: new Date().toISOString() } } : {}) };
  await q(
    `insert into proposals select (jsonb_populate_record(null::proposals, to_jsonb(t) || jsonb_build_object('id', $1::text, 'status', $2::text, 'intern_id', $3::text, 'flow_type', 'direct', 'interview_id', null, 'hired_at', $4::text, 'updated_at', now()::text, 'offer_details', t.offer_details || $5::jsonb))).* from proposals t where t.id = $6`,
    [id, status, interns[n++], hired ? new Date(Date.now() - 86_400_000).toISOString() : null, JSON.stringify(extra), tplId],
  );
  return id;
}
const row = async (id) => (await q("select status, hired_at, offer_details from proposals where id = $1", [id]))[0];

before(async () => {
  pool = new pg.Pool({ connectionString: DB });
  await clean();
  employerId = (await q("select id from employers where company_email = 'hiring@northwind.dev'"))[0].id;
  tplId = (await q("select id from proposals where employer_id = $1 and status = 'sent' order by id limit 1", [employerId]))[0].id;
  interns = (await q("select o.user_id from intern_onboarding o where not exists (select 1 from proposals p where p.intern_id = o.user_id and p.employer_id = $1) order by o.user_id limit 60", [employerId])).map((r) => r.user_id);
  assert.ok(interns.length >= 40, "needs 40 interns without a northwind proposal");
  emp = await login("/api/auth/employer/login", "hiring@northwind.dev");
  adm = await login("/api/auth/admin/login", "admin@findtern.dev");
});
after(async () => {
  if (!process.env.E2E_KEEP) await clean();
  await pool.end();
});

const OPEN = ["draft", "sent", "interview_scheduled"];
const CLOSED_FOR_EMPLOYER = ["accepted", "processing", "rejected", "withdrawn", "expired", "hired"];
const seedClosed = (s) => seed(s, { hired: s === "hired", expiredReason: s === "expired" ? "accepted_elsewhere" : undefined });

for (const status of OPEN) {
  test(`employer: an internship offer that is ${status} can be edited and withdrawn`, async () => {
    const id = await seed(status);
    const e = await edit(emp, id, { offer: { roleTitle: "Edited by employer" } });
    assert.equal(e.status, 200, JSON.stringify(e.body));
    assert.equal((await row(id)).offer_details.roleTitle, "Edited by employer");
    const w = await withdraw(emp, id);
    assert.equal(w.status, 200, JSON.stringify(w.body));
    assert.equal((await row(id)).status, "withdrawn");
  });
}

for (const status of CLOSED_FOR_EMPLOYER) {
  test(`employer: a ${status} offer cannot be edited or withdrawn (409, nothing changes)`, async () => {
    const id = await seedClosed(status);
    const before = await row(id);
    const e = await edit(emp, id, { offer: { roleTitle: "Sneaky edit" } });
    assert.equal(e.status, 409, `edit: ${JSON.stringify(e.body)}`);
    const w = await withdraw(emp, id);
    assert.equal(w.status, 409, `withdraw: ${JSON.stringify(w.body)}`);
    assert.deepEqual(await row(id), before, "row unchanged");
  });
}

test("employer: the words for an accepted offer say the candidate accepted, not 'already accepted'", async () => {
  const id = await seed("accepted");
  assert.match((await withdraw(emp, id)).body?.error ?? "", /candidate accepted/i);
  assert.match((await edit(emp, id, { offer: { roleTitle: "x y" } })).body?.error ?? "", /candidate accepted/i);
});

test("admin: can withdraw an accepted internship offer; a full-time acceptance stays closed to everyone", async () => {
  const id = await seed("accepted");
  assert.equal((await withdraw(adm, id)).status, 200);
  assert.equal((await row(id)).status, "withdrawn");
  const ft = await seed("accepted", { fullTime: true });
  const before = await row(ft);
  assert.equal((await withdraw(adm, ft)).status, 409);
  assert.equal((await withdraw(emp, ft)).status, 409);
  assert.equal((await edit(emp, ft, { fullTimeOffer: { annualCtc: 1 } })).status, 409);
  assert.deepEqual(await row(ft), before);
});

test("full-time (item 12): the employer can edit an unanswered full-time offer, and the candidate is told", async () => {
  const id = await seed("sent", { fullTime: true });
  const r = await edit(emp, id, { fullTimeOffer: { jobTitle: "Senior Engineer", annualCtc: 900000, jobMode: "hybrid", jobLocationCity: "Jaipur", jobLocationState: "Rajasthan", shiftFrom: "10:00", shiftTo: "19:00", timezone: "Asia/Kolkata" } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const ft = (await row(id)).offer_details.fullTimeOffer;
  assert.equal(ft.jobTitle, "Senior Engineer");
  assert.equal(ft.annualCtc, 900000);
  assert.equal(ft.jobLocationCity, "Jaipur");
  assert.equal(ft.offerLetterKey, FT.offerLetterKey, "the letter stays when no new one is sent");
  assert.equal((await row(id)).status, "sent");
  const notes = await q("select type from notifications where data->>'proposalId' = $1", [id]);
  assert.ok(notes.some((x) => x.type === "proposal_updated"), "intern notified");
});

test("full-time edit: bad terms and a non-PDF letter are refused, and an internship edit body is not accepted on a full-time offer", async () => {
  const id = await seed("sent", { fullTime: true });
  const before = await row(id);
  assert.equal((await edit(emp, id, { fullTimeOffer: { annualCtc: -5 } })).status, 400);
  assert.equal((await edit(emp, id, { fullTimeOffer: { jobMode: "onsite" } })).status, 400, "on-site needs a city and state");
  assert.equal((await edit(emp, id, { fullTimeOffer: { offerLetterKey: `${employerId.slice(0, 32)}.abcdefghijklmnopqrstuv.webp` } })).status, 400, "an image key is not a letter");
  assert.equal((await edit(emp, id, { offer: { roleTitle: "Wrong body" } })).status, 400);
  assert.deepEqual(await row(id), before);
});

test("another employer's offer cannot be edited or withdrawn (ownership)", async () => {
  const other = (await q("select id from proposals where employer_id <> $1 and status = 'sent' limit 1", [employerId]))[0];
  if (!other) return;
  const before = await row(other.id);
  assert.equal((await withdraw(emp, other.id)).status, 403);
  assert.equal((await edit(emp, other.id, { offer: { roleTitle: "Not mine" } })).status, 403);
  assert.deepEqual(await row(other.id), before);
});

// Item 13: the offer letter is a PDF. The type is judged by the bytes, not the header or the name.
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const px = { create: { width: 8, height: 8, channels: 3, background: "#369" } };
const JPG = await sharp(px).jpeg().toBuffer();
const PNG = await sharp(px).png().toBuffer();
const upload = (kind, type, body) => call(emp, "POST", "/api/uploads", body, { "content-type": type, "x-document-kind": kind, "x-file-name": "offer" }, true);

test("offer letter upload: a real PDF is stored; JPG and PNG are refused by type; an image sent as a PDF is refused by its bytes", async () => {
  const ok = await upload("offer_letter", "application/pdf", PDF);
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.match(ok.body.key, /\.pdf$/);
  assert.equal((await upload("offer_letter", "image/jpeg", JPG)).status, 415);
  assert.equal((await upload("offer_letter", "image/png", PNG)).status, 415);
  assert.equal((await upload("offer_letter", "application/pdf", JPG)).status, 415, "JPG bytes labelled as a PDF");
  assert.equal((await upload("offer_letter", "application/pdf", PNG)).status, 415, "PNG bytes labelled as a PDF");
});
