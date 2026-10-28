import { open, text } from "./lib.mjs";
const s = await open({ port: 3502, width: 1440, name: "bs7mk-days" });
await s.page.goto(s.url("/pricing"), { waitUntil: "networkidle" }); await s.page.waitForTimeout(800);
await s.page.locator("button:has-text('5 days')").first().click(); await s.page.getByText("6 days").click(); await s.page.waitForTimeout(500);
const t = await text(s);
console.log(t.match(/A .{0,40}intern working.{0,400}/)?.[0]);
await s.close();
