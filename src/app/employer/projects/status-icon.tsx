import { CheckCircle2, CircleSlash, FilePen, PauseCircle, SearchCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { Pill } from "@/components/app/primitives";
import type { CanonicalProjectStatus } from "@/lib/projects/lifecycle";
import { statusMeta } from "./status";

const ICON: Record<CanonicalProjectStatus, LucideIcon> = {
  draft: FilePen,
  pending_review: SearchCheck,
  published: CheckCircle2,
  paused: PauseCircle,
  closed: CircleSlash,
  rejected: TriangleAlert,
};

/** Status as icon + text; the one place a project's state is drawn. */
export function StatusPill({ status, size = "sm" }: { status: string | null | undefined; size?: "sm" | "md" }) {
  const m = statusMeta(status);
  const Icon = m.key ? ICON[m.key] : FilePen;
  return (
    <Pill tone={m.tone} size={size} icon={<Icon />}>
      {m.key === "rejected" ? "Rejected" : m.label}
    </Pill>
  );
}
