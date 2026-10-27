import { open, shot, text, pick } from "./lib.mjs";
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const s = await open({ port: PORT, ...pick("employer"), width: 1440, name: `qa-012-${PORT}` });
await s.page.goto(s.url("/employer/account"), { waitUntil: "networkidle" });
const t = await text(s);
console.log((t.match(/[^.]{0,60}(complete|Complete)[^.]{0,80}/g) ?? []).slice(0, 5));
console.log(await s.page.$$eval("input", (i) => i.filter((x) => /escalation/i.test(x.name + x.id)).map((x) => `${x.name || x.id}=${x.value ? "<filled>" : "<EMPTY>"}`)));
await shot(s, `qa-012-account-${PORT}`);
await s.close();
