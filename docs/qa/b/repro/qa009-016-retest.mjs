// Tester B, 28 Oct: retest QA-009 (hiring speed never negative) and QA-016 (one password rule).
import { open, shot } from "./lib.mjs";
for (const [port, label] of [[3502, "live-copy"], [3503, "fresh-seed"]]) {
  const email = port === 3502 ? "e2e-admin@findtern.test" : "admin@findtern.dev", password = port === 3502 ? "E2e#Admin2026" : "Findtern@2026";
  const s = await open({ port, role: "admin", email, password, name: `qa009-016r-${label}` });
  await s.page.goto(s.url("/admin/dashboard"), { waitUntil: "networkidle" });
  const t = (await s.page.locator("main").innerText()).replace(/\s+/g, " ");
  console.log(label, "QA-009", t.match(/Avg hiring speed[^A-Z]{0,40}[A-Za-z ]{0,30}/)?.[0] ?? "(tile absent)", "| any negative days:", /-\s?\d+(\.\d+)?\s*days?|−\s?\d+(\.\d+)? days?/.test(t));
  await shot(s, `qa009r-dashboard-${label}`, { fullPage: false });
  await s.page.goto(s.url("/admin/account"), { waitUntil: "networkidle" });
  const a = (await s.page.locator("main").innerText()).replace(/\s+/g, " ");
  console.log(label, "QA-016 rule mentions:", (a.match(/[^.]*(characters|at least|uppercase|lowercase|number|symbol|special)[^.]*\./gi) ?? []).map((x) => x.trim()));
  await shot(s, `qa016r-account-${label}`);
  await s.close();
}
