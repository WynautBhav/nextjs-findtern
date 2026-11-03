import Link from "next/link";

/**
 * The last line of the queue: signups that never finished onboarding. A plain
 * row under a 1px rule (the caller draws the rule), not a boxed banner; nothing
 * at zero, because a permanent warning teaches people to ignore it.
 */
export function IncompleteProfilesLine({ count, total, href }: { count: number; total: number; href: string }) {
  if (count <= 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-text-subtle">
      <p className="min-w-0 text-pretty">
        <span className="nums font-medium text-foreground">{count.toLocaleString("en-IN")}</span> of{" "}
        <span className="nums font-medium text-foreground">{total.toLocaleString("en-IN")}</span> signups {count === 1 ? "has" : "have"} not
        finished onboarding, so employers can&apos;t see them yet.
      </p>
      <Link
        href={href}
        className="inline-flex min-h-9 shrink-0 items-center text-foreground underline underline-offset-4 outline-none hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
      >
        Review list<span className="sr-only"> of signups that have not finished onboarding</span>
      </Link>
    </div>
  );
}
