import { open, shot, text } from "./lib.mjs";
import { dump } from "./dump.mjs";
const s = await open({ port: 3502, width: 375, height: 812, name: "bs7-emp-peek" });
const p = s.page;
await p.goto(s.url("/employer/signup"), { waitUntil: "networkidle" });
console.log(JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("input,select,button,a")].filter(e=>e.getBoundingClientRect().width>0).map(e => { const r=e.getBoundingClientRect(); return `${e.tagName}:${e.type||""}:${e.name||e.id}:${(e.getAttribute("aria-label")||e.innerText||e.placeholder||"").slice(0,30)}:im=${e.inputMode}:${Math.round(r.width)}x${Math.round(r.height)}`; })), null, 1));
console.log((await text(s)).slice(0,1500));
await shot(s, "bs7-emp-signup-375", { fullPage: true });
await s.close();
