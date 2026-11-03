import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { CALENDAR_TOKEN_OWNER, DRIVE_SCOPE, calendarConfig, refreshAccessToken } from "@/lib/google";

/**
 * Findtern's Drive, used only for the redacted AI interview reports.
 *
 * Same Google connection as the Meet calendar (`employer_google_tokens`, owner
 * CALENDAR_TOKEN_OWNER), with the narrow `drive.file` scope: the app can only
 * see files it created itself. Plain fetch, like `google.ts`; no SDK.
 */

const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
export const REPORTS_FOLDER = "Findtern AI Reports";
/** Stamped on every file we create so `attach` can tell ours from anything else. */
export const REPORT_SOURCE = "findtern-ai-report";

export class DriveError extends Error {
  status: number;
  /** "reconnect": ask an admin to reconnect Google; "failed": Google said no. */
  kind: "reconnect" | "failed";
  constructor(message: string, status = 500, kind: "reconnect" | "failed" = "failed") {
    super(message);
    this.status = status;
    this.kind = kind;
  }
}

export type DriveStatus = "ready" | "reconnect" | "not_configured";

export function hasDriveScope(scope: string | null | undefined): boolean {
  return String(scope ?? "").split(/\s+/).includes(DRIVE_SCOPE);
}

/** Whether uploads can work now. null = couldn't check. */
export async function driveStatus(): Promise<DriveStatus | null> {
  if (!calendarConfig()) return "not_configured";
  try {
    const [token] = await getDb()
      .select({ refresh: schema.employerGoogleTokens.refreshToken, scope: schema.employerGoogleTokens.scope })
      .from(schema.employerGoogleTokens)
      .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
      .limit(1);
    return token?.refresh && hasDriveScope(token.scope) ? "ready" : "reconnect";
  } catch (e) {
    console.error("[drive] token check failed", e);
    return null;
  }
}

/** A fresh access token, or a DriveError telling the admin to (re)connect Google. */
export async function driveAccessToken(): Promise<string> {
  const cfg = calendarConfig();
  if (!cfg) throw new DriveError("Google is not configured on this server.", 503, "reconnect");
  const [token] = await getDb()
    .select({ refresh: schema.employerGoogleTokens.refreshToken, scope: schema.employerGoogleTokens.scope })
    .from(schema.employerGoogleTokens)
    .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
    .limit(1);
  if (!token?.refresh || !hasDriveScope(token.scope)) {
    throw new DriveError("Reconnect Google in Settings so reports can be saved to Drive.", 409, "reconnect");
  }
  try {
    return await refreshAccessToken(cfg, token.refresh);
  } catch {
    throw new DriveError("Google sign-in expired. Reconnect Google in Settings.", 409, "reconnect");
  }
}

async function drive<T>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) {
    // Never echo Google's body to the browser: it can name accounts and quotas.
    console.error("[drive]", init.method ?? "GET", path.split("?")[0], res.status);
    throw new DriveError(`Google Drive refused the request (${res.status}).`, res.status === 404 ? 404 : 502);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

let folderCache: { id: string; at: number } | null = null;

/** The "Findtern AI Reports" folder; made on first use. With `drive.file` the search only sees folders we made. */
export async function ensureReportsFolder(token: string): Promise<string> {
  if (folderCache && Date.now() - folderCache.at < 10 * 60_000) return folderCache.id;
  const q = encodeURIComponent(
    `name = '${REPORTS_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const found = await drive<{ files?: { id: string }[] }>(token, `/files?q=${q}&fields=files(id)&pageSize=1`);
  const id =
    found.files?.[0]?.id ??
    (
      await drive<{ id: string }>(token, "/files?fields=id", {
        method: "POST",
        body: JSON.stringify({ name: REPORTS_FOLDER, mimeType: "application/vnd.google-apps.folder" }),
      })
    ).id;
  folderCache = { id, at: Date.now() };
  return id;
}

/**
 * Starts a resumable upload and returns the one-time upload URL. The browser
 * sends the file there itself, so it never passes through our request-size
 * limit. `origin` makes Google allow that cross-origin PUT.
 */
export async function createUploadSession(
  token: string,
  input: { name: string; internId: string; size: number; origin: string },
): Promise<string> {
  const parent = await ensureReportsFolder(token);
  const res = await fetch(`${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "application/pdf",
      "X-Upload-Content-Length": String(input.size),
      Origin: input.origin,
    },
    body: JSON.stringify({
      name: input.name,
      mimeType: "application/pdf",
      parents: [parent],
      appProperties: { source: REPORT_SOURCE, internId: input.internId },
    }),
  });
  const location = res.headers.get("location");
  if (!res.ok || !location) {
    console.error("[drive] upload session", res.status);
    throw new DriveError(`Google Drive refused the upload (${res.status}).`, 502);
  }
  return location;
}

export type DriveFile = {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  trashed?: boolean;
  webViewLink?: string;
  appProperties?: Record<string, string>;
};

export function getFile(token: string, fileId: string): Promise<DriveFile> {
  return drive<DriveFile>(
    token,
    `/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,trashed,webViewLink,appProperties`,
  );
}

/** "Anyone with the link can view": the employer opens it without a Google account. */
export async function shareAnyoneWithLink(token: string, fileId: string): Promise<void> {
  await drive(token, `/files/${encodeURIComponent(fileId)}/permissions`, {
    method: "POST",
    body: JSON.stringify({ type: "anyone", role: "reader", allowFileDiscovery: false }),
  });
}

export async function trashFile(token: string, fileId: string): Promise<void> {
  try {
    await drive(token, `/files/${encodeURIComponent(fileId)}`, { method: "PATCH", body: JSON.stringify({ trashed: true }) });
  } catch (e) {
    // Already gone (404) is the outcome we wanted.
    if (!(e instanceof DriveError && e.status === 404)) throw e;
  }
}
