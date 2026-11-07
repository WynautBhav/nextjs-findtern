import { HeroFigure, HeroPanel } from "@/components/employer/kit/hero-panel";
import { Avatar } from "@/components/app/avatar";

/** The compare hero: how many are side by side, with their initials as a stack. */
export function CompareHero({
  count,
  max,
  lede,
  people,
}: {
  count: number;
  max: number;
  lede: string;
  people: { id: string; initials: string }[];
}) {
  return (
    <HeroPanel className="rise mb-6 rounded-[28px]">
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="min-w-0">
          <h1 className="text-balance text-4xl font-medium leading-[1.02] tracking-[-0.04em] sm:text-5xl">Compare candidates</h1>
          <p className="mt-3 max-w-xl text-pretty text-base text-on-dark-subtle sm:text-lg">{lede}</p>
          <ul className="mt-5 flex -space-x-2" aria-label="Candidates in this comparison">
            {people.map((p) => (
              <li key={p.id} className="rounded-full ring-2 ring-brand-900">
                <Avatar masked initials={p.initials} size="sm" />
              </li>
            ))}
          </ul>
        </div>
        <HeroFigure lead label={`of ${max} side by side`} value={count} />
      </div>
    </HeroPanel>
  );
}
