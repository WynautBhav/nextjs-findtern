"use client";

/**
 * `Count` ticks only when its value changes. The dashboard's headline figures
 * also tick up once on arrival (400ms): this arms `Count` at 0 after mount and
 * then lets it count to the real value. The server HTML and the first client
 * render carry the final value, so nothing is hidden without script; reduced
 * motion skips the arming and shows the final figure at once.
 */

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { Count } from "@/components/admin/motion";
import { rupees } from "./format";

const COUNT = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

export function TickCount({ value, kind = "count", className }: { value: number; kind?: "count" | "money"; className?: string }) {
  const reduce = useReducedMotion();
  // 0 = as served, 1 = armed at zero, 2 = counting to the value.
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (reduce) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      setStage(1);
      second = requestAnimationFrame(() => setStage(2));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [reduce]);

  return (
    <Count
      key={stage === 0 ? "served" : "armed"}
      value={stage === 1 ? 0 : value}
      format={kind === "money" ? (n) => rupees(n) : (n) => COUNT.format(Math.round(n))}
      className={className}
    />
  );
}
