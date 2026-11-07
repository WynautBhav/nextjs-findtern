"use client";

import { useEffect } from "react";

import { usePresence } from "@/hooks/use-presence";
import { useUnread, useUnreadFeed } from "@/hooks/use-unread";
import { badgeText } from "@/lib/messaging/ui-logic";

/** Mounted once per console layout: heartbeat, the shared event stream, and the unread count in the tab title. */
export function MessagingLive() {
  usePresence();
  useUnreadFeed();
  const n = useUnread();
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s/, "");
    document.title = n > 0 ? `(${badgeText(n)}) ${base}` : base;
  }, [n]);
  return null;
}
