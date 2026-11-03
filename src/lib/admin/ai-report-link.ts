import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AI_INTERVIEW_EMAIL } from "@/lib/intern-data";
import { mergeInterviewNotes } from "@/lib/admin/interview-notes";

/**
 * Makes a redacted report the candidate's "Feedback report".
 *
 * The employer page reads the link from two places (`aiInterviewLinks`): the
 * newest AI interview's `feedback:` note line first, then the profile's
 * `extraData.aiFeedbackLink`. Writing only the profile would let an older raw
 * Incruiter link in an interview note keep winning, so both are written.
 */

export type AiReportMeta = {
  driveFileId: string;
  fileName: string;
  canId: string | null;
  /** Admin user id who published it. */
  by: string;
};

export class AttachError extends Error {
  code: "no_profile" | "conflict";
  constructor(code: "no_profile" | "conflict", message: string) {
    super(message);
    this.code = code;
  }
}

/** Drive file of the report published earlier, so the caller can trash it. */
export async function currentReportFileId(internId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, internId))
    .limit(1);
  const report = (row?.extra as Record<string, unknown> | null | undefined)?.aiReport as { driveFileId?: unknown } | undefined;
  return typeof report?.driveFileId === "string" ? report.driveFileId : null;
}

export async function attachAiFeedbackLink(
  internId: string,
  link: string,
  meta: AiReportMeta,
): Promise<{ previousDriveFileId: string | null }> {
  if (!/^https:\/\/\S+$/i.test(link)) throw new Error("The report link must be an https:// link.");
  const db = getDb();

  // One transaction: the interview note and the profile change together or not at all, and the profile row is
  // locked, so two attaches for the same candidate run one after the other. The second one then sees the first's
  // file as "previous" and the caller bins it, instead of both leaving a public file behind.
  return db.transaction(async (tx) => {
    const [onboarding] = await tx
      .select({ id: schema.internOnboarding.id, extra: schema.internOnboarding.extraData })
      .from(schema.internOnboarding)
      .where(eq(schema.internOnboarding.userId, internId))
      .for("update")
      .limit(1);
    if (!onboarding) throw new AttachError("no_profile", "This candidate has no profile yet, so there is nowhere to attach the report.");
    const prev = (onboarding.extra as Record<string, unknown> | null)?.aiReport as { driveFileId?: unknown } | undefined;
    const previousDriveFileId = typeof prev?.driveFileId === "string" ? prev.driveFileId : null;

    // 1. The newest AI interview row (legacy "admin" employer or the synthetic AI employer).
    const aiEmployers = await tx
      .select({ id: schema.employers.id })
      .from(schema.employers)
      .where(eq(schema.employers.companyEmail, AI_INTERVIEW_EMAIL));
    const employerIds = ["admin", ...aiEmployers.map((e) => e.id)];

    let stamped = false;
    let hadRow = false;
    for (let attempt = 0; attempt < 2 && !stamped; attempt++) {
      const [row] = await tx
        .select({ id: schema.interviews.id, notes: schema.interviews.notes })
        .from(schema.interviews)
        .where(and(eq(schema.interviews.internId, internId), inArray(schema.interviews.employerId, employerIds)))
        .orderBy(desc(schema.interviews.createdAt))
        .limit(1);
      if (!row) break;
      hadRow = true;
      // Only if the notes are still what was read: the employer may have left feedback in between (ADP-33).
      const [updated] = await tx
        .update(schema.interviews)
        .set({ notes: mergeInterviewNotes(row.notes, { feedbackLink: link }), updatedAt: new Date() })
        .where(
          and(
            eq(schema.interviews.id, row.id),
            row.notes == null ? isNull(schema.interviews.notes) : eq(schema.interviews.notes, row.notes),
          ),
        )
        .returning({ id: schema.interviews.id });
      stamped = Boolean(updated);
    }
    if (hadRow && !stamped) {
      throw new AttachError("conflict", "This candidate's interview was just updated by someone else. Try again.");
    }

    // 2. The profile. A JSON merge in SQL, so a ratings edit made at the same moment is not overwritten.
    const patch = {
      aiFeedbackLink: link,
      aiReport: { driveFileId: meta.driveFileId, fileName: meta.fileName, canId: meta.canId, by: meta.by, at: new Date().toISOString() },
    };
    await tx
      .update(schema.internOnboarding)
      .set({
        extraData: sql`coalesce(${schema.internOnboarding.extraData}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb`,
        updatedAt: new Date(),
      })
      .where(eq(schema.internOnboarding.id, onboarding.id));

    return { previousDriveFileId };
  });
}
