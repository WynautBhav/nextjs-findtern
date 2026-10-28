// dump visible form controls with labels/options for the current page (EMAIL for fresh accounts)
export async function dump(p) {
  return p.evaluate(() => {
    const vis = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
    const lab = (e) => (e.labels?.[0]?.innerText || e.getAttribute("aria-label") || e.placeholder || e.name || e.id || "").replace(/\s+/g, " ").trim().slice(0, 60);
    const out = [];
    document.querySelectorAll("main input, main select, main textarea, main [role=radio], main [role=checkbox], main button").forEach((e) => {
      if (!vis(e) && e.type !== "file") return;
      const r = e.getBoundingClientRect();
      const o = { t: e.tagName.toLowerCase() + (e.type && e.tagName === "INPUT" ? ":" + e.type : ""), l: lab(e) || (e.innerText || "").trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) };
      if (e.tagName === "SELECT") o.opts = [...e.options].map((x) => x.text).slice(0, 14).concat(e.options.length > 14 ? [`…(${e.options.length})`] : []);
      if (e.getAttribute("inputmode")) o.im = e.getAttribute("inputmode");
      if (e.tagName === "INPUT" && ["date", "month", "number"].includes(e.type)) o.max = e.max || undefined;
      out.push(o);
    });
    return out;
  });
}
