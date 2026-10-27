import type { StudentRow } from "@/components/college/types";
import type { CollegeStudent } from "./scope";

export function toStudentRow(s: CollegeStudent): StudentRow {
  return {
    userId: s.userId,
    name: `${s.firstName} ${s.lastName}`.trim(),
    email: s.email,
    rollNo: s.rollNo,
    status: s.status,
    year: s.year,
    branch: s.branch,
    cgpa: s.cgpa,
    score: s.score,
    aiStatus: s.aiStatus,
    lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
    lastActivityAt: s.lastActivityAt?.toISOString() ?? null,
    offersPending: s.offersPending,
    proposals: s.proposals,
    interviewsScheduled: s.interviewsScheduled,
    driveMeetings: s.driveMeetings,
    purposes: [...s.purposes],
    collegeId: s.collegeId,
    leftAt: null,
  };
}
