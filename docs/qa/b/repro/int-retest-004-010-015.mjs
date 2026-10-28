// Tester B, 28 Oct: retest of QA-004 (one Findtern Score everywhere), QA-010 (role page for a hired intern), QA-015 (no raw ISO dates on Record).
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 1440);
const s = await open({ port: 3502, role: "intern", email: "ritika.launchtest@gmail.com", password: "Launch#2026pw", width, height: width < 500 ? 812 : 900, engine, name: `int-r-${engine}-${width}` });
const T = async (p) => { await s.page.goto(s.url(p), { waitUntil: "networkidle" }); await s.page.waitForTimeout(400); return (await s.page.locator("main").innerText()).replace(/\s+/g, " "); };
const props = await s.page.request.get(s.url("/intern/proposals")).then(() => null);
const pages = { dashboard: "/intern/dashboard", interviews: "/intern/interviews", profile: "/intern/profile", record: "/intern/record" };
for (const [k, p] of Object.entries(pages)) {
  const t = await T(p);
  console.log(`QA-004 ${k.padEnd(10)} score:`, t.match(/Findtern Score[^0-9]{0,12}(\d+(\.\d)?)/i)?.[1], "| coding:", t.match(/Coding[^0-9]{0,12}(\d+(\.\d)?)/i)?.[1], "| comm:", t.match(/Communication[^0-9]{0,12}(\d+(\.\d)?)/i)?.[1]);
}
await s.page.goto(s.url("/intern/proposals"), { waitUntil: "networkidle" });
const pid = await s.page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).find((h) => /^\/intern\/proposals\/[0-9a-f-]{20,}/.test(h)));
const pt = await T(pid); console.log("QA-004 offer page score:", pt.match(/Findtern Score[^0-9]{0,12}(\d+(\.\d)?)/i)?.[1], "| coding:", pt.match(/Coding[^0-9]{0,12}(\d+(\.\d)?)/i)?.[1]);
const rec = await T("/intern/record");
console.log("QA-015 raw ISO dates on Record:", rec.match(/\b\d{4}-\d{2}-\d{2}\b/g), "| date strings sample:", rec.match(/\b\d{1,2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec) \d{4}\b|\b\d{2}\/\d{2}\/\d{4}\b/g)?.slice(0, 5));
await shot(s, `int-r-${engine}-${width}-record`, { fullPage: false });
// QA-010: the role page for each project the intern has a proposal for
for (const pj of (process.env.PROJECTS ?? "").split(",").filter(Boolean)) {
  const r = await s.page.goto(s.url(`/intern/opportunities/${pj}`), { waitUntil: "networkidle" });
  const t = (await s.page.locator("main").innerText()).replace(/\s+/g, " ");
  console.log("QA-010 role", pj.slice(0, 8), r.status(), "|", t.match(/(You have an offer for this role|You are hired|You're hired|hired|Offer waiting)[^.]{0,80}/i)?.[0] ?? t.slice(0, 120));
  await shot(s, `int-r-${engine}-${width}-role-${pj.slice(0, 6)}`, { fullPage: false });
}
await s.close();
