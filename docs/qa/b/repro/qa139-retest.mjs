// Tester B, 28 Oct: retest of QA-139 (a Pay link pays the placement it names, or says it can't).
// Usage: node qa139-retest.mjs [chromium|webkit] ; runs the live-copy employer (hired-unpaid + monthly placement) and a seed employer with accepted offers.
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium";
const T = async (s, p) => { await s.page.goto(s.url(p), { waitUntil: "networkidle" }); await s.page.waitForTimeout(300); return (await s.page.locator("main").innerText()).replace(/\s+/g, " "); };
for (const [label, port, email, password] of [["live-copy Neha", 3502, "neha@acmerobotics-launchtest.in", "Launch#2026pw"], ["seed Swiggy", 3503, "careers@swiggy-labs.dev", "Findtern@2026"]]) {
  const s = await open({ port, role: "employer", email, password, width: 375, height: 812, engine, name: `qa139r-${engine}-${port}` });
  console.log(`\n=== ${label} (${engine})`);
  const o = await T(s, "/employer/orders");
  console.log("orders lede:", o.match(/Orders & payments[^]{0,200}/)?.[0]);
  const pays = await s.page.locator("main a, main button").evaluateAll((es) => es.filter((e) => /^Pay\b/.test(e.innerText.trim())).map((e) => ({ text: e.innerText.trim(), href: e.getAttribute("href") })));
  console.log("Pay controls on Orders:", JSON.stringify(pays));
  const rows = await s.page.locator("main").evaluate((m) => [...m.querySelectorAll("li, tr, article")].filter((r) => /Not paid|Paid|Accepted|Monthly/.test(r.innerText) && r.innerText.length < 400).map((r) => r.innerText.replace(/\s+/g, " ").slice(0, 110)).slice(0, 6));
  console.log("rows:", rows);
  let i = 0;
  for (const p of pays) {
    const t = await T(s, p.href);
    console.log(`  → ${p.text}: ${t.replace(/^Checkout /, "").slice(0, 330)}`);
    await shot(s, `qa139r-${engine}-${port}-pay-${i++}`, { fullPage: false });
  }
  // a named proposal that is not payable: use an id from the hired row without a Pay control
  const ids = await s.page.evaluate(() => [...document.querySelectorAll("a[href*='proposal=']")].map((a) => a.getAttribute("href")));
  console.log("errors:", [...new Set(s.errors)].slice(0, 2));
  await s.close();
}
