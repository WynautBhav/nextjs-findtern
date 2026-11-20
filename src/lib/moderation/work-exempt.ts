/**
 * Frozen intern with a running paid hire: the admin decides whether they may keep working (timesheets, stipend view,
 * notifications; see lib/account-restriction.ts). Orchestration only, every side effect behind `deps`, so it runs under plain
 * `node --test` with fakes. The real deps are in work-exempt-db.ts.
 *
 * Default is fully frozen. Nothing here cancels the hire or touches payments. The grant is cleared when the account is unfrozen
 * (standing-db.ts) and is only honoured while a paid hire is still running (the guard asks, lib/auth.ts), so it also lapses by
 * itself when the hire ends. Every grant, revoke and keep-frozen choice is written to the admin audit log with the admin's note.
 */

export const NOTE_MIN = 3;
export const NOTE_MAX = 500;

export type WorkDecision = "grant" | "revoke" | "keep_frozen";
export type RunningHire = { proposalId: string; company: string };

export type WorkTxState = { name: string; frozen: boolean; workExemptAt: Date | null; workDecisionAt: Date | null; reviewNotifiedAt: Date | null };

export type WorkTx = {
  state: WorkTxState;
  set(patch: { workExemptAt?: Date | null; workExemptBy?: string | null; workDecisionAt?: Date | null }): Promise<void>;
  audit(entry: { adminId: string; action: "account.work_exempt_grant" | "account.work_exempt_revoke" | "account.work_exempt_keep_frozen"; meta: Record<string, unknown> }): Promise<void>;
};

export type WorkDeps = {
  /** Locks the intern's row (FOR UPDATE), loads its state, runs `fn` in one transaction. Null when the account does not exist. */
  transaction<T>(internId: string, fn: (tx: WorkTx) => Promise<T>): Promise<T | null>;
  runningHire(internId: string): Promise<RunningHire | null>;
  /** Close the open "decide" alert in the admin inbox for this intern. Best effort. */
  closeAlert(internId: string): Promise<void>;
  now(): Date;
};

export type WorkResult =
  | { ok: true; effect: "granted" | "revoked" | "kept_frozen" | "none"; why?: "already_exempt" | "not_exempt" | "already_decided" }
  | { ok: false; status: 400 | 404 | 409; error: string };

export function cleanNote(raw: unknown): { ok: true; note: string } | { ok: false; error: string } {
  const note = typeof raw === "string" ? raw.trim() : "";
  if (note.length < NOTE_MIN) return { ok: false, error: "Add a short note about why." };
  if (note.length > NOTE_MAX) return { ok: false, error: `Keep the note under ${NOTE_MAX} characters.` };
  return { ok: true, note };
}

export async function decideWork(deps: WorkDeps, input: { internId: string; adminId: string; decision: unknown; note: unknown }): Promise<WorkResult> {
  const decision = input.decision;
  if (decision !== "grant" && decision !== "revoke" && decision !== "keep_frozen") return { ok: false, status: 400, error: "Unknown choice." };
  const note = cleanNote(input.note);
  if (!note.ok) return { ok: false, status: 400, error: note.error };
  const hire = decision === "grant" ? await deps.runningHire(input.internId) : null;
  const now = deps.now();

  const done = await deps.transaction(input.internId, async (tx): Promise<WorkResult> => {
    const s = tx.state;
    if (!s.frozen) return { ok: false, status: 409, error: "This account is not frozen." };
    const meta = { userType: "intern", userId: input.internId, note: note.note };
    if (decision === "grant") {
      if (s.workExemptAt) return { ok: true, effect: "none", why: "already_exempt" };
      if (!hire) return { ok: false, status: 409, error: "This intern has no running internship, so there is nothing to keep working on." };
      await tx.set({ workExemptAt: now, workExemptBy: input.adminId, workDecisionAt: now });
      await tx.audit({ adminId: input.adminId, action: "account.work_exempt_grant", meta: { ...meta, proposalId: hire.proposalId } });
      return { ok: true, effect: "granted" };
    }
    if (decision === "revoke") {
      if (!s.workExemptAt) return { ok: true, effect: "none", why: "not_exempt" };
      await tx.set({ workExemptAt: null, workExemptBy: null, workDecisionAt: now });
      await tx.audit({ adminId: input.adminId, action: "account.work_exempt_revoke", meta });
      return { ok: true, effect: "revoked" };
    }
    // keep_frozen: record the choice; if they had been let work, this is a revoke.
    if (s.workExemptAt) {
      await tx.set({ workExemptAt: null, workExemptBy: null, workDecisionAt: now });
      await tx.audit({ adminId: input.adminId, action: "account.work_exempt_revoke", meta: { ...meta, choice: "keep_frozen" } });
      return { ok: true, effect: "revoked" };
    }
    if (s.workDecisionAt) return { ok: true, effect: "none", why: "already_decided" };
    await tx.set({ workDecisionAt: now });
    await tx.audit({ adminId: input.adminId, action: "account.work_exempt_keep_frozen", meta });
    return { ok: true, effect: "kept_frozen" };
  });
  if (!done) return { ok: false, status: 404, error: "Account not found." };
  if (done.ok && done.effect !== "none") await deps.closeAlert(input.internId).catch((err) => console.error("[work-exempt] could not close the alert", err));
  return done;
}

/* ------------------------------------------------------------------ the alert on freeze */

export type AlertDeps = {
  runningHire(internId: string): Promise<RunningHire | null>;
  /** Marks this freeze as announced; true only for the one caller that did it (so the alert goes out once per freeze). */
  claim(internId: string): Promise<boolean>;
  /** Writes the admin inbox row and sends the (calm, evidence-free) email to the admin alert address. */
  alertAdmins(a: { internId: string; internName: string; company: string }): Promise<void>;
};

/** After an intern is frozen: if a paid hire is still running, tell the admins once and ask them to decide. */
export async function flagRunningHire(deps: AlertDeps, intern: { id: string; name: string }): Promise<{ flagged: boolean; company?: string }> {
  const hire = await deps.runningHire(intern.id);
  if (!hire) return { flagged: false };
  if (!(await deps.claim(intern.id))) return { flagged: false };
  await deps.alertAdmins({ internId: intern.id, internName: intern.name, company: hire.company });
  return { flagged: true, company: hire.company };
}

/** What the admin panel shows for a frozen intern. */
export type WorkPanelState =
  | { kind: "none" }
  | { kind: "pending"; company: string }
  | { kind: "exempt"; company: string; since: Date }
  | { kind: "kept_frozen"; company: string }
  | { kind: "lapsed" };

export function workPanelState(i: { frozen: boolean; workExemptAt: Date | null; workDecisionAt: Date | null; hire: RunningHire | null }): WorkPanelState {
  if (!i.frozen) return { kind: "none" };
  if (!i.hire) return i.workExemptAt ? { kind: "lapsed" } : { kind: "none" };
  if (i.workExemptAt) return { kind: "exempt", company: i.hire.company, since: i.workExemptAt };
  return i.workDecisionAt ? { kind: "kept_frozen", company: i.hire.company } : { kind: "pending", company: i.hire.company };
}
