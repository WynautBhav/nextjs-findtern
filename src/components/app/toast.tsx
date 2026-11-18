"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Bell, CircleAlert, CircleCheck, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * In-house toasts for async results and live events (SPECS §4). One polite
 * live region that is always mounted, so screen readers hear each toast. At
 * most three on screen; each leaves after 6 s, paused while hovered or
 * focused. Entrance motion only under prefers-reduced-motion: no-preference.
 */
type Tone = "neutral" | "success" | "error";
export type ToastInput = { title: string; body?: string; href?: string; tone?: Tone };
type Toast = ToastInput & { id: number };

const MAX = 3;
const DURATION_MS = 6000;

const ToastContext = createContext<{ show(t: ToastInput): void } | null>(null);

export function useToast(): { show(t: ToastInput): void } {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const ICON = { neutral: Bell, success: CircleCheck, error: CircleAlert } as const;
const ICON_CLASS = { neutral: "text-primary", success: "text-success", error: "text-danger" } as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const show = useCallback((t: ToastInput) => {
    const id = ++next.current;
    setToasts((all) => [...all, { ...t, id }].slice(-MAX));
  }, []);
  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-relevant="additions"
        className="pointer-events-none fixed inset-x-3 top-3 z-[100] flex flex-col gap-2 sm:inset-x-auto sm:top-auto sm:right-6 sm:bottom-6 sm:w-96"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: (id: number) => void }) {
  const tone = toast.tone ?? "neutral";
  const Icon = ICON[tone];
  const [paused, setPaused] = useState(false);
  const onDismiss = useCallback(() => dismiss(toast.id), [dismiss, toast.id]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(onDismiss, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [paused, onDismiss]);

  const text = (
    <>
      <span className="block font-medium text-foreground">{toast.title}</span>
      {toast.body ? <span className="mt-0.5 block text-muted-foreground">{toast.body}</span> : null}
    </>
  );

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-start gap-3 rounded-apple-lg border border-border bg-surface-raised p-3.5 text-sm shadow-lg motion-safe:animate-tile-in"
    >
      <Icon aria-hidden className={cn("mt-0.5 size-4.5 shrink-0", ICON_CLASS[tone])} />
      <div className="min-w-0 flex-1 break-words">
        {toast.href ? (
          <Link href={toast.href} onClick={onDismiss} className="block rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            {text}
          </Link>
        ) : (
          text
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="-m-1.5 grid size-8 shrink-0 place-items-center rounded-apple-sm text-text-subtle hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:size-11"
      >
        <X aria-hidden className="size-4" />
      </button>
    </div>
  );
}
