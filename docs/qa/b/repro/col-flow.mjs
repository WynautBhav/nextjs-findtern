// Tester B, 28 Oct: college admin creates a drive, closes it (in-page confirm), looks at the revoked drive.
// Usage: node col-flow.mjs [chromium|webkit] [375|1440]   (local copy; creates "QA-B drive <n>")
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port: 3502, role: "college", email: "tpo@jklu.edu.in", password: "Findtern@2026", width, height: width < 500 ? 812 : 900, engine, name: `col-flow-${engine}-${width}` });
const { page } = s;
const log = (k, v) => console.log(`${k}: ${typeof v === "string" ? v : JSON.stringify(v)}`);
const reqs = []; page.on("request", (r) => r.method() !== "GET" && reqs.push(`${r.method()} ${new URL(r.url()).pathname}`));
const name = `QA-B drive ${Date.now() % 100000}`;
await page.goto(s.url("/college/drives/new"), { waitUntil: "networkidle" });
log("fields", await page.locator("main input:not([type=hidden]), main textarea, main select").evaluateAll((es) => es.map((e) => `${e.type}:${e.name || e.getAttribute("aria-label") || e.placeholder}:${e.inputMode || "-"}:${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}:${e.value.slice(0, 12)}`)));
await page.getByPlaceholder("e.g. Summer internship drive 2027").fill(name);
const dates = page.locator("main input[placeholder*='DD/MM'], main input[inputmode='numeric']");
log("date-like inputs", await dates.count());
await shot(s, `col-flow-${engine}-${width}-new-filled`, { fullPage: false });
// invalid date check
const closes = page.locator('input[aria-label="Closes (IST), date"]');
const ctr = await closes.count();
log("closes field", ctr);
if (ctr) { await closes.fill("2026-11-05"); await closes.blur(); await page.waitForTimeout(500); log("iso typed into closes", { value: await closes.inputValue(), validity: await closes.evaluate((e) => e.validationMessage) }); await closes.fill("99/99/2026"); await closes.blur(); await page.waitForTimeout(400); log("99/99/2026", { validity: await closes.evaluate((e) => e.validationMessage), aria: await closes.getAttribute("aria-invalid"), text: (await page.locator("main").innerText()).replace(/\s+/g, " ").match(/(valid date|DD\/MM|date)[^.]{0,60}/i)?.[0] }); await closes.fill("05/11/2026"); await closes.blur(); }
await page.getByRole("button", { name: /Create drive|Create|Save/ }).first().click(); await page.waitForTimeout(2500);
log("after create", { url: page.url().replace(s.origin, ""), requests: reqs.slice(-2) });
log("page", (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 420));
await shot(s, `col-flow-${engine}-${width}-created`);
log("errors", [...new Set(s.errors)].filter((e) => !/avatar|googletag|CONNECTION_RESET|TLS/.test(e)).slice(0, 3));
await s.close();
