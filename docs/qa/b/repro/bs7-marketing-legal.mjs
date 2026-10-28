import { open } from "./lib.mjs";
for (const [route, w] of [["/intern-terms-and-conditions", 1440], ["/intern-terms-and-conditions", 375], ["/terms-and-conditions", 1440], ["/terms-and-conditions", 375], ["/employer-terms-and-conditions", 1440]]) {
  const s = await open({ port: 3502, width: w, name: "bs7mk-legal" });
  await s.page.goto(s.url(route), { waitUntil: "networkidle" }); await s.page.waitForTimeout(500);
  const o = await s.page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const hs = [...main.querySelectorAll("h2,h3,h4")].filter((h) => /^\d+(\.\d+)*\.?\s/.test(h.innerText.trim()));
    const base = Math.round(hs[0]?.getBoundingClientRect().left ?? 0);
    return hs.map((h) => ({ n: h.innerText.trim().match(/^\d+(\.\d+)*/)[0], tag: h.tagName, dx: Math.round(h.getBoundingClientRect().left) - base, fs: getComputedStyle(h).fontSize, text: h.innerText.trim().slice(0, 40) }));
  });
  const lv = {}; for (const h of o) { const d = h.n.split(".").length; (lv[d] ??= new Set()).add(`${h.tag}|dx${h.dx}|${h.fs}`); }
  console.log(route, w, "count", o.length, "levels:", Object.fromEntries(Object.entries(lv).map(([k, v]) => [k, [...v]])));
  const odd = o.filter((h) => { const d = h.n.split(".").length; return d > 1 && h.dx <= 0; });
  console.log("   sub-headings not indented:", odd.map((h) => h.n + " dx=" + h.dx));
  await s.close();
}
