import { open, shot, pick } from "./lib.mjs";
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const s = await open({ port: PORT, ...pick("admin"), width: 1440, name: `qa-007-projects-${PORT}` });
await s.page.goto(s.url("/admin/projects"), { waitUntil: "networkidle" });
console.log(await s.page.$$eval("table thead th", (t) => t.map((x) => x.innerText.trim())));
console.log(await s.page.$$eval("table tbody tr", (trs) => trs.slice(0, 3).map((tr) => [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim().slice(0, 24)).join(" | "))));
await shot(s, `qa-007-projects-${PORT}`, { fullPage: false });
await s.close();
