// usage: [SEED=1] node page.mjs <role> <route> [shotname] [width]  — prints visible text, errors; saves a screenshot
import { open, shot, text, pick } from "./lib.mjs";
const [role, route, name, width] = process.argv.slice(2);
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const s = await open({ port: PORT, ...pick(role), width: Number(width ?? 1440), name: `${name ?? "page"}-${PORT}` });
await s.page.goto(s.url(route), { waitUntil: "networkidle" });
console.log((await text(s)).replace(/^.*?Report a problem Sign out/, "").slice(0, Number(process.env.LEN ?? 1500)));
if (s.errors.length) console.log("ERRORS", s.errors);
if (name) console.log(await shot(s, `${name}-${PORT}`, { fullPage: process.env.FULL === "1" }));
await s.close();
