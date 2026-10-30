import { formatIstDay } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * One company round as an agenda entry: a date block on the left (in IST),
 * the round and its state on the right, and whatever it needs below.
 * `iso` null means no date yet (times offered but none picked, or none sent).
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
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-4 gap-y-4 p-5 sm:grid-cols-[4rem_minmax(0,1fr)] lg:p-6">
      {iso ? (
        <p
          className={cn(
            "flex h-16 flex-col items-center justify-center rounded-apple-md",
            past ? "bg-ink-100 text-ink-700" : "bg-brand-700 text-white",
          )}
        >
          <span className="text-xs">{month}</span>
          <span className="nums text-xl font-semibold leading-tight">{day}</span>
          <span className="sr-only"> {weekday}</span>
        </p>
      ) : (
        <p className="flex h-16 items-center justify-center rounded-apple-md border border-dashed border-ink-300 text-center text-xs text-text-subtle">
          Date to pick
        </p>
      )}
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h3 className="text-pretty text-base font-medium text-ink-900">{title}</h3>
            <p className="mt-1 text-sm text-text-subtle">
              {iso ? <span className="nums">{weekday} · </span> : null}
              {company}
            </p>
          </div>
          {status}
        </div>
      </div>
      {/* Full width on a phone, under the title column from sm. */}
      {children ? <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">{children}</div> : null}
    </li>
  );
}
