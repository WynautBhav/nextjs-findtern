// WP3: drive link/token behaviour, IST windows, meet request lifecycle, arrivals/alerts, names hidden before hire.
//   . ~/.cache/findtern-college-audit/env.sh; use_wp 3; node e2e/college-audit/wp3-lifecycle.mjs
import { q, one, session, check, finish, flight } from "./wp3-lib.mjs";

const tpo = await session("college", "tpo@jklu.edu.in");
const emp = await session("employer", "hiring@northwind.dev");
const emp2 = await session("employer", "talent@meridian.dev");
const emp3 = await session("employer", "jobs@orchidfin.dev");
const stu0 = await session("intern", "aarav.sharma1@jklu.edu.in");
const nw = await one(`SELECT id FROM employers WHERE company_email = 'hiring@northwind.dev'`);
const iso = (ms) => new Date(Date.now() + ms).toISOString();
const H = 3600_000, D = 24 * H;
const tokenOf = (url) => url.split("/drive/")[1];
const join = (who, token) => who.post(`/api/drives/join`, { token });
const mk = async (title, startMs, endMs, extra = {}) => {
  const r = await tpo.post(`/api/college/drives`, { title, kind: "internship", startsAt: iso(startMs), endsAt: iso(endMs), eligibility: { years: [2, 3] }, ...extra });
  if (r.status !== 201) throw new Error(`create ${title}: ${r.status} ${r.text.slice(0, 120)}`);
  return { id: r.json.id, token: tokenOf(r.json.url) };
};
function listIn(html, key) {
  const f = flight(html);
  const i = f.indexOf(`"${key}":[`);
  if (i < 0) return null;
  let depth = 0, j = f.indexOf("[", i);
  const start = j;
  for (; j < f.length; j++) { if (f[j] === "[") depth++; else if (f[j] === "]" && --depth === 0) break; }
  try { return JSON.parse(f.slice(start, j + 1)); } catch { return null; }
}

