import { formatDate, formatMoney } from "./format.ts";
import { draftFromRecord, MIN_SKILLS } from "./onboarding.ts";
/**
 * The journey derivation.
 *
 * ── What this is ────────────────────────────────────────────────────────
 *
 * One pure module that turns rows the candidate already owns into the four
 * things the app shows them: which stage they are in, what has happened,
 * what they can prove, and what is still invisible to an employer.
 *
 * ── Why it is pure and writes nothing ───────────────────────────────────
 *
 * Proof cards are a dated, exportable record. The obvious build is a new
 * `intern_proofs` table written on every event. We are not changing the
 * schema: the database is being moved to a managed one and a migration now
 * buys nothing. So every card is *derived* from the row that already exists,
 * and dated by a timestamp that row already carries (`submittedAt`, `paidAt`,
 * `approvedAt`, `createdAt`). Nothing is invented and nothing is duplicated,
 * so a card can never disagree with the thing it came from.
 *
 * The honest limitation, and it is a real one: a card can only exist for an
 * event whose source row carries a date. `intern_document` has `createdAt` but
 * an upload is not achievement, so documents deliberately issue no card.
 * When the schema moves, `deriveProofs` becomes the reader for a real table
 * and its signature does not change.
 */

/* ── Row shapes, deliberately loose ────────────────────────────────────────
 * These mirror the drizzle columns this module reads. They are structural
 * rather than `typeof schema.x.$inferSelect` so the derivation stays testable
 * without a database, which is the whole reason it lives here. */

export type ProposalRow = {
  id: string;
  employerId: string;
  internId: string;
  projectId: string | null;
  skills: unknown;
  interviewId: string | null;
  flowType: string | null;
  status: string | null;
  currency: string | null;
  offerDetails: Record<string, unknown> | null;
  aiRatings: Record<string, unknown> | null;
  createdAt: Date;
  hiredAt: Date | null;
};

export type InterviewRow = {
  id: string;
  employerId: string;
  projectId: string | null;
  status: string | null;
  slot1: Date | null;
  slot2: Date | null;
  slot3: Date | null;
  selectedSlot: number | null;
  timezone: string | null;
  meetingLink: string | null;
  notes: string | null;
  createdAt: Date;
};

export type TimesheetRow = {
  id: string;
  proposalId: string;
  periodStart: Date | null;
  periodEnd: Date | null;
  status: string | null;
  entries: unknown;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  managerNote: string | null;
  internNote: string | null;
  createdAt: Date;
};

export type PayoutRow = {
  id: string;
  /** Legacy bag: `proposalId` (which placement it pays), `scheduledFor`. */
  raw?: unknown;
  amountMinor: number | null;
  currency: string | null;
  status: string | null;
  referenceId: string | null;
  notes: string | null;
  paidAt: Date | null;
  createdAt: Date;
};

export type OnboardingRow = {
  linkedinUrl: string | null;
  city: string | null;
  state: string | null;
  bio: string | null;
  skills: unknown;
  hasLaptop: boolean | null;
  extraData: Record<string, unknown> | null;
};

export type DocumentRow = {
  profilePhotoName: string | null;
  aadhaarImageName: string | null;
  panImageName: string | null;
};

/** Employer name lookup, `id -> name`. */
export type CompanyNames = Record<string, string>;

const AI_INTERVIEW_LABEL = "AI Interview";

export type ProofSource = {
  proposals: ProposalRow[];
  interviews: InterviewRow[];
  timesheets: TimesheetRow[];
  payouts: PayoutRow[];
  names: CompanyNames;
  /** Employer ids that own AI interview rows (intern-data); their rows read as the AI interview. */
  aiEmployerIds?: Set<string>;
  /**
   * The current Findtern Score (intern_onboarding.extra_data), the one Home,
   * Profile and Interviews show. Record used each proposal's frozen
   * ai_ratings snapshot instead, one card per proposal (QA-004).
   */
  score?: { overall: number; ratings: Record<string, number>; at: Date | null } | null;
};

/* ── Stage ───────────────────────────────────────────────────────────────
 * One role, two jobs. The database calls everyone `intern`, but the work a
 * screen should do depends entirely on whether there is a live engagement, so
 * the stage is derived rather than stored. */

export type Stage = "seeking" | "working";

