import { csrfFetch } from "@/lib/client-fetch";

export type MeetingResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string; code?: string };

export const CLASH = "That time clashes with another meeting. Pick a different time.";

/** POST to a meetings route. Errors come back as the route's own sentence; a clash always reads the same. */
export async function postMeeting<T = Record<string, unknown>>(path: string, body: unknown): Promise<MeetingResult<T>> {
  try {
    const res = await csrfFetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
    if (res.ok) return { ok: true, data };
    if (data.code === "conflict") return { ok: false, error: CLASH, code: "conflict" };
    return { ok: false, error: data.error ?? "That didn't go through. Try again in a moment.", code: data.code };
  } catch {
    return { ok: false, error: "Couldn't reach the server. Check your connection and try again." };
  }
}

/** Codes that mean the meeting moved on while the screen was open: refresh so the page shows what is true now. */
export const STALE_CODES = new Set(["stale", "lapsed", "not_pending", "not_open", "started"]);
