// Part B (college screens) of the data-sync oracle: for every student of one college compare DB truth with
//   (a) the TPO master-data CSV export (19 DB-derived columns), (b) the Students page card, (c) the Master data table row,
// and every dashboard / Students / Approvals / Master-data / admin-college tile with its own SQL. Read-only (the export writes one audit row).
import { q, one, session, htmlText, textProblems, cell, rec } from "./sync-lib.mjs";
import { MASTER_COLUMNS, cgpaText } from "../../src/lib/college/master-row.ts";

export function parseCsv(text) {
  const rows = [[]]; let c = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') quoted = false; else c += ch; }
    else if (ch === '"') quoted = true; else if (ch === ",") { rows.at(-1).push(c); c = ""; } else if (ch === "\n") { rows.at(-1).push(c.replace(/\r$/, "")); rows.push([]); c = ""; } else c += ch;
  }
  if (c || rows.at(-1).length) rows.at(-1).push(c);
  return rows.filter((r) => r.length > 1);
}
const ord = (n) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
const t1 = (v) => (v == null || v === "" ? null : cgpaText(Math.round(Number(v) * 100) / 100));
const fix1 = (v) => (v == null || v === "" ? "" : Number(v).toFixed(1));
const cgpaOf = (s) => (s.stype && s.stype !== "cgpa") || !s.score || !/^[0-9]+(\.[0-9]+)?$/.test(s.score) || Number(s.score) > 10 ? null : t1(s.score);
const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const fullName = (s) => `${s.first_name} ${s.last_name}`.replace(/\s+/g, " ").trim();

/** DB truth for every live member of the college (verified and claimed). */
export async function truthFor(collegeId) {
  return q(`SELECT m.user_id id, m.status mstatus, m.year, m.branch mbranch, m.joined_at, u.first_name, u.last_name, lower(u.email) email, u.country_code cc, u.phone_number phone,
      o.extra_data->'academics'->>'degree' degree, o.extra_data->'academics'->>'specialization' spec, o.extra_data->'academics'->>'startYear' sy, o.extra_data->'academics'->>'endYear' ey,
      o.extra_data->'academics'->>'currentSemester' sem, o.extra_data->'academics'->>'score' score, o.extra_data->'academics'->>'scoreType' stype, o.city, o.state, o.skills, o.has_laptop,
      o.extra_data->>'findternScore' fscore, o.extra_data->'ratings' ratings,
      (SELECT roll_no FROM college_roster r WHERE r.college_id = m.college_id AND lower(r.email) = lower(u.email)) roll,
      (SELECT count(*) FROM proposals p WHERE p.intern_id = u.id AND p.status <> 'draft' AND p.employer_id <> 'admin' AND lower(coalesce((SELECT company_email FROM employers e WHERE e.id = p.employer_id),'')) <> 'ai-interview@findtern.ai') offers,
      (SELECT count(*) FROM proposals p WHERE p.intern_id = u.id AND (p.hired_at IS NOT NULL OR p.status IN ('hired','completed')) AND p.employer_id <> 'admin') hired,
      (SELECT coalesce(sum(w.amount_minor),0) FROM college_wallet_entries w WHERE w.intern_id = u.id AND w.college_id = m.college_id AND w.kind = 'incentive') earn
    FROM college_memberships m JOIN users u ON u.id = m.user_id LEFT JOIN intern_onboarding o ON o.user_id = u.id
    WHERE m.college_id = $1 AND m.left_at IS NULL ORDER BY u.email`, [collegeId]);
}

