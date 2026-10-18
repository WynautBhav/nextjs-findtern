import { Pill } from "@/components/app/primitives";
import { proposalStatus } from "@/components/app/status";

export { proposalStatus };

export function StatusPill({ status }: { status: string | null }) {
  const s = proposalStatus(status);
  return <Pill tone={s.tone}>{s.label}</Pill>;
}
