"use client";

import { useEffect, useRef, useState } from "react";

import { initialsOf } from "@/lib/admin/person-tint";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
} as const;

/**
 * A person in the admin: their own photo, or their initials on a flat ink disc (the same
 * `UserDot` look as the shell; never a pastel tint). A missing photo never renders as somebody
 * else's face. `id` is kept for callers and no longer changes the colour. Decorative: the name is always printed next to it, so it is hidden from assistive tech.
 */
export function AdminAvatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string | null | undefined;
  id?: string | number | null;
  photoUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // A server-rendered <img> can fail before React attaches onError, so check once on mount.
  useEffect(() => {
    const img = ref.current;
    if (img?.complete && img.naturalWidth === 0) setFailed(true);
  }, [photoUrl]);

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- access-checked avatar route, not a static asset
      <img
        ref={ref}
        src={photoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={cn("shrink-0 rounded-full object-cover", SIZES[size], className)}
      />
    );
  }
  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-full bg-ink-900 font-semibold text-paper", SIZES[size], className)}>
      {initialsOf(name)}
    </span>
  );
}
