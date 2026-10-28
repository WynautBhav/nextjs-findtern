import { open, shot } from "./lib.mjs";
import { body } from "./bs7-employer-lib.mjs";
const s = await open({ port: 3502, role: "intern", email: "qa.b.intern.941877@gmail.com", password: "Qa#Tester2026", width: 1280, height: 900, name: "bs7-offerletter" });
const p = s.page;
await p.goto(s.url("/intern/proposals/3df62ca3-f0e0-4b7e-ad4d-b4a4d718b90e"), { waitUntil: "domcontentloaded" }); await p.waitForTimeout(3500);
console.log((await body(p)).slice(240, 1800));
await shot(s, "bs7-intern-offer-1280", { fullPage: true });
await s.close();
