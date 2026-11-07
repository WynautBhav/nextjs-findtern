// Pure project lifecycle rules. No DB.
export const MAX_SKILLS_PER_PROJECT = 7;

export type CanonicalProjectStatus = "draft" | "pending_review" | "published" | "paused" | "closed" | "rejected";
export type LegacyProjectStatus = "active" | "inactive" | "archived";
export type ProjectStatus = CanonicalProjectStatus | LegacyProjectStatus;
export type LifecycleRole = "employer" | "admin";

const LEGACY: Record<LegacyProjectStatus, CanonicalProjectStatus> = {
  active: "published",
  inactive: "paused",
  archived: "closed",
};
const CANON = new Set<string>(["draft", "pending_review", "published", "paused", "closed", "rejected"]);

export function normalizeStatus(s: string | null | undefined): CanonicalProjectStatus | null {
  if (!s) return null;
  if (CANON.has(s)) return s as CanonicalProjectStatus;
  return Object.hasOwn(LEGACY, s) ? LEGACY[s as LegacyProjectStatus] : null;
}

const EMPLOYER_EDGES: ReadonlySet<string> = new Set([
  "draft>pending_review",
  "pending_review>draft",
  "published>paused",
  "paused>published",
  "published>closed",
  "paused>closed",
  "rejected>draft",
]);
const ADMIN_EDGES: ReadonlySet<string> = new Set([
  "pending_review>published",
  "pending_review>rejected",
  "published>closed",
  "paused>closed",
]);

export function canTransition(from: string, to: string, actorRole: LifecycleRole): boolean {
  const f = normalizeStatus(from);
  const t = normalizeStatus(to);
  if (!f || !t || f === t) return false;
  const edge = `${f}>${t}`;
  if (actorRole === "employer") return EMPLOYER_EDGES.has(edge);
  if (actorRole === "admin") return t === "closed" || ADMIN_EDGES.has(edge);
  return false;
}

export function transitionError(
  from: string,
  to: string,
  role: LifecycleRole,
  opts: { reason?: string | null } = {},
): string | null {
  const f = normalizeStatus(from);
  const t = normalizeStatus(to);
  if (!f) return `Unknown current status "${from}".`;
  if (!t) return `Unknown target status "${to}".`;
  if (!canTransition(f, t, role)) return `A ${role} cannot move a project from ${f} to ${t}.`;
  if (role === "admin" && t === "rejected" && !opts.reason?.trim()) return "A rejection needs a reason.";
  return null;
}

export function isVisibleToInterns(status: string | null | undefined): boolean {
  return normalizeStatus(status) === "published";
}

export function isEditableByEmployer(status: string | null | undefined): boolean {
  const s = normalizeStatus(status);
  return s === "draft" || s === "rejected" || s === "paused";
}

/** Fields (projects columns) an employer may change while a project is published. */
export const EDITABLE_WHILE_PUBLISHED = ["scopeOfWork", "preferredLocations", "fullTimeOffer"] as const;

export interface SubmitReadinessInput {
  projectName?: string | null;
  scopeOfWork?: string | null;
  skills?: string[] | null;
  locationType?: string | null;
}

/** Missing or invalid fields blocking submit for review. Empty array means ready. */
export function submitReadiness(p: SubmitReadinessInput): string[] {
  const missing: string[] = [];
  if (!p.projectName?.trim()) missing.push("title");
  if (!p.scopeOfWork?.trim()) missing.push("description");
  const n = (p.skills ?? []).filter((s) => typeof s === "string" && s.trim()).length;
  if (n < 1) missing.push("skills");
  else if (n > MAX_SKILLS_PER_PROJECT) missing.push(`skills (at most ${MAX_SKILLS_PER_PROJECT})`);
  if (!p.locationType?.trim()) missing.push("locationType");
  return missing;
}
