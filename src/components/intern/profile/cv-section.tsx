import Link from "next/link";
import { PencilLine } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * One section of the profile as a line of the CV: a hairline, a display-face title, an optional hint and one
 * edit link. No box, no shadow; the page is the document. Same props as ProfileCard (which stays for the
 * shared notification settings), so the section list did not change shape.
 */
export function CvSection({
  id,
  title,
  hint,
  icon,
  edit,
  children,
  className,
  firstContent,
}: {
  id: string;
  title: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  edit?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
  firstContent?: boolean;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-head`}
      data-first-content={firstContent ? "" : undefined}
      className={cn("scroll-mt-24 min-w-0 border-t border-ink-300 py-6 sm:py-7", className)}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-head`} className="flex items-center gap-2 font-display text-lg font-semibold text-ink-900">
            {icon}
            {title}
          </h2>
          {hint ? <p className="mt-1 max-w-prose text-pretty text-sm text-ink-700">{hint}</p> : null}
        </div>
        {edit ? (
          <Link
            href={edit.href}
            className="-mr-2 -mt-1 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-brand-700 transition-[background-color,color] duration-150 hover:bg-brand-100 touch:min-h-11"
          >
            <PencilLine className="size-4" aria-hidden />
            Edit<span className="sr-only"> {edit.label}</span>
          </Link>
        ) : null}
      </header>
      <div className="mt-4">{children}</div>
    </section>
  );
}
