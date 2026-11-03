"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  RemoveFormatting,
  Underline,
} from "lucide-react";

import { sanitizeRichText } from "@/lib/richtext";
import { cn } from "@/lib/utils";

type ToolName =
  | "bold"
  | "italic"
  | "underline"
  | "h2"
  | "h3"
  | "blockquote"
  | "insertUnorderedList"
  | "insertOrderedList"
  | "link"
  | "removeFormat";

const TOOLS: { name: ToolName; label: string; icon: React.ReactNode }[] = [
  { name: "bold", label: "Bold", icon: <Bold /> },
  { name: "italic", label: "Italic", icon: <Italic /> },
  { name: "underline", label: "Underline", icon: <Underline /> },
  { name: "h2", label: "Heading", icon: <Heading2 /> },
  { name: "h3", label: "Subheading", icon: <Heading3 /> },
  { name: "blockquote", label: "Quote", icon: <Quote /> },
  { name: "insertUnorderedList", label: "Bulleted list", icon: <List /> },
  { name: "insertOrderedList", label: "Numbered list", icon: <ListOrdered /> },
  { name: "link", label: "Link", icon: <Link2 /> },
  { name: "removeFormat", label: "Clear formatting", icon: <RemoveFormatting /> },
];

export const LINK_RULE = "Use a web address starting with https:// or http://, or a mailto: address.";

