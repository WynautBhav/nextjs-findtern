"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A candidate's photo, falling back to the initials tile.
 *
 * Employer screens used to render initials only, so an intern who uploaded a
 * photo never had it shown. The fallback also covers a photo that fails to
 * load (a deleted file, an external URL that went away), so a broken image
 * icon never reaches the card.
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

  if (photoUrl && !failed) {
    // A private, auth-gated route (`/api/intern/avatar`) - next/image's
    // optimiser would fetch it without the viewer's session cookie.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className={cn("shrink-0 bg-brand-50 object-cover", className)}
      />
    );
  }

  return (
    <span aria-hidden className={cn("grid shrink-0 place-items-center bg-brand-50 font-bold text-brand-800", className)}>
      {initials}
    </span>
  );
}
