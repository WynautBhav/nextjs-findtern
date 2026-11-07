import { normalizeStatus, type CanonicalProjectStatus } from "@/lib/projects/lifecycle";

export type PillTone = "live" | "waiting" | "closed" | "new" | "paid" | "neutral";

export const STATUS_META: Record<CanonicalProjectStatus, { label: string; tone: PillTone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_review: { label: "In review", tone: "waiting" },
  published: { label: "Live", tone: "live" },
  paused: { label: "Paused", tone: "closed" },
  closed: { label: "Closed", tone: "closed" },
  rejected: { label: "Needs changes", tone: "new" },
};

export const STATUS_ORDER: CanonicalProjectStatus[] = ["draft", "pending_review", "published", "paused", "rejected", "closed"];

export function statusMeta(raw: string | null | undefined) {
  const s = normalizeStatus(raw);
  return { key: s, ...(s ? STATUS_META[s] : { label: "Unknown", tone: "neutral" as PillTone }) };
}
