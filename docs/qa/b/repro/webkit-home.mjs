import { open, shot } from "./lib.mjs";
const W = Number(process.argv[2] ?? 375);
for (let i = 0; i < 3; i++) {
  const s = await open({ port: 3502, width: W, engine: "webkit", name: `webkit-home-${W}-${i}` });
  try {
    await s.page.goto(s.url("/"), { waitUntil: "load", timeout: 30000 });
    await s.page.waitForTimeout(3000);
    console.log(`run ${i} ${W}px: ok`, await s.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth })));
    if (i === 0) await shot(s, `webkit-home-${W}`, { fullPage: false });
  } catch (e) { console.log(`run ${i} ${W}px: ${e.message.split("\n")[0]}`); }
  await s.close().catch(() => {});
}
