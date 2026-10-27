import { webkit } from "playwright";
const origin = "http://localhost:3502";
const run = async (label, ctxOpts, setup) => {
  const b = await webkit.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, ...ctxOpts });
  const p = await ctx.newPage();
  if (setup) await setup(p);
  try { await p.goto(origin + "/", { waitUntil: "load", timeout: 25000 }); await p.waitForTimeout(2000); console.log(label, "→ ok"); }
  catch (e) { console.log(label, "→", e.message.split("\n")[0]); }
  await b.close().catch(() => {});
};
await run("JS off + CSS blocked", { javaScriptEnabled: false }, (p) => p.route(/\.css(\?|$)/, (r) => r.abort()));
await run("JS off + only HTML doc (no subresources)", { javaScriptEnabled: false }, (p) => p.route("**/*", (r) => (r.request().resourceType() === "document" ? r.continue() : r.abort())));
await run("/signup same way", { javaScriptEnabled: false }, async (p) => { p.goto = ((g) => (u, o) => g(u.replace(/\/$/, "/signup"), o))(p.goto.bind(p)); });
