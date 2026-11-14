"use client";

import { useEffect, useSyncExternalStore } from "react";

import { PageMascot } from "@/components/chat/mascot";

/**
 * The contact page owl: the headset clip, swapping to the success jump once the form is sent.
 * The form lives in a sibling subtree, so a tiny module store carries the flag. Same tile size
 * for both clips, so the swap does not move anything.
 */
let sent = false;
const listeners = new Set<() => void>();

export function setContactSent(next: boolean): void {
  if (sent === next) return;
  sent = next;
  listeners.forEach((l) => l());
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

export function ContactOwl() {
  const done = useSyncExternalStore(subscribe, () => sent, () => false);
  // Leaving the page forgets it, so coming back shows the headset again.
  useEffect(() => () => setContactSent(false), []);
  return <PageMascot clip={done ? "success-jump" : "headset"} size={260} />;
}
