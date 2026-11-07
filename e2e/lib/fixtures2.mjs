/**
 * Fixtures for the messaging / projects / profile-limit suites (WP-T).
 *
 * Accounts are inserted with SQL (argon2 hash, terms accepted, verified) so the
 * suites do not depend on the mail-OTP signup. Everything carries a run tag and
 * `cleanup()` removes it again. Needs the QA server (TRUST_PROXY=1, see
 * lib/qa-server.mjs) so each login can send its own X-Forwarded-For.
 */
import { randomInt } from "node:crypto";

import { hash } from "@node-rs/argon2";

import { baseUrl } from "./env.mjs";
import { one, rows } from "./db.mjs";
import { loginState } from "./session.mjs";

export const TERMS_VERSION = "2026-11-06"; // src/lib/terms.ts CURRENT_TERMS_VERSION
export const PASSWORD = "Wp-T#2026e2e";
export const RUN = Date.now().toString(36) + randomInt(1000, 9999);
/** Shared-list skills (src/lib/data/skills.ts); 9 of them for the limit tests. */
export const SKILLS = ["Python", "JavaScript", "TypeScript", "React", "Node.js", "Next.js", "HTML", "CSS", "SQL"];

const made = { users: [], employers: [], projects: [], proposals: [] };
let passwordHash;
const pw = async () => (passwordHash ??= await hash(PASSWORD));
const phone = (lead) => `${lead}${randomInt(100_000_000, 999_999_999)}`;

export async function mkIntern(label, { skills = null, bio = null } = {}) {
  const email = `e2e-${label}-${RUN}@gmail.com`;
  const u = await one(
    `INSERT INTO users (first_name,last_name,email,email_verified,phone_number,password,agreed_to_terms,terms_accepted_version,terms_accepted_at,role)
     VALUES ($1,$2,$3,true,$4,$5,true,$6,now(),'intern') RETURNING id`,
    [`Intern${label}`, `Wpt${RUN}`, email, phone(9), await pw(), TERMS_VERSION],
  );
  made.users.push(u.id);
  await one(
    `INSERT INTO intern_onboarding (user_id, bio, skills, location_types) VALUES ($1,$2,$3::jsonb,'["remote"]'::jsonb) RETURNING id`,
    [u.id, bio, JSON.stringify((skills ?? SKILLS.slice(0, 4)).map((name) => ({ name, rating: 2 })))],
  );
  return { id: u.id, email, password: PASSWORD, role: "intern", name: `Intern${label} Wpt${RUN}` };
}

export async function mkEmployer(label) {
  const email = `owner-${label}-${RUN}@e2e${RUN}.example.com`;
  const e = await one(
    `INSERT INTO employers (name,company_name,company_email,email_verified,phone_number,password,agreed_to_terms,terms_accepted_version,terms_accepted_at,
       country,state,city,setup_completed,onboarding_completed)
     VALUES ($1,$2,$3,true,$4,$5,true,$6,now(),'India','Karnataka','Bengaluru',true,true) RETURNING id`,
    [`Emp ${label}`, `Qorvex ${label} ${RUN}`, email, phone(8), await pw(), TERMS_VERSION],
  );
  made.employers.push(e.id);
  return { id: e.id, email, password: PASSWORD, role: "employer", company: `Qorvex ${label} ${RUN}` };
}

/** A project row straight into SQL, in any status (including legacy 'active'). */
export async function mkProject(employerId, name, { status = "published", skills = SKILLS.slice(0, 4), complete = true } = {}) {
  const p = await one(
    `INSERT INTO projects (employer_id,project_name,skills,scope_of_work,location_type,status,timezone)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6,'Asia/Kolkata') RETURNING id`,
    [employerId, name, JSON.stringify(complete ? skills : []), complete ? "short-term" : null, complete ? "remote" : null, status],
  );
  made.projects.push(p.id);
  return p.id;
}

export async function mkProposal(employerId, internId, projectId) {
  const p = await one(
    `INSERT INTO proposals (employer_id,intern_id,project_id,flow_type,status) VALUES ($1,$2,$3,'direct','sent') RETURNING id`,
    [employerId, internId, projectId],
  );
  made.proposals.push(p.id);
  return p.id;
}

/** Log in through the API; returns { ctx, page, state } with the session cookies set. */
export async function signedIn(browser, who, viewport) {
  const state = await loginState(browser, who);
  const ctx = await browser.newContext({ storageState: state, ...(viewport ? { viewport } : { viewport: { width: 1280, height: 900 } }) });
  const page = await ctx.newPage();
  return { ctx, page, state };
}

/** Raw SSE connection from Node (no page, so the layout's own stream is not counted). Resolves once headers arrive. */
export async function openStream(state, headers = {}) {
  const ac = new AbortController();
  const cookie = state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await fetch(new URL("/api/realtime/stream", baseUrl()), { headers: { cookie, ...headers }, signal: ac.signal });
  return { res, close: () => ac.abort() };
}

/** Read an SSE body for `ms`, return the parsed frames [{id,event,data}]. */
export async function collectFrames(res, ms) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const r = await Promise.race([reader.read(), new Promise((ok) => setTimeout(() => ok(null), Math.max(1, end - Date.now())))]);
    if (!r || r.done) break;
    buf += dec.decode(r.value, { stream: true });
  }
  return buf
    .split("\n\n")
    .map((f) => Object.fromEntries(f.split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 1).trim()])))
    .filter((f) => f.id)
    .map((f) => ({ id: Number(f.id), event: f.event, data: JSON.parse(f.data || "{}") }));
}

export async function cleanup() {
  const ids = [...made.users, ...made.employers];
  if (!ids.length) return;
  const t = await rows(`SELECT id FROM threads WHERE employer_id = ANY($1) OR intern_id = ANY($1)`, [ids]);
  const tids = t.map((r) => r.id);
  const steps = [
    [`DELETE FROM messages WHERE thread_id = ANY($1)`, [tids]],
    [`DELETE FROM threads WHERE id = ANY($1)`, [tids]],
    [`DELETE FROM realtime_events WHERE user_id = ANY($1)`, [ids]],
    [`DELETE FROM user_presence WHERE user_id = ANY($1)`, [ids]],
    [`DELETE FROM proposals WHERE employer_id = ANY($1) OR intern_id = ANY($1)`, [ids]],
    [`DELETE FROM projects WHERE employer_id = ANY($1)`, [ids]],
    [`DELETE FROM notifications WHERE recipient_id = ANY($1)`, [ids]],
    [`DELETE FROM intern_onboarding WHERE user_id = ANY($1)`, [ids]],
    [`DELETE FROM users WHERE id = ANY($1)`, [ids]],
    [`DELETE FROM employers WHERE id = ANY($1)`, [ids]],
  ];
  for (const [sql, params] of steps) await rows(sql, params).catch(() => {}); // best effort: a missing table must not mask a failure
}