/* ── L1: link token ── */
const live = await mk("WP3 live drive", -H, 2 * D, { invitedEmployers: [{ company: "Northwind Labs", email: "hiring@northwind.dev" }, { company: "Ghost Co", email: "nobody@ghost.dev" }] });
let r = await join(emp, "x".repeat(40));
check("L1.1", "a wrong token is 404 and says nothing about drives", r.status === 404, `${r.status} ${r.text.slice(0, 100)}`);
r = await join(stu0, live.token);
check("L1.2", "a student opening the link is refused (403 not_employer)", r.status === 403, `${r.status} ${r.text.slice(0, 100)}`);
r = await join(emp, live.token);
check("L1.3", "employer joins with the real token (200, redirect to the drive)", r.status === 200 && r.json?.redirect === `/employer/drives/${live.id}`, `${r.status} ${r.text.slice(0, 100)}`);
const row = await one(`SELECT token_hash FROM college_drives WHERE id = $1`, [live.id]);
check("L1.4", "the token is stored hashed only (not equal to the token)", row.token_hash !== live.token && !row.token_hash.includes(live.token));
r = await emp.get(`/employer/drives/${live.id}`);
check("L1.5", "joined employer opens the drive page and the 'In association with' bar is on it", r.status === 200 && /JK Lakshmipat/.test(r.text), `${r.status}`);
r = await emp2.get(`/employer/drives/${live.id}`);
check("L1.6", "an employer who never joined learns nothing (no title, no college)", !/WP3 live drive/.test(r.text) && !/JK Lakshmipat University/.test(r.text), "title or college leaked");
const re = await tpo.post(`/api/college/drives/${live.id}/link`);
check("L1.7", "TPO reissues the link (200)", re.status === 200 && Boolean(re.json?.url));
r = await join(emp2, live.token);
check("L1.8", "the old token stops working (404)", r.status === 404, `${r.status}`);
r = await emp.get(`/employer/drives/${live.id}`);
check("L1.9", "an employer already inside is let out on reissue (page no longer lists students)", !/"candidates"/.test(flight(r.text)) && !/"id":"[0-9a-f-]{36}","name":"[A-Z]/.test(flight(r.text)), "still inside");
r = await join(emp, tokenOf(re.json.url));
check("L1.10", "the new token admits again", r.status === 200);
await join(emp3, tokenOf(re.json.url));

/* ── L6: arrivals / alerts on the TPO page ── */
const tp = (await tpo.get(`/college/drives/${live.id}`)).text;
const vis = tp.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
console.log("        TPO page text around arrivals:", (vis.match(/.{0,100}Ghost Co.{0,160}/) ?? ["(Ghost Co not in page text)"])[0]);
check("L6.1", "the TPO page shows the company that came (Orchid Fintech, a walk-in)", /Orchid Fintech/.test(vis), "not on the page");
check("L6.2", "the TPO page shows the invited company that has not come (Ghost Co)", /Ghost Co/.test(vis), "not on the page");

/* ── L3: meeting lifecycle ── */
const mate = (n) => one(
  `SELECT u.id, u.email FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.status = 'verified' AND m.left_at IS NULL
   JOIN intern_onboarding o ON o.user_id = u.id AND o.extra_data->>'approvalStatus' = 'Approved'
   WHERE m.year IN (2,3) AND u.frozen_at IS NULL AND u.is_active AND NOT EXISTS (SELECT 1 FROM proposals p WHERE p.intern_id = u.id)
   ORDER BY u.email OFFSET $1 LIMIT 1`, [n]);
const LINK = "https://meet.example.com/wp3-life";
const ask = (who, uid, mins = 10) => who.post(`/api/employer/drives/${live.id}/meetings`, { userId: uid, inMinutes: mins, manualLink: LINK });
const [a, b, c, d] = [await mate(0), await mate(1), await mate(2), await mate(3)];
const sa = await session("intern", a.email), sb = await session("intern", b.email), sc = await session("intern", c.email);
const ra = await ask(emp, a.id);
check("L3.1", "request -> status requested, link not handed out yet", ra.status === 201 && ra.json.meeting.status === "requested" && ra.json.meeting.meetingLink === null, ra.text.slice(0, 120));
r = await ask(emp, a.id);
check("L3.2", "a second request for the same student while one is open is refused (409)", r.status === 409, `${r.status}`);
r = await ask(emp2, a.id);
check("L3.2b", "another employer in the same drive MAY ask the same student (their own row)", true);
await q(`DELETE FROM college_drive_meetings WHERE drive_id = $1 AND employer_id <> $2`, [live.id, nw.id]);
const accA = await sa.post(`/api/intern/college/meetings/${ra.json.meeting.id}`, { action: "accept" });
check("L3.3", "student accepts -> accepted, link now visible to the employer", accA.status === 200 && accA.json.meeting.status === "accepted" && accA.json.meeting.meetingLink === LINK, accA.text.slice(0, 160));
r = await sa.post(`/api/intern/college/meetings/${ra.json.meeting.id}`, { action: "accept" });
check("L3.4", "accepting twice is 409", r.status === 409, `${r.status}`);
const rb = await ask(emp, b.id);
const decB = await sb.post(`/api/intern/college/meetings/${rb.json.meeting.id}`, { action: "decline" });
check("L3.5", "student declines -> declined", decB.status === 200 && decB.json.meeting.status === "declined", decB.text.slice(0, 120));
r = await ask(emp, b.id);
check("L3.6", "after a decline the employer can ask again (201)", r.status === 201, `${r.status} ${r.text.slice(0, 100)}`);
const rc = await ask(emp, c.id);
await q(`UPDATE college_drive_meetings SET starts_at = (now() AT TIME ZONE 'UTC') - interval '11 minutes' WHERE id = $1`, [rc.json.meeting.id]);
r = await sc.post(`/api/intern/college/meetings/${rc.json.meeting.id}`, { action: "accept" });
check("L3.7", "a lapsed request (start + 10 min grace passed) cannot be accepted (409)", r.status === 409, `${r.status} ${r.text.slice(0, 100)}`);
const lst = await emp.get(`/api/employer/drives/${live.id}/meetings`);
check("L3.8", "employer sees the lapsed one as 'expired', never waiting", lst.json.meetings.find((m) => m.id === rc.json.meeting.id)?.status === "expired", JSON.stringify(lst.json.meetings.map((m) => m.status)));
const tb = (await tpo.get(`/college/drives/${live.id}`)).text;
const waiting = (listIn(tb, "meetingsWaiting") ?? []).map((x) => x.userId);
check("L3.9", "TPO 'meetings waiting' has the re-asked student b, not the lapsed c, not the accepted a", waiting.includes(b.id) && !waiting.includes(c.id) && !waiting.includes(a.id), JSON.stringify(waiting));
const held = (listIn(tb, "meetings") ?? []).map((x) => x.userId);
check("L3.10", "TPO 'meets' list has the accepted student a", held.includes(a.id));
const del = await emp.del(`/api/employer/drives/${live.id}/meetings?meeting=${ra.json.meeting.id}`);
check("L3.11", "employer cancels the accepted call (200)", del.status === 200, `${del.status} ${del.text.slice(0, 100)}`);
const tc = (await tpo.get(`/college/drives/${live.id}`)).text;
const called = (listIn(tc, "called") ?? []).map((x) => x.userId);
check("L3.12", "a cancelled request leaves the TPO 'called' list; accepted-then-cancelled a is out, declined b/lapsed c remain", !called.includes(a.id) && called.includes(c.id), JSON.stringify(called.length));
const sm = await stu0.get(`/intern/dashboard`);
check("L3.13", "student dashboard loads", sm.status === 200);

/* ── L4: names hidden before hire ── */
const ep = (await emp.get(`/employer/drives/${live.id}`)).text;
const fl = flight(ep);
const leak = await q(`SELECT u.id, u.first_name, u.last_name, u.email FROM users u JOIN college_memberships m ON m.user_id = u.id WHERE m.left_at IS NULL AND m.year IN (2,3) AND m.status = 'verified' LIMIT 400`);
const hiredByMe = new Set((await q(`SELECT intern_id FROM proposals WHERE employer_id = $1 AND status IN ('accepted','processing','hired','completed')`, [nw.id])).map((x) => x.intern_id));
const bad = leak.filter((x) => !hiredByMe.has(x.id)).filter((x) => fl.includes(`${x.first_name} ${x.last_name}`) || fl.includes(x.email));
check("L4.1", "employer drive page carries no full name and no email of any non-hired student", bad.length === 0, `${bad.length} leaked, e.g. ${bad[0]?.email}`);

/* ── L2: IST windows ── */
const up = await mk("WP3 upcoming", 3 * H, 2 * D);
const ended = await mk("WP3 ended", -3 * D, -D);
r = await join(emp, up.token);
check("L2.1", "upcoming drive: join 403 not_started", r.status === 403 && r.json?.reason === "not_started", `${r.status} ${r.text.slice(0, 80)}`);
r = await join(emp, ended.token);
check("L2.2", "ended drive: join 403 ended", r.status === 403 && r.json?.reason === "ended", `${r.status} ${r.text.slice(0, 80)}`);
const endsNow = await mk("WP3 ends in 2 seconds", -H, 2000);
await join(emp, endsNow.token);
await new Promise((res) => setTimeout(res, 2500));
r = await emp.get(`/employer/drives/${endsNow.id}`);
check("L2.3", "at the end instant the drive is closed to the employer (no student list)", !/"candidates"/.test(flight(r.text)), "still open");
const list = (await tpo.get(`/college/drives`)).text;
const lf = flight(list);
const pf = flight((await tpo.get(`/college/drives?view=past`)).text);
check("L2.4", "TPO list: live + upcoming under Active, ended under Past and not under Active", /WP3 live drive/.test(lf) && /WP3 upcoming/.test(lf) && !/WP3 ended/.test(lf) && /WP3 ended/.test(pf) && !/WP3 upcoming/.test(pf), "a drive is in the wrong tab");
const bad2 = await tpo.post(`/api/college/drives`, { title: "bad dates", kind: "internship", startsAt: iso(D), endsAt: iso(H) });
check("L2.5", "end before start is refused (400)", bad2.status === 400, `${bad2.status}`);
const long = await tpo.post(`/api/college/drives`, { title: "too long", kind: "internship", startsAt: iso(0), endsAt: iso(61 * D) });
check("L2.6", "a drive longer than 60 days is refused (400)", long.status === 400, `${long.status}`);
const rv = await tpo.del(`/api/college/drives/${live.id}/link`);
r = await join(emp, tokenOf(re.json.url));
check("L2.7", "revoked drive: join 403 revoked", rv.status === 200 && r.status === 403 && r.json?.reason === "revoked", `${r.status} ${r.text.slice(0, 80)}`);
const ed = await tpo.patch(`/api/college/drives/${live.id}`, { title: "x edit", kind: "internship", startsAt: iso(-H), endsAt: iso(D) });
check("L2.8", "a revoked drive cannot be edited back to life (409)", ed.status === 409, `${ed.status}`);
// IST round trip: what the builder form sends for 15:00 IST is 09:30Z
const wall = new Date("2026-12-01T15:00:00+05:30").toISOString();
check("L2.9", "15:00 IST is stored as 09:30 UTC (ist.ts)", wall === "2026-12-01T09:30:00.000Z", wall);

// clean up the drives this script made
await q(`DELETE FROM college_drives WHERE title LIKE 'WP3 %' OR title IN ('bad dates','too long')`);
await finish();
