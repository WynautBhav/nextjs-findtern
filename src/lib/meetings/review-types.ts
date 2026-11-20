/**
 * Shared shapes for meeting reviews (Phase 3: Fireflies transcripts, deterministic flags, the admin queue).
 * Pure: types and constants only, relative imports only, so it runs under plain `node --test`.
 *
 * Privacy: transcripts, summaries and flags are ADMIN-ONLY. No employer, intern or college route may read them.
 * Nothing here punishes anyone: a flag is a pointer for an admin to read, never an action.
 */

export type FlagSeverity = "high" | "medium" | "low";

/** Rule codes. Stored in `meeting_transcripts.flags[].rule`; add codes, never rename (stored rows keep them). */
export const FLAG_RULES = {
  phone_number: { label: "Phone number", severity: "high" },
  email_address: { label: "Email address", severity: "high" },
  messaging_handle: { label: "WhatsApp / Telegram / Signal / Instagram", severity: "medium" },
  payment_handle: { label: "UPI id, payment app or bank account", severity: "high" },
  direct_payment: { label: "Pay or stipend outside Findtern", severity: "high" },
  external_meeting_link: { label: "External meeting link", severity: "low" },
  skip_platform: { label: "Skip the platform", severity: "high" },
} as const satisfies Record<string, { label: string; severity: FlagSeverity }>;

export type FlagCode = keyof typeof FLAG_RULES;
export const FLAG_CODES = Object.keys(FLAG_RULES) as FlagCode[];
export const isFlagCode = (v: unknown): v is FlagCode => typeof v === "string" && Object.hasOwn(FLAG_RULES, v);

export const SEVERITY_RANK: Record<FlagSeverity, number> = { high: 3, medium: 2, low: 1 };

/** One spoken line of a transcript, as stored (short keys: this is the bulk of the row). */
export type TranscriptLine = {
  /** Sentence index within the transcript. */
  i: number;
  /** The words. */
  t: string;
  /** Start offset in seconds from the start of the recording; null when the source gave none. */
  s: number | null;
  /** Speaker label exactly as the source gives it (a name or "Speaker 1"); null when unknown. */
  sp: string | null;
};

/** One flag: evidence only. `snippet` is the matching words with a few words of context either side. */
export type Flag = {
  rule: FlagCode;
  severity: FlagSeverity;
  snippet: string;
  /** Seconds from the start of the recording (for jumping to the moment); null when unknown. */
  offsetSec: number | null;
  speaker: string | null;
  /** `TranscriptLine.i` the match came from. */
  line: number;
};

export type ReviewState = "open" | "clean" | "dismissed" | "warned" | "frozen";
export const REVIEW_STATES: readonly ReviewState[] = ["open", "clean", "dismissed", "warned", "frozen"];
export type ReviewAction = "dismiss" | "warn" | "freeze";
export type ReviewPartyType = "employer" | "intern";

/** How the transcript was tied to a meeting (strongest first). */
export type MatchMethod = "calendar_event" | "meet_link" | "title_time";

/** Retention, decided by Vaibhav: transcript text and summary 90 days; flagged evidence (the flags and their snippets) 1 year. */
export const TRANSCRIPT_RETENTION_DAYS = 90;
export const EVIDENCE_RETENTION_DAYS = 365;
/** A confirmed meeting with no transcript this many hours after it ended shows "No recording" to the admin. */
export const NO_RECORDING_AFTER_HOURS = 3;

/** What the admin queue shows for one party of a meeting. Names are for admins only. */
export type ReviewParty = {
  type: ReviewPartyType;
  id: string;
  name: string;
  /** Confirmed violations on record (warnings + freezes): the value the strike service wants back as `expectedViolations`. */
  violations: number;
  frozen: boolean;
};

export type ReviewKind =
  /** Matched to a meeting, transcript fetched. */
  | "reviewed"
  /** Fireflies sent a transcript we could not tie to a meeting. */
  | "unmatched"
  /** A confirmed meeting that ended more than NO_RECORDING_AFTER_HOURS ago with no transcript (bot did not join / nothing delivered). */
  | "no_recording"
  /** Webhook received, transcript not fetched yet (or retrying with backoff). */
  | "pending_fetch"
  /** Fetching failed after every retry. */
  | "fetch_failed";

export type ReviewRowView = {
  /** `meeting_transcripts.id`, or `iv:<interviewId>` for a no-recording row (which has no transcript row). */
  key: string;
  kind: ReviewKind;
  transcriptId: string | null;
  meetingId: string | null;
  title: string;
  /** Meeting (or recording) start, ISO UTC. */
  meetingAt: string | null;
  durationMin: number | null;
  employer: ReviewParty | null;
  intern: ReviewParty | null;
  project: string | null;
  state: ReviewState;
  flagsCount: number;
  maxSeverity: FlagSeverity | null;
  /** Fireflies' AI summary; null once purged (90 days) or when none exists. */
  summary: string | null;
  /** Every flag, evidence only; empty once purged (1 year). */
  flags: Flag[];
  /** The full text is gone (retention) so only the flags/metadata remain. */
  textPurged: boolean;
  evidencePurged: boolean;
  matchMethod: MatchMethod | null;
  /** Why an unmatched transcript was not tied to a meeting. */
  matchNote: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
  reviewParty: ReviewPartyType | null;
  lastError: string | null;
  attempts: number;
  /** The recording page in Fireflies (admin only), when known. */
  sourceUrl: string | null;
};

export type ReviewFilter = "open" | "all" | "no_recording" | "unmatched";
export const REVIEW_FILTERS: readonly { key: ReviewFilter; label: string }[] = [
  { key: "open", label: "To review" },
  { key: "all", label: "All meetings" },
  { key: "no_recording", label: "No recording" },
  { key: "unmatched", label: "Unmatched" },
];
