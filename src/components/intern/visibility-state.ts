/** Which blink a profile status pill gets (visibility-pill.tsx): closed is hidden (red), live is live (green), the rest is quiet. */
export type VisibilityState = "hidden" | "live" | "waiting";

export function visibilityState(tone: string): VisibilityState {
  return tone === "closed" ? "hidden" : tone === "live" ? "live" : "waiting";
}
