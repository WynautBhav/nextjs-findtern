import type { PresenceLabel } from "@/lib/presence";
import { cn } from "@/lib/utils";

/**
 * Intern presence for employers (OA2): a green dot when online now, grey for
 * "Active today / this week", nothing when hidden or older. The label is
 * always in the accessible name, so colour is never the only signal; it is
 * never a time. Server-safe (no client hooks).
 */
export function PresenceDot({ label, withText = false }: { label: PresenceLabel | null; withText?: boolean }) {
  if (!label) return null;
  const online = label === "Online now";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" title={withText ? undefined : label}>
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", online ? "bg-success" : "bg-muted-foreground/50")} />
      {withText ? (
        <span className={online ? "font-medium text-success" : "text-muted-foreground"}>{label}</span>
      ) : (
        <span className="sr-only">{label}</span>
      )}
    </span>
  );
}
