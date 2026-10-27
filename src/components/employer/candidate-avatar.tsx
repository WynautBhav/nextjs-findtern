"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A candidate's initials tile, or their photo once this employer has hired
 * them (`photoUrl` is only ever set for a hire - see `attachPhotos`). Before
 * hire employers see initials only (bug sheet 7, NC r41: a photo can be
 * reverse-searched to a name).
 *
 * A photo that fails to load falls back to the initials. The browser can
 * report that failure before React hydrates, when `onError` is not attached
 * yet, so the mount effect also checks a finished-but-empty image.
 */
export function CandidateAvatar({
  photoUrl,
  initials,
  className,
}: {
  photoUrl?: string | null;
  initials: string;
  /** Size, radius and type scale - the same classes the initials tile used. */
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setFailed(true);
  }, [photoUrl]);

  if (photoUrl && !failed) {
    // A private, auth-gated route (`/api/intern/avatar`) - next/image's
    // optimiser would fetch it without the viewer's session cookie.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        ref={img}
        src={photoUrl}
        alt=""
        onError={() => setFailed(true)}
        className={cn("shrink-0 bg-brand-50 object-cover", className)}
      />
    );
  }

  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center bg-brand-50 font-semibold text-brand-800 nums", className)}>
      {initials}
    </span>
  );
}
