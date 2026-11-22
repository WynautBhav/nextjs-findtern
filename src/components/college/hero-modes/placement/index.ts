import type { PlacementData } from "@/lib/college/overview-modes";
import { SankeyFlow } from "./d02-sankey-flow";

/** Placement analysis: the chosen design (the other nine are in git history, commit e78baeb1). */
export const PLACEMENT_DESIGNS: { name: string; Component: (p: { data: PlacementData }) => React.ReactNode }[] = [{ name: "Sankey flow", Component: SankeyFlow }];
