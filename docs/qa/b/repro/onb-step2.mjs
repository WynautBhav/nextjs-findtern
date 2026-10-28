import { open, shot, pickOr as pick } from "./lib.mjs";
import { dump } from "./dump.mjs";
const s = await open({ port: 3502, ...pick("intern"), width: 375, name: "onb-step2" });
const p = s.page;
await p.goto(s.url("/intern/onboarding"), { waitUntil: "networkidle" });
// jump to step 2 through the step list (draft is saved server-side)
await p.getByRole("button", { name: /Step 1 of 8/ }).click();
await p.waitForTimeout(500);
console.log("step list:", await p.$$eval("[role=dialog] button, nav button", (b) => b.map((x) => x.innerText.replace(/\s+/g, " ").trim()).filter(Boolean)));
await shot(s, "onb-steplist-375", { fullPage: false });
await s.close();
