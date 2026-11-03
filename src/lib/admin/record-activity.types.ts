/**
 * The contract between the record-activity loaders (lib/admin/record-activity.ts)
 * and the Activities timeline on the admin candidate and company pages.
 * Plain serialisable data only: it crosses from a server component into
 * client components.
 */

export type ActivityKind =
  | "proposal"
  | "interview"
  | "timesheet"
  | "payout"
  | "payment"
  | "document"
  | "review"
  | "project"
  | "hire"
  | "signup"
  | "offer";

export type ActivityEntry = {
  /** Unique and stable, e.g. "proposal:<id>:sent". Used as the React key and to dedupe. */
  id: string;
  /** ISO timestamp the thing happened. */
  at: string;
  kind: ActivityKind;
  /** Who did it (the avatar and name); null when nobody in particular did. */
  actor: { name: string; id?: string | null } | null;
  /** Plain past-tense phrase, e.g. "sent a proposal to". */
  verb: string;
  /** What it was done to or with, e.g. "Heavy Data Co". */
  object?: string;
  /** One line of context, e.g. a project name. Never an identity or bank number. */
  detail?: string;
  /** A status change, only when both sides are recorded in the data. */
  change?: { from: string; to: string } | null;
  /** The related record's own page in the admin. */
  href?: string | null;
};
