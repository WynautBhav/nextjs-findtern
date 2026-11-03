"use client";

import { useEffect } from "react";

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
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <h1 className="text-xl font-semibold text-ink-900">This page couldn&apos;t load</h1>
      <p className="mt-2 text-sm text-ink-600">
        Something went wrong while building it. Nothing was changed. Try again; if it keeps happening, tell the tech team
        {error.digest ? ` and quote ${error.digest}` : ""}.
      </p>
      <button
        type="button"
        onClick={reset}
        className="apple-spring mt-6 inline-flex min-h-11 items-center rounded-apple-sm bg-primary px-4 text-sm font-medium text-white hover:bg-primary-hover"
      >
        Try again
      </button>
    </div>
  );
}
