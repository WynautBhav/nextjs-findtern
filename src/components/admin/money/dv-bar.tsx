import { barWidths, split, type DriveCounts } from "./dv-model";

/**
 * A college's slots as one bar at true scale: activated, issued but not yet activated, and not issued, each as
 * its share of the LARGEST college's slots (so a small college is a short bar). The text beside it carries the
 * numbers; the bar is a picture of them, hidden from screen readers.
 */
export function SlotBar({ counts, scaleSlots }: { counts: DriveCounts; scaleSlots: number }) {
  const w = barWidths(counts, scaleSlots);
  const s = split(counts);
  return (
    <span
      role="img"
      aria-label={`${s.activated} activated, ${s.waiting} issued and waiting, ${s.notIssued} not issued`}
      className="flex h-2.5 w-full rounded-sm bg-ink-100"
    >
      <span className="flex h-full gap-px overflow-hidden rounded-sm" style={{ width: `${Math.min(100, w.activated + w.waiting + w.notIssued)}%` }}>
        {s.activated > 0 ? <span className="block h-full bg-brand-800" style={{ flexGrow: s.activated, flexBasis: 0 }} /> : null}
        {s.waiting > 0 ? <span className="block h-full bg-brand-300" style={{ flexGrow: s.waiting, flexBasis: 0 }} /> : null}
        {s.notIssued > 0 ? <span className="block h-full bg-ink-300" style={{ flexGrow: s.notIssued, flexBasis: 0 }} /> : null}
      </span>
    </span>
  );
}

/** What the three bar colours mean, as text with a swatch each. */
export function SlotLegend() {
  const items = [
    { cls: "bg-brand-800", label: "Activated" },
    { cls: "bg-brand-300", label: "Issued, not activated yet" },
    { cls: "bg-ink-300", label: "Not issued" },
  ];
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-700" aria-label="Bar colours">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-2">
          <span aria-hidden className={`inline-block size-2.5 rounded-sm ${i.cls}`} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
