import type { ActivityEntry } from "./record-activity.types.ts";

/**
 * Pure helpers behind the Activities timeline on the admin candidate and
 * company pages: merging the sources, and mapping each source's plain row to
 * an entry. No database and no `@/` imports, so node:test can run them; the
 * loaders are in `record-activity.ts`.
 *
 * Rules: verbs are plain past tense in the words of the trade; `change` is
 * set only when both the from and the to value exist in the data (a row that
 * only holds its current status never gets an invented "from").
 */

/** "intern": the timeline of a candidate (the candidate is the actor). "company": the timeline of an employer. */
export type ActivityView = "intern" | "company";

type DateLike = Date | string | null | undefined;

/** ISO string for a date or date string; null when missing or not a real date. */
export function isoOrNull(value: DateLike): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const clean = (v: string | null | undefined) => (v ?? "").trim();

/** Newest first, ties broken by id; drops entries with an invalid date; first entry wins a duplicate id; cut to `limit`. */
export function mergeActivity(groups: ActivityEntry[][], limit = 30): ActivityEntry[] {
  const seen = new Set<string>();
  const out: { entry: ActivityEntry; ms: number }[] = [];
  for (const group of groups) {
    for (const entry of group ?? []) {
      const ms = new Date(entry.at).getTime();
      if (Number.isNaN(ms) || seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push({ entry, ms });
    }
  }
  out.sort((a, b) => b.ms - a.ms || (a.entry.id < b.entry.id ? -1 : a.entry.id > b.entry.id ? 1 : 0));
  return out.slice(0, Math.max(0, limit)).map((r) => r.entry);
}

/** "₹5,000" from minor units; plain "5,000 XYZ" when the currency is not one Intl knows. */
export function formatAmount(amountMinor: number | null | undefined, currency: string | null | undefined): string {
  if (amountMinor === null || amountMinor === undefined) return "";
  const minor = Number(amountMinor);
  if (!Number.isFinite(minor)) return "";
  const code = clean(currency).toUpperCase() || "INR";
  const major = minor / 100;
  try {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: code, maximumFractionDigits: major % 1 === 0 ? 0 : 2 }).format(major);
  } catch {
    return `${major.toLocaleString("en-IN")} ${code}`;
  }
}

const person = (name: string | null | undefined, id: string | null | undefined, fallback: string) => ({
  name: clean(name) || fallback,
  id: id ?? null,
});
const internHref = (id: string | null | undefined) => (id ? `/admin/interns/${encodeURIComponent(id)}` : null);
const companyHref = (id: string | null | undefined) => (id ? `/admin/companies/${encodeURIComponent(id)}` : null);

/** The two parties of a row (and its project), already named. The loader fills these in. */
export type Parties = {
  internId: string;
  internName: string | null;
  employerId: string;
  companyName: string | null;
  projectName: string | null;
};

/**
 * Builds one entry. `who` is the actor. The object is the other side of the
 * action: a candidate acts on a company (on the candidate's page) or on a
 * project (on the company's page); a company acts on the candidate.
 */
function made(
  view: ActivityView,
  p: Parties,
  who: "intern" | "company",
  rest: { id: string; at: string; kind: ActivityEntry["kind"] },
  internVerb: string,
  companyVerb: string,
  extra: Partial<ActivityEntry> = {},
): ActivityEntry {
  const byIntern = who === "intern";
  let object: string;
  let href: string | null;
  if (!byIntern) {
    object = clean(p.internName) || "a candidate";
    href = internHref(p.internId);
  } else if (view === "intern") {
    object = clean(p.companyName) || "a company";
    href = companyHref(p.employerId);
  } else {
    object = clean(p.projectName) || "a project";
    href = null;
  }
  // The project already is the object on a company page: do not say it twice.
  const detail = extra.detail && extra.detail !== object ? extra.detail : undefined;
  return {
    ...rest,
    actor: byIntern ? person(p.internName, p.internId, "Candidate") : person(p.companyName, p.employerId, "Company"),
    verb: view === "intern" ? internVerb : companyVerb,
    object,
    href,
    ...extra,
    detail,
  };
}

