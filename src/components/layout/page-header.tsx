/**
 * Shared page chrome for the employer portal.
 *
 * These replace the bare `<h1>` stubs that shipped with the legacy pages.
 * Using a real header component here means every employer page has the same
 * structure, and a style change in one place lands everywhere.
 */

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

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-14 text-center">
      <p className="text-base font-semibold text-ink-900">{title}</p>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-600">{body}</p>
    </div>
  );
}
