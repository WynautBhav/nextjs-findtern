import { PRESENCE_ONLINE } from "@/lib/presence-logic";
import { cn } from "@/lib/utils";

/**
 * Intern presence for employers: a green dot when active now, grey for "Last
 * seen 2h ago" / "Offline", nothing when the candidate hides it. The label is
 * always in the accessible name, so colour is never the only signal. The
 * server decides the label (lib/presence.ts); this only draws it. Server-safe
 * (no client hooks).
 */
export function PresenceDot({ label, withText = false }: { label: string | null; withText?: boolean }) {
  if (!label) return null;
  const online = label === PRESENCE_ONLINE;
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
