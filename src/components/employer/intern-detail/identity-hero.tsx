import { HeroPanel } from "@/components/employer/kit/hero-panel";

/**
 * Candidate identity hero. Caller passes the already-masked name, avatar,
 * status pill and meta line; nothing here decides what is visible.
 */
export function InternIdentityHero({
  avatar,
  title,
  status,
  meta,
  rate,
  rateHint,
}: {
  avatar: React.ReactNode;
  title: string;
  status?: React.ReactNode;
  meta?: React.ReactNode;
  rate: string;
  rateHint: string;
}) {
  return (
    <HeroPanel className="rise mb-6 sm:p-10">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="flex min-w-0 items-center gap-5">
          {avatar}
          <div className="min-w-0">
            <h1 className="text-balance break-words text-3xl font-medium leading-[1.05] tracking-[-0.03em] sm:text-5xl">{title}</h1>
            {status ? <div className="mt-3">{status}</div> : null}
            {meta ? <div className="mt-4 text-on-dark-subtle [&_ul]:text-on-dark-subtle">{meta}</div> : null}
          </div>
        </div>
        <div className="border-t border-white/15 pt-5 lg:border-l lg:border-t-0 lg:pl-10 lg:pt-0 lg:text-right">
          <p className="nums text-[clamp(2.5rem,6vw,4.25rem)] font-light leading-none tracking-[-0.05em]">{rate}</p>
          <p className="mt-2 text-xs text-on-dark-subtle">{rateHint}</p>
        </div>
      </div>
    </HeroPanel>
  );
}
