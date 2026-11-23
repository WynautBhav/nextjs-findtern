// Checkpoint = "after EVERY step run the oracle for the touched entities". The story driver (sync-story.mjs) calls checkpoint(label, scope) after each step.
//   scope = { collegeId, internIds: [], employerIds: [], proposalIds: [] }   (only the entities the step touched; omit a list to mean none)
// Runs: SQL invariants (whole DB, new rows only vs SYNC_BASELINE) + every role oracle that exists on disk. Each role module exports
//   internOracle(tag, scope) (sync-intern.mjs), employerOracle(tag, scope) (sync-employer.mjs), adminOracle(tag, scope) (sync-admin.mjs: admin + TPO + mail + bells).
// They are read-only: they log in as the roles (sessionAny), fetch screens/APIs, and record every comparison with rec()/cell() from sync-lib.mjs.
import { existsSync } from "node:fs";
import { runInvariants } from "./sync-invariants.mjs";
import { results, rec } from "./sync-lib.mjs";

const here = new URL(".", import.meta.url).pathname;
const MODS = [["sync-intern.mjs", "internOracle"], ["sync-employer.mjs", "employerOracle"], ["sync-admin.mjs", "adminOracle"]];

export async function checkpoint(label, scope = {}, { invariants = true } = {}) {
  const before = results.length, failedBefore = results.filter((r) => !r.ok).length;
  if (invariants) await runInvariants(`cp:${label}`);
  for (const [file, fn] of MODS) {
    if (!existsSync(here + file) || process.env.SYNC_SKIP_ROLES === "1") continue;
    try { const m = await import("./" + file); if (m[fn]) await m[fn](`cp:${label}`, { internIds: [], employerIds: [], proposalIds: [], ...scope }); }
    catch (e) { rec("harness", `cp:${label}:${file}`, `${file} ran without crashing`, false, e.stack?.split("\n").slice(0, 3).join(" | ")); }
  }
  const n = results.length - before, f = results.slice(before).filter((r) => !r.ok).length;
  console.log(`== checkpoint ${label}: ${n} checks, ${n - f} pass, ${f} fail`);
  return { checks: n, fail: f };
}
