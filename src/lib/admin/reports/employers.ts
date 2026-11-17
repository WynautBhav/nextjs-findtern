/** Pure helpers for the Employers tab: project lifecycle buckets, proposal buckets, skill demand vs supply, the company table filter. */

export type LifecycleCounts = { total: number; published: number; paused: number; draft: number; pending_review: number; rejected: number; closed: number; other: number };

/**
 * Raw `projects.status` counts -> lifecycle buckets. Legacy values follow lib/projects/lifecycle (`active` is
 * published, `inactive` is paused, `archived` is closed) and a blank status is legacy active, as `activeProject()`
 * in scope.ts reads it. A value nobody knows lands in `other` so the buckets always add up to `total`.
 */
export function lifecycleCounts(rows: readonly { status: string | null; n: number }[]): LifecycleCounts {
  const out: LifecycleCounts = { total: 0, published: 0, paused: 0, draft: 0, pending_review: 0, rejected: 0, closed: 0, other: 0 };
  const MAP: Record<string, keyof Omit<LifecycleCounts, "total">> = {
    published: "published", active: "published", "": "published",
    paused: "paused", inactive: "paused",
    draft: "draft", pending_review: "pending_review", rejected: "rejected",
    closed: "closed", archived: "closed",
  };
  for (const r of rows) {
    const key = MAP[String(r.status ?? "").trim().toLowerCase()] ?? "other";
    out[key] += r.n;
    out.total += r.n;
  }
  return out;
}

export type ProposalBuckets = { sent: number; accepted: number; rejected: number; pending: number; expired: number; withdrawn: number };

/**
 * Raw proposal status counts -> what an owner asks about. `sent` is every proposal that left the employer
 * (all but drafts); it equals accepted + rejected + pending + expired + withdrawn. `accepted` includes
 * `hired` (lib/proposals.ts: both are wins). An unknown status counts as sent only.
 */
export function companyProposalBuckets(rows: readonly { status: string | null; n: number }[]): ProposalBuckets {
  const b: ProposalBuckets = { sent: 0, accepted: 0, rejected: 0, pending: 0, expired: 0, withdrawn: 0 };
  for (const r of rows) {
    const s = String(r.status ?? "").trim().toLowerCase();
    if (s === "draft") continue;
    b.sent += r.n;
    if (s === "accepted" || s === "hired") b.accepted += r.n;
    else if (s === "rejected") b.rejected += r.n;
    else if (s === "sent" || s === "interview_scheduled") b.pending += r.n;
    else if (s === "expired") b.expired += r.n;
    else if (s === "withdrawn") b.withdrawn += r.n;
  }
  return b;
}

/**
 * The key two skill spellings share. Mirrors the SQL `regexp_replace(lower(name), '[^a-z0-9+#]', '', 'g')`
 * the loaders group by: case, spaces, dots and dashes fold ("Node.js", "nodejs", "Node JS"), `+` and `#` stay
 * ("C++" and "C#" differ). No aliasing beyond that: "React" and "React.js" are two skills.
 */
export const normSkill = (s: string) => s.toLowerCase().replace(/[^a-z0-9+#]/g, "");

export type GapVerdict = "short" | "balanced" | "surplus";
export type GapRow = { key: string; skill: string; demand: number; supply: number; /** Interns per live project asking; null when nobody has the skill. */ perProject: number | null; verdict: GapVerdict };

/** Fewer interns than this per project asking for a skill is a shortage; this many or more is a surplus. A reading, not a rule. */
export const SHORT_BELOW = 3;
export const SURPLUS_FROM = 10;

/** Demand (live projects asking) against supply (interns who list the skill). Scarcest first; skills nobody asks for are not listed. */
export function demandSupplyGap(demand: readonly { key: string; label: string; count: number }[], supply: readonly { key: string; count: number }[]): GapRow[] {
  const have = new Map<string, number>();
  for (const s of supply) have.set(s.key, (have.get(s.key) ?? 0) + s.count);
  return demand
    .filter((d) => d.count > 0)
    .map((d) => {
      const n = have.get(d.key) ?? 0;
      const perProject = n === 0 ? null : Math.round((n / d.count) * 10) / 10;
      const verdict: GapVerdict = perProject === null || perProject < SHORT_BELOW ? "short" : perProject >= SURPLUS_FROM ? "surplus" : "balanced";
      return { key: d.key, skill: d.label, demand: d.count, supply: n, perProject, verdict };
    })
    .sort((a, b) => (a.perProject ?? -1) - (b.perProject ?? -1) || b.demand - a.demand || a.skill.localeCompare(b.skill));
}

export const COMPANY_PAGE_SIZE = 25;
export const COMPANY_SORTS = ["joined", "name", "projects", "sent", "hires", "paid"] as const;
export type CompanySort = (typeof COMPANY_SORTS)[number];
export const COMPANY_STATUSES = ["live", "paused", "none", "hired"] as const;

export type CompanyFilter = { q: string; status: "" | (typeof COMPANY_STATUSES)[number]; sort: CompanySort; dir: "asc" | "desc"; page: number };

export function parseCompanyFilter(p: Record<string, string | undefined>): CompanyFilter {
  const page = Number.parseInt(p.cpage ?? "", 10);
  return {
    q: (p.cq ?? "").trim().slice(0, 80),
    status: (COMPANY_STATUSES as readonly string[]).includes(p.cstatus ?? "") ? (p.cstatus as CompanyFilter["status"]) : "",
    sort: (COMPANY_SORTS as readonly string[]).includes(p.csort ?? "") ? (p.csort as CompanySort) : "joined",
    dir: p.cdir === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}
