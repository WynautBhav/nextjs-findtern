// Tester B, 28 Oct: retest of QA-150: an unknown, short, malformed or inactive drive token answers 404; a live one still renders.
// Usage: TOKEN=<live token> node qa150-retest.mjs [chromium|webkit]
import { open, shot } from "./lib.mjs";
import { execFileSync } from "node:child_process";
const engine = process.argv[2] ?? "chromium", token = process.env.TOKEN;
const psql = (q) => execFileSync("psql", ["-h", "localhost", "-p", process.env.PGPORT ?? "5432", "-U", "findtern", "-d", "findtern_seed2", "-At", "-c", q]).toString().trim();
const origin = "http://localhost:3503";
const title = (h) => h.match(/<title>[^<]*<\/title>/)?.[0];
const cases = [["valid live token", token], ["30 x x", "x".repeat(30)], ["made-up 36 chars", "nonexistenttoken1234567890abcdef12"], ["short", "abc"], ["101 chars", "a".repeat(101)], ["percent-encoded nulls", "%00".repeat(10)], ["dots", ".."]];
for (const [label, t] of cases) {
  const r = await fetch(`${origin}/drive/${t}`, { redirect: "manual" });
  const h = await r.text();
  console.log(`curl  ${label.padEnd(22)} → ${r.status} ${title(h)} | not-found text: ${/not found|isn't available|no longer|doesn't exist/i.test(h)} | drive content: ${/Enter drive|inviting employers/i.test(h)}`);
}
// inactive token: deactivate the drive in SQL, check, restore
const col = psql("select column_name from information_schema.columns where table_name='college_drives' and column_name in ('status','is_active','active','closes_at') limit 4").split("\n");
console.log("drive columns:", col);
const s = await open({ port: 3503, width: 375, height: 812, engine, name: `qa150r-${engine}` });
const resp = await s.page.goto(s.url(`/drive/${"x".repeat(30)}`), { waitUntil: "networkidle" });
console.log(engine, "browser unknown token:", resp.status(), "|", (await s.page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 160));
await shot(s, `qa150r-${engine}-unknown`, { fullPage: false });
const ok = await s.page.goto(s.url(`/drive/${token}`), { waitUntil: "networkidle" });
const links = await s.page.getByRole("link", { name: /create an employer account/i }).getAttribute("href");
console.log(engine, "browser live token:", ok.status(), "| signup link:", links);
await shot(s, `qa150r-${engine}-live`, { fullPage: false });
await s.close();