/**
 * Offer statuses the intern has said yes to. "processing" is legacy's mark
 * for an accepted offer whose employer started checkout (abandoned
 * checkouts stay there), so it reads as accepted on intern screens
 * (INW-21). Money is a different question: only a hire (the company paid)
 * earns, see `earningsEngagements` in earnings-view.
 */
export function isAcceptedStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "accepted" || s === "processing" || s === "hired";
}

/**
 * A candidate is `working` once an offer is accepted. `hiredAt` is checked
 * first because it is the strongest signal we have, then `accepted` (or
 * legacy's `processing`), and `hired` from the legacy status set is honoured
 * so old rows still classify.
 */
export function deriveStage(proposals: ProposalRow[]): Stage {
  const live = proposals.some((p) => Boolean(p.hiredAt) || isAcceptedStatus(p.status));
  return live ? "working" : "seeking";
}

/** The accepted engagement, which is what the working stage is *about*. */
export function activeEngagement(proposals: ProposalRow[]): ProposalRow | null {
  const live = proposals.filter((p) => Boolean(p.hiredAt) || isAcceptedStatus(p.status));
  if (live.length === 0) return null;
  return live.sort((a, b) => (b.hiredAt ?? b.createdAt).getTime() - (a.hiredAt ?? a.createdAt).getTime())[0];
}

/* ── Thread ───────────────────────────────────────────────────────────────
 * One chronological spine of real events. It exists because the single loudest
 * thing a candidate tells us is "I have no idea what is happening", and a
 * list of rows scattered across six screens does not answer it. A spine does.
 *
 * `tone` is what the candidate has to *do*, not what colour it is:
 *   action  something is waiting on them
 *   waiting something is waiting on someone else, and that is fine
 *   done    it happened
 *   info    worth knowing, no obligation attached
 */

export type ThreadTone = "action" | "waiting" | "done" | "info";
export type ThreadKind = "profile" | "proposal" | "interview" | "timesheet" | "payout";

export type ThreadNode = {
  id: string;
  kind: ThreadKind;
  tone: ThreadTone;
  at: Date;
  title: string;
  detail: string;
  /** Second line of context, e.g. who it is with. */
  with?: string;
  href?: string;
  /** Only for `action`. Names the screen that resolves it. */
  action?: string;
};

const roleOf = (offer: Record<string, unknown> | null): string => {
  const v = offer?.roleTitle ?? offer?.role;
  return typeof v === "string" && v.trim() ? v.trim() : "this internship";
};

/**
 * Builds the spine, newest first.
 *
 * `now` is injected rather than read from `Date.now()` so the same rows render
 * the same thread on the server and on the client. Without that, a
 * "waiting, day 3" label flips to "waiting, day 4" across a revalidation and
 * the page visibly disagrees with itself.
 */
