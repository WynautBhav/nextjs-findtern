import { open } from "./lib.mjs";
import { body } from "./bs7-employer-lib.mjs";
const intern = await open({ port: 3502, role: "intern", email: "qa.b.intern.941877@gmail.com", password: "Qa#Tester2026", width: 1280, height: 900, name: "bs7-otw-restore" });
const ip = intern.page;
await ip.goto(intern.url("/intern/dashboard"), { waitUntil: "domcontentloaded" }); await ip.waitForTimeout(3000);
const sw = ip.locator("[role=switch]").first();
console.log("before:", await sw.getAttribute("aria-checked"));
if ((await sw.getAttribute("aria-checked")) !== "true") { await sw.click(); await ip.waitForTimeout(2000); }
console.log("after:", await sw.getAttribute("aria-checked"), (await body(ip)).match(/Profile status.{0,120}/)?.[0]);
await intern.close();
