/**
 * International FTE status, legacy's three values only (ADP-03). A stored
 * "rejected" (written by an earlier build) reads as none. Plain module, so
 * server components and the client controls share it.
 */
export type FteStatus = "none" | "applied" | "approved";

export function fteOf(value: string | null | undefined): FteStatus {
  const v = String(value ?? "").toLowerCase();
  return v === "applied" || v === "approved" ? v : "none";
}
