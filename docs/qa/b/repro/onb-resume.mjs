import { open, shot, pickOr as pick } from "./lib.mjs";
import { dump } from "./dump.mjs";
const s = await open({ port: 3502, ...pick("intern"), width: Number(process.argv[2] ?? 375), name: "onb-resume" });
await s.page.goto(s.url("/intern/onboarding"), { waitUntil: "networkidle" });
console.log(await s.page.locator("text=/Step \\d of \\d/").first().innerText());
for (const c of await dump(s.page)) console.log(JSON.stringify(c));
await shot(s, "onb-resume", { fullPage: false });
await s.close();
