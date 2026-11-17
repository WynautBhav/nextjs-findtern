/** Small "Taken down" pill for a project that Findtern took down. */
export function TakedownBadge({ className = "" }: { className?: string }) {
  return (
    <span
      aria-label="Taken down by Findtern"
      className={`inline-flex items-center rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger ring-1 ring-inset ring-danger/20 ${className}`}
    >
      Taken down
    </span>
  );
}
