// Tester B, 28 Oct: is every admin sidebar item reachable at common laptop heights?
import { open, shot, pick } from "./lib.mjs";
for (const h of [900, 768, 700]) {
  const s = await open({ port: 3502, ...pick("admin"), width: 1440, height: h, name: `adm-nav-${h}` });
  await s.page.goto(s.url("/admin/dashboard"), { waitUntil: "networkidle" });
  const r = await s.page.evaluate(() => {
    const nav = [...document.querySelectorAll("nav")].find((n) => /Dashboard/.test(n.innerText) && /Promo codes/.test(n.innerText));
    const links = [...nav.querySelectorAll("a")];
    let sc = nav; while (sc && !(sc.scrollHeight > sc.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(sc).overflowY))) sc = sc.parentElement;
    const inView = (e) => { const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; };
    return { links: links.length, visible: links.filter(inView).length, hidden: links.filter((l) => !inView(l)).map((l) => l.innerText.trim()), scroller: sc ? `${sc.tagName.toLowerCase()} ${sc.scrollHeight}>${sc.clientHeight} overflow-y:${getComputedStyle(sc).overflowY}` : "none (content clipped, not scrollable)", vh: innerHeight };
  });
  console.log(h, JSON.stringify(r));
  await shot(s, `adm-nav-${h}`, { fullPage: false });
  await s.close();
}
