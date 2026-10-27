import { open, shot } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-home-${w}` });
  await s.page.goto(s.url("/"), { waitUntil: "networkidle" });
  await s.page.waitForTimeout(1200);
  const info = await s.page.evaluate(() => {
    const R = (e) => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y + scrollY), w: Math.round(r.width), h: Math.round(r.height) }; };
    const out = {};
    out.videos = [...document.querySelectorAll("video")].map((v) => ({ ...R(v), controls: v.controls, autoplay: v.autoplay, muted: v.muted, loop: v.loop, paused: v.paused, src: (v.currentSrc || "").split("/").pop(), poster: v.poster?.split("/").pop(), cls: v.className.slice(0, 100), parentTag: v.parentElement.tagName, ancestorButtons: [...v.parentElement.querySelectorAll("button")].map((b) => b.getAttribute("aria-label") || b.innerText.trim()), siblingBtns: [...v.closest("section")?.querySelectorAll("button") ?? []].map((b) => (b.getAttribute("aria-label") || b.innerText.trim()).slice(0, 40)) }));
    out.headerLogo = [...document.querySelectorAll("header img, header svg, header a[href='/'] *")].slice(0, 6).map((e) => ({ tag: e.tagName, alt: e.getAttribute("alt"), src: (e.getAttribute("src") || "").slice(0, 120), ...R(e), nat: e.naturalWidth ? `${e.naturalWidth}x${e.naturalHeight}` : null }));
    out.footerLogo = [...document.querySelectorAll("footer img, footer svg")].slice(0, 3).map((e) => ({ tag: e.tagName, alt: e.getAttribute("alt"), src: (e.getAttribute("src") || "").slice(0, 120), ...R(e), nat: e.naturalWidth ? `${e.naturalWidth}x${e.naturalHeight}` : null }));
    out.talk = [...document.querySelectorAll("a,button")].filter((e) => /talk to us/i.test(e.innerText)).map((e) => ({ text: e.innerText.trim(), href: e.getAttribute("href"), ...R(e) }));
    out.askme = [...document.querySelectorAll("button,a")].filter((e) => /ask me/i.test(e.innerText + (e.getAttribute("aria-label") || ""))).map((e) => ({ text: e.innerText.trim().slice(0, 60), aria: e.getAttribute("aria-label"), pos: getComputedStyle(e).position, ...R(e), vy: Math.round(e.getBoundingClientRect().y) }));
    out.mail = [...document.querySelectorAll("a[href^=mailto]")].map((e) => ({ href: e.getAttribute("href"), text: e.innerText.trim() }));
    return out;
  });
  console.log(w, JSON.stringify(info, null, 1));
  await shot(s, `bs7mk-home-top-${w}`, { fullPage: false });
  console.log(s.errors.filter(e=>!/maps|ERR_FAILED/.test(e)));
  await s.close();
}
