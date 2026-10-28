// Tester B, 28 Oct: after the root loading.tsx was removed (QA-150), what does a visitor see between a click and the next
// marketing page on a slow phone connection? Samples the page at 0.3, 1, 2.5 s after the click and looks for any busy cue.
// Usage: PORT=3503 node nav-feedback.mjs [chromium]
import { open, shot } from "./lib.mjs";
const port = process.env.PORT ?? 3503;
const s = await open({ port, width: 375, height: 812, name: "nav-feedback" });
const { page } = s;
const cdp = await s.ctx.newCDPSession(page);
await cdp.send("Network.enable");
await page.goto(s.url("/"), { waitUntil: "load" }); await page.waitForTimeout(1500);
// slow 3G-ish plus a 4x CPU slowdown, like the QA harness's slow3g run
await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const probe = () => page.evaluate(() => ({ path: location.pathname, h1: document.querySelector("h1")?.innerText?.slice(0, 40), busy: !!document.querySelector("[aria-busy=true], [role=progressbar], progress, [class*=spinner], [class*=animate-spin], [data-loading], #nprogress"), cursor: getComputedStyle(document.body).cursor, scrollY: Math.round(scrollY) }));
for (const [label, link] of [["header -> Pricing", /^Pricing$/], ["header -> About", /^About/]]) {
  await page.goto(s.url("/faq"), { waitUntil: "load" }).catch(() => {}); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); await page.waitForTimeout(1200);
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 400, downloadThroughput: (400 * 1024) / 8, uploadThroughput: (400 * 1024) / 8 });
  const href = label.includes("Pricing") ? "/pricing" : "/about";
  const t0 = Date.now();
  await page.evaluate((h) => document.querySelector(`a[href="${h}"]`).click(), href);
  const samples = [];
  for (const wait of [300, 700, 1500]) { await page.waitForTimeout(wait); samples.push({ t: Date.now() - t0, ...(await probe().catch(() => ({ err: "navigating" }))) }); }
  await shot(s, `nav-feedback-${label.replace(/\W+/g, "-")}-1s`, { fullPage: false });
  await page.waitForFunction(() => location.pathname !== "/faq", null, { timeout: 30000 }).catch(() => {});
  await page.waitForLoadState("load").catch(() => {});
  console.log(label, JSON.stringify(samples), "| arrived:", Date.now() - t0, "ms");
}
await s.close();
