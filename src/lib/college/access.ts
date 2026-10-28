import type { Role } from "../security/session.ts";
import { tokenMatches } from "./tokens.ts";
import { DASHBOARD_PURPOSE } from "./eligibility.ts";

export { isStudentEligible, readEligibility, normBranch, type DriveEligibility, type StudentFacts } from "./eligibility.ts";

/**
 * Who may see what in College Partners. Pure functions, no I/O: the route
 * handlers load rows and ask these. Covered by
 * src/lib/security/college-access.test.ts.
 *
 * The rules, in one place:
 *  - A drive link admits a signed-in employer, inside the drive's window,
 *    while the drive is not revoked. The token is checked against the stored
 *    hash; afterwards the employer's "joined" row is their pass.
 *  - An employer sees a student only if the student is a verified (or
 *    hand-included) member of the drive's college, consented to drive
 *    visibility, has not left, and meets the cutoffs. Exclude beats include;
 *    include beats cutoffs. Nothing beats the college boundary or consent.
 *  - A college admin sees only their own college's students who consented to
 *    the dashboard purpose. They can never write student data.
 */

type SessionLike = { uid: string; role: Role } | null | undefined;

type DriveLike = {
  collegeId: string;
  startsAt: Date;
  endsAt: Date;
  revokedAt: Date | null;
  tokenHash: string;
  eligibility: Record<string, unknown>;
  includeUserIds: string[];
  excludeUserIds: string[];
};

export type DriveDenial = "sign_in" | "not_employer" | "bad_token" | "revoked" | "not_started" | "ended" | "not_joined";
export type AccessResult = { ok: true } | { ok: false; reason: DriveDenial };

export type DriveWindow = "upcoming" | "live" | "ended" | "revoked";

export function driveWindow(drive: Pick<DriveLike, "startsAt" | "endsAt" | "revokedAt">, now = Date.now()): DriveWindow {
  if (drive.revokedAt && drive.revokedAt.getTime() <= now) return "revoked";
  if (now < drive.startsAt.getTime()) return "upcoming";
  if (now >= drive.endsAt.getTime()) return "ended";
  return "live";
}

/**
 * List order for drives (QA-013: a closed drive sat above the live one):
 * live first, ending soonest; then upcoming, starting soonest; then ended or
 * revoked, most recent first.
 */
export function compareDrives(a: Pick<DriveLike, "startsAt" | "endsAt" | "revokedAt">, b: Pick<DriveLike, "startsAt" | "endsAt" | "revokedAt">, now = Date.now()): number {
  const rank = { live: 0, upcoming: 1, ended: 2, revoked: 2 } as const;
  const wa = driveWindow(a, now);
  const wb = driveWindow(b, now);
  if (rank[wa] !== rank[wb]) return rank[wa] - rank[wb];
  if (wa === "live") return a.endsAt.getTime() - b.endsAt.getTime();
  if (wa === "upcoming") return a.startsAt.getTime() - b.startsAt.getTime();
  return b.endsAt.getTime() - a.endsAt.getTime();
}

function windowDenial(drive: DriveLike, now: number): AccessResult | null {
  const w = driveWindow(drive, now);
  if (w === "revoked") return { ok: false, reason: "revoked" };
  if (w === "upcoming") return { ok: false, reason: "not_started" };
  if (w === "ended") return { ok: false, reason: "ended" };
  return null;
}

/** Opening the share link. */
export function checkDriveLink(input: {
  drive: DriveLike;
  token: string | null | undefined;
  session: SessionLike;
  now?: number;
}): AccessResult {
  const now = input.now ?? Date.now();
  // Token first: a wrong token must not learn anything about the drive.
  if (!tokenMatches(input.token, input.drive.tokenHash)) return { ok: false, reason: "bad_token" };
  const w = windowDenial(input.drive, now);
  if (w) return w;
  if (!input.session) return { ok: false, reason: "sign_in" };
  if (input.session.role !== "employer") return { ok: false, reason: "not_employer" };
  return { ok: true };
}

/** Every drive API call after the link was opened. */
export function checkDriveAccess(input: {
  drive: DriveLike;
  session: SessionLike;
  joined: boolean;
  now?: number;
}): AccessResult {
  const now = input.now ?? Date.now();
  if (!input.session) return { ok: false, reason: "sign_in" };
  if (input.session.role !== "employer") return { ok: false, reason: "not_employer" };
  const w = windowDenial(input.drive, now);
  if (w) return w;
  if (!input.joined) return { ok: false, reason: "not_joined" };
  return { ok: true };
}

/** Whether `email`'s domain is `domain` or a subdomain of it. */
function onDomain(email: string, domain: string): boolean {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const host = email.slice(at + 1).trim().toLowerCase();
  const d = domain.trim().toLowerCase().replace(/^@/, "");
  if (!host || !d) return false;
  return host === d || host.endsWith(`.${d}`);
}

export function membershipFor(input: {
  email: string;
  emailVerified: boolean;
  domains: string[];
  onRoster: boolean;
}): { status: "claimed" | "verified"; verifiedBy: "roster" | "email_domain" | null } {
  if (input.onRoster) return { status: "verified", verifiedBy: "roster" };
  if (input.emailVerified && input.domains.some((d) => onDomain(input.email, d))) {
    return { status: "verified", verifiedBy: "email_domain" };
  }
  return { status: "claimed", verifiedBy: null };
}

/**
 * The only writes a college admin can make. Everything about the student
 * (profile, scores, offers, proposals, membership, recordings) is read-only.
 */
const COLLEGE_ADMIN_WRITES = new Set(["drive:create", "drive:update", "drive:revoke", "roster:import", "nudge:send"]);

export function collegeAdminMay(action: string): boolean {
  return COLLEGE_ADMIN_WRITES.has(action);
}

export function canCollegeAdminSee(
  session: SessionLike,
  adminCollegeId: string,
  student: { collegeId: string; leftAt: Date | null; purposes: readonly string[] },
): boolean {
  if (!session || session.role !== "college") return false;
  if (!adminCollegeId || student.collegeId !== adminCollegeId) return false;
  if (student.leftAt) return false;
  return student.purposes.includes(DASHBOARD_PURPOSE);
}