/** The href to store, or null when it is not an http(s) or mailto address. */
export function safeLinkHref(raw: string): string | null {
  const v = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (/^mailto:[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/i.test(v)) return v;
  if (!/^https?:\/\//i.test(v) || /[\s<>"]/.test(v)) return null;
  try {
    const u = new URL(v);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname ? v : null;
  } catch {
    return null;
  }
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Rich text field shared by the legal documents and the blog editor.
 *
 * Visual mode is a contentEditable surface driven by `execCommand` (what the
 * legacy admin used too, and still supported by every browser we target);
 * HTML mode is the raw source. The editable surface is uncontrolled: React
 * writes its HTML only when the value changes from outside (load, switching
 * back from HTML mode), so typing never resets the caret.
 *
 * There is no image button: the sanitizer (lib/richtext) allows no <img>, so an
 * inserted image would be deleted on save.
 */
export function RichTextField({
  value,
  onChange,
  label,
  minHeight = "min-h-96",
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  minHeight?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const surface = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const savedRange = useRef<Range | null>(null);
  const linkHintId = `${id}-link-hint`;

  // Enter makes a <p>, which the sanitizer keeps; a bare <div> would be unwrapped and lines would run together.
  useEffect(() => {
    document.execCommand("defaultParagraphSeparator", false, "p");
  }, []);

  // Push outside changes into the surface; skip our own echoes.
  useEffect(() => {
    if (mode !== "visual" || !surface.current) return;
    if (value === lastEmitted.current && surface.current.innerHTML !== "") return;
    // Stored or pasted HTML is never trusted: a script or an onerror handler
    // in a saved body would run in the admin's session as soon as the editor
    // opened. sanitizeRichText is the same allowlist the public page uses; it
    // also drops the <svg><use href="/cdn/assets/sprites-…"> icons legacy
    // pastes carry (QA-147).
    surface.current.innerHTML = sanitizeRichText(value);
    lastEmitted.current = value;
  }, [value, mode]);

  function emit() {
    if (!surface.current) return;
    const html = surface.current.innerHTML;
    lastEmitted.current = html;
    onChange(html);
  }

  function exec(cmd: string, arg?: string) {
    surface.current?.focus();
    document.execCommand("defaultParagraphSeparator", false, "p");
    document.execCommand(cmd, false, arg);
    emit();
  }

  function openLink() {
    const sel = window.getSelection();
    const range = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
    savedRange.current = range && surface.current?.contains(range.commonAncestorContainer) ? range.cloneRange() : null;
    setLinkUrl("");
    setLinkError(null);
    setLinkOpen(true);
    // The field mounts on the next render.
    requestAnimationFrame(() => linkInput.current?.focus());
  }

  function closeLink(refocus = true) {
    setLinkOpen(false);
    setLinkError(null);
    if (refocus) surface.current?.focus();
  }

  function applyLink() {
    const href = safeLinkHref(linkUrl);
    if (!href) {
      setLinkError(LINK_RULE);
      linkInput.current?.focus();
      return;
    }
    setLinkOpen(false);
    setLinkError(null);
    surface.current?.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
    if (savedRange.current?.collapsed === false) exec("createLink", href);
    else exec("insertHTML", `<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`);
    savedRange.current = null;
  }

  function runTool(name: ToolName) {
    switch (name) {
      case "bold":
      case "italic":
      case "underline":
      case "insertUnorderedList":
      case "insertOrderedList":
      case "removeFormat":
        return exec(name);
      case "h2":
      case "h3":
      case "blockquote":
        return exec("formatBlock", `<${name}>`);
      case "link":
        return linkOpen ? closeLink() : openLink();
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink-800">
          {label}
        </label>
        <div role="group" aria-label="Editor mode" className="flex items-center gap-0.5 rounded-apple-sm bg-ink-100 p-0.5">
          {(["visual", "html"] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-apple-sm px-2.5 text-xs font-semibold max-lg:h-10",
                mode === m ? "bg-card text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900",
              )}
            >
              {m === "visual" ? <Eye className="size-3.5" aria-hidden /> : <Code className="size-3.5" aria-hidden />}
              {m === "visual" ? "Visual" : "HTML"}
            </button>
          ))}
        </div>
      </div>

      {mode === "visual" ? (
        <div className="overflow-hidden rounded-apple-md border border-ink-200 bg-surface focus-within:border-brand-500 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
          <div role="toolbar" aria-label={`${label} formatting`} className="flex flex-wrap items-center gap-0.5 border-b border-ink-100 bg-ink-50 p-1.5">
            {TOOLS.map((t) => (
              <button
                key={t.label}
                type="button"
                title={t.label}
                aria-label={t.label}
                disabled={disabled}
                // Keep the selection in the editor when a tool is clicked.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => runTool(t.name)}
                aria-expanded={t.name === "link" ? linkOpen : undefined}
                className="grid size-8 place-items-center rounded-apple-sm text-ink-700 hover:bg-surface-raised hover:text-ink-900 max-lg:size-10 [&_svg]:size-4"
              >
                {t.icon}
              </button>
            ))}
          </div>
          {linkOpen ? (
            <div className="border-b border-ink-100 bg-surface-raised px-3 py-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`${id}-link`} className="text-sm font-medium text-ink-800">
                  Link address
                </label>
                <input
                  id={`${id}-link`}
                  ref={linkInput}
                  type="url"
                  inputMode="url"
                  value={linkUrl}
                  placeholder="https://"
                  aria-invalid={linkError ? true : undefined}
                  aria-describedby={linkError ? `${linkHintId} ${linkHintId}-err` : linkHintId}
                  onChange={(e) => {
                    setLinkUrl(e.target.value);
                    setLinkError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      applyLink();
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      closeLink();
                    }
                  }}
                  className="h-9 min-w-0 flex-1 basis-56 rounded-apple-sm border border-ink-200 bg-surface px-3 text-base text-ink-900 placeholder:text-text-subtle focus-visible:border-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-invalid:border-danger max-lg:h-11 sm:text-sm"
                />
                <button type="button" onClick={applyLink} className="inline-flex h-9 items-center rounded-apple-sm bg-primary px-3 text-sm font-semibold text-on-primary hover:bg-primary-hover max-lg:h-11">
                  Add link
                </button>
                <button type="button" onClick={() => closeLink()} className="inline-flex h-9 items-center rounded-apple-sm px-3 text-sm font-semibold text-ink-700 hover:bg-ink-100 max-lg:h-11">
                  Cancel
                </button>
              </div>
              <p id={linkHintId} className="mt-1.5 text-xs text-ink-600">
                {LINK_RULE}
              </p>
              {linkError ? (
                <p id={`${linkHintId}-err`} role="alert" className="mt-1 text-sm font-medium text-danger">
                  {linkError}
                </p>
              ) : null}
            </div>
          ) : null}
          <div
            id={id}
            ref={surface}
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            contentEditable={!disabled}
            suppressContentEditableWarning
            onInput={emit}
            onBlur={emit}
            className={cn(
              "prose prose-sm max-w-none overflow-y-auto px-5 py-4 text-sm leading-relaxed text-ink-900 outline-none max-h-[36rem] [&_img]:max-w-full [&_img]:rounded-apple-sm",
              minHeight,
            )}
          />
        </div>
      ) : (
        <textarea
          id={id}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          rows={18}
          spellCheck={false}
          className={cn(
            "w-full rounded-apple-md border border-ink-200 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring focus:border-brand-500",
            minHeight,
          )}
        />
      )}
    </div>
  );
}
