"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Loader2,
  Quote,
  RemoveFormatting,
  Underline,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
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

/**
 * Rich text field shared by the legal documents and the blog editor.
 *
 * Visual mode is a contentEditable surface driven by `execCommand` (what the
 * legacy admin used too, and still supported by every browser we target);
 * HTML mode is the raw source. The editable surface is uncontrolled: React
 * writes its HTML only when the value changes from outside (load, switching
 * back from HTML mode), so typing never resets the caret.
 *
 * `imageUpload` turns on the image button: the file goes through the normal
 * upload route (`cms_image`) and is inserted by URL, not inlined as base64.
 */
export function RichTextField({
  value,
  onChange,
  label,
  imageUpload = false,
  minHeight = "min-h-96",
  disabled,
}: {
  value: string;
  onChange: (html: string) => void;
  label: string;
  imageUpload?: boolean;
  minHeight?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [mode, setMode] = useState<"visual" | "html">("visual");
  const surface = useRef<HTMLDivElement>(null);
  const lastEmitted = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Push outside changes into the surface; skip our own echoes.
  useEffect(() => {
    if (mode !== "visual" || !surface.current) return;
    if (value === lastEmitted.current && surface.current.innerHTML !== "") return;
    surface.current.innerHTML = value;
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
    document.execCommand(cmd, false, arg);
    emit();
  }

  function addLink() {
    const url = window.prompt("Link address (https://…)");
    if (!url) return;
    if (!/^(https?:\/\/|mailto:|\/)/i.test(url.trim())) {
      setUploadError("Links must start with https://, mailto: or /.");
      return;
    }
    exec("createLink", url.trim());
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const res = await csrfFetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "x-document-kind": "cms_image",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!res.ok || !data?.url) {
        setUploadError(data?.error ?? "The image didn't upload. Try a JPG, PNG or WebP under 5 MB.");
        return;
      }
      exec("insertImage", data.url);
    } catch {
      setUploadError("The image didn't upload: the network request failed.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
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
        return addLink();
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
                mode === m ? "bg-white text-ink-900 shadow-xs" : "text-ink-600 hover:text-ink-900",
              )}
            >
              {m === "visual" ? <Eye className="size-3.5" aria-hidden /> : <Code className="size-3.5" aria-hidden />}
              {m === "visual" ? "Visual" : "HTML"}
            </button>
          ))}
        </div>
      </div>

      {mode === "visual" ? (
        <div className="overflow-hidden rounded-apple-md border border-ink-200 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20">
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
                className="grid size-8 place-items-center rounded-apple-sm text-ink-700 hover:bg-white hover:text-ink-900 max-lg:size-10 [&_svg]:size-4"
              >
                {t.icon}
              </button>
            ))}
            {imageUpload ? (
              <>
                <span aria-hidden className="mx-1 h-5 w-px bg-ink-200" />
                <button
                  type="button"
                  title="Insert image"
                  aria-label="Insert image"
                  disabled={disabled || uploading}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => fileInput.current?.click()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-apple-sm px-2 text-xs font-semibold text-ink-700 hover:bg-white hover:text-ink-900 max-lg:h-10 [&_svg]:size-4"
                >
                  {uploading ? <Loader2 className="animate-spin" aria-hidden /> : <ImagePlus aria-hidden />}
                  Image
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadImage(f);
                  }}
                />
              </>
            ) : null}
          </div>
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
            "w-full rounded-apple-md border border-ink-200 bg-ink-950 p-4 font-mono text-xs leading-relaxed text-brand-100 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
            minHeight,
          )}
        />
      )}
      {uploadError ? (
        <p role="alert" className="mt-1.5 text-sm text-danger">
          {uploadError}
        </p>
      ) : null}
    </div>
  );
}
