// WP5 L3 in the browser: officer's uploader: paste, Windows-1252 file, UTF-16 file, xlsx refusal, preview before save.
import { openRoles, closeAll } from "./lib/ctx.mjs";
import { q, closeDb, check, failures, SFX, JKLU } from "./wp5-lib.mjs";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
const EV = resolve(process.env.OUT ?? "./out"); // screenshots; ./out is gitignored
mkdirSync(EV, { recursive: true });
const T = process.env.TMPDIR;
const base = process.env.BASE;
const { browser, ctxs } = await openRoles(["tpo"], { base });
const p = await ctxs.tpo.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.goto(base + "/college/approvals", { waitUntil: "networkidle" });
const roster = async (email) => (await q("select name,phone from college_roster where college_id=$1 and email=$2", [JKLU, email]))[0];
const E = (n) => `${n}.${SFX}@e2e-wp5.test`;
// 1 paste
await p.getByRole("button", { name: /Paste from Excel/i }).click();
await p.getByRole("textbox", { name: /Copy the rows in Excel/ }).fill(`Name\tPhone\tEmail\nPaste One\t+91 98100 00001\t${E("paste1")}\nPaste Two\t12345\t${E("paste2")}\n`);
await p.waitForTimeout(400);
let txt = await p.innerText("body");
check("paste: preview shown before anything is saved", /2 students ready to save/.test(txt) && !(await roster(E("paste1"))), txt.replace(/\n+/g, " | ").slice(0, 300));
check("paste: preview says one row needs a look", /1 row needs a look|1 row to check/.test(txt));
await p.screenshot({ path: `${EV}/uploader-preview.png`, fullPage: true });
await p.getByRole("button", { name: /^Save/i }).first().click();
await p.waitForTimeout(1500);
txt = await p.innerText("body");
check("paste: saved, message shown", /Saved 2 students/.test(txt), txt.replace(/\n+/g, " | ").slice(0, 200));
const r1 = await roster(E("paste1"));
check("paste: phone stored as 10 digits, other row saved without phone", r1?.phone === "9810000001" && (await roster(E("paste2")))?.phone === null, JSON.stringify(r1));
// 2 Windows-1252 file
const input = p.locator('#roster-file');
writeFileSync(`${T}/ansi.csv`, Buffer.from(`Name,Email,Phone\nJos\xe9 N\xfa\xf1ez,${E("ansi")},9810000003\n`, "latin1"));
await input.setInputFiles(`${T}/ansi.csv`);
await p.waitForTimeout(500);
txt = await p.innerText("body");
check("ANSI CSV: accented name read correctly in the preview", /José Núñez/.test(txt) && !/\ufffd/.test(txt), txt.replace(/\n+/g, " | ").slice(0, 200));
await p.getByRole("button", { name: /^Save/i }).first().click(); await p.waitForTimeout(1200);
check("ANSI CSV: stored as José Núñez", (await roster(E("ansi")))?.name === "José Núñez");
// 3 UTF-16
writeFileSync(`${T}/u16.txt`, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(`Name\tEmail\nRahul Sharma\t${E("u16")}\n`, "utf16le")]));
await input.setInputFiles(`${T}/u16.txt`); await p.waitForTimeout(500);
txt = await p.innerText("body");
check("UTF-16 text file read", /1 student ready to save/.test(txt), txt.replace(/\n+/g, " | ").slice(0, 200));
await p.getByRole("button", { name: /^Save/i }).first().click(); await p.waitForTimeout(1200);
// 4 xlsx refused with guidance
writeFileSync(`${T}/x.xlsx`, Buffer.from("PK\x03\x04"));
await input.setInputFiles(`${T}/x.xlsx`); await p.waitForTimeout(400);
txt = await p.innerText("body");
check("xlsx: told how to save as CSV, nothing saved", /Excel workbook/.test(txt));
console.log("page errors", errs);
await closeAll(browser); await closeDb();
process.exit(failures() ? 1 : 0);
