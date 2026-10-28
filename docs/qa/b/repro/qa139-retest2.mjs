// Tester B, 28 Oct: QA-139 retest, part 2: open checkout for each named proposal; read the Orders row and the header button.
// Usage: node qa139-retest2.mjs [chromium|webkit]
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium";
const cases = [
  ["live-copy", 3502, "neha@acmerobotics-launchtest.in", "Launch#2026pw", [["Ritika, hired, unpaid", "7883bd3d-96c7-4797-8284-1653ae4ec6dd"], ["Qab, hired, monthly placement", "3df62ca3-f0e0-4b7e-ad4d-b4a4d718b90e"], ["bogus id", "00000000-0000-0000-0000-000000000000"]]],
  ["seed", 3503, "careers@swiggy-labs.dev", "Findtern@2026", [["Neha, accepted", "5dede3a3-9b11-4df1-8102-6a17c73c816c"], ["Bhavna, accepted", "56951289-e790-40bb-8245-b4fa6c4b4fb9"], ["Meera, hired and paid", "fd967dbe-2cb2-4cbf-a193-563e0e2d8f09"]]],
];
for (const [label, port, email, password, list] of cases) {
  const s = await open({ port, role: "employer", email, password, width: 375, height: 812, engine, name: `qa139r2-${engine}-${port}` });
  const T = async (p) => { await s.page.goto(s.url(p), { waitUntil: "networkidle" }); await s.page.waitForTimeout(300); return (await s.page.locator("main").innerText()).replace(/\s+/g, " "); };
  console.log(`\n=== ${label} (${engine})`);
  const o = await T("/employer/orders");
  console.log("Ritika/Orders row text:", o.match(/(Not paid|Paid upfront|Monthly plan)[^]{0,400}/g)?.map((x) => x.slice(0, 400)));
  const hdr = await s.page.locator("main a, main button").evaluateAll((es) => es.filter((e) => /payments? due/.test(e.innerText)).map((e) => `${e.innerText.trim()} → ${e.getAttribute("href")}`));
  console.log("header button:", hdr);
  let i = 0;
  for (const [what, id] of list) {
    const t = await T(`/employer/checkout?proposal=${id}`);
    const links = await s.page.locator("main a").evaluateAll((es) => es.filter((e) => /due|orders|pay|invoice/i.test(e.innerText)).map((e) => `${e.innerText.trim().slice(0, 40)} → ${e.getAttribute("href")}`).slice(0, 3));
    console.log(`- ${what}: ${t.replace(/^Checkout /, "").slice(150, 620)}\n    links: ${JSON.stringify(links)}`);
    await shot(s, `qa139r2-${engine}-${port}-${i++}`, { fullPage: false });
  }
  await s.close();
}
