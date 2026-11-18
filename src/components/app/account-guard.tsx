"use client";

import { useEffect, useRef, useState } from "react";

import { ACCOUNT_DISABLED_MESSAGE, disabledLoginHref, type SignInRole } from "@/lib/account-disabled";
import { isAccountDisabledBody } from "@/lib/account-disabled";
import { CHANNEL, CLAIM_KEY, DISABLED_KEY, NOTICE_AFTER_MS, POLL_MS, disabledSignalApplies, shouldPoll, statusVerdict } from "@/lib/account-guard";

/**
 * Signs an open tab out the moment its account is disabled, instead of leaving a page that quietly stops working until
 * the person refreshes. Mounted in the employer, intern and college shells (not admin "View as").
 *
 * It asks GET /api/auth/status on focus, when the tab becomes visible, and every POLL_MS while visible (nothing while
 * hidden); tabs of one browser share the asking through localStorage and tell each other through a BroadcastChannel.
 * Any API answer of 403 ACCOUNT_DISABLED (csrfFetch, fetch, the upload XHR) triggers it too. On disabled it navigates
 * to the role's sign-in page with ?reason=disabled; if that does not happen it shows a blocking notice.
 */
export function AccountGuard({ role }: { role: SignInRole }) {
  const [blocked, setBlocked] = useState(false);
  const fired = useRef(false);

  useEffect(() => {
    const target = disabledLoginHref(role);

    function leave(announce: boolean) {
      if (fired.current) return;
      fired.current = true;
      if (announce) {
        const msg = JSON.stringify({ role, at: Date.now() });
        try { localStorage.setItem(DISABLED_KEY, msg); } catch { /* private mode */ }
        try { const ch = new BroadcastChannel(CHANNEL); ch.postMessage(msg); ch.close(); } catch { /* unsupported */ }
      }
      window.location.assign(target);
      window.setTimeout(() => setBlocked(true), NOTICE_AFTER_MS);
    }

    async function check(force: boolean) {
      const visible = document.visibilityState === "visible";
      let last: number | null = null;
      try { last = Number(localStorage.getItem(CLAIM_KEY)) || null; } catch { /* private mode */ }
      if (!shouldPoll({ now: Date.now(), lastClaim: last, visible, force })) return;
      try { localStorage.setItem(CLAIM_KEY, String(Date.now())); } catch { /* private mode */ }
      try {
        const res = await fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin" });
        const body = await res.json().catch(() => null);
        if (statusVerdict(res.status, body) === "disabled") leave(true);
      } catch {
        // offline or a server blip: try again on the next tick
      }
    }

    const onFocus = () => void check(true);
    const onVisible = () => { if (document.visibilityState === "visible") void check(true); };
    const onApiRefusal = () => leave(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === DISABLED_KEY && disabledSignalApplies(e.newValue, role, Date.now())) leave(false);
    };
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(CHANNEL);
      channel.onmessage = (e) => { if (disabledSignalApplies(String(e.data), role, Date.now())) leave(false); };
    } catch { /* unsupported */ }

    // A tab opened after another tab already learned it: act on the stored signal.
    try { if (disabledSignalApplies(localStorage.getItem(DISABLED_KEY), role, Date.now())) leave(false); } catch { /* private mode */ }

    // Any refused call from this page (plain fetch included) is the fastest signal there is.
    const realFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const res = await realFetch(...args);
      if (res.status === 403) {
        const url = res.url ? new URL(res.url, window.location.href) : null;
        if (url && url.origin === window.location.origin && url.pathname !== "/api/auth/status") {
          void res.clone().json().then((b) => { if (isAccountDisabledBody(b)) leave(true); }).catch(() => undefined);
        }
      }
      return res;
    };

    void check(false);
    const timer = window.setInterval(() => void check(false), POLL_MS);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("storage", onStorage);
    window.addEventListener("findtern:account-disabled", onApiRefusal);
    return () => {
      window.fetch = realFetch;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("findtern:account-disabled", onApiRefusal);
      channel?.close();
    };
  }, [role]);

  if (!blocked) return null;
  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-ink-900/50 p-4">
      <div role="alertdialog" aria-modal="true" aria-labelledby="account-disabled-title" aria-describedby="account-disabled-body" className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl">
        <h2 id="account-disabled-title" className="text-xl font-semibold text-ink-900">Account disabled</h2>
        <p id="account-disabled-body" className="mt-2 text-base text-ink-600">{ACCOUNT_DISABLED_MESSAGE}</p>
        <a href={disabledLoginHref(role)} className="mt-5 inline-flex min-h-11 items-center rounded-full bg-brand-700 px-5 text-sm font-semibold text-white hover:bg-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          Go to sign in
        </a>
      </div>
    </div>
  );
}
