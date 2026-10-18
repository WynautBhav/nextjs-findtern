/** Full IANA timezone list for interview scheduling, ported from the legacy dashboard.
 *
 * Labels are plain text (no flag emoji) per house style. Group headers render
 * as disabled separators in the select. */
export type TimezoneOption = { id: string; label: string; group?: boolean };

export const TIMEZONES: TimezoneOption[] = [
  { id: "group-utc", label: "UTC / Global", group: true },
  { id: "UTC", label: "UTC" },
  { id: "Etc/UTC", label: "Etc/UTC" },
  { id: "Etc/GMT", label: "Etc/GMT" },
  { id: "group-asia", label: "Asia", group: true },
  { id: "Asia/Kolkata", label: "Asia/Kolkata" },
  { id: "Asia/Karachi", label: "Asia/Karachi" },
  { id: "Asia/Dhaka", label: "Asia/Dhaka" },
  { id: "Asia/Kathmandu", label: "Asia/Kathmandu" },
  { id: "Asia/Colombo", label: "Asia/Colombo" },
  { id: "Asia/Dubai", label: "Asia/Dubai" },
  { id: "Asia/Muscat", label: "Asia/Muscat" },
  { id: "Asia/Riyadh", label: "Asia/Riyadh" },
  { id: "Asia/Qatar", label: "Asia/Qatar" },
  { id: "Asia/Kuwait", label: "Asia/Kuwait" },
  { id: "Asia/Tehran", label: "Asia/Tehran" },
  { id: "Asia/Baghdad", label: "Asia/Baghdad" },
  { id: "Asia/Jerusalem", label: "Asia/Jerusalem" },
  { id: "Asia/Amman", label: "Asia/Amman" },
  { id: "Asia/Beirut", label: "Asia/Beirut" },
  { id: "Asia/Damascus", label: "Asia/Damascus" },
  { id: "Asia/Istanbul", label: "Asia/Istanbul" },
  { id: "Asia/Tbilisi", label: "Asia/Tbilisi" },
  { id: "Asia/Yerevan", label: "Asia/Yerevan" },
  { id: "Asia/Baku", label: "Asia/Baku" },
  { id: "Asia/Kabul", label: "Asia/Kabul" },
  { id: "Asia/Tashkent", label: "Asia/Tashkent" },
  { id: "Asia/Almaty", label: "Asia/Almaty" },
  { id: "Asia/Tokyo", label: "Asia/Tokyo" },
  { id: "Asia/Seoul", label: "Asia/Seoul" },
  { id: "Asia/Shanghai", label: "Asia/Shanghai" },
  { id: "Asia/Hong_Kong", label: "Asia/Hong_Kong" },
  { id: "Asia/Taipei", label: "Asia/Taipei" },
  { id: "Asia/Singapore", label: "Asia/Singapore" },
  { id: "Asia/Kuala_Lumpur", label: "Asia/Kuala_Lumpur" },
  { id: "Asia/Jakarta", label: "Asia/Jakarta" },
  { id: "Asia/Bangkok", label: "Asia/Bangkok" },
  { id: "Asia/Ho_Chi_Minh", label: "Asia/Ho_Chi_Minh" },
  { id: "Asia/Manila", label: "Asia/Manila" },
  { id: "group-europe", label: "Europe", group: true },
  { id: "Europe/London", label: "Europe/London" },
  { id: "Europe/Paris", label: "Europe/Paris" },
  { id: "Europe/Berlin", label: "Europe/Berlin" },
  { id: "Europe/Rome", label: "Europe/Rome" },
  { id: "Europe/Madrid", label: "Europe/Madrid" },
  { id: "Europe/Amsterdam", label: "Europe/Amsterdam" },
  { id: "Europe/Brussels", label: "Europe/Brussels" },
  { id: "Europe/Vienna", label: "Europe/Vienna" },
  { id: "Europe/Zurich", label: "Europe/Zurich" },
  { id: "Europe/Stockholm", label: "Europe/Stockholm" },
  { id: "Europe/Oslo", label: "Europe/Oslo" },
  { id: "Europe/Copenhagen", label: "Europe/Copenhagen" },
  { id: "Europe/Helsinki", label: "Europe/Helsinki" },
  { id: "Europe/Warsaw", label: "Europe/Warsaw" },
  { id: "Europe/Prague", label: "Europe/Prague" },
  { id: "Europe/Budapest", label: "Europe/Budapest" },
  { id: "Europe/Athens", label: "Europe/Athens" },
  { id: "Europe/Bucharest", label: "Europe/Bucharest" },
  { id: "Europe/Sofia", label: "Europe/Sofia" },
  { id: "Europe/Kiev", label: "Europe/Kiev" },
  { id: "Europe/Moscow", label: "Europe/Moscow" },
  { id: "Europe/Lisbon", label: "Europe/Lisbon" },
  { id: "Europe/Dublin", label: "Europe/Dublin" },
  { id: "Europe/Reykjavik", label: "Europe/Reykjavik" },
  { id: "group-america", label: "America", group: true },
  { id: "America/New_York", label: "America/New_York" },
  { id: "America/Chicago", label: "America/Chicago" },
  { id: "America/Denver", label: "America/Denver" },
  { id: "America/Los_Angeles", label: "America/Los_Angeles" },
  { id: "America/Phoenix", label: "America/Phoenix" },
  { id: "America/Anchorage", label: "America/Anchorage" },
  { id: "America/Toronto", label: "America/Toronto" },
  { id: "America/Vancouver", label: "America/Vancouver" },
  { id: "America/Mexico_City", label: "America/Mexico_City" },
  { id: "America/Bogota", label: "America/Bogota" },
  { id: "America/Lima", label: "America/Lima" },
  { id: "America/Santiago", label: "America/Santiago" },
  { id: "America/Argentina/Buenos_Aires", label: "America/Argentina/Buenos_Aires" },
  { id: "America/Sao_Paulo", label: "America/Sao_Paulo" },
  { id: "America/Havana", label: "America/Havana" },
  { id: "America/Panama", label: "America/Panama" },
  { id: "America/Jamaica", label: "America/Jamaica" },
  { id: "group-aus", label: "Australia & Pacific", group: true },
  { id: "Australia/Sydney", label: "Australia/Sydney" },
  { id: "Australia/Melbourne", label: "Australia/Melbourne" },
  { id: "Australia/Brisbane", label: "Australia/Brisbane" },
  { id: "Australia/Perth", label: "Australia/Perth" },
  { id: "Australia/Adelaide", label: "Australia/Adelaide" },
  { id: "Australia/Darwin", label: "Australia/Darwin" },
  { id: "Pacific/Auckland", label: "Pacific/Auckland" },
  { id: "Pacific/Fiji", label: "Pacific/Fiji" },
  { id: "Pacific/Guam", label: "Pacific/Guam" },
  { id: "Pacific/Honolulu", label: "Pacific/Honolulu" },
  { id: "group-africa", label: "Africa", group: true },
  { id: "Africa/Cairo", label: "Africa/Cairo" },
  { id: "Africa/Johannesburg", label: "Africa/Johannesburg" },
  { id: "Africa/Nairobi", label: "Africa/Nairobi" },
  { id: "Africa/Lagos", label: "Africa/Lagos" },
  { id: "Africa/Accra", label: "Africa/Accra" },
  { id: "Africa/Casablanca", label: "Africa/Casablanca" },
  { id: "Africa/Algiers", label: "Africa/Algiers" },
  { id: "Africa/Tunis", label: "Africa/Tunis" },
];

/**
 * "2026-11-03T15:30" read as wall-clock time in `tz` → the UTC instant.
 * Uses Intl to find the zone's offset at that moment (DST-aware), then
 * corrects once for offsets that change across the guess.
 */
export function wallTimeToUtc(local: string, tz: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local);
  if (!m) throw new Error("Expected YYYY-MM-DDTHH:mm");
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  const offsetAt = (t: number) => {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(new Date(t))
        .map((p) => [p.type, p.value]),
    );
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - t;
  };
  let t = asUtc - offsetAt(asUtc);
  t = asUtc - offsetAt(t);
  return new Date(t);
}
