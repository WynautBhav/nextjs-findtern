import { cn } from "@/lib/utils";

const AXES = ["Coding", "Aptitude", "AI interview", "Communication"] as const;
const SHORT: Record<string, string> = { "AI interview": "Interview" };

/**
 * The four score axes as one readable strip: label over figure, out of 10.
 * An axis with no score yet reads "Not scored", never a made-up number.
 */
export function ScoreStrip({ ratings, className }: { ratings: [label: string, value: number][]; className?: string }) {
  const by = new Map(ratings);
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4", className)}>
      {AXES.map((axis) => {
        const v = by.get(axis);
        return (
          <div key={axis} className="min-w-0">
            <dt className="text-sm text-text-subtle">{SHORT[axis] ?? axis}</dt>
            <dd className="nums text-base font-semibold text-ink-900">
              {typeof v === "number" ? (
                <>
                  {v.toFixed(1)}
                  <span className="ml-0.5 text-sm font-normal text-text-subtle">/10</span>
                </>
              ) : (
                <span className="text-sm font-normal text-text-subtle">Not scored</span>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
