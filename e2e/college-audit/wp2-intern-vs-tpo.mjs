// WP2 C2: for every verified student with an offer, the TPO CSV (offer replies) equals what that student reads on /intern/proposals (accepted+hired, waiting, closed). Needs :3332 and the scratch DB.
import pg from "pg";
import { login, parseCsv } from "./wp2-lib.mjs";
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, options: "-c TimeZone=UTC" }); await db.connect();
const students = (await db.query(`select distinct u.id, u.email from proposals p join users u on u.id=p.intern_id join college_memberships m on m.user_id=p.intern_id and m.status='verified' where p.status<>'draft' order by u.email`)).rows;
const tpo = await login();
const res = await tpo.post("/api/college/students/export", { columns: ["email", "offers", "offerReplies", "hired", "ppo", "meetingsDone", "meetingsNotAccepted", "meetingsMissed", "driveCalls"], userIds: students.map((s) => s.id) });
const [head, ...lines] = parseCsv((await res.text()).replace(/^\uFEFF/, ""));
const tp = new Map(lines.map((l) => [l[0].replace(/^'/, "").toLowerCase(), Object.fromEntries(head.map((h, i) => [h, l[i]]))]));
console.log(head);
const txt = (h) => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
let bad = 0, n = 0; const heads = new Map();
for (const s of students) {
  const st = await login(s.email, "/api/auth/login");
  const t = txt(await (await st.get("/intern/proposals")).text());
  const sect = {}; for (const m of t.matchAll(/\b(Hired|Accepted|Closed|Open|Waiting|Waiting on you|Needs your answer|Lapsed)\s+·\s+(\d+)/g)) sect[m[1]] = (+(sect[m[1]] ?? 0)) + +m[2];
  const waits = t.match(/(\d+) offers? waits? on your answer/);
  const row = tp.get(s.email.toLowerCase());
  const replies = row["Offer replies"] ?? "";
  const pick = (w) => +(replies.match(new RegExp(`(\\d+) ${w}`))?.[1] ?? 0);
  const tpoAcc = pick("accepted"), tpoWait = pick("waiting"), tpoRej = pick("rejected") + pick("deadline missed");
  const internAcc = (sect.Hired ?? 0) + (sect.Accepted ?? 0);
  const internWait = waits ? +waits[1] : 0;
  n++;
  for (const k of Object.keys(sect)) heads.set(k, (heads.get(k) ?? 0) + 1);
  const problems = [];
  if (tpoAcc !== internAcc) problems.push(`accepted TPO ${tpoAcc} intern ${internAcc}`);
  if (tpoWait !== internWait) problems.push(`waiting TPO ${tpoWait} intern ${internWait}`);
  if (tpoRej > (sect.Closed ?? 0)) problems.push(`rejected+lapsed TPO ${tpoRej} > intern Closed ${sect.Closed ?? 0}`);
  if (problems.length) { bad++; console.log("DIFF", s.email, problems.join("; "), "| TPO:", replies, "| intern:", JSON.stringify(sect), waits?.[0] ?? ""); }
}
console.log({ students: n, bad, heads: Object.fromEntries(heads) });
await db.end();
process.exit(bad ? 1 : 0);
