"use client";

import { useEffect, useRef, useState } from "react";

import { initialsOf, personTint } from "@/lib/admin/person-tint";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
} as const;

/**
 * A person in the admin: their own photo, or their initials on a pale tint that is theirs alone
 * (stable per `id`, falling back to the name). A missing photo never renders as somebody else's
 * face. Decorative: the name is always printed next to it, so it is hidden from assistive tech.
 */
export function AdminAvatar({
  name,
  id,
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
  const tint = personTint(id ?? name);
  return (
    <span
      aria-hidden
      style={{ backgroundColor: `var(--admin-person-${tint})`, color: `var(--admin-person-ink-${tint})` }}
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold", SIZES[size], className)}
    >
      {initialsOf(name)}
    </span>
  );
}
