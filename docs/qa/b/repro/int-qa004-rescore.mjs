import { open, shot, pick, pickOr } from "./lib.mjs";
const ID = process.argv[2];
const a = await open({ port: 3502, ...pick("admin"), width: 375, name: "int-qa004-rescore" });
const p = a.page;
await p.goto(a.url(`/admin/interns/${ID}`), { waitUntil: "networkidle" });
for (const [l, v] of [["Communication", "9"], ["Coding", "9"], ["Aptitude", "9"], ["AI interview", "9"]]) await p.getByLabel(l, { exact: true }).fill(v);
await p.getByRole("button", { name: /save ratings and links/i }).click();
await p.waitForTimeout(2000);
console.log("toast/alerts:", JSON.stringify(await p.$$eval("[role=status], [role=alert], [data-sonner-toast]", (e) => e.map((x) => x.textContent.trim()))));
await shot(a, "int-qa004-admin-rescore-375", { fullPage: false });
await p.reload({ waitUntil: "networkidle" });
console.log("score header:", (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " "))).match(/Findtern Score[^A-Z]{0,30}/)?.[0]);
await a.close();
const i = await open({ port: 3502, role: "intern", email: "qa.b.intern.941877@gmail.com", password: "Qa#Tester2026", width: 375, name: "admin-score-intern" });
for (const r of ["/intern/dashboard", "/intern/profile", "/intern/record"]) {
  await i.page.goto(i.url(r), { waitUntil: "networkidle" });
  console.log(r, (await i.page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))).match(/(Findtern Score|SCORE|Coding)[^a-z]{0,20}[0-9.]+/gi)?.slice(0, 4));
}
await i.close();
