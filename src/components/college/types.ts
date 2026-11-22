import type { HiddenReason } from "@/lib/college/student-readiness";
/** Student rows as the placement console's client components receive them. */
export type StudentRow = {
  userId: string;
  name: string;
  email: string;
  rollNo: string | null;
  phone: string | null;
  linkedin: string | null;
  status: "claimed" | "verified";
  year: number | null;
  branch: string | null;
  cgpa: number | null;
  semester?: number | null;
  score: number | null;
  aiStatus: string;
  lastSeenAt: string | null;
  lastActivityAt: string | null;
  offersPending: number;
  hired: number;
  proposals: number;
  interviewsScheduled: number;
  driveMeetings: number;
  collegeId: string;
  openToWork: boolean;
  leftAt: null;
  /** Why employers can't find this student, one line; null when they can (student-readiness.ts). */
  hiddenWhy?: string | null;
  hidden?: HiddenReason | null;
  /** Why they can't be hired yet; null when they can. */
  hireWhy?: string | null;
};
