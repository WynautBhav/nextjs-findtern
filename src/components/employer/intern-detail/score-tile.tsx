import { ScoreDial } from "@/components/app/score-dial";
import { Pill } from "@/components/app/primitives";
import { RATING_META, type CandidateProfile } from "@/lib/employer-candidates";

/** The score dial beside one bar per rated axis. Data comes straight from the profile. */
export function ScoreTile({ profile }: { profile: CandidateProfile }) {
  return (
    <section aria-label="Score" className="rise mb-8 grid gap-8 rounded-[24px] bg-white p-6 shadow-tile sm:p-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-center lg:gap-14">
      {profile.scored ? (
        <div className="flex justify-center lg:justify-start">
          <ScoreDial score={profile.score} axes={profile.ratings} size="lg" />
        </div>
      ) : (
        <div className="flex items-center justify-center lg:justify-start">
          <Pill tone="neutral">Not scored yet</Pill>
        </div>
      )}
      <div className="min-w-0">
        <h2 className="sr-only">Score by axis</h2>
        <dl className="grid gap-x-10 gap-y-5 sm:grid-cols-2">
          {RATING_META.map((m) => {
            const v = profile.ratings[m.key];
            return (
              <div key={m.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-2">
                <dt className="text-sm font-medium text-ink-800">{m.key === "interview" ? "Interview" : m.label}</dt>
                <dd className="nums text-3xl font-light leading-none tracking-[-0.04em] text-ink-900">
                  {v > 0 ? v.toFixed(1) : <span className="text-base font-medium text-text-subtle">Not rated</span>}
                </dd>
                <span className="col-span-2 block h-1.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
                  <span className="block h-full rounded-full bg-brand-600" style={{ width: `${Math.max(0, Math.min(10, v)) * 10}%` }} />
                </span>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
