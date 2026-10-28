import { open, shot } from "./lib.mjs";
import { join } from "node:path"; import { SHOTS } from "./lib.mjs";
for (const w of [1440, 375]) {
  const s = await open({ port: 3502, width: w, name: `bs7mk-video-${w}` });
  await s.page.goto(s.url("/"), { waitUntil: "networkidle" });
  await s.page.evaluate(() => document.querySelector("video").scrollIntoView({ block: "center" }));
  await s.page.waitForTimeout(3500);
  const info = await s.page.evaluate(() => {
    const v = document.querySelector("video"); const r = v.getBoundingClientRect();
    const sec = v.closest("section") ?? v.parentElement.parentElement;
    const btns = [...document.querySelectorAll("button,[role=button]")].map((b) => (b.getAttribute("aria-label") || b.innerText).trim()).filter((t) => /play|pause|mute|sound|video/i.test(t));
    // elements overlapping the video rect
    const over = [...document.querySelectorAll("body *")].filter((e) => { if (e === v || e.contains(v) || v.contains(e)) return false; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && q.left < r.right && q.right > r.left && q.top < r.bottom && q.bottom > r.top && getComputedStyle(e).display !== "none" && (e.children.length === 0); }).map((e) => `${e.tagName}:${(e.innerText || e.getAttribute("aria-label") || "").trim().slice(0, 40)}`).slice(0, 20);
    return { paused: v.paused, readyState: v.readyState, t: v.currentTime, opacity: getComputedStyle(v).opacity, rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], playPauseButtons: btns, over };
  });
  console.log(w, JSON.stringify(info));
  await s.page.screenshot({ path: join(SHOTS, `bs7mk-video-${w}.png`), fullPage: false });
  await s.close();
}
