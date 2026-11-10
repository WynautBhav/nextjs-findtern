"use client";

import { useEffect } from "react";

import { recoverFromChunkError, retryOrReload } from "@/lib/chunk-error";

/**
 * Last-resort boundary: a failure in the root layout itself (or a chunk that
 * will not load while the layout renders). It replaces the document, so it
 * brings its own <html>/<body> and inline styles; the app's CSS is not loaded here.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
    recoverFromChunkError(error);
  }, [error]);

  return (
    <html lang="en-IN">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", color: "#0f172a", background: "#fff" }}>
        <div style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: 0 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#475569", margin: "8px 0 0" }}>An unexpected error occurred. Please try again.</p>
          <button
            type="button"
            onClick={() => retryOrReload(error, retry)}
            style={{ marginTop: 24, padding: "10px 20px", fontSize: 14, fontWeight: 600, color: "#fff", background: "#0E6049", border: 0, borderRadius: 8, cursor: "pointer" }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