export function buildThread(src: ProofSource, now: Date = new Date()): ThreadNode[] {
  const nodes: ThreadNode[] = [];
  const name = (id: string) => src.names[id] ?? "the company";

  for (const p of src.proposals) {
    const role = roleOf(p.offerDetails);
    const withName = name(p.employerId);
    if (p.status === "sent") {
      nodes.push({
        id: `p-sent-${p.id}`,
        kind: "proposal",
        tone: "action",
        at: p.createdAt,
        title: `Offer waiting on you: ${role}`,
        detail: `${withName} sent you an offer. If you do nothing, it is marked as rejected once the joining date passes.`,
        with: withName,
        href: `/intern/proposals/${p.id}`,
        action: "Read the offer",
      });
    } else if (p.hiredAt || p.status === "hired") {
      nodes.push({
        id: `p-accepted-${p.id}`,
        kind: "proposal",
        tone: "done",
        at: p.hiredAt ?? p.createdAt,
        title: `You started: ${role}`,
        detail: `${withName} completed the payment. Log your hours on Timesheets.`,
        with: withName,
        href: `/intern/proposals/${p.id}`,
      });
    } else if (p.status === "accepted" || p.status === "processing") {
      nodes.push({
        id: `p-accepted-${p.id}`,
        kind: "proposal",
        tone: "waiting",
        at: p.createdAt,
        title: `You accepted: ${role}`,
        detail: `Waiting for ${withName} to complete the payment. Logging hours opens once they do.`,
        with: withName,
        href: `/intern/proposals/${p.id}`,
      });
    } else if (p.status === "rejected") {
      nodes.push({
        id: `p-rejected-${p.id}`,
        kind: "proposal",
        tone: "done",
        at: p.createdAt,
        title: `Offer closed: ${role}`,
        detail: `This one did not go ahead with ${withName}. Nothing else is needed from you.`,
        with: withName,
      });
    }
  }

  for (const i of src.interviews) {
    const withName = name(i.employerId);
    if (src.aiEmployerIds?.has(i.employerId)) {
      // Findtern's own AI interview: never "a company", never its raw notes
      // (they carry the report and recording links).
      const done = i.status === "completed";
      const ready = !done && i.status === "scheduled" && Boolean(i.meetingLink);
      nodes.push({
        id: `i-ai-${i.id}`,
        kind: "interview",
        tone: done ? "done" : ready ? "action" : "waiting",
        at: i.createdAt,
        title: done ? "AI interview completed" : ready ? "Your AI interview link is ready" : "AI interview requested",
        detail: done
          ? "Your Findtern Score and ratings are on the interviews page."
          : ready
            ? "Open it from the interviews page when you are ready."
            : "The link arrives here, usually within two working days.",
        with: AI_INTERVIEW_LABEL,
        href: "/intern/interviews",
        action: ready ? "Open the interview" : undefined,
      });
      continue;
    }
    if (i.status === "completed") {
      nodes.push({
        id: `i-done-${i.id}`,
        kind: "interview",
        tone: "done",
        at: slotOf(i) ?? i.createdAt,
        title: "Interview completed",
        detail: i.notes?.trim()
          ? i.notes.trim()
          : `You met ${withName}. Their notes are on the interview page.`,
        with: withName,
        href: "/intern/interviews",
      });
    } else if (i.status === "scheduled") {
      // An interview with three times on offer and no choice made is not
      // "with them", it is on the candidate. Classifying this as waiting while
      // still rendering a button on it was the bug that let the status strip
      // skip past the only thing that genuinely needed an answer.
      const needsChoice = !i.selectedSlot;
      nodes.push({
        id: `i-live-${i.id}`,
        kind: "interview",
        tone: needsChoice ? "action" : "waiting",
        at: slotOf(i) ?? i.createdAt,
        title: needsChoice ? "Choose your interview time" : "Interview confirmed",
        detail: needsChoice
          ? `${withName} offered you three times. Pick the one that suits you and they will be told.`
          : `Confirmed for ${withName}. The join link is on the interview page.`,
        with: withName,
        href: "/intern/interviews",
        action: needsChoice ? "Pick a time" : undefined,
      });
    } else {
      nodes.push({
        id: `i-pending-${i.id}`,
        kind: "interview",
        tone: "waiting",
        at: i.createdAt,
        title: "Interview request pending",
        detail: `${withName} will send times shortly. There is nothing to do yet.`,
        with: withName,
        href: "/intern/interviews",
      });
    }
  }

  for (const t of src.timesheets) {
    const period = periodLabel(t);
    const withName = "your manager";
    if (t.status === "draft") {
      nodes.push({
        id: `t-draft-${t.id}`,
        kind: "timesheet",
        tone: "action",
        at: t.periodStart ?? t.createdAt,
        title: `Hours not sent for ${period}`,
        detail: `Your draft is saved. Send it when your hours look right.`,
        href: "/intern/timesheets",
        action: "Finish and send",
      });
    } else if (t.status === "submitted") {
      const waiting = daysBetween(t.submittedAt ?? t.createdAt, now);
      nodes.push({
        id: `t-sub-${t.id}`,
        kind: "timesheet",
        tone: "waiting",
        at: t.submittedAt ?? t.createdAt,
        title: `Hours for ${period} are with ${withName}`,
        detail: `Sent ${ordinal(waiting)} day${waiting === 1 ? "" : "s"} ago. Reviews here usually take about two working days.`,
        href: "/intern/timesheets",
      });
    } else if (t.status === "rejected") {
      nodes.push({
        id: `t-rej-${t.id}`,
        kind: "timesheet",
        tone: "done",
        at: t.rejectedAt ?? t.createdAt,
        title: `Hours for ${period} need another look`,
        detail: t.managerNote?.trim() ?? `${withName} asked for a change to this period.`,
        href: "/intern/timesheets",
        action: "Open and fix",
      });
    } else if (t.approvedAt) {
      nodes.push({
        id: `t-app-${t.id}`,
        kind: "timesheet",
        tone: "done",
        at: t.approvedAt,
        title: `Hours for ${period} approved`,
        detail: `${hoursIn(t)} hours approved at ${formatHoursInPlainWords(hoursIn(t))}.`,
        href: "/intern/timesheets",
      });
    }
  }

  for (const r of src.payouts) {
    const payoutStatus = payoutState(r.status);
    if (payoutStatus === "paid" && r.paidAt) {
      nodes.push({
        id: `r-paid-${r.id}`,
        kind: "payout",
        tone: "done",
        at: r.paidAt,
        title: "Stipend reached your account",
        detail: r.referenceId ? `Reference ${r.referenceId}.` : "Paid in by bank transfer.",
        href: "/intern/earnings",
      });
    } else if (payoutStatus === "failed") {
      // INW-04: a failed transfer is not money on its way.
      nodes.push({
        id: `r-fail-${r.id}`,
        kind: "payout",
        tone: "info",
        at: r.createdAt,
        title: "A stipend payment did not go through",
        detail: "Findtern's team follows up on failed transfers. Check that your bank details are right.",
        href: "/intern/earnings",
      });
    } else if (payoutStatus === "pending") {
      const scheduled = readScheduledFor(r);
      nodes.push({
        id: `r-pend-${r.id}`,
        kind: "payout",
        tone: "waiting",
        at: r.createdAt,
        title: "Stipend on its way",
        detail: scheduled
          ? `Scheduled for ${scheduled}. It usually lands within two working days of that date.`
          : "This one is queued. The date appears here as soon as it is set.",
        href: "/intern/earnings",
      });
    }
  }

  return nodes.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** The one thing that needs this person, if anything does. */
export function nextAction(thread: ThreadNode[]): ThreadNode | null {
  return thread.find((n) => n.tone === "action") ?? null;
}

/* ── Proof ────────────────────────────────────────────────────────────────
 * The reward object. Not a badge, not points: a dated statement of something
 * that actually happened, carrying the facts, and exportable as text.
 *
 * Every reward here is informational. A reward that tells you what you have
 * done raises your sense of competence, and that is the only reward shape the
 * motivation research backs. A reward that tells you what you should do next
 * to keep a number going is the shape that produces guilt, and it is the shape
 * this product does not have. */

export type ProofKind = "assessment" | "interview" | "hours" | "stipend" | "offer";
export type ProofFact = { label: string; value: string };

export type Proof = {
  id: string;
  kind: ProofKind;
  title: string;
  /** One sentence in the product's voice. Never congratulatory. */
  line: string;
  facts: ProofFact[];
  at: Date;
  /** Who verified it, when a human did. */
  issuedBy?: string;
  href?: string;
};

export const PROOF_META: Record<ProofKind, { label: string; blurb: string }> = {
  assessment: { label: "Assessment score", blurb: "Your published score and what it set" },
  offer: { label: "Offer accepted", blurb: "The role, the company, the dates" },
  interview: { label: "Interview completed", blurb: "The conversation you had" },
  hours: { label: "Hours approved", blurb: "Work a manager checked and signed off" },
  stipend: { label: "Stipend paid", blurb: "Money that reached your account" },
};

export function deriveProofs(src: ProofSource): Proof[] {
  const out: Proof[] = [];
  const name = (id: string) => src.names[id] ?? "the company";

  // One score card, the current score, dated by its approval (QA-004). The
  // per-proposal snapshots stay on the offers that froze them.
  if (src.score) {
    const bands = Object.entries(src.score.ratings).map(([k, v]) => ({ label: prettyRating(k), value: `${v}/10` }));
    const firstOffer = src.proposals.reduce<Date | null>((a, p) => (a && a < p.createdAt ? a : p.createdAt), null);
    out.push({
      id: "pf-score",
      kind: "assessment",
      title: "Findtern Score published",
      line: "One assessment. The score is public and the rate that follows from it is public too.",
      facts: [{ label: "Overall", value: `${src.score.overall}/10` }, ...bands],
      at: src.score.at ?? firstOffer ?? new Date(0),
    });
  }

  for (const p of src.proposals) {
    if (p.hiredAt || isAcceptedStatus(p.status)) {
      const offer = p.offerDetails ?? {};
      out.push({
        id: `pf-offer-${p.id}`,
        kind: "offer",
        title: `Started ${roleOf(offer)}`,
        line: "You were accepted. Everything after this is on the record.",
        facts: [
          { label: "Company", value: name(p.employerId) },
          ...(typeof offer.startDate === "string"
            ? [{ label: "Start", value: formatDate(offer.startDate) }] // was the raw ISO day (QA-015)
            : []),
          ...(typeof offer.durationWeeks === "number"
            ? [{ label: "Length", value: `${offer.durationWeeks} weeks` }]
            : []),
          ...(typeof offer.hoursPerWeek === "number"
            ? [{ label: "Hours", value: `${offer.hoursPerWeek} a week` }]
            : []),
        ],
        at: p.hiredAt ?? p.createdAt,
        issuedBy: name(p.employerId),
        href: `/intern/proposals/${p.id}`,
      });
    }
  }

  for (const i of src.interviews) {
    if (i.status !== "completed") continue;
    const at = slotOf(i) ?? i.createdAt;
    out.push({
      id: `pf-iv-${i.id}`,
      kind: "interview",
      title: "Interview completed",
      line: i.notes?.trim() ?? "You met the team and completed the conversation.",
      facts: [
        { label: "Company", value: name(i.employerId) },
        { label: "When", value: at.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) },
      ],
      at,
      issuedBy: name(i.employerId),
      href: "/intern/interviews",
    });
  }

  for (const t of src.timesheets) {
    if (!t.approvedAt) continue;
    const h = hoursIn(t);
    out.push({
      id: `pf-hrs-${t.id}`,
      kind: "hours",
      title: `${h} hours approved`,
      line: "A manager reviewed this period and signed it off.",
      facts: [
        { label: "Period", value: periodLabel(t) },
        { label: "Hours", value: `${h}` },
        ...(workLines(t).length ? [{ label: "Work", value: workLines(t).join(", ") }] : []),
      ],
      at: t.approvedAt,
      issuedBy: "Your manager",
      href: "/intern/timesheets",
    });
  }

  for (const r of src.payouts) {
    if (r.status !== "paid" || !r.paidAt) continue;
    out.push({
      id: `pf-stp-${r.id}`,
      kind: "stipend",
      title: "Stipend paid",
      line: "This reached your bank account.",
      facts: [
        { label: "Amount", value: formatMoney(r.amountMinor ?? 0, r.currency ?? "INR", { zeroLabel: false }) },
        ...(r.referenceId ? [{ label: "Reference", value: r.referenceId }] : []),
      ],
      at: r.paidAt,
      issuedBy: "Findtern",
      href: "/intern/earnings",
    });
  }

  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** The plain text version, which is the export. No ribbon, no confetti. */
export function proofAsText(proof: Proof, candidate: string): string {
  const lines = [
    "FINDTERN RECORD",
    candidate,
    "",
    `${PROOF_META[proof.kind].label.toUpperCase()}`,
    proof.title,
    proof.line,
    "",
    ...proof.facts.map((f) => `${f.label}: ${f.value}`),
    "",
    `Issued ${proof.at.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}${proof.issuedBy ? ` by ${proof.issuedBy}` : ""}`,
    `Verify at findtern.in/record`,
  ];
  return lines.join("\n");
}

export function recordAsText(proofs: Proof[], candidate: string): string {
  const header = [
    "FINDTERN RECORD",
    candidate,
    `${proofs.length} verified item${proofs.length === 1 ? "" : "s"}`,
    "",
  ].join("\n");
  return header + proofs.map((p) => `${proofAsText(p, candidate)}\n${"─".repeat(34)}`).join("\n");
}

/* ── Readiness ────────────────────────────────────────────────────────────
 * Replaces the legacy "profile completion, 23 of 30 done" checklist.
 *
 * The change is not cosmetic. A percentage tells a candidate they are behind,
 * which is a statement about the person. Each item below instead states a fact
 * about what an employer can see, and what stays hidden until it is filled.
 * Same data, opposite framing, and the framing is the entire difference
 * between a chore and a reason. */

export type ReadinessItem = {
  id: string;
  label: string;
  /** What is invisible right now. Empty means nothing is hidden. */
  unlocks: string;
  done: boolean;
  href: string;
  /** Worth surfacing above the rest, because it blocks money, not pride. */
  blocking?: boolean;
};

export function deriveReadiness(
  onboarding: OnboardingRow | null,
  doc: DocumentRow | null,
  proposals: ProposalRow[],
): ReadinessItem[] {
  const draft = onboarding ? draftFromRecord(onboarding) : null;
  const academics = draft?.academics ?? { institution: "", degree: "" };
  const bank = draft?.bank ?? { accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", upiId: "" };
  const skills = draft?.skills ?? [];
  const live = proposals.some((p) => isAcceptedStatus(p.status));

  return [
    {
      id: "name",
      label: "Your name and contact",
      unlocks: "",
      done: true,
      href: "/intern/profile",
    },
    {
      id: "city",
      label: "Where you can work",
      unlocks: "Employers filter by city before they read anything else.",
      done: Boolean(onboarding?.city && onboarding?.state),
      href: "/intern/onboarding",
    },
    {
      id: "skills",
      label: "Skills you will be hired for",
      unlocks: "Without these, a search for your role never returns you.",
      // Same minimum as the onboarding step and the payment gate (INT-20).
      done: skills.length >= MIN_SKILLS,
      href: "/intern/onboarding",
    },
    {
      id: "academics",
      label: "What you are studying",
      unlocks: "Most employers check this before they schedule a call.",
      done: Boolean(academics.institution && academics.degree),
      href: "/intern/onboarding",
    },
    {
      id: "photo",
      label: "A photo employers recognise",
      unlocks: "Profiles with a face get roughly twice the callback.",
      done: Boolean(doc?.profilePhotoName),
      href: "/intern/onboarding",
    },
    {
      id: "linkedin",
      label: "LinkedIn profile",
      unlocks: "Helps employers verify you are who you say you are.",
      done: Boolean(onboarding?.linkedinUrl),
      href: "/intern/onboarding",
    },
    {
      id: "bio",
      label: "A line about what you do well",
      unlocks: "Optional, but it is the part a recruiter reads out loud.",
      // Optional here and in the payment gate alike (INT-20; legacy had no bio).
      done: (onboarding?.bio ?? "").trim().length > 0,
      href: "/intern/onboarding",
    },
    {
      // Both card images are required, as in the payment gate (bug sheet 7, NC r18).
      id: "pan",
      label: "PAN and Aadhaar card images",
      unlocks: "Needed before the first stipend is released.",
      done: Boolean(doc?.panImageName && doc?.aadhaarImageName),
      href: "/intern/onboarding",
      blocking: live,
    },
    {
      id: "bank",
      label: "Bank account for your stipend",
      unlocks: "Your stipend cannot be sent anywhere else.",
      done: Boolean(bank.accountHolderName && bank.bankName && bank.accountNumber && bank.ifscCode),
      href: "/intern/bank-details",
      blocking: live,
    },
  ];
}

export type Readiness = {
  items: ReadinessItem[];
  /** Share of things an employer can see. Framed as visibility, not score. */
  visible: number;
  /** Only counted when the person is actually earning, so early on it does
   *  not look like failure to have no bank details yet. */
  visibleLive: number;
  hiddenCount: number;
  blocking: ReadinessItem[];
};

export function readinessFrom(items: ReadinessItem[]): Readiness {
  const done = items.filter((i) => i.done).length;
  const blocking = items.filter((i) => i.blocking);
  const blockingDone = blocking.filter((i) => i.done).length;
  return {
    items,
    visible: items.length ? done / items.length : 0,
    visibleLive: blocking.length ? blockingDone / blocking.length : 1,
    hiddenCount: items.length - done,
    blocking,
  };
}

/* ── Money ────────────────────────────────────────────────────────────────
 * The current earnings screen sums every payout row and calls the result
 * "Total paid out", which means pending money is displayed as though it had
 * already arrived. A candidate who plans rent on that number is being misled
 * by our arithmetic, so paid and incoming are now separate figures and the
 * split is the whole screen. */

export type Money = {
  paidMinor: number;
  /** Pending payouts only (legacy "Pending payout"); failed ones are not on their way. */
  incomingMinor: number;
  /** Transfers that failed, kept apart from paid and pending (INW-04). */
  failedMinor: number;
  currency: string;
  lastPaidAt: Date | null;
  nextExpectedAt: Date | null;
};

/**
 * A payout row's state, as legacy reads it (routes.ts:13490): "paid",
 * "pending" and "failed", case-insensitive. Anything else is none of the
 * three and is left out of every total, as legacy did.
 */
export function payoutState(status: string | null | undefined): "paid" | "pending" | "failed" | null {
  const s = (status ?? "").trim().toLowerCase();
  return s === "paid" || s === "pending" || s === "failed" ? s : null;
}

/**
 * Paid, pending and failed, kept apart (INT-01 / INW-04). Only a pending
 * payout is "on its way"; a failed one used to be added to it.
 */
export function deriveMoney(payouts: PayoutRow[]): Money {
  const currency = payouts.find((p) => p.currency)?.currency ?? "INR";
  let paidMinor = 0;
  let incomingMinor = 0;
  let failedMinor = 0;
  let lastPaidAt: Date | null = null;
  let nextExpectedAt: Date | null = null;

  for (const p of payouts) {
    const amount = Math.max(0, p.amountMinor ?? 0);
    const state = payoutState(p.status);
    if (state === "paid") {
      paidMinor += amount;
      if (p.paidAt && (!lastPaidAt || p.paidAt > lastPaidAt)) lastPaidAt = p.paidAt;
    } else if (state === "pending") {
      incomingMinor += amount;
      const when = readScheduledForDate(p);
      if (when && (!nextExpectedAt || when < nextExpectedAt)) nextExpectedAt = when;
    } else if (state === "failed") {
      failedMinor += amount;
    }
  }
  return { paidMinor, incomingMinor, failedMinor, currency, lastPaidAt, nextExpectedAt };
}

/* ── Small helpers ─────────────────────────────────────────────────────── */

export function hoursIn(t: TimesheetRow): number {
  const entries = toArray<{ hours?: unknown }>(t.entries);
  return entries.reduce((sum, e) => sum + (typeof e.hours === "number" ? e.hours : 0), 0);
}

/** Distinct work the candidate described, which is the interesting part. */
export function workLines(t: TimesheetRow, limit = 3): string[] {
  const entries = toArray<{ note?: unknown }>(t.entries);
  const seen = new Set<string>();
  for (const e of entries) {
    const note = typeof e.note === "string" ? e.note.trim() : "";
    if (note) seen.add(note);
    if (seen.size >= limit) break;
  }
  return [...seen];
}

export function periodLabel(t: TimesheetRow): string {
  const start = t.periodStart;
  const end = t.periodEnd ?? t.periodStart;
  if (!start) return "this period";
  const sameMonth =
    end &&
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth();
  const a = start.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const b = end!.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  if (sameMonth) return `${a} to ${b}`;
  return `${a} to ${b} ${end!.getFullYear()}`;
}

export function slotOf(i: InterviewRow): Date | null {
  const slots = [i.slot1, i.slot2, i.slot3].filter((s): s is Date => s instanceof Date);
  if (i.selectedSlot && i.selectedSlot >= 1 && i.selectedSlot <= 3) {
    const chosen = [i.slot1, i.slot2, i.slot3][i.selectedSlot - 1];
    if (chosen) return chosen;
  }
  return slots.sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
}

export function slotsOf(i: InterviewRow): Date[] {
  return [i.slot1, i.slot2, i.slot3].filter((s): s is Date => s instanceof Date);
}

/**
 * Whether a moment has already passed, as of this request.
 *
 * Reads the clock at call time on the server, once per render, which is what a
 * page listing dated rows wants. It lives here rather than in a component
 * because React's purity rule forbids an impure call in a render body, and
 * because three pages need the same question answered the same way.
 */
export function isPast(when: Date | null | undefined): boolean {
  if (!when) return false;
  return when.getTime() < Date.now();
}

export function daysBetween(from: Date | null, to: Date): number {
  if (!from) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

export function ordinal(n: number): string {
  const v = Math.max(1, Math.round(n));
  if (v === 11 || v === 12 || v === 13) return `${v}th`;
  return `${v}${["th", "st", "nd", "rd"][Math.min(v % 10, 4)] ?? "th"}`;
}

function formatHoursInPlainWords(h: number): string {
  if (h <= 0) return "no time";
  const days = Math.round(h / 6);
  return days <= 1 ? "about a day of work" : `about ${days} days of work`;
}

function prettyRating(key: string): string {
  const map: Record<string, string> = {
    communication: "Communication",
    coding: "Coding",
    aptitude: "Aptitude",
    problemSolving: "Problem solving",
    leadership: "Leadership",
  };
  return map[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

function readScheduledFor(r: PayoutRow): string | null {
  const d = readScheduledForDate(r);
  return d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : null;
}

export function readScheduledForDate(r: PayoutRow): Date | null {
  const raw = r.raw && typeof r.raw === "object" ? (r.raw as { scheduledFor?: unknown; scheduled_for?: unknown }) : null;
  const v = raw?.scheduledFor ?? raw?.scheduled_for;
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}


export function toArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}
