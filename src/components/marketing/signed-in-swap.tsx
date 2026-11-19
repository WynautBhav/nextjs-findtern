"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { hasSignInHint } from "./signed-in-hint";

const subscribe = () => () => {};

/**
 * Shows `guest` in the static HTML and swaps to `member` in the browser when the sign-in hint cookie is there.
 * The page stays static (no session read on the server); the server snapshot is always the guest view, so
 * hydration matches and a signed-in visitor sees the swap right after load.
 */
export function SignedInSwap({ guest, member }: { guest: ReactNode; member: ReactNode }) {
  const signedIn = useSyncExternalStore(subscribe, () => hasSignInHint(document.cookie), () => false);
  return <>{signedIn ? member : guest}</>;
}
