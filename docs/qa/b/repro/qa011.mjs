import { open, shot, text, pick } from "./lib.mjs";
const PORT = process.env.PORT ?? (process.env.SEED ? 3503 : 3502);
const s = await open({ port: PORT, ...pick("intern"), width: 1440, name: `qa-011-${PORT}` });
await s.page.goto(s.url("/intern/settings"), { waitUntil: "networkidle" });
const t = await text(s);
console.log((t.match(/(Bank|Account|IFSC|Payout)[^.]{0,160}/gi) ?? []).slice(0, 8));
console.log(await s.page.$$eval("input", (i) => i.filter((x) => /bank|account|ifsc|holder/i.test(x.name + x.id + (x.labels?.[0]?.innerText ?? ""))).map((x) => ({ name: x.name || x.id, value: x.value ? "<filled>" : "<empty>", ro: x.readOnly, dis: x.disabled }))));
await shot(s, `qa-011-settings-${PORT}`);
await s.close();
