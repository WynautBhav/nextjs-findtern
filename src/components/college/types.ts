/** Student rows as the placement console's client components receive them. */
export type StudentRow = {
  userId: string;
  name: string;
  email: string;
  rollNo: string | null;
  status: "claimed" | "verified";
  year: number | null;
  branch: string | null;
  cgpa: number | null;
  score: number | null;
  aiStatus: string;
  lastSeenAt: string | null;
  lastActivityAt: string | null;
  offersPending: number;
  proposals: number;
  interviewsScheduled: number;
  driveMeetings: number;
  purposes: string[];
  collegeId: string;
  leftAt: null;
};
