import type { Funnel as FunnelData } from "@/lib/employer-dashboard";

/** `funnel.stages` has 4 entries in order: pipeline, offered, accepted, hired. See `FunnelStage` for each field. */
export type FunnelProps = { funnel: FunnelData };

/** WP2 fills this in. WP0 ships the contract only; it renders nothing. */
export function Funnel(props: FunnelProps) {
  void props;
  return null;
}
