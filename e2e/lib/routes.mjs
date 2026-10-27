/**
 * The route list, derived from src/app/**\/page.tsx so it cannot drift, and
 * the real ids for dynamic segments, read from the QA database.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { ARTIFACTS, ROOT } from "./env.mjs";
import { one, rows } from "./db.mjs";

const APP = join(ROOT, "src", "app");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name === "page.tsx") out.push(p);
  }
  return out;
}

/** "/employer/proposal/[id]" for src/app/(x)/employer/proposal/[id]/page.tsx */
export function appRoutes() {
  return walk(APP)
    .map((f) => {
      const segs = relative(APP, join(f, "..")).split(sep).filter((s) => s && !/^\(.*\)$/.test(s));
      return "/" + segs.join("/");
    })
    .sort();
}

const PUBLIC_AUTH = new Set([
  "/admin/login",
  "/employer/login",
  "/employer/signup",
  "/employer/forgot-password",
  "/employer/reset-password",
  "/employer/verify-email",
  "/college/login",
]);

/** intern | employer | admin | public (marketing + auth pages, no session needed) */
export function roleOf(route) {
  if (PUBLIC_AUTH.has(route)) return "public";
  if (route.startsWith("/admin")) return "admin";
  if (route.startsWith("/employer")) return "employer";
  if (route === "/college" || route.startsWith("/college/")) return "college";
  if (route.startsWith("/intern/") && !["/intern-nda", "/intern-terms-and-conditions"].includes(route)) return "intern";
  return "public";
}

export const isDynamic = (route) => route.includes("[");

/**
 * Concrete values for a dynamic route, for one persona. First value is the
 * "primary" (run at every width); the rest are extra data situations.
 */
export async function dynamicValues(route, persona, ids) {
  const email = persona?.email;
  const employerId = email ? (await one(`SELECT id FROM employers WHERE lower(company_email) = lower($1)`, [email]))?.id : null;
  const internId = email ? (await one(`SELECT id FROM users WHERE lower(email) = lower($1)`, [email]))?.id : null;
  const col = async (sql, params) => (await rows(sql, params)).map((r) => r.v).filter(Boolean);

  switch (route) {
    case "/admin/companies/[id]":
      return [ids.employerMain, ids.employerHeavy, ids.employerLong, ids.employerUsd, ids.employerEmpty];
    case "/admin/interns/[id]":
      return [ids.internHired, ids.internHeavy, ids.internLong, ids.internLow, ids.internHidden, ids.internEmpty];
    case "/employer/intern/[id]": {
      if (!employerId) return [];
      return col(`SELECT DISTINCT intern_id AS v FROM proposals WHERE employer_id = $1 LIMIT 3`, [employerId]);
    }
    case "/employer/proposal/[id]":
      return employerId ? col(`SELECT id AS v FROM proposals WHERE employer_id = $1 ORDER BY created_at LIMIT 3`, [employerId]) : [];
    case "/employer/timesheets/[id]":
      return employerId ? col(`SELECT id AS v FROM timesheets WHERE employer_id = $1 ORDER BY created_at LIMIT 2`, [employerId]) : [];
    case "/intern/proposals/[id]":
      return internId ? col(`SELECT id AS v FROM proposals WHERE intern_id = $1 ORDER BY created_at LIMIT 2`, [internId]) : [];
    case "/intern/opportunities/[id]":
    case "/opportunities/[id]":
      return col(`SELECT id AS v FROM projects WHERE status = 'active' ORDER BY created_at DESC LIMIT 2`);
    case "/college/drives/[id]":
      return col(`SELECT id AS v FROM college_drives ORDER BY created_at DESC LIMIT 2`);
    case "/college/students/[id]":
      return col(`SELECT user_id AS v FROM college_memberships WHERE status = 'verified' ORDER BY joined_at LIMIT 2`);
    case "/employer/drives/[id]":
      return employerId ? col(`SELECT drive_id AS v FROM college_drive_employers WHERE employer_id = $1 LIMIT 2`, [employerId]) : [];
    case "/drive/[token]": {
      // The drive token is shown once at creation; seed-colleges writes it to a dev file.
      try {
        const t = JSON.parse(readFileSync(join(ARTIFACTS, "qa-college.json"), "utf8")).token;
        return t ? [t] : [];
      } catch {
        return [];
      }
    }
    case "/blog/[slug]":
      return col(`SELECT slug AS v FROM website_blog_posts ORDER BY created_at DESC LIMIT 2`);
    default:
      return [];
  }
}

export function fill(route, value) {
  return route.replace(/\[[^\]]+\]/, encodeURIComponent(value));
}

/** Ids the seed printed, re-derived from the database so crawl runs stand alone. */
export async function situationIds() {
  const emp = async (e) => (await one(`SELECT id FROM employers WHERE company_email = $1`, [e]))?.id;
  const usr = async (e) => (await one(`SELECT id FROM users WHERE email = $1`, [e]))?.id;
  return {
    employerMain: await emp("neha@acmerobotics-launchtest.in"),
    employerEmpty: await emp("qa.employer.empty@qa.test"),
    employerOne: await emp("qa.employer.one@qa.test"),
    employerHeavy: await emp("qa.employer.heavy@qa.test"),
    employerUsd: await emp("qa.employer.usd@qa.test"),
    employerLong: await emp("qa.employer.longtext@qa.test"),
    internHired: await usr("ritika.launchtest@gmail.com"),
    internEmpty: await usr("qa.intern.empty@qa.test"),
    internOne: await usr("qa.intern.one@qa.test"),
    internHeavy: await usr("qa.intern.heavy@qa.test"),
    internLong: await usr("qa.intern.longtext@qa.test"),
    internLow: await usr("qa.intern.lowscore@qa.test"),
    internHidden: await usr("qa.intern.hidden@qa.test"),
  };
}
