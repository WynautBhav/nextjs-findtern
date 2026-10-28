"use client";

import { useCallback, useRef, useState } from "react";

import { buttonClass } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Ask = { title: string; body: string; confirmLabel: string; destructive?: boolean };

/**
 * An in-page confirm for destructive actions (admin, intern, employer), in place of
 * window.confirm (QA-145 and its follow-up): a browser driver dismisses the
 * native dialog, it can't be styled or read with the rest of the page, and it
 * looked like a dead button. `await ask({...})` resolves true on "Yes",
 * false on Cancel / Esc / outside click; render `dialog` once in the
 * component.
 */
export function useConfirm() {
  const [current, setCurrent] = useState<Ask | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const ask = useCallback((a: Ask) => {
    setCurrent(a);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setCurrent(null);
  };

  const dialog = (
    <Dialog open={current !== null} onOpenChange={(open) => (!open ? settle(false) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{current?.title}</DialogTitle>
          <DialogDescription>{current?.body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Cancel takes the focus: Enter on a focused delete is the one
              keyboard slip that can't be undone. */}
          <button type="button" autoFocus onClick={() => settle(false)} className={buttonClass({ variant: "outline", size: "sm" })}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => settle(true)}
            className={buttonClass({ variant: current?.destructive === false ? "primary" : "dark", size: "sm" })}
          >
            {current?.confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return { ask, dialog };
}
