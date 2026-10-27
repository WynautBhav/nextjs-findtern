"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/** The candidate's own photo, falling back to initials if it can't load. */
export function InternAvatar({ src, initials, className }: { src: string | null; initials: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span aria-hidden className={cn("grid shrink-0 place-items-center bg-brand-50 font-semibold text-brand-800", className)}>
        {initials}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- access-checked avatar route, not a static asset
    <img src={src} alt="" onError={() => setFailed(true)} className={cn("shrink-0 object-cover ring-1 ring-ink-200/80", className)} />
  );
}
