import { open, shot, text, pick } from "./lib.mjs";
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const s = await open({ port: PORT, ...pick("admin"), name: `qa-007-companies-${PORT}` });
await s.page.goto(s.url("/admin/companies"), { waitUntil: "networkidle" });
const rows = await s.page.$$eval("table tbody tr", (trs) => trs.slice(0, 4).map((tr) => ({ cells: [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim()), href: tr.querySelector("a")?.getAttribute("href") })));
console.log(JSON.stringify(rows, null, 1));
console.log("headers:", await s.page.$$eval("table thead th", (t) => t.map((x) => x.innerText.trim())));
await shot(s, `qa-007-companies-list-${PORT}`, { fullPage: false });
for (const r of rows.slice(0, 2)) {
  if (!r.href) continue;
  await s.page.goto(s.url(r.href), { waitUntil: "networkidle" });
  console.log("\nDETAIL", r.href, (await text(s)).replace(/^.*Report a problem Sign out/, "").slice(0, 600));
}
await shot(s, `qa-007-company-detail-${PORT}`, { fullPage: false });
await s.close();
