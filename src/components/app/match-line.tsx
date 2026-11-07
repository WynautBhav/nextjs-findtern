import { cn } from "@/lib/utils";
import { skillMatch } from "./skill-match";

export { skillMatch } from "./skill-match";

/** "Matches 4 of 5 skills" with matched skills in bold. Renders nothing when no skills are wanted. */
export function MatchLine({ candidateSkills, wantedSkills, showNames = true, className }: { candidateSkills: readonly string[]; wantedSkills: readonly string[]; showNames?: boolean; className?: string }) {
  const { matched, total } = skillMatch(candidateSkills, wantedSkills);
  if (total === 0) return null;
  return (
    <p className={cn("text-sm text-text-subtle", className)}>
      Matches <span className="nums font-semibold text-ink-900">{matched.length}</span> of <span className="nums">{total}</span> skills
      {showNames && matched.length > 0 ? (
        <>
          : {matched.map((m, i) => (
            <span key={m}>
              <strong className="font-semibold text-ink-800">{m}</strong>
              {i < matched.length - 1 ? ", " : ""}
            </span>
          ))}
        </>
      ) : null}
    </p>
  );
}
