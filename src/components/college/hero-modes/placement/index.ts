import type { PlacementData } from "@/lib/college/overview-modes";
import { OfferRiver } from "./d01-offer-river";

/** Placement analysis designs, in the order the picker shows them. Each takes the same data. */
export const PLACEMENT_DESIGNS: { name: string; Component: (p: { data: PlacementData }) => React.ReactNode }[] = [
  { name: "Offer river", Component: OfferRiver },
];