// ---------------------------------------------------------------- proposals

export type ProposalRow = Parties & {
  id: string;
  status: string;
  createdAt: DateLike;
  updatedAt: DateLike;
  hiredAt: DateLike;
};

/** A proposal (offer) sent to a candidate. Drafts were never sent. */
export function proposalEntry(row: ProposalRow, view: ActivityView): ActivityEntry | null {
  const at = isoOrNull(row.createdAt);
  if (!at || row.status === "draft") return null;
  const intern = view === "intern";
  return made(
    view,
    row,
    intern ? "intern" : "company",
    { id: `proposal:${row.id}:sent`, at, kind: intern ? "offer" : "proposal" },
    "received an offer from",
    "sent a proposal to",
    { detail: clean(row.projectName) || undefined },
  );
}

/**
 * The candidate's (or employer's) answer. The row only keeps its current
 * status and when it was last touched, so this is dated by that update, and
 * there is no `change`: the previous status is not recorded.
 */
export function proposalOutcomeEntry(row: ProposalRow, view: ActivityView): ActivityEntry | null {
  const at = isoOrNull(row.updatedAt);
  const created = isoOrNull(row.createdAt);
  if (!at || (created && at <= created)) return null;
  const intern = view === "intern";
  const detail = clean(row.projectName) || undefined;
  const id = (suffix: string) => ({ id: `proposal:${row.id}:${suffix}`, at, kind: (intern ? "offer" : "proposal") as ActivityEntry["kind"] });
  switch (row.status) {
    case "accepted":
      return made(view, row, "intern", id("accepted"), "accepted the offer at", "accepted the proposal for", { detail });
    case "rejected":
      return made(view, row, "intern", id("declined"), "declined the offer from", "declined the proposal for", { detail });
    case "withdrawn":
      return made(view, row, "company", id("withdrawn"), "withdrew the offer to", "withdrew the proposal to", { detail });
    case "expired":
      return made(view, row, intern ? "intern" : "company", id("expired"), "had an offer expire from", "had a proposal expire for", { detail });
    default:
      return null;
  }
}

/** The employer paid and the candidate was hired. */
export function hireEntry(row: ProposalRow, view: ActivityView): ActivityEntry | null {
  const at = isoOrNull(row.hiredAt);
  if (!at) return null;
  const intern = view === "intern";
  return made(
    view,
    row,
    intern ? "intern" : "company",
    { id: `proposal:${row.id}:hired`, at, kind: "hire" },
    "was hired by",
    "hired",
    { detail: clean(row.projectName) || undefined },
  );
}

// --------------------------------------------------------------- interviews

export type InterviewRow = Parties & {
  id: string;
  /** pending | scheduled | completed | missed (anything else is not shown). */
  status: string;
  createdAt: DateLike;
  updatedAt: DateLike;
};

/** One entry per interview, worded by where it stands. Dated by the request while pending, else by its last update. */
export function interviewEntry(row: InterviewRow, view: ActivityView): ActivityEntry | null {
  const base = (at: string | null, suffix: string) => (at ? { id: `interview:${row.id}:${suffix}`, at, kind: "interview" as const } : null);
  const detail = clean(row.projectName) || undefined;
  switch (row.status) {
    case "pending": {
      const b = base(isoOrNull(row.createdAt), "pending");
      return b && made(view, row, view === "intern" ? "intern" : "company", b, "was invited to interview by", "asked for an interview with", { detail });
    }
    case "scheduled": {
      const b = base(isoOrNull(row.updatedAt) ?? isoOrNull(row.createdAt), "scheduled");
      return b && made(view, row, view === "intern" ? "intern" : "company", b, "scheduled an interview with", "scheduled an interview with", { detail });
    }
    case "completed": {
      const b = base(isoOrNull(row.updatedAt) ?? isoOrNull(row.createdAt), "completed");
      return b && made(view, row, view === "intern" ? "intern" : "company", b, "completed an interview with", "completed an interview with", { detail });
    }
    case "missed": {
      const b = base(isoOrNull(row.updatedAt) ?? isoOrNull(row.createdAt), "missed");
      return b && made(view, row, "intern", b, "missed an interview with", "missed an interview for", { detail });
    }
    default:
      return null;
  }
}

