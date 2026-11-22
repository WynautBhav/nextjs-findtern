import type { CategoriesData } from "@/lib/college/overview-modes";
import { CoffeeCounter } from "./d01-coffee-counter";
import { StudentGrid } from "./d02-student-grid";
import { Mosaic } from "./d03-mosaic";
import { Rings } from "./d04-rings";
import { HeatMatrix } from "./d05-heat-matrix";
import { CafeBoard } from "./d06-cafe-board";
import { Bubbles } from "./d07-bubbles";
import { Flow } from "./d08-flow";
import { Staircase } from "./d09-staircase";
import { Poster } from "./d10-poster";

/** Categories analysis designs, in the order the picker shows them. Each takes the same data. */
export const CATEGORY_DESIGNS: { name: string; Component: (p: { data: CategoriesData }) => React.ReactNode }[] = [
  { name: "Coffee counter", Component: CoffeeCounter },
  { name: "Student grid", Component: StudentGrid },
  { name: "Mosaic", Component: Mosaic },
  { name: "Rings", Component: Rings },
  { name: "Heat matrix", Component: HeatMatrix },
  { name: "Café board", Component: CafeBoard },
  { name: "Bubbles", Component: Bubbles },
  { name: "Flow", Component: Flow },
  { name: "Staircase", Component: Staircase },
  { name: "Poster", Component: Poster },
];
