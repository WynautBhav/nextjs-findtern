import { cn } from "@/lib/utils";

/** Dot plus words: state is never colour alone. */
export function PresenceDot({ online, showText = true }: { online: boolean; showText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-subtle">
      <span aria-hidden className={cn("size-2 rounded-full", online ? "bg-success" : "bg-ink-300")} />
      <span className={showText ? undefined : "sr-only"}>{online ? "Online" : "Offline"}</span>
    </span>
  );
}
