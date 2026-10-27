/**
 * The accounts the QA crawler signs in as. `seed-situations.mjs` creates them
 * (in a LOCAL database only); `crawl.e2e.mjs` reads this list to log in.
 *
 * role: intern | employer | admin | college (college admin, once WP1 lands)
 * situation: the data shape the account is seeded with, so a page is tested
 *            empty, with one row, with 50+ rows, with hostile text, etc.
 */
export const SITUATION_PASSWORD = "Qa#Situations2026";

export const PERSONAS = [
  // The plan's three logins, rebuilt in the scrubbed copy with the same passwords.
  { key: "intern-hired", role: "intern", situation: "hired", email: "ritika.launchtest@gmail.com", password: "Launch#2026pw" },
  { key: "employer-main", role: "employer", situation: "main", email: "neha@acmerobotics-launchtest.in", password: "Launch#2026pw" },
  { key: "admin", role: "admin", situation: "super", email: "e2e-admin@findtern.test", password: "E2e#Admin2026" },

  { key: "intern-empty", role: "intern", situation: "empty", email: "qa.intern.empty@qa.test", password: SITUATION_PASSWORD },
  { key: "intern-one", role: "intern", situation: "one", email: "qa.intern.one@qa.test", password: SITUATION_PASSWORD },
  { key: "intern-heavy", role: "intern", situation: "heavy", email: "qa.intern.heavy@qa.test", password: SITUATION_PASSWORD },
  { key: "intern-longtext", role: "intern", situation: "longtext", email: "qa.intern.longtext@qa.test", password: SITUATION_PASSWORD },
  { key: "intern-lowscore", role: "intern", situation: "lowscore", email: "qa.intern.lowscore@qa.test", password: SITUATION_PASSWORD },
  { key: "intern-hidden", role: "intern", situation: "hidden", email: "qa.intern.hidden@qa.test", password: SITUATION_PASSWORD },

  { key: "employer-empty", role: "employer", situation: "empty", email: "qa.employer.empty@qa.test", password: SITUATION_PASSWORD },
  { key: "employer-one", role: "employer", situation: "one", email: "qa.employer.one@qa.test", password: SITUATION_PASSWORD },
  { key: "employer-heavy", role: "employer", situation: "heavy", email: "qa.employer.heavy@qa.test", password: SITUATION_PASSWORD },
  { key: "employer-usd", role: "employer", situation: "usd", email: "qa.employer.usd@qa.test", password: SITUATION_PASSWORD },
  { key: "employer-longtext", role: "employer", situation: "longtext", email: "qa.employer.longtext@qa.test", password: SITUATION_PASSWORD },
];

/** The role-level "main" accounts: the full-width matrix runs these. */
export const MAIN_KEYS = ["intern-hired", "employer-main", "admin"];

/** Where each role signs in. */
export const LOGIN = {
  intern: { page: "/login", api: "/api/auth/login", body: (p) => ({ email: p.email, password: p.password }) },
  employer: { page: "/employer/login", api: "/api/auth/employer/login", body: (p) => ({ email: p.email, password: p.password }) },
  admin: { page: "/admin/login", api: "/api/auth/admin/login", body: (p) => ({ email: p.email, password: p.password }) },
};
