/**
 * The drive's "Day by day" chart buckets: India calendar days (bug sheet 26 Nov). They used to be 24 h steps from the
 * drive's opening time, so a drive that opened at 7:30 pm filed the next day's afternoon under the day before. Past a
 * month the buckets are weeks, starting on the opening day. Pure, so it is unit tested.
 */
const DAY = 86_400_000;
const IST = 330 * 60_000;
/** Days since 1970 on India's calendar. */
const istDay = (d: Date) => Math.floor((d.getTime() + IST) / DAY);
const isoOf = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);

export function driveDayBuckets(start: Date, end: Date): { step: 1 | 7; buckets: { day: string }[]; indexOf: (d: Date) => number } {
  const first = istDay(start);
  // A drive that ends exactly at midnight does not reach into the next day.
  const last = Math.max(first, istDay(new Date(end.getTime() - 1)));
  const days = last - first + 1;
  const step = days > 31 ? 7 : 1;
  const count = Math.ceil(days / step);
  const buckets = Array.from({ length: count }, (_, i) => ({ day: isoOf(first + i * step) }));
  const indexOf = (d: Date) => {
    if (d < start || d > end) return -1;
    return Math.min(count - 1, Math.floor((istDay(d) - first) / step));
  };
  return { step, buckets, indexOf };
}
