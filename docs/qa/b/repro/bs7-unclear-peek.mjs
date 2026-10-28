// Tester B, 28 Oct: read-only look at where an intern can change preferred locations, and what the profile checklist names.
import { open, pick } from "./lib.mjs";
const s = await open({ port: 3502, ...pick("intern"), width: 1440, name: "bs7-unclear" });
for (const p of ["/intern/settings", "/intern/profile", "/intern/onboarding"]) {
  await s.page.goto(s.url(p), { waitUntil: "networkidle" });
  const t = (await s.page.locator("main").innerText()).replace(/\s+/g, " ");
  console.log(p, "| mentions location:", (t.match(/[^.]{0,60}(preferred location|work mode|remote|hybrid|on-site)[^.]{0,60}/gi) ?? []).slice(0, 3), "| edit controls:", await s.page.getByRole("link", { name: /edit|update|change/i }).allInnerTexts());
}
await s.page.goto(s.url("/intern/profile"), { waitUntil: "networkidle" });
const t = (await s.page.locator("main").innerText()).replace(/\s+/g, " ");
console.log("checklist:", t.match(/(Profile (checklist|complete|strength)|Complete your profile)[^]{0,400}/i)?.[0]);
await s.close();
