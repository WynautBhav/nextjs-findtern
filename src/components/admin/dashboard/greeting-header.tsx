import Link from "next/link";

import { greetingFor } from "@/lib/admin/dashboard-overview-pure";

export type StripItem = { key: string; value: string; label: string; href: string | null };

/**
 * The dashboard's top: today's date, "Good morning, Name" and one inline strip of the figures that
 * need a person (never a zero: the caller leaves those out), then the page actions on the right.
 * The strip replaces the paragraph of numbers that used to sit under the title.
 */
export function GreetingHeader({
  name,
  now,
  strip,
  action,
}: {
  name: string;
  now: Date;
  strip: StripItem[];
  action: React.ReactNode;
}) {
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(now);
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-text-subtle">{date}</p>
        <h1 className="mt-0.5 text-balance break-words text-[1.5rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[2rem]">
          {greetingFor(now)}, {name}
        </h1>
        {strip.length > 0 ? (
          <ul aria-label="At a glance" className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 text-sm text-text-subtle">
            {strip.map((item, i) => {
              const body = (
                <>
                  <span className="nums font-semibold text-foreground">{item.value}</span> {item.label}
                </>
              );
              return (
                <li key={item.key} className="flex items-center gap-1">
                  {i > 0 ? <span aria-hidden className="mr-1 h-3.5 w-px bg-ink-300" /> : null}
                  {item.href ? (
                    <Link href={item.href} className="rounded-full px-1 underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                      {body}
                    </Link>
                  ) : (
                    <span className="px-1">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 max-sm:w-full [&>*]:max-sm:flex-1">{action}</div>
    </header>
  );
}
