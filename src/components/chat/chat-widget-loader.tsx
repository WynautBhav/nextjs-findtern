"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { usePathname } from "next/navigation";

import { OPEN_CHAT_EVENT } from "@/lib/chat-events";

/**
 * Loads the chat widget (and the `motion` library it pulls in, ~44 KB gz) after
 * the page is idle instead of shipping it in every route's first-load JS.
 *
 * - Nothing loads in the admin workspace: the widget renders nothing there.
 * - The console's "Ask me" button fires OPEN_CHAT_EVENT. If that happens before
 *   the widget has loaded, the loader starts the load at once and replays the
 *   event when the widget has mounted and is listening.
 */
const IDLE_TIMEOUT_MS = 4000;

export function ChatWidgetLoader() {
  const pathname = usePathname();
  const skip = pathname?.startsWith("/admin") ?? false;
  const [Widget, setWidget] = useState<ComponentType | null>(null);
  const wantsOpen = useRef(false);
  const loading = useRef(false);

  useEffect(() => {
    if (skip || Widget) return;
    const load = () => {
      if (loading.current) return;
      loading.current = true;
      import("./chat-widget").then(
        (m) => setWidget(() => m.ChatWidget),
        () => {
          loading.current = false; // offline or a stale chunk: the next trigger retries
        },
      );
    };
    const onOpen = () => {
      wantsOpen.current = true;
      load();
    };
    window.addEventListener(OPEN_CHAT_EVENT, onOpen);
    // requestIdleCallback is missing in Safari < 18.
    const hasIdle = typeof window.requestIdleCallback === "function";
    const handle = hasIdle ? window.requestIdleCallback(load, { timeout: IDLE_TIMEOUT_MS }) : window.setTimeout(load, 2000);
    return () => {
      window.removeEventListener(OPEN_CHAT_EVENT, onOpen);
      if (hasIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [skip, Widget]);

  // The widget's own listener is attached in its effect, which runs before this one.
  useEffect(() => {
    if (Widget && wantsOpen.current) {
      wantsOpen.current = false;
      window.dispatchEvent(new Event(OPEN_CHAT_EVENT));
    }
  }, [Widget]);

  return Widget ? <Widget /> : null;
}
