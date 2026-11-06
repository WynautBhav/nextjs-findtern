"use client";

import { useEffect, useRef, useState } from "react";

import { avatarTint } from "@/components/employer/candidate-view";
import { cn } from "@/lib/utils";

/**
 * A candidate's photo when they uploaded one (`attachPhotos`), else their
 * initials tile. Photos show before hire by owner call (6 Nov); the name
 * stays initials until the hire.
 *
 * A photo that fails to load falls back to the initials. The browser can
 * report that failure before React hydrates, when `onError` is not attached
 * yet, so the mount effect also checks a finished-but-empty image.
 */
export function CandidateAvatar({
  photoUrl,
  initials,
  className,
  seed,
}: {
  photoUrl?: string | null;
  initials: string;
  /** Size, radius and type scale - the same classes the initials tile used. */
  className?: string;
  /** The candidate's id: picks the initials tile's tint so neighbouring rows differ. */
  seed?: string;
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
        // The class sets the real size; these only reserve the box so the grid doesn't shift.
        width={48}
        height={48}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn("shrink-0 bg-brand-50 object-cover", className)}
      />
    );
  }

  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center font-semibold nums", seed ? avatarTint(seed) : "bg-brand-50 text-brand-800", className)}>
      {initials}
    </span>
  );
}
