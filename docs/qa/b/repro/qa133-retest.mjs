// Tester B, 28 Oct: retest of QA-133 (seed writes the app's day words): tallies on the seeded sheets after `npm run qa:seed`.
import { open, shot, pick } from "./lib.mjs";
for (const [w, engine] of [[1440, "chromium"], [375, "webkit"]]) {
  const s = await open({ port: 3502, ...pick("employer"), width: w, height: w < 500 ? 812 : 900, engine, name: `qa133r-${engine}-${w}` });
  const T = async (p) => { await s.page.goto(s.url(p), { waitUntil: "networkidle" }); return (await s.page.locator("main").innerText()).replace(/\s+/g, " "); };
  const list = await T("/employer/timesheets");
  console.log(engine, w, "LIST:", list.match(/\d+ \/ \d+ days present · \d+ h[^]{0,30}/g));
  const id = process.env.SHEET ?? "2c37daaa-a2f1-45d7-8f86-ff066b452b5f";
  const d = await T(`/employer/timesheets/${id}`);
  console.log(engine, w, "DETAIL:", d.match(/Present \d+ Hours \d+ Absent \d+ Off \/ holiday \d+/)?.[0], "|", d.match(/\d+ days[^.]{0,40}/)?.[0], "| week 2:", d.match(/Present \d+ Hours \d+ Not filled \d+/g)?.slice(0, 3));
  await shot(s, `qa133r-${engine}-${w}-detail`, { fullPage: false });
  await s.close();
}
