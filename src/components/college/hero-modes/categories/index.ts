import type { CategoriesData } from "@/lib/college/overview-modes";
import { CoffeeCounter } from "./d01-coffee-counter";

/** Categories analysis designs, in the order the picker shows them. Each takes the same data. */
export const CATEGORY_DESIGNS: { name: string; Component: (p: { data: CategoriesData }) => React.ReactNode }[] = [
  { name: "Coffee counter", Component: CoffeeCounter },
];
