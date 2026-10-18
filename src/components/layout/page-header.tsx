/**
 * Shared page chrome for the employer portal.
 *
 * These replace the bare `<h1>` stubs that shipped with the legacy pages.
 * Using a real header component here means every employer page has the same
 * structure, and a style change in one place lands everywhere.
 *
 * `PageHeader` intentionally mirrors `PageHead` in app/primitives so the
 * employer console and the intern console never disagree about what a
 * heading looks like. `EmptyState` is a thin adapter over `EmptyScene` -
 * same premium empty taxonomy (art + next-step CTA), legacy prop names kept
 * so existing pages keep working.
 */

import { EmptyScene } from "@/components/app/primitives";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-7 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-balance text-2xl font-semibold tracking-[-0.02em] text-ink-900 md:text-3xl">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-2 text-pretty text-[0.9375rem] leading-relaxed text-ink-600">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  body,
  action,
  who,
}: {
  title: string;
  body: string;
  /** Optional next step - renders a 44px primary CTA under the copy. */
  action?: { label: string; href: string };
  /** Who acts next. Shown as a quiet pill under the copy. */
  who?: string;
}) {
  return (
    <EmptyScene
      art
      title={title}
      body={body}
      next={action ? { label: action.label, href: action.href } : undefined}
      who={who}
    />
  );
}
