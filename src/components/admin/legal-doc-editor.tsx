"use client";

import { useEffect, useState } from "react";
import { Check, Code, Eye, Loader2, Save } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";

export function LegalDocEditor({
  title: initialTitle,
  initialContent,
  documentKey,
  description,
  apiEndpoint,
  clauseId,
}: {
  title: string;
  initialContent: string;
  documentKey: string;
  description: string;
  apiEndpoint?: string;
  clauseId?: string;
}) {
  const [title, setTitle] = useState(() => {
    if (typeof window !== "undefined" && !apiEndpoint) {
      const stored = localStorage.getItem(`findtern_legal_${documentKey}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.title) return parsed.title;
        } catch {}
      }
    }
    return initialTitle;
  });
  const [content, setContent] = useState(() => {
    if (typeof window !== "undefined" && !apiEndpoint) {
      const stored = localStorage.getItem(`findtern_legal_${documentKey}`);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.content) return parsed.content;
        } catch {}
      }
    }
    return initialContent;
  });
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeClauseId, setActiveClauseId] = useState<string | undefined>(clauseId);

  const [error, setError] = useState<string | null>(null);
  // Until the server copy has loaded, saving would overwrite it with the fallback text.
  const [loaded, setLoaded] = useState(!apiEndpoint);

  useEffect(() => {
    if (!apiEndpoint) return;

    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(apiEndpoint!);
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (cancelled) return;
        if (data.terms) {
          if (data.terms.title) setTitle(data.terms.title);
          if (data.terms.bodyHtml) setContent(data.terms.bodyHtml);
        } else if (data.clauses && data.clauses.length > 0) {
          const first = data.clauses[0];
          setActiveClauseId(first.id);
          if (first.title) setTitle(first.title);
          if (first.bodyHtml) setContent(first.bodyHtml);
        }
        setLoaded(true);
      } catch {
        if (!cancelled) setError("Couldn't load the current version. Reload the page before saving.");
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [apiEndpoint, documentKey]);

  const handleSave = async () => {
    if (!loaded) {
      setError("Couldn't load the current version. Reload the page before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (apiEndpoint) {
        let res: Response;
        if (apiEndpoint.includes("/ndc-clauses")) {
          if (activeClauseId) {
            res = await csrfFetch(`${apiEndpoint}/${activeClauseId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, bodyHtml: content }),
            });
          } else {
            res = await csrfFetch(apiEndpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title, bodyHtml: content, sortOrder: 0, isActive: true }),
            });
            if (res.ok) {
              const body = await res.json();
              if (body.clause?.id) setActiveClauseId(body.clause.id);
            }
          }
        } else {
          res = await csrfFetch(apiEndpoint, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, bodyHtml: content }),
          });
        }
        if (!res.ok) throw new Error(String(res.status));
      }
      if (typeof window !== "undefined") {
        localStorage.setItem(`findtern_legal_${documentKey}`, JSON.stringify({ title, content }));
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Couldn't save your changes. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const exec = (cmd: string, arg?: string) => {
    if (typeof document === "undefined") return;
    document.execCommand(cmd, false, arg);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink-100 pb-5">
          <div>
            <h3 className="font-bold text-base text-ink-900">{title}</h3>
            <p className="text-xs text-text-subtle mt-0.5">{description}</p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="apple-spring apple-pressable inline-flex min-h-10 items-center justify-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : saved ? (
              <Check className="size-3.5" />
            ) : (
              <Save className="size-3.5" />
            )}
            <span>{saving ? "Saving..." : saved ? "Saved" : "Save Changes"}</span>
          </button>
        </div>

        {error ? (
          <p role="alert" className="mt-4 rounded-xl bg-danger-soft px-4 py-2.5 text-xs font-medium text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-5 space-y-4">
          <div>
            <label className="block text-2xs font-semibold uppercase tracking-wider text-text-subtle mb-1.5">
              Document Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-xs font-medium text-ink-900 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-2xs font-semibold uppercase tracking-wider text-text-subtle">
                Document Content
              </label>
              <div className="flex items-center gap-1 rounded-lg border border-ink-200 p-0.5 bg-ink-50">
                <button
                  type="button"
                  onClick={() => setMode("visual")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-2xs font-semibold ${
                    mode === "visual"
                      ? "bg-white text-ink-900 shadow-2xs"
                      : "text-text-subtle hover:text-ink-800"
                  }`}
                >
                  <Eye className="size-3" />
                  <span>Visual</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode("html")}
                  className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-2xs font-semibold ${
                    mode === "html"
                      ? "bg-white text-ink-900 shadow-2xs"
                      : "text-text-subtle hover:text-ink-800"
                  }`}
                >
                  <Code className="size-3" />
                  <span>HTML</span>
                </button>
              </div>
            </div>

            {mode === "visual" ? (
              <div className="space-y-2">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center gap-1 rounded-t-xl border border-ink-200 bg-ink-50/70 p-2 border-b-0">
                  <button
                    type="button"
                    onClick={() => exec("bold")}
                    className="rounded px-2.5 py-1 text-xs font-bold text-ink-700 hover:bg-ink-200/60"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => exec("italic")}
                    className="rounded px-2.5 py-1 text-xs italic text-ink-700 hover:bg-ink-200/60"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => exec("underline")}
                    className="rounded px-2.5 py-1 text-xs underline text-ink-700 hover:bg-ink-200/60"
                  >
                    U
                  </button>
                  <span className="mx-1 h-4 w-px bg-ink-300" />
                  <button
                    type="button"
                    onClick={() => exec("insertUnorderedList")}
                    className="rounded px-2.5 py-1 text-xs text-ink-700 hover:bg-ink-200/60"
                  >
                    • List
                  </button>
                  <button
                    type="button"
                    onClick={() => exec("insertOrderedList")}
                    className="rounded px-2.5 py-1 text-xs text-ink-700 hover:bg-ink-200/60"
                  >
                    1. List
                  </button>
                </div>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(e) => setContent(e.currentTarget.innerHTML)}
                  dangerouslySetInnerHTML={{ __html: content }}
                  className="min-h-[380px] max-h-[550px] overflow-y-auto rounded-b-xl border border-ink-200 bg-white p-5 text-xs text-ink-900 leading-relaxed focus:outline-hidden prose prose-sm max-w-none"
                />
              </div>
            ) : (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={18}
                className="w-full rounded-xl border border-ink-200 bg-ink-950 p-4 font-mono text-2xs text-emerald-400 focus:border-brand-500 focus:outline-hidden focus:ring-2 focus:ring-brand-500/20"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
