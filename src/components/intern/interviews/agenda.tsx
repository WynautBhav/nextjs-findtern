import { CalendarClock } from "lucide-react";

import { formatIstDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One company round as an agenda entry on a ruled list: the day as a numeral statement on the left (IST),
 * the round and its state on the right, and whatever it needs below. Upcoming days are set in brand green,
 * finished ones in ink. `iso` null means no date yet (times offered but none picked, or none sent).
 */
export function AgendaRow({
  iso,
  past = false,
  title,
  company,
  status,
  children,
}: {
  iso: string | null;
  past?: boolean;
  title: string;
  company: string;
  status: React.ReactNode;
  children?: React.ReactNode;
}) {
  // "Fri 10 Jul", in India time.
  const [weekday, day, month] = iso ? formatIstDay(iso).split(" ") : [];
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-4 gap-y-3 py-5 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-x-6">
      {iso ? (
        <p className={cn("leading-none", past ? "text-ink-700" : "text-brand-800")}>
          <span className="nums block font-display text-4xl font-bold">{day}</span>
          <span aria-hidden className="mt-1.5 block text-sm font-medium">
            {month} {weekday}
          </span>
          <span className="sr-only">
            {weekday} {day} {month}
          </span>
        </p>
      ) : (
        <p className="text-ink-700">
          <CalendarClock className="size-7" aria-hidden />
          <span className="sr-only">Date to pick</span>
        </p>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-pretty font-display text-lg font-semibold text-ink-900">{title}</h3>
            <p className="mt-0.5 text-sm text-ink-700">{company}</p>
          </div>
          {status}
        </div>
      </div>
      {/* Full width on a phone, under the title column from sm. */}
      {children ? <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">{children}</div> : null}
    </li>
  );
}
