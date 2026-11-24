// How many of a drive's students employers can actually see, and why the rest can't: one reason each, the first that
// blocks (student-readiness.ts), so the parts always add up to the drive's strength. Pure, so node:test runs it.

import { HIDDEN_REASONS } from "./labels.ts";
import type { HiddenReason } from "./student-readiness.ts";

export type ReachBucketId = HiddenReason | "unverified";
export type ReachBucket = { id: ReachBucketId; label: string; ids: string[] };
export type DriveReach = {
  /** Every student who matches the drive's rules. */
  strength: number;
  /** Of those, the ones employers can see today. */
  seen: number;
  /** strength - seen, split by reason in the order the officer reads them. */
  out: number;
  buckets: ReachBucket[];
};

/** The five reasons the owner named always show (a zero is an answer); paused and unapproved only when someone is. */
const ALWAYS: ReachBucketId[] = ["checks", "rejected", "profile", "interview", "open_to_work"];
const UNVERIFIED_LABEL = "Waiting for your approval";

export function driveReach(
  students: { userId: string; status: string }[],
  readiness: ReadonlyMap<string, { seen: boolean; hidden: HiddenReason | null }>,
): DriveReach {
  const by = new Map<ReachBucketId, string[]>();
  let seen = 0;
  for (const s of students) {
    // Employers only ever get a college's verified students, whatever Findtern says about the rest.
    const r = readiness.get(s.userId);
    const id: ReachBucketId | null = s.status !== "verified" ? "unverified" : r?.seen ? null : (r?.hidden ?? "profile");
    if (id === null) {
      seen++;
      continue;
    }
    by.set(id, [...(by.get(id) ?? []), s.userId]);
  }
  const buckets: ReachBucket[] = [
    ...HIDDEN_REASONS.filter((h) => ALWAYS.includes(h.id) || by.has(h.id)).map((h) => ({ id: h.id as ReachBucketId, label: h.label, ids: by.get(h.id) ?? [] })),
    ...(by.has("unverified") ? [{ id: "unverified" as const, label: UNVERIFIED_LABEL, ids: by.get("unverified")! }] : []),
  ];
  return { strength: students.length, seen, out: students.length - seen, buckets };
}
