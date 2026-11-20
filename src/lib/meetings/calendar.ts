/**
 * The platform calendar behind an interface, so meeting code never talks to Google directly and tests run with a fake.
 *
 * Every event is made on Findtern's own calendar with NO attendees (neither side may see the other's address); each side
 * gets its own .ics and email from Findtern instead. `createEvent` resolves null when no calendar is connected: the meeting
 * is then "booked, link pending" and an admin adds the link (api/admin/interviews/[id]/meeting-link).
 *
 * Alias-free so `node --test` can use the fake. The real client (src/lib/google.ts underneath) is in calendar-google.ts.
 */

export type CalendarEventInput = { title: string; description: string; start: Date; end: Date; timezone: string };
export type CalendarEvent = { eventId: string; meetUrl: string };

export interface MeetCalendar {
  /** null: no calendar connected (nothing was created). Throws when Google refuses. */
  createEvent(e: CalendarEventInput): Promise<CalendarEvent | null>;
  patchEvent(eventId: string, patch: Partial<Pick<CalendarEventInput, "start" | "end" | "timezone" | "title" | "description">>): Promise<void>;
  /** Idempotent: an event already gone is fine. */
  deleteEvent(eventId: string): Promise<void>;
}

/** In-memory calendar for tests; records every call. */
export class FakeCalendar implements MeetCalendar {
  events = new Map<string, CalendarEventInput & { meetUrl: string; attendees: string[] }>();
  calls: { op: "create" | "patch" | "delete"; eventId?: string }[] = [];
  /** "none": nothing connected; "fail": Google errors. */
  mode: "ok" | "none" | "fail" = "ok";
  private n = 0;

  async createEvent(e: CalendarEventInput): Promise<CalendarEvent | null> {
    if (this.mode === "none") return null;
    if (this.mode === "fail") throw new Error("fake google: refused");
    const eventId = `fake-evt-${++this.n}`;
    const meetUrl = `https://meet.google.com/fake-${this.n}`;
    this.events.set(eventId, { ...e, meetUrl, attendees: [] });
    this.calls.push({ op: "create", eventId });
    return { eventId, meetUrl };
  }

  async patchEvent(eventId: string, patch: Partial<CalendarEventInput>): Promise<void> {
    const cur = this.events.get(eventId);
    if (cur) this.events.set(eventId, { ...cur, ...patch });
    this.calls.push({ op: "patch", eventId });
  }

  async deleteEvent(eventId: string): Promise<void> {
    this.events.delete(eventId);
    this.calls.push({ op: "delete", eventId });
  }
}

let override: MeetCalendar | null = null;
/** Tests inject the fake here; null restores the real client. */
export function setCalendar(c: MeetCalendar | null): void {
  override = c;
}

/** The calendar meeting code should use: an injected one, else Findtern's Google calendar. */
export async function getCalendar(): Promise<MeetCalendar> {
  if (override) return override;
  return (await import("./calendar-google.ts")).googleCalendar;
}
