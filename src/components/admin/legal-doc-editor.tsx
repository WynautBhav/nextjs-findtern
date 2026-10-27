"use client";

import { useEffect, useState } from "react";
import { Check, ExternalLink, Loader2, Save } from "lucide-react";

import { Panel, PanelHeader } from "@/components/admin/panel";
import { RichTextField } from "@/components/admin/rich-text-field";
import { buttonClass } from "@/components/ui/button";
import { pickNdaClause, type NdaClause as Clause } from "@/lib/admin/legal-docs";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

/**
 * Editor for one legal document (platform / intern / company terms, the
 * intern NDA). Loads the stored copy from `apiEndpoint`; until that load
 * succeeds Save stays off, so the built-in fallback text can never overwrite
 * what is live.
 */
export function LegalDocEditor({
  title: initialTitle,
  initialContent,
  description,
  apiEndpoint,
  publicHref,
}: {
  title: string;
  initialContent: string;
  /** Kept for callers; the old browser-only draft store is gone. */
  documentKey?: string;
  description: string;
  apiEndpoint: string;
  /** Public page that shows this document. */
  publicHref?: string;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [clauseId, setClauseId] = useState<string | undefined>();
  const [clauseInactive, setClauseInactive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const isNda = apiEndpoint.includes("/ndc-clauses");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiEndpoint, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { terms?: Clause | null; clauses?: Clause[] };
        if (cancelled) return;
        const doc = isNda ? pickNdaClause(data.clauses ?? []) : (data.terms ?? null);
        if (doc) {
          if (doc.title) setTitle(doc.title);
          if (doc.bodyHtml) setContent(doc.bodyHtml);
          if (isNda) {
            setClauseId(doc.id);
            setClauseInactive(doc.isActive === false);
          }
        }
        setLoadFailed(false);
        setLoaded(true);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, isNda, attempt]);

  async function save() {
    if (!loaded) return;
    setSaving(true);
    setError(null);
    try {
      let res: Response;
      if (isNda && clauseId) {
        res = await csrfFetch(`${apiEndpoint}/${clauseId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, bodyHtml: content }),
        });
      } else if (isNda) {
        res = await csrfFetch(apiEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, bodyHtml: content, sortOrder: 0, isActive: true }),
        });
      } else {
        res = await csrfFetch(apiEndpoint, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, bodyHtml: content }),
        });
      }
      const data = (await res.json().catch(() => null)) as { error?: string; clause?: { id?: string } } | null;
      if (!res.ok) {
        setError(data?.error ?? `Couldn't save (HTTP ${res.status}). Nothing was changed.`);
        return;
      }
      if (data?.clause?.id) setClauseId(data.clause.id);
      setSavedAt(new Date());
    } catch {
      setError("Couldn't save: the network request failed. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel>
      <PanelHeader
        title={title || "Untitled document"}
        description={description}
        action={
          <>
            {publicHref ? (
              <a href={publicHref} target="_blank" rel="noreferrer" className={buttonClass({ variant: "ghost", size: "sm" })}>
                View live <ExternalLink className="size-3.5" aria-hidden />
              </a>
            ) : null}
            <button
              type="button"
              onClick={save}
              disabled={saving || !loaded}
              className={buttonClass({ variant: "primary", size: "sm" })}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </>
        }
      />

      <div className="space-y-5 px-5 py-5">
        {loadFailed ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
            <span>Couldn&apos;t load the live version, so saving is off to protect it. Nothing was changed.</span>
            <button type="button" onClick={() => setAttempt((n) => n + 1)} className={buttonClass({ variant: "outline", size: "sm" })}>
              Try again
            </button>
          </div>
        ) : !loaded ? (
          <p className="flex items-center gap-2 text-sm text-ink-600">
            <Loader2 className="size-4 animate-spin" aria-hidden /> Loading the live version…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {savedAt && !error ? (
          <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
            <Check className="size-4" aria-hidden />
            Saved at {savedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}. The public page updates on its next load.
          </p>
        ) : null}
        {clauseInactive ? (
          <p className="rounded-apple-md bg-accent-100 px-4 py-3 text-sm text-accent-700">
            No clause is switched on, so the public page shows the built-in text. Saving edits this inactive clause.
          </p>
        ) : null}

        <div>
          <label htmlFor="legal-title" className="mb-1.5 block text-sm font-medium text-ink-800">
            Document title
          </label>
          <input
            id="legal-title"
            type="text"
            value={title}
            disabled={!loaded}
            onChange={(e) => setTitle(e.target.value)}
            className={cn(
              "h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3.5 text-[0.9375rem] font-medium text-ink-900 outline-none",
              "focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 disabled:opacity-60",
            )}
          />
        </div>

        <RichTextField label="Document text" value={content} onChange={setContent} disabled={!loaded} />
      </div>
    </Panel>
  );
}
