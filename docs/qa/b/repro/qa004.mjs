import { open, shot, text, pick } from "./lib.mjs";
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const s = await open({ port: PORT, ...pick("intern"), width: 1440, name: `qa-004-${PORT}` });
for (const r of ["/intern/dashboard", "/intern/record", "/intern/profile", "/intern/interviews"]) {
  await s.page.goto(s.url(r), { waitUntil: "networkidle" });
  const t = await text(s);
  const m = [...t.matchAll(/(Findtern score|score|Coding|Communication|Aptitude|Domain|Technical)[^0-9]{0,25}(\d{1,2}(?:\.\d)?)/gi)].map((x) => `${x[1]} ${x[2]}`);
  console.log(r.padEnd(20), [...new Set(m)].slice(0, 12).join(" | "));
  if (r === "/intern/record") await shot(s, `qa-004-record-${PORT}`, { fullPage: false });
  if (r === "/intern/dashboard") await shot(s, `qa-004-dashboard-${PORT}`, { fullPage: false });
}
await s.close();
