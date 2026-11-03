"use client";

import { useEffect } from "react";

import { Panel } from "@/components/admin/panel";

/**
 * An unexpected failure inside the admin console. It keeps the rail and the top
 * bar (the segment error boundary sits below the admin layout), says that
 * nothing was changed by loading, and offers a retry. Failures a page expects
 * (a database outage on a list) use `AdminLoadError` in the page instead.
 */
export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Panel role="alert" className="mx-auto mt-8 flex max-w-md flex-col items-center px-6 py-14 text-center">
      <h1 className="text-balance text-xl font-semibold tracking-[-0.01em] text-foreground">This page couldn&apos;t load</h1>
      <p className="mt-2 text-pretty text-sm leading-relaxed text-text-subtle">
        Something went wrong while building it. Nothing was changed. Try again; if it keeps happening, tell the tech team
        {error.digest ? ` and quote ${error.digest}` : ""}.
      </p>
      <button
        type="button"
        onClick={reset}
        className="apple-spring mt-6 inline-flex min-h-11 items-center rounded-full bg-primary px-5 text-sm font-medium text-white hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        Try again
      </button>
    </Panel>
  );
}
