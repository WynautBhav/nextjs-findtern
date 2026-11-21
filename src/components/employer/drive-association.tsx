"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { CollegeMark } from "./drive-parts";

/**
 * "In association with <college>" in the console's top bar, opposite the Findtern logo, for as long as an employer
 * is inside that college's campus drive. Rendered by the drive page into the slot the shell leaves for it
 * (#shell-association), so the shell needs to know nothing about drives. On a phone the bar has room for the
 * college's mark only; the name is read out and shown again in the page header.
 */
export function DriveAssociation({ collegeName, logoUrl }: { collegeName: string; logoUrl: string | null }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    // The slot exists only after the shell has rendered, so it is looked up once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSlot(document.getElementById("shell-association"));
  }, []);
  if (!slot) return null;
  return createPortal(
    <div className="mr-1 flex min-w-0 items-center gap-2.5 sm:mr-3" title={`In association with ${collegeName}`}>
      <div className="hidden min-w-0 text-right leading-tight md:block">
        <p className="text-xs text-text-subtle">In association with</p>
        <p className="max-w-[16rem] truncate text-sm font-semibold text-ink-900">{collegeName}</p>
      </div>
      <span className="sr-only md:hidden">In association with {collegeName}</span>
      <CollegeMark name={collegeName} logoUrl={logoUrl} className="size-10 rounded-lg text-xs" />
    </div>,
    slot,
  );
}
