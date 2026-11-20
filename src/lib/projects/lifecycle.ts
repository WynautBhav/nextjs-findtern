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

// Employers publish their own postings: Submit goes draft>published (gated by
// submitReadiness in planTransition). pending_review>published lets the existing
// backlog self-publish. The draft>pending_review edge stays for old clients only;
// no screen uses it.
const EMPLOYER_EDGES: ReadonlySet<string> = new Set([
  "draft>published",
  "pending_review>published",
  "draft>pending_review",
  "pending_review>draft",
  "published>paused",
  "paused>published",
  "published>closed",
  "paused>closed",
  "rejected>draft",
]);
// No admin review: admins only take postings down (anything to closed).
const ADMIN_EDGES: ReadonlySet<string> = new Set([
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
): string | null {
  const f = normalizeStatus(from);
  const t = normalizeStatus(to);
  if (!f) return `Unknown current status "${from}".`;
  if (!t) return `Unknown target status "${to}".`;
  if (!canTransition(f, t, role)) return `A ${role} cannot move a project from ${f} to ${t}.`;
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

/** True when the server refuses a change to this field while the project is published. */
export const isLockedWhilePublished = (field: string): boolean =>
  !(EDITABLE_WHILE_PUBLISHED as readonly string[]).includes(field);

/**
 * What an employer calls each project field. Fields missing here are never named in a message
 * (preferredLocations has no input on the form any more).
 */
export const PROJECT_FIELD_LABELS: Readonly<Record<string, string>> = {
  projectName: "title",
  skills: "skills",
  scopeOfWork: "scope of work",
  fullTimeOffer: "full-time option",
  locationType: "work mode",
  city: "city",
  state: "state",
  pincode: "PIN code",
  timezone: "timezone",
};

const joinWords = (xs: readonly string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`;

/** Plain-language 409 for an edit that touches fields a live project keeps locked. `changed` are raw column names. */
export function publishedLockedMessage(changed: readonly string[]): string {
  const locked = joinWords([...new Set(changed.filter(isLockedWhilePublished).map((k) => PROJECT_FIELD_LABELS[k]).filter(Boolean))]);
  const open = joinWords(EDITABLE_WHILE_PUBLISHED.map((k) => PROJECT_FIELD_LABELS[k]).filter(Boolean).map((l) => `the ${l}`));
  return `This project is live, so its ${locked || "other details"} can't be changed. You can still change ${open}. To change the rest, pause the project first.`;
}

export interface SubmitReadinessInput {
  projectName?: string | null;
  scopeOfWork?: string | null;
  skills?: string[] | null;
  locationType?: string | null;
}

/** Missing or invalid fields blocking submit (publish). Empty array means ready. */
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
