import { webkit } from "playwright";
const b = await webkit.launch();
const ctx = await b.newContext({ viewport: { width: 375, height: 812 }, javaScriptEnabled: false });
const p = await ctx.newPage();
await p.route("**/*", async (r) => {
  if (r.request().resourceType() !== "document") return r.abort();
  const res = await r.fetch();
  const html = (await res.text()).replace(/<video[\s\S]*?<\/video>/g, "<!--video removed-->");
  console.log("video tags removed:", (html.match(/video removed/g) ?? []).length);
  return r.fulfill({ response: res, body: html });
});
try { await p.goto("http://localhost:3502/", { waitUntil: "load", timeout: 25000 }); console.log("without <video> → ok"); } catch (e) { console.log("without <video> →", e.message.split("\n")[0]); }
await b.close().catch(() => {});
