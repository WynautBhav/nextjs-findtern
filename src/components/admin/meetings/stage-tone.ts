import type { StatusTone } from "@/lib/admin/status-tone";
import type { MeetingStage } from "@/lib/admin/meeting-stage";

/** One colour per stage, for the table's badge, the drawer and the stage cards' dot. */
export const STAGE_TONE: Record<MeetingStage, { tone: StatusTone }> = {
  sent: { tone: "warning" },
  accepted: { tone: "info" },
  completed: { tone: "success" },
  expired: { tone: "neutral" },
  withdrawn: { tone: "neutral" },
};
