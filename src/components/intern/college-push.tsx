"use client";

import { useEffect, useState } from "react";
import { BellRing, Check } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/**
 * "Get call alerts on this phone".
 *
 * Push is a bonus channel, never the only one: the banner and the email carry
 * the same request. iPhones only deliver push to a web app added to the home
 * screen (iOS 16.4+), so on an iPhone browser tab we say that plainly instead
 * of offering a button that can't work.
 */

type State = "checking" | "unsupported" | "ios-browser" | "denied" | "off" | "on" | "busy" | "error";

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
  } catch {
    return null;
  }
}

export function PushToggle({ vapidKey, tone = "light", className }: { vapidKey: string; tone?: "light" | "dark"; className?: string }) {
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      let next: State;
      if (!supported) next = isIos() && !isStandalone() ? "ios-browser" : "unsupported";
      else if (!vapidKey) next = "unsupported";
      else if (Notification.permission === "denied") next = "denied";
      else {
        const reg = await registerServiceWorker();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        next = sub ? "on" : "off";
      }
      if (!cancelled) setState(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [vapidKey]);

  async function subscribe() {
    setState("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(vapidKey) }));
      const res = await csrfFetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      setState(res.ok ? "on" : "error");
    } catch {
      setState("error");
    }
  }

  const muted = tone === "dark" ? "text-white/80" : "text-ink-600";
  const note = (text: string) => <p className={cn("text-[13px] leading-relaxed", muted, className)}>{text}</p>;

  switch (state) {
    case "checking":
      return null;
    case "ios-browser":
      return note("On iPhone, call alerts need Findtern on your home screen: tap Share, then Add to Home Screen, and open it from there.");
    case "unsupported":
      return note("This browser can't show call alerts. Keep this tab open during the drive and you'll see requests here.");
    case "denied":
      return note("Notifications are blocked for Findtern. Allow them in your browser's site settings to get call alerts.");
    case "on":
      return (
        <p className={cn("inline-flex items-center gap-1.5 text-[13px] font-medium", tone === "dark" ? "text-white" : "text-brand-800", className)}>
          <Check className="size-4" aria-hidden />
          Call alerts are on for this device
        </p>
      );
    default:
      return (
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1", className)}>
          <button
            type="button"
            onClick={subscribe}
            disabled={state === "busy"}
            className={cn(
              "inline-flex min-h-11 items-center gap-2 rounded-[10px] px-3.5 text-sm font-medium transition-colors disabled:opacity-60",
              "focus-visible:outline-2 focus-visible:outline-offset-2",
              tone === "dark"
                ? "bg-white/12 text-white hover:bg-white/20 focus-visible:outline-white"
                : "border border-ink-200 bg-white text-ink-800 hover:bg-ink-50 focus-visible:outline-brand-700",
            )}
          >
            <BellRing className="size-4" aria-hidden />
            {state === "busy" ? "Turning on…" : "Get call alerts on this phone"}
          </button>
          {state === "error" ? <span className={cn("text-[13px]", muted)} role="status">That didn&apos;t work. Try again.</span> : null}
        </div>
      );
  }
}
