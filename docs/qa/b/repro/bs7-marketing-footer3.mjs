import { open } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
const s = await open({ port: 3502, width: 375, height: 667, name: `bs7mk-footer3` });
await s.page.goto(s.url("/faq"), { waitUntil: "networkidle" });
await s.page.waitForTimeout(3000);
await s.page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await s.page.waitForTimeout(500);
await s.page.screenshot({ path: join(SHOTS, "bs7mk-footer-overlap-faq-375x667.png") });
await s.close();
