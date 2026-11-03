import { NextResponse } from "next/server";
import { z } from "zod";

import { DriveError } from "@/lib/google-drive";

/** Shared by the three ai-reports routes. */

export const MAX_REPORT_BYTES = 25 * 1024 * 1024;

export const idSchema = z.string().trim().min(1).max(64).regex(/^[\w-]+$/, "Invalid id");

/** Incruiter candidate id as printed in the report ("CAN00269"). */
export const canIdSchema = z.string().trim().regex(/^CAN\d{3,12}$/i, "Invalid candidate id").transform((v) => v.toUpperCase());

/** The Drive name never carries the candidate's name: the employer sees it when the link opens. */
export function reportFileName(canId: string | null | undefined, internId: string): string {
  return `Feedback Report ${canId || internId.slice(0, 8)} (redacted).pdf`;
}

export function driveErrorResponse(e: unknown) {
  if (e instanceof DriveError) {
    return NextResponse.json({ error: e.message, code: e.kind }, { status: e.status >= 400 && e.status < 600 ? e.status : 502 });
  }
  console.error("[ai-reports]", e);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}
