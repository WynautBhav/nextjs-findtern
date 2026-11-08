import { cn } from "@/lib/utils";

/** Dot plus words: state is never colour alone. The label comes from the server; null (hidden) draws nothing. */
export function PresenceDot({ online, label, showText = true }: { online: boolean; label: string | null; showText?: boolean }) {
  if (!label) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-subtle">
      <span aria-hidden className={cn("size-2 rounded-full", online ? "bg-success" : "bg-ink-300")} />
      <span className={showText ? undefined : "sr-only"}>{label}</span>
    </span>
  );
}
