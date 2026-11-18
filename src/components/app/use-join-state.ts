"use client";

import { useEffect, useState } from "react";

import { joinState, type JoinInput, type JoinResult } from "@/lib/interview-join";

/**
 * `joinState` kept current in the browser. The first render uses the server's
 * clock, so server and client markup match; after mount it follows the
 * viewer's clock, so "Join opens at ..." turns into the button on its own.
 */
export function useJoinState(interview: JoinInput, serverNowIso: string, zone?: string | null): JoinResult {
  const [now, setNow] = useState(() => new Date(serverNowIso).getTime());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const id = window.setInterval(tick, 15_000);
    return () => window.clearInterval(id);
  }, []);
  return joinState(now, interview, { zone });
}
