// usage: [SEED=1] node inspect.mjs <role|anon> <route> [width] [engine] — lists form controls, keyboards, tap targets
import { open, shot, pickOr as pick } from "./lib.mjs";
const [role, route, width = "375", engine = "chromium"] = process.argv.slice(2);
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const s = await open({ port: PORT, ...(role === "anon" ? {} : pick(role)), width: Number(width), engine, name: `inspect-${role}-${Date.now()}` });
await s.page.goto(s.url(route), { waitUntil: "networkidle" });
const info = await s.page.evaluate(() => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== "hidden"; };
  const controls = [...document.querySelectorAll("input,select,textarea,button,a[href]")].filter(vis).map((e) => {
    const r = e.getBoundingClientRect();
    return { tag: e.tagName.toLowerCase(), type: e.getAttribute("type"), name: e.getAttribute("name") || e.id, label: (e.getAttribute("aria-label") || e.labels?.[0]?.innerText || e.innerText || e.placeholder || "").trim().slice(0, 40), inputmode: e.getAttribute("inputmode"), autocomplete: e.getAttribute("autocomplete"), w: Math.round(r.width), h: Math.round(r.height) };
  });
  return { sw: document.documentElement.scrollWidth, iw: innerWidth, controls };
});
console.log(`scrollWidth ${info.sw} / innerWidth ${info.iw}`);
for (const c of info.controls) console.log(JSON.stringify(c));
console.log(s.errors);
await shot(s, `inspect-${role}-${route.replace(/\W+/g, "-")}-${width}`, { fullPage: true });
await s.close();
