import Link from "next/link";
import { PencilLine } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * One section of the profile: the rounded-2xl card the employer lists use (white, ink-200 hairline, shadow-xs),
 * a title, an optional hint, and one edit link that goes to the existing form. Cards are never nested; a list
 * inside a card is set apart with hairlines and space.
 */
export function ProfileCard({
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
  /** A small glyph before the title (the private cards carry a lock). */
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
      className={cn("scroll-mt-24 min-w-0 rounded-2xl border border-ink-200 bg-white p-5 shadow-xs sm:p-6", className)}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`${id}-head`} className="flex items-center gap-2 text-base font-semibold tracking-[-0.01em] text-ink-900">
            {icon}
            {title}
          </h2>
          {hint ? <p className="mt-1 max-w-prose text-pretty text-sm text-text-subtle">{hint}</p> : null}
        </div>
        {edit ? (
          <Link
            href={edit.href}
            className="-mr-2 -mt-1 inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand-700 transition-[background-color,color] duration-150 hover:bg-brand-50 touch:min-h-11"
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

/** An empty section: what goes here, why it helps, and the one thing to do about it. */
export function CardEmpty({ title, body, action }: { title: string; body: string; action: { label: string; href: string } }) {
  return (
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-900">{title}</p>
        <p className="mt-0.5 max-w-prose text-pretty text-sm text-ink-600">{body}</p>
      </div>
      <ButtonLink href={action.href} variant="outline" size="sm" className="shrink-0 touch:min-h-11">
        {action.label}
      </ButtonLink>
    </div>
  );
}
