/**
 * Account standing rules (policy D5, final). Pure: no database, no clock except where passed in; relative imports only so
 * this runs under plain `node --test`.
 *
 *  - Only an admin action ever creates a strike. Nothing here (or anywhere) punishes automatically.
 *  - A confirmed violation is a `warning` or a `freeze` entry. The FIRST confirmed violation is a WARNING (email + a notice
 *    the person must acknowledge before continuing). The SECOND (any count >= 1) FREEZES the account: login blocked, data
 *    kept, nothing deleted. Strikes never expire, so a violation after an unfreeze freezes again.
 *  - An admin can also freeze directly (severe cases); that counts as a confirmed violation.
 *  - Unfreeze is the admin's call after the person gets in touch. It is not a violation and is audited like the rest.
 *  - Re-clicking is safe: a violation request carries the count the admin saw, and a stale count changes nothing
 *    (otherwise a double click on Warn would escalate to a freeze).
 *  - Applies to interns and employers alike.
 */

export type StrikeKind = "warning" | "freeze" | "unfreeze" | "revoked";
export type StrikeSubject = "intern" | "employer";

export type StrikeEntry = {
  id?: string;
  kind: StrikeKind | string;
  acknowledgedAt?: Date | string | null;
  createdAt?: Date | string | null;
};

/** Reason codes an admin picks; the label is for the admin only. Users are told in general terms, never the code or the evidence. */
export const STRIKE_REASONS = {
  off_platform_contact: "Shared contact details to move the conversation off Findtern",
  payment_outside: "Asked for or offered payment outside Findtern",
  harassment: "Abusive or inappropriate behaviour",
  false_information: "False or misleading information",
  other: "Other breach of the Findtern terms",
} as const;
export type StrikeReason = keyof typeof STRIKE_REASONS;

/** What the PERSON is told, in general terms: never the code, the evidence, a score or a quote. */
export const STRIKE_REASON_PUBLIC: Record<StrikeReason, string> = {
  off_platform_contact: "sharing contact details or moving a conversation away from Findtern",
  payment_outside: "arranging payment outside Findtern",
  harassment: "behaviour that did not meet our conduct standards",
  false_information: "information that was not accurate",
  other: "activity that did not follow our terms of use",
};

export const UNFREEZE_REASONS = {
  contacted_admin: "Person contacted Findtern admin and the matter is settled",
  frozen_in_error: "Frozen in error",
  other: "Other",
} as const;
export type UnfreezeReason = keyof typeof UNFREEZE_REASONS;

export const EVIDENCE_MIN = 5;
export const EVIDENCE_MAX = 2000;

export const isStrikeReason = (v: unknown): v is StrikeReason => typeof v === "string" && Object.hasOwn(STRIKE_REASONS, v);
export const isUnfreezeReason = (v: unknown): v is UnfreezeReason => typeof v === "string" && Object.hasOwn(UNFREEZE_REASONS, v);

/** The evidence note is required (it is what a later admin reads), trimmed, and capped. Returns the cleaned note or an error. */
export function cleanEvidence(raw: unknown): { ok: true; note: string } | { ok: false; error: string } {
  const note = typeof raw === "string" ? raw.trim() : "";
  if (note.length < EVIDENCE_MIN) return { ok: false, error: `Add an evidence note (at least ${EVIDENCE_MIN} characters). Only admins see it.` };
  if (note.length > EVIDENCE_MAX) return { ok: false, error: `The evidence note can be at most ${EVIDENCE_MAX} characters.` };
  return { ok: true, note };
}

/** Confirmed violations on record: warnings and freezes. Unfreezes and revoked entries are not violations. */
export function violationCount(history: StrikeEntry[]): number {
  return history.filter((h) => h.kind === "warning" || h.kind === "freeze").length;
}

export type Standing = {
  violations: number;
  frozen: boolean;
  /** What the next confirmed violation does. */
  next: "warn" | "freeze";
  /** A warning the person has not acknowledged yet (blocks the app behind a notice until they do). */
  pendingWarning: boolean;
};

export function standingOf(history: StrikeEntry[], frozen: boolean): Standing {
  const violations = violationCount(history);
  return { violations, frozen, next: nextForViolations(violations), pendingWarning: pendingWarningIds(history).length > 0 };
}

/** Strike count -> action: 0 -> warn, >= 1 -> freeze. */
export function nextForViolations(violations: number): "warn" | "freeze" {
  return violations >= 1 ? "freeze" : "warn";
}

export type AdminAction = "violation" | "freeze" | "unfreeze";

export type Plan =
  | { effect: "warn" | "freeze" | "unfreeze" }
  | { effect: "none"; why: "stale" | "already_frozen" | "not_frozen" };

/**
 * What an admin click does. `violation` applies the policy (warn, or freeze when one is already on record); `freeze` is the
 * direct freeze; `unfreeze` releases. `expectedViolations` is the count the admin's screen showed: if it moved (a second tab,
 * a double click) nothing happens and the caller reports "already done".
 */
export function planAction(state: Pick<Standing, "violations" | "frozen">, req: { action: AdminAction; expectedViolations: number }): Plan {
  if (req.action === "unfreeze") return state.frozen ? { effect: "unfreeze" } : { effect: "none", why: "not_frozen" };
  if (state.frozen) return { effect: "none", why: "already_frozen" };
  if (req.expectedViolations !== state.violations) return { effect: "none", why: "stale" };
  if (req.action === "freeze") return { effect: "freeze" };
  return { effect: nextForViolations(state.violations) };
}

/** Ids of warnings still waiting to be acknowledged. */
export function pendingWarningIds(history: StrikeEntry[]): string[] {
  return history.filter((h) => h.kind === "warning" && !h.acknowledgedAt && h.id).map((h) => h.id as string);
}

/** Days an open offer or proposal stays paused while one side is frozen; after that the sweeper expires it (decision D3). */
export const HOLD_EXPIRY_DAYS = 14;
export const HOLD_EXPIRY_MS = HOLD_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

/** Whether a freeze that began at `frozenAt` has lasted long enough to lapse the account's unpaid offers. */
export function holdLapsed(frozenAt: Date | string | null | undefined, now: Date = new Date()): boolean {
  if (!frozenAt) return false;
  const t = new Date(frozenAt).getTime();
  return Number.isFinite(t) && now.getTime() - t >= HOLD_EXPIRY_MS;
}

/** The freeze cutoff the sweeper compares `frozen_at` against: frozen at or before this instant means 14 days have passed. */
export function holdCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - HOLD_EXPIRY_MS);
}
