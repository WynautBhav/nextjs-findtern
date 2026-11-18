/**
 * Where a candidate's AI interview report and recording live.
 *
 * Legacy admin stored them only as tagged lines in the AI interview row's
 * notes ("feedback: https://…", "recording: https://…"), on the employer id
 * "admin"; this app's admin also copies them into the onboarding extraData.
 * Reading extraData alone missed every report entered on the legacy site, so
 * the employer profile showed no report link (bug sheet 26 Oct: "where can I
 * see the candidate's AI interview report"). The newest AI interview wins,
 * extraData fills any gap - the same order the legacy candidate page used
 * (employer-intern-detail.tsx:899).
 */

import { and, desc, eq, inArray, or } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { AI_INTERVIEW_EMAIL } from "@/lib/intern-data";

export type AiInterviewLinks = { feedbackLink: string | null; recordingLink: string | null };

/** The URL on a "label: https://…" line of interview notes, if any. */
export function linkFromNotes(notes: string | null | undefined, label: string): string | null {
  const prefix = `${label.toLowerCase()}:`;
  for (const line of String(notes ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.toLowerCase().startsWith(prefix)) continue;
    const url = trimmed.slice(prefix.length).trim();
    if (/^https?:\/\//i.test(url)) return url;
  }
  return null;
}

function httpUrl(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim()) ? value.trim() : null;
}

export async function aiInterviewLinks(
  internId: string,
  // A promise is accepted so a caller can start this read before its own `extra` has loaded (the two are independent).
  extra: Record<string, unknown> | null | undefined | Promise<Record<string, unknown> | null | undefined>,
): Promise<AiInterviewLinks> {
  let feedbackLink: string | null = null;
  let recordingLink: string | null = null;
  try {
    const db = getDb();
    // One statement: the AI employer ids are a sub-select, not a first round trip.
    const rows = await db
      .select({ notes: schema.interviews.notes })
      .from(schema.interviews)
      .where(
        and(
          eq(schema.interviews.internId, internId),
          or(
            eq(schema.interviews.employerId, "admin"),
            inArray(
              schema.interviews.employerId,
              db.select({ id: schema.employers.id }).from(schema.employers).where(eq(schema.employers.companyEmail, AI_INTERVIEW_EMAIL)),
            ),
          ),
        ),
      )
      .orderBy(desc(schema.interviews.createdAt));
    for (const row of rows) {
      feedbackLink ??= linkFromNotes(row.notes, "feedback");
      recordingLink ??= linkFromNotes(row.notes, "recording");
    }
  } catch {
    // Fall back to what the profile carries.
  }
  const bag = await extra;
  return {
    feedbackLink: feedbackLink ?? httpUrl(bag?.aiFeedbackLink),
    recordingLink: recordingLink ?? httpUrl(bag?.aiRecordingLink),
  };
}
