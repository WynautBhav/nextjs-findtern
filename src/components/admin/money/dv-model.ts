/**
 * The drive overview's figures. A college's slots split three ways: activated (a student used the code),
 * issued but not yet activated, and not issued yet. The database keeps issued <= slots and redeemed <= issued
 * (college_drive_orders_counts_valid); the clamps here only stop a bad row from drawing a negative or >100% bar.
 */
export type DriveCounts = { slots: number; issued: number; redeemed: number };

export function split(c: DriveCounts): { activated: number; waiting: number; notIssued: number } {
  const slots = Math.max(0, c.slots);
  const issued = Math.min(slots, Math.max(0, c.issued));
  const activated = Math.min(issued, Math.max(0, c.redeemed));
  return { activated, waiting: issued - activated, notIssued: slots - issued };
}

/** Segment widths as percentages of the track, against the largest college's slots (the scale). */
export function barWidths(c: DriveCounts, scaleSlots: number): { activated: number; waiting: number; notIssued: number } {
  const s = split(c);
  const scale = Math.max(1, scaleSlots);
  return { activated: (s.activated / scale) * 100, waiting: (s.waiting / scale) * 100, notIssued: (s.notIssued / scale) * 100 };
}

/** Activated as a share of issued codes, whole percent; null when nothing is issued. */
export function activationShare(c: DriveCounts): number | null {
  const s = split(c);
  const issued = s.activated + s.waiting;
  return issued > 0 ? Math.round((s.activated / issued) * 100) : null;
}