// -------------------------------------------------------------- timesheets

export type TimesheetRow = Parties & {
  id: string;
  periodStart: DateLike;
  periodEnd: DateLike;
  submittedAt: DateLike;
  approvedAt: DateLike;
  rejectedAt: DateLike;
};

const day = (v: DateLike) => isoOrNull(v)?.slice(0, 10) ?? null;

/** Up to two entries: submitted, then approved or rejected. `change` Submitted -> Approved/Rejected only when the submission is dated. */
export function timesheetEntries(row: TimesheetRow, view: ActivityView): ActivityEntry[] {
  const out: ActivityEntry[] = [];
  const intern = view === "intern";
  const from = day(row.periodStart);
  const to = day(row.periodEnd);
  const detail = [clean(row.projectName), from && to ? `${from} to ${to}` : ""].filter(Boolean).join(" · ") || undefined;
  const submitted = isoOrNull(row.submittedAt);
  if (submitted) {
    out.push(
      made(view, row, "intern", { id: `timesheet:${row.id}:submitted`, at: submitted, kind: "timesheet" }, "submitted a timesheet for", "submitted a timesheet for", {
        detail,
      }),
    );
  }
  const approved = isoOrNull(row.approvedAt);
  if (approved) {
    out.push(
      made(view, row, intern ? "intern" : "company", { id: `timesheet:${row.id}:approved`, at: approved, kind: "timesheet" }, "had a timesheet approved by", "approved a timesheet from", {
        detail,
        change: submitted ? { from: "Submitted", to: "Approved" } : null,
      }),
    );
  }
  const rejected = isoOrNull(row.rejectedAt);
  if (rejected) {
    out.push(
      made(view, row, intern ? "intern" : "company", { id: `timesheet:${row.id}:rejected`, at: rejected, kind: "timesheet" }, "had a timesheet sent back by", "sent back a timesheet from", {
        detail,
        change: submitted ? { from: "Submitted", to: "Rejected" } : null,
      }),
    );
  }
  return out;
}

// ---------------------------------------------------------------- payments

export type PaymentRow = {
  id: string;
  amountMinor: number | null;
  currency: string | null;
  invoiceNumber: string | null;
  paidAt: DateLike;
};

/** What a payout is called to the person reading: money out to the candidate. */
export function payoutEntry(row: PaymentRow, who: { internId: string; internName: string | null }): ActivityEntry | null {
  const at = isoOrNull(row.paidAt);
  if (!at) return null;
  return {
    id: `payout:${row.id}`,
    at,
    kind: "payout",
    actor: person(who.internName, who.internId, "Candidate"),
    verb: "was paid",
    object: formatAmount(row.amountMinor, row.currency) || undefined,
    detail: "Stipend payout",
    href: null,
  };
}

/** The candidate paid Findtern's fee. */
export function internPaymentEntry(row: PaymentRow, who: { internId: string; internName: string | null }): ActivityEntry | null {
  const at = isoOrNull(row.paidAt);
  if (!at) return null;
  return {
    id: `payment:intern:${row.id}`,
    at,
    kind: "payment",
    actor: person(who.internName, who.internId, "Candidate"),
    verb: "paid the platform fee",
    object: formatAmount(row.amountMinor, row.currency) || undefined,
    detail: clean(row.invoiceNumber) ? `Invoice ${clean(row.invoiceNumber)}` : undefined,
    href: null,
  };
}