export async function collegeOracle(tag, { collegeId, tpoEmail, admin, sampleCap = Infinity }) {
  const A = "B-college";
  const tpo = await session("college", tpoEmail);
  const truth = await truthFor(collegeId);
  const ver = truth.filter((t) => t.mstatus === "verified");
  const sample = ver.length > sampleCap ? ver.slice(0, sampleCap) : ver;

  // ---- (a) CSV export, per student ----
  const keys = MASTER_COLUMNS.map((c) => c.key);
  const ex = await tpo.post("/api/college/students/export", { columns: keys, userIds: ver.map((v) => v.id) });
  rec(A, `${tag}:export 200`, "master-data export returns 200", ex.status === 200, ex.status);
  const [, ...lines] = parseCsv(ex.text.replace(/^﻿/, ""));
  const byEmail = new Map(lines.map((l) => [l[1].toLowerCase(), Object.fromEntries(keys.map((k, i) => [k, l[i] ?? ""]))]));
  cell("college", "export rows", "csv", ver.length, lines.length, { area: A });
  let bad = 0;
  for (const s of ver) {
    const row = byEmail.get(s.email); const id = s.email;
    if (!row) { cell(id, "row", "csv", "present", "missing", { area: A }); bad++; continue; }
    const exp = {
      name: fullName(s), email: s.email, phone: s.phone ? `+${String(s.cc).replace("+", "")} ${s.phone}` : "", degree: s.degree ?? "", branch: s.mbranch ?? s.spec ?? "",
      startYear: s.sy ?? "", endYear: s.ey ?? "", year: s.year == null ? "" : String(s.year), semester: /^\d+$/.test(s.sem ?? "") ? String(Number(s.sem)) : "",
      city: [s.city, s.state].filter(Boolean).join(", "), cgpa: cgpaOf(s) ?? "",
      laptop: s.has_laptop == null ? "" : s.has_laptop ? "Yes" : "No", skills: (s.skills ?? []).map((x) => x?.name ?? x).join(", "),
      english: fix1(s.ratings?.communication), coding: fix1(s.ratings?.coding), aptitude: fix1(s.ratings?.aptitude), aiInterview: fix1(s.ratings?.interview), score: fix1(s.fscore),
      offers: String(s.offers), hired: Number(s.hired) > 0 ? "Yes" : "No", earningsMinor: (Number(s.earn) / 100).toFixed(2),
    };
    for (const [k, v] of Object.entries(exp)) {
      const got = k === "phone" ? row[k].replace(/^'/, "") : row[k];
      if (!cell(id, k, "csv", v, got, { area: A })) bad++;
    }
  }
  rec(A, `${tag}:export per-student fields`, `CSV: ${ver.length} students x 22 fields equal DB`, bad === 0, `${bad} mismatching cells (see matrix)`);

  // ---- (b) Students page cards ----
  const sp = htmlText((await tpo.get("/college/students")).text);
  const cards = (sp.match(/Findtern score/g) ?? []).length;
  let miss = 0, checked = 0;
  for (const s of sample) {
    const name = fullName(s);
    const i = sp.indexOf(` ${name} `);
    if (i < 0) continue;
    const seg = sp.slice(i, i + 700); checked++;
    const m = seg.match(new RegExp(`^ ${esc(name)} (\\S+) · (\\d)(?:st|nd|rd|th) year · (.+?) (?:\\d+ \\w+ ago|just now|never|—|-).*?(\\+\\d+ \\d+) (\\S+@\\S+) Findtern score (\\S+) CGPA (\\S+)`));
    if (!m) { cell(s.email, "card", "students-page", "parsable", "unparsable: " + seg.slice(0, 80), { area: A }); miss++; continue; }
    const [, roll, yr, br, ph, em, sc, cg] = m;
    for (const [f, e, a] of [["roll", s.roll ?? "", roll], ["year", ord(s.year), ord(Number(yr))], ["branch", s.mbranch ?? s.spec, br], ["phone", `+${String(s.cc).replace("+", "")} ${s.phone}`, ph], ["email", s.email, em], ["score", s.fscore ? fix1(s.fscore) : "—", sc], ["cgpa", cgpaOf(s) ?? "—", cg]])
      if (!cell(s.email, f, "students-page", e, a, { area: A })) miss++;
  }
  rec(A, `${tag}:students page card fields`, `Students page: ${checked} rendered cards (of ${ver.length} verified; page shows ${cards}) equal DB`, miss === 0 && checked > 0, `${miss} mismatching cells, checked ${checked}`);

  // ---- (c) Master data table ----
  const md = htmlText((await tpo.get("/college/master-data")).text);
  let mdMiss = 0, mdChecked = 0;
  for (const s of sample) {
    const name = fullName(s);
    if (!md.includes(` ${name} `)) continue; mdChecked++;
    const want = ` ${name} ${s.degree ?? "-"} ${s.mbranch ?? s.spec ?? "-"} ${s.year ?? "-"} ${cgpaOf(s) ?? "-"} ${s.fscore ? fix1(s.fscore) : "-"} `;
    const at = md.indexOf(` ${name} `);
    if (!cell(s.email, "row(name degree branch year cgpa score)", "master-table", want, md.includes(want) ? want : md.slice(at, at + want.length + 2), { area: A })) mdMiss++;
  }
  rec(A, `${tag}:master table rows`, `Master data table: ${mdChecked} rendered rows equal DB (degree, branch, year, CGPA, score)`, mdMiss === 0 && mdChecked > 0, `${mdMiss} mismatching rows, checked ${mdChecked}`);

  // ---- (d) tiles vs SQL ----
  const live = `m.college_id = $1 AND m.left_at IS NULL`;
  const n = async (s) => Number((await one(s, [collegeId])).n);
  const members = truth.length, verifiedN = ver.length, claimedN = members - verifiedN;
  const leaver = `EXISTS (SELECT 1 FROM users u JOIN college_memberships m ON m.user_id = u.id WHERE lower(u.email) = r.email AND m.college_id = r.college_id AND m.left_at IS NOT NULL) AND NOT EXISTS (SELECT 1 FROM users u JOIN college_memberships m ON m.user_id = u.id WHERE lower(u.email) = r.email AND m.college_id = r.college_id AND m.left_at IS NULL)`;
  const real = `p.employer_id <> 'admin' AND lower(coalesce((SELECT company_email FROM employers e WHERE e.id = p.employer_id), '')) <> 'ai-interview@findtern.ai'`;
  const rosterOnly = await n(`SELECT count(*) n FROM college_roster r WHERE r.college_id = $1 AND NOT (${leaver}) AND NOT EXISTS (SELECT 1 FROM users u JOIN college_memberships m ON m.user_id = u.id AND m.college_id = r.college_id AND m.left_at IS NULL WHERE lower(u.email) = r.email)`);
  const noScore = await n(`SELECT count(*) n FROM college_memberships m LEFT JOIN intern_onboarding o ON o.user_id = m.user_id WHERE ${live} AND m.status = 'verified' AND jsonb_typeof(o.extra_data->'findternScore') IS DISTINCT FROM 'number'`);
  const withOffer = await n(`SELECT count(DISTINCT p.intern_id) n FROM proposals p JOIN college_memberships m ON m.user_id = p.intern_id AND ${live} AND m.status = 'verified' WHERE p.status <> 'draft' AND ${real}`);
  const hiredN = await n(`SELECT count(DISTINCT p.intern_id) n FROM proposals p JOIN college_memberships m ON m.user_id = p.intern_id AND ${live} AND m.status = 'verified' WHERE (p.hired_at IS NOT NULL OR p.status IN ('hired','completed')) AND ${real}`);
  const noAcct = await n(`SELECT count(*) n FROM college_roster r WHERE r.college_id = $1 AND NOT (${leaver}) AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = r.email)`);
  const dash = htmlText((await tpo.get("/college")).text);
  const num = (t, re) => { const m = t.match(re); return m ? Number((m[1] ?? m[2]).replace(/,/g, "")) : null; };
  const T = (screen, what, text, re, want, dflt = null) => cell("college", what, screen, want, num(text, re) ?? dflt, { area: A });
  T("tpo-dashboard", "On your list", dash, /On your list\s+([\d,]+)/, rosterOnly + members);
  T("tpo-dashboard", "Verified on Findtern", dash, /Verified on Findtern\s+([\d,]+)/, verifiedN);
  T("tpo-dashboard", "AI interview done", dash, /AI interview done\s+([\d,]+)/, verifiedN - noScore);
  T("tpo-dashboard", "Got an offer", dash, /Got an offer\s+([\d,]+)/, withOffer);
  T("tpo-dashboard", "Hired", dash, /\bHired\s+([\d,]+)\s/, hiredN);
  T("tpo-dashboard", "AI interview not done", dash, /AI interview not done\s+([\d,]+)/, noScore, 0);
  T("tpo-dashboard", "Not joined yet", dash, /Not joined yet\s+([\d,]+)/, noAcct, 0);
  const sdash = htmlText((await tpo.get("/college/students")).text), appr = htmlText((await tpo.get("/college/approvals")).text);
  T("tpo-students", "Verified students", sdash, /Verified students\s+([\d,]+)/, verifiedN);
  T("tpo-master", "header students", md, /Master data\s+([\d,]+) students|(?:^|[^\d,])([\d,]+) students\./, members);
  T("tpo-master", "waiting for approval", md, /([\d,]+) waiting for your approval/, claimedN, 0);
  T("tpo-approvals", "Waiting for you", appr, /Waiting for you\s+([\d,]+)/, claimedN, 0);
  T("tpo-dashboard", "Waiting for approval tile", dash, /Waiting for approval\s+([\d,]+)/, claimedN, 0);
  if (admin) {
    const ac = htmlText((await admin.get(`/admin/colleges/${collegeId}`)).text);
    T("admin-college", "Students in this college", ac, /Students in this college\s*([\d,]+)/, members);
    const p = textProblems(ac); rec(A, `${tag}:text sanity admin-college`, "no undefined/NaN/raw enums/ungrouped rupees on admin-college", p.length === 0, p.join(" | "));
  }
  for (const [scr, txt] of [["tpo-dashboard", dash], ["tpo-students", sdash], ["tpo-master", md], ["tpo-approvals", appr]]) { const p = textProblems(txt); rec(A, `${tag}:text sanity ${scr}`, `no undefined/NaN/raw enums/ungrouped rupees on ${scr}`, p.length === 0, p.join(" | ")); }
  return { members, verifiedN, claimedN, rosterOnly, noAcct, cards, checked, mdChecked };
}
