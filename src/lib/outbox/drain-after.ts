import { after } from "next/server";

import { drainNowIfQueued } from "./drain-now.ts";

/** Call after mail was queued: sends it right after the response (see drain-now.ts). Never throws. */
export function drainOutboxAfterQueue(queued: number): boolean {
  return drainNowIfQueued(queued, { schedule: after });
}
