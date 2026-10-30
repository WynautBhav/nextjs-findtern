import Link from "next/link";

import { authPath, type Door } from "@/lib/auth-doors";

const LABEL: Record<Door, string> = { intern: "Intern", employer: "Company", college: "College" };

/**
 * The account-type switch on /login and /signup. Plain links, not tabs: each
 * type is its own URL (`?as=`), so it works without JS, survives a reload and
 * the back button, and can be linked to directly.
 */
export function DoorSwitch({
  path,
  doors,
  current,
  keep = {},
}: {
  path: string;
  doors: readonly Door[];
  current: Door;
  /** Params that survive a switch, e.g. `next`. */
  keep?: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="Account type" className="mb-8">
      <ul
        className="grid gap-1 rounded-xl bg-ink-100/70 p-1"
        style={{ gridTemplateColumns: `repeat(${doors.length}, minmax(0, 1fr))` }}
      >
        {doors.map((d) => {
          const on = d === current;
          return (
            <li key={d}>
              <Link
                href={authPath(path, d, keep)}
                replace
                scroll={false}
                aria-current={on ? "page" : undefined}
                className={`flex h-9 items-center justify-center rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [@media(pointer:coarse)]:h-11 ${
                  on ? "bg-white font-semibold text-ink-900 shadow-xs" : "font-medium text-ink-600 hover:text-ink-900"
                }`}
              >
                {LABEL[d]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
