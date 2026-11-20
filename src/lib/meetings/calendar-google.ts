import { eq } from "drizzle-orm";

import { getDb, schema } from "@/lib/db";
import { CALENDAR_TOKEN_OWNER, calendarConfig, createMeetEvent, deleteMeetEvent, refreshAccessToken } from "@/lib/google";

import type { MeetCalendar } from "./calendar.ts";

/** Findtern's one Google calendar (the Calendar connection in Admin > Settings). Never invites attendees. */
async function refreshToken(): Promise<string | null> {
  if (!calendarConfig()) return null;
  const [row] = await getDb()
    .select({ refreshToken: schema.employerGoogleTokens.refreshToken })
    .from(schema.employerGoogleTokens)
    .where(eq(schema.employerGoogleTokens.employerId, CALENDAR_TOKEN_OWNER))
    .limit(1);
  return row?.refreshToken ?? null;
}

export const googleCalendar: MeetCalendar = {
  async createEvent(e) {
    const token = await refreshToken();
    if (!token) return null;
    const ev = await createMeetEvent(token, { summary: e.title, description: e.description, start: e.start, end: e.end, timezone: e.timezone, attendees: [] });
    return { eventId: ev.eventId, meetUrl: ev.meetUrl };
  },

  async patchEvent(eventId, patch) {
    const token = await refreshToken();
    const cfg = calendarConfig();
    if (!token || !cfg) return;
    const access = await refreshAccessToken(cfg, token);
    const tz = patch.timezone ?? "Asia/Kolkata";
    const calendarId = encodeURIComponent(process.env.MEET_CALENDAR_ID || "primary");
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(patch.title ? { summary: patch.title } : {}),
        ...(patch.description ? { description: patch.description } : {}),
        ...(patch.start ? { start: { dateTime: patch.start.toISOString(), timeZone: tz } } : {}),
        ...(patch.end ? { end: { dateTime: patch.end.toISOString(), timeZone: tz } } : {}),
      }),
    });
    if (!res.ok) throw new Error(`Google Calendar patch failed (${res.status})`);
  },

  async deleteEvent(eventId) {
    const token = await refreshToken();
    if (!token) return;
    await deleteMeetEvent(token, eventId);
  },
};
