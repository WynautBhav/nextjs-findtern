"use client";

import { LineDuo } from "@/components/admin/charts/line-duo";
import { PillBars } from "@/components/admin/charts/pill-bars";
import { formatMoney } from "@/lib/format";

/**
 * Finance charts for the ledger: thin wrappers over the shared admin SVG
 * charts. `RevenueChart` is one monthly line (a single series, so its legend
 * is read aloud only); `VolumeBars` is the daily paid-transaction count as
 * pill bars with today filled and empty days hatched.
 */

export type RevenuePoint = { label: string; totalMinor: number };
export type VolumePoint = { label: string; count: number; totalMinor: number };

const inr = (minor: number) => formatMoney(minor, "INR", { short: true, zeroLabel: false });

export function RevenueChart({ data }: { data: RevenuePoint[] }) {
  // A flat line at zero reads as a broken chart, so an all-zero series gets
  // the same empty state as a too-short one.
  if (data.length < 2 || data.every((d) => d.totalMinor === 0)) {
    return <p className="py-12 text-center text-sm text-text-subtle">Not enough revenue history to chart yet.</p>;
  }
  return (
    <LineDuo
      className="[&>figcaption]:sr-only"
      ariaLabel="Revenue collected by month, in rupees"
      format={inr}
      series={[{ label: "Revenue collected", tone: "current", points: data.map((d) => ({ x: d.label, y: d.totalMinor })) }]}
    />
  );
}

export function VolumeBars({ data }: { data: VolumePoint[] }) {
  if (data.length === 0 || data.every((d) => d.count === 0)) {
    return <p className="py-12 text-center text-sm text-text-subtle">Not enough transaction history to chart yet.</p>;
  }
  return (
    <PillBars
      ariaLabel="Paid transactions per day, last 7 days"
      unit="payments"
      data={data.map((d, i) => ({ label: d.label, value: d.count, state: i === data.length - 1 ? "today" : "past" }))}
    />
  );
}
