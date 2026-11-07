"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import { avatarTint, avatarLabel } from "./avatar-helpers";

const SIZE = {
  sm: { box: "size-8 text-xs", dot: "size-2.5", px: 32 },
  md: { box: "size-10 text-sm", dot: "size-3", px: 40 },
  lg: { box: "size-14 text-lg", dot: "size-3.5", px: 56 },
} as const;

/**
 * Person mark. `masked` renders the deliberate anonymous mark (identity hidden
 * until a hire): a tinted disc with the initials centred and a subtle ring.
 */
export function Avatar({
  name,
  initials,
  src,
  masked = false,
  online = null,
  label,
  size = "md",
  className,
}: {
  name?: string;
  initials?: string;
  src?: string | null;
  masked?: boolean;
  /** true/false adds a status dot with sr-only text; null/undefined adds none. */
  online?: boolean | null;
  /** Overrides the computed accessible name. */
  label?: string;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [src]);

  const s = SIZE[size];
  const ini = (initials ?? (name ? name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("") : "")).toUpperCase();
  const accessible = label ?? avatarLabel({ name, initials: ini, masked });
  const tint = avatarTint(ini || name || "");
  const showPhoto = !!src && !failed;

  return (
    <span role="img" aria-label={accessible} className={cn("relative inline-flex shrink-0", className)}>
      {showPhoto ? (
        // Private auth-gated route: next/image's optimiser would not carry the session.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={img}
          src={src}
          alt=""
          width={s.px}
          height={s.px}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn("rounded-full object-cover", s.box)}
        />
      ) : (
        <span
          aria-hidden
          className={cn(
            "relative grid place-items-center overflow-hidden rounded-full font-semibold nums ring-1 ring-inset",
            masked ? "ring-current/25" : "ring-ink-900/10",
            s.box,
            tint,
          )}
        >
          {ini}
        </span>
      )}
      {online === null || online === undefined ? null : (
        <span
          className={cn(
            "absolute bottom-0 right-0 rounded-full ring-2 ring-white",
            s.dot,
            online ? "bg-success" : "bg-ink-300",
          )}
        >
          <span className="sr-only">{online ? "Online" : "Offline"}</span>
        </span>
      )}
    </span>
  );
}
