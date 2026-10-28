// Tester B, 28 Oct: QA-134 retest, does the "Avg hiring speed" tile say how many hires it used?
import { open } from "./lib.mjs";
for (const [port, email, password] of [[3502, "e2e-admin@findtern.test", "E2e#Admin2026"], [3503, "admin@findtern.dev", "Findtern@2026"]]) {
  const s = await open({ port, role: "admin", email, password, name: `qa134-${port}` });
  await s.page.goto(s.url("/admin/dashboard"), { waitUntil: "networkidle" });
  console.log(port, (await s.page.locator("main").innerText()).replace(/\s+/g, " ").match(/Avg hiring speed[^]{0,120}/)?.[0]);
  await s.close();
}
