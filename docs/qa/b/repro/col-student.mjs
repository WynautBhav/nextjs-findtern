// Tester B, 28 Oct: college student detail (first student on /college) + audit. Usage: node col-student.mjs [chromium|webkit] [375|1440]
import { open, shot } from "./lib.mjs";
const engine = process.argv[2] ?? "chromium", width = Number(process.argv[3] ?? 375);
const s = await open({ port: 3502, role: "college", email: "tpo@jklu.edu.in", password: "Findtern@2026", width, height: width < 500 ? 812 : 900, engine, name: `col-student-${engine}-${width}` });
const { page } = s;
await page.goto(s.url("/college"), { waitUntil: "networkidle" });
const links = await page.evaluate(() => [...new Set([...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).filter((h) => /^\/college\/students\/[0-9a-f-]{20,}/.test(h)))]);
console.log("student links on /college:", links.length);
await page.goto(s.url(links[0]), { waitUntil: "networkidle" }); await page.waitForTimeout(400);
const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
console.log("text:", t.slice(0, 700));
const m = await page.evaluate(() => { const e = document.querySelector("main"); return { clip: e.scrollWidth > e.clientWidth + 1 ? [e.scrollWidth, e.clientWidth] : null, small: [...document.querySelectorAll("main a, main button, main input")].filter((x) => { const b = x.getBoundingClientRect(); return b.width > 3 && (b.height < 40 && b.width < 400); }).slice(0, 6).map((x) => `${(x.innerText || x.getAttribute("aria-label") || x.type).trim().slice(0, 22)} ${Math.round(x.getBoundingClientRect().width)}x${Math.round(x.getBoundingClientRect().height)}`) }; });
console.log("audit:", JSON.stringify(m));
await shot(s, `col-${engine}-${width}-student`);
// a student with an offer / meetings, if any: look at names on /college with a status chip
await s.close();
