import type { CategoriesData } from "@/lib/college/overview-modes";
import { HeatMatrix } from "./d05-heat-matrix";

/** Categories analysis: the Heat matrix, chosen by the owner on 23 Nov 2026 (the other nine are in git history, e78baeb1). */
export const CATEGORY_DESIGNS: { name: string; Component: (p: { data: CategoriesData }) => React.ReactNode }[] = [
  { name: "Heat matrix", Component: HeatMatrix },
];
