import { HeroFigure, HeroPanel } from "@/components/employer/kit/hero-panel";

export type TimelineStep = { label: string; done: boolean; when?: string };

/** Proposal hero: who it is for, the lead money figure, and the offer's journey as a segmented track. */
export function ProposalHero({
  avatar,
  title,
  subtitle,
  status,
  next,
  figures,
  timeline,
}: {
  avatar: React.ReactNode;
  title: string;
  subtitle: React.ReactNode;
  status: React.ReactNode;
  next: string;
  figures: [string, string][];
  timeline: TimelineStep[];
}) {
  const [lead, ...rest] = figures;
  return (
    <HeroPanel className="rise sm:p-10">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          {avatar}
          <div className="min-w-0">
            <h1 className="text-balance text-3xl font-medium leading-[1.05] tracking-[-0.03em] sm:text-4xl">{title}</h1>
            <p className="mt-2 text-sm text-on-dark-subtle">{subtitle}</p>
          </div>
        </div>
        {status}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)] lg:items-end">
        <HeroFigure lead label={lead[0]} value={lead[1]} />
        <dl className="grid grid-cols-3 gap-4 border-t border-white/15 pt-5 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
          {rest.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-medium text-on-dark-subtle">{label}</dt>
              <dd className="nums mt-1 whitespace-nowrap text-base font-light tracking-[-0.02em] min-[420px]:text-lg xl:text-xl">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <ol className="nums mt-8 grid grid-cols-4 gap-2" aria-label="Progress">
        {timeline.map((t) => (
          <li key={t.label} className="min-w-0">
            <span aria-hidden className={t.done ? "block h-1.5 rounded-full bg-data-on-dark" : "block h-1.5 rounded-full bg-white/20"} />
            <p className={t.done ? "mt-2 text-xs font-medium text-white sm:text-sm" : "mt-2 text-xs text-on-dark-subtle sm:text-sm"}>
              {t.label}
              <span className="sr-only">{t.done ? " (done)" : " (not yet)"}</span>
            </p>
            {t.when ? <p className="text-xs text-on-dark-subtle">{t.when}</p> : null}
          </li>
        ))}
      </ol>
      <p className="mt-6 max-w-prose text-pretty text-sm text-on-dark">
        <span className="font-semibold text-white">Next: </span>
        {next}
      </p>
    </HeroPanel>
  );
}
