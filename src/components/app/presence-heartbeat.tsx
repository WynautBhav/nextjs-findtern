"use client";

import { usePresence } from "@/hooks/use-presence";

/** Mounted once per console layout: the 30 s heartbeat behind employer-facing "Online" / "Last seen". Draws nothing. */
export function PresenceHeartbeat() {
  usePresence();
  return null;
}