/** The employer paid an order. */
export function companyPaymentEntry(row: PaymentRow, who: { employerId: string; companyName: string | null }): ActivityEntry | null {
  const at = isoOrNull(row.paidAt);
  if (!at) return null;
  return {
    id: `payment:company:${row.id}`,
    at,
    kind: "payment",
    actor: person(who.companyName, who.employerId, "Company"),
    verb: "paid",
    object: formatAmount(row.amountMinor, row.currency) || undefined,
    detail: clean(row.invoiceNumber) ? `Invoice ${clean(row.invoiceNumber)}` : undefined,
    href: null,
  };
}

// --------------------------------------------------- documents, review, etc.

export type DocumentRow = {
  id: string;
  hasPhoto: boolean;
  hasVideo: boolean;
  hasIdentity: boolean;
  createdAt: DateLike;
  updatedAt: DateLike;
};

/** The kinds of file on record, as words. Never file names, and never the numbers on the identity documents. */
export function documentLabels(row: Pick<DocumentRow, "hasPhoto" | "hasVideo" | "hasIdentity">): string[] {
  return [row.hasPhoto ? "profile photo" : "", row.hasVideo ? "intro video" : "", row.hasIdentity ? "identity documents" : ""].filter(Boolean);
}

export function documentEntry(row: DocumentRow, who: { internId: string; internName: string | null }): ActivityEntry | null {
  const at = isoOrNull(row.updatedAt) ?? isoOrNull(row.createdAt);
  const labels = documentLabels(row);
  if (!at || labels.length === 0) return null;
  return {
    id: `document:${row.id}`,
    at,
    kind: "document",
    actor: person(who.internName, who.internId, "Candidate"),
    verb: "uploaded",
    object: labels.join(", "),
    href: null,
  };
}

export type ReviewRow = {
  internId: string;
  internName: string | null;
  /** extraData.approvalStatus */
  status: string | null;
  /** extraData.approvedAt: only set by the automatic approval on a live score. */
  approvedAt: DateLike;
  approvedBy: string | null;
};

/** The approval, when it was dated. No `change`: the status before is not recorded. */
export function reviewEntry(row: ReviewRow): ActivityEntry | null {
  const at = isoOrNull(row.approvedAt);
  if (!at || row.status !== "Approved") return null;
  const auto = clean(row.approvedBy).startsWith("auto:");
  return {
    id: `review:${row.internId}:approved`,
    at,
    kind: "review",
    actor: person(row.internName, row.internId, "Candidate"),
    verb: "was approved",
    detail: auto ? "Automatically, after the first interview score" : undefined,
    href: null,
  };
}

export function internSignupEntry(row: { id: string; name: string | null; createdAt: DateLike }): ActivityEntry | null {
  const at = isoOrNull(row.createdAt);
  if (!at) return null;
  return { id: `signup:intern:${row.id}`, at, kind: "signup", actor: person(row.name, row.id, "Candidate"), verb: "signed up", href: null };
}

export function companySignupEntry(row: { id: string; companyName: string | null; createdAt: DateLike }): ActivityEntry | null {
  const at = isoOrNull(row.createdAt);
  if (!at) return null;
  return { id: `signup:company:${row.id}`, at, kind: "signup", actor: person(row.companyName, row.id, "Company"), verb: "signed up", href: null };
}

export type ProjectRow = { id: string; projectName: string | null; employerId: string; companyName: string | null; createdAt: DateLike };

export function projectEntry(row: ProjectRow): ActivityEntry | null {
  const at = isoOrNull(row.createdAt);
  if (!at) return null;
  return {
    id: `project:${row.id}`,
    at,
    kind: "project",
    actor: person(row.companyName, row.employerId, "Company"),
    verb: "posted a project",
    object: clean(row.projectName) || undefined,
    href: null,
  };
}

/** Drops nulls from a list of mapper results. */
export function compact<T>(items: (T | null | undefined)[]): T[] {
  return items.filter((i): i is T => i !== null && i !== undefined);
}
