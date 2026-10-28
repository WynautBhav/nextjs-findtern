"use client";

import { createContext, useContext, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";

import { RichTextField } from "@/components/admin/rich-text-field";
import { sendInline } from "@/components/admin/inline-control";
import { FileUpload } from "@/components/app/file-upload";
import { buttonClass } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  CMS_COLLECTIONS,
  buildCmsCreate,
  buildCmsPatch,
  cmsFields,
  cmsImageSrc,
  draftFromItem,
  imageError,
  inlineTokenKb,
  isInlineToken,
  slugError,
  type CmsDraft,
  type CmsField,
  type CmsType,
} from "@/lib/admin/cms-collections";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/app/use-confirm";

export type CmsItem = Record<string, unknown> & { id: string };

const fieldClass =
  "mt-1.5 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

type Ctx = { open: (item: CmsItem | "new") => void; remove: (item: CmsItem) => Promise<void>; busyId: string | null };
const EditorContext = createContext<Ctx | null>(null);

function useEditor(): Ctx {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("CMS controls must sit inside <CmsEditorProvider>");
  return ctx;
}

/**
 * Owns the edit sheet for one collection. The list itself is a server-rendered
 * DataTable passed in as children; its row buttons reach the sheet through
 * context. Edits send only the fields that changed (legacy inline images are
 * never re-posted) and an emptied optional field as null, so it clears.
 */
export function CmsEditorProvider({
  type,
  items,
  children,
}: {
  type: CmsType;
  items: CmsItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const def = CMS_COLLECTIONS[type];
  const [editing, setEditing] = useState<CmsItem | "new" | null>(null);
  const [original, setOriginal] = useState<CmsDraft>({});
  const [draft, setDraft] = useState<CmsDraft>({});
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  function open(item: CmsItem | "new") {
    const base = draftFromItem(type, item === "new" ? null : (items.find((i) => i.id === item.id) ?? item));
    setEditing(item);
    setOriginal(base);
    setDraft(base);
    setError(null);
  }

  async function remove(item: CmsItem) {
    const name = String(item[def.title] ?? "this item");
    const ok = await ask({ title: `Delete "${name}"?`, body: "It disappears from the website at once and can't be restored.", confirmLabel: "Yes, delete it" });
    if (!ok) return;
    setBusyId(item.id);
    setListError(null);
    const result = await sendInline({ url: "/api/admin/cms", method: "DELETE", body: { type, id: item.id } });
    setBusyId(null);
    if (!result.ok) {
      setListError(result.error);
      return;
    }
    router.refresh();
  }

  function clientError(): string | null {
    for (const f of cmsFields(type)) {
      const v = draft[f.name] ?? "";
      if (f.required && !v.trim()) return `${f.label} is required`;
      if (f.kind === "image" && !isInlineToken(v)) {
        const err = imageError(v, f.label);
        if (err) return err;
      }
    }
    if (type === "blog") return slugError(draft.slug, editing === "new" ? null : original.slug);
    return null;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const invalid = clientError();
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError(null);
    const result =
      editing === "new"
        ? await sendInline({ url: "/api/admin/cms", method: "POST", body: { type, ...buildCmsCreate(type, draft) } })
        : await sendInline({
            url: "/api/admin/cms",
            method: "PATCH",
            body: { type, id: (editing as CmsItem).id, ...buildCmsPatch(type, original, draft) },
          });
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setEditing(null);
    router.refresh();
  }

  const id = editing && editing !== "new" ? editing.id : null;
  const wide = type === "blog";

  return (
    <EditorContext.Provider value={{ open, remove, busyId }}>
      {dialog}
      {listError ? (
        <p role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
          {listError}
          <button type="button" aria-label="Dismiss" onClick={() => setListError(null)} className="shrink-0">
            <X className="size-4" aria-hidden />
          </button>
        </p>
      ) : null}
      {children}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && !busy && setEditing(null)}>
        <SheetContent side="right" className={cn("w-full overflow-y-auto", wide ? "sm:max-w-3xl" : "sm:max-w-lg")}>
          <SheetHeader className="border-b border-ink-100 px-6 py-5">
            <SheetTitle className="text-lg tracking-[-0.01em] text-ink-900">
              {editing === "new" ? `New ${def.noun}` : `Edit ${def.noun}`}
            </SheetTitle>
            <SheetDescription className="text-sm text-ink-600">
              {def.toggle
                ? "Saved changes show on the public site on its next load. Hide an entry instead of deleting it to keep it for later."
                : "Drafts stay private. Published posts show on the blog on its next load."}
            </SheetDescription>
          </SheetHeader>
          <form onSubmit={save} className="space-y-5 px-6 py-6" noValidate>
            {cmsFields(type).map((f) => (
              <FieldInput
                key={f.name}
                type={type}
                itemId={id}
                field={f}
                value={draft[f.name] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))}
              />
            ))}
            {error ? (
              <p role="alert" className="rounded-apple-md bg-danger-soft px-4 py-3 text-sm text-danger">
                {error}
              </p>
            ) : null}
            <div className="sticky bottom-0 -mx-6 flex flex-wrap items-center gap-2 border-t border-ink-100 bg-white px-6 py-4">
              <button type="submit" disabled={busy} className={buttonClass({ variant: "primary", size: "sm" })}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                {busy ? "Saving…" : editing === "new" ? `Add ${def.noun}` : "Save changes"}
              </button>
              <button type="button" disabled={busy} onClick={() => setEditing(null)} className={buttonClass({ variant: "ghost", size: "sm" })}>
                Cancel
              </button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </EditorContext.Provider>
  );
}

function FieldInput({
  type,
  itemId,
  field: f,
  value,
  onChange,
}: {
  type: CmsType;
  itemId: string | null;
  field: CmsField;
  value: string;
  onChange: (v: string) => void;
}) {
  const inputId = `cms-${f.name}`;
  if (f.kind === "richtext") {
    return <RichTextField label={f.label} value={value} onChange={onChange} imageUpload />;
  }
  const label = (
    <label htmlFor={inputId} className="block text-sm font-medium text-ink-800">
      {f.label}
      {f.required ? <span className="text-danger"> *</span> : <span className="font-normal text-text-subtle"> (optional)</span>}
    </label>
  );
  if (f.kind === "image") {
    return <ImageInput type={type} itemId={itemId} field={f} value={value} onChange={onChange} label={label} />;
  }
  return (
    <div>
      {label}
      {f.kind === "textarea" ? (
        <textarea id={inputId} rows={5} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldClass, "py-2.5 leading-relaxed")} />
      ) : f.kind === "select" ? (
        <select id={inputId} value={value} onChange={(e) => onChange(e.target.value)} className={cn(fieldClass, "h-11")}>
          {!(f.options ?? []).includes(value) && value ? <option value={value}>{value} (legacy value)</option> : null}
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o === "draft" ? "Draft" : o === "published" ? "Published" : o}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={inputId}
          type={f.kind === "number" ? "number" : "text"}
          inputMode={f.kind === "number" ? "numeric" : undefined}
          min={f.kind === "number" ? 0 : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn(fieldClass, "h-11", f.name === "slug" && "font-mono")}
        />
      )}
      {f.hint ? <p className="mt-1.5 text-xs text-ink-600">{f.hint}</p> : null}
    </div>
  );
}

function ImageInput({
  type,
  itemId,
  field: f,
  value,
  onChange,
  label,
}: {
  type: CmsType;
  itemId: string | null;
  field: CmsField;
  value: string;
  onChange: (v: string) => void;
  label: React.ReactNode;
}) {
  const inline = isInlineToken(value);
  const src = itemId ? cmsImageSrc(type, itemId, f.name, value) : value.trim() || null;
  return (
    <div>
      {label}
      <div className="mt-1.5 flex items-start gap-3">
        <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-apple-md border border-ink-200 bg-ink-50">
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin preview of arbitrary stored images
            <img src={src} alt="" className="size-full object-contain" />
          ) : (
            <span className="text-xs text-text-subtle">None</span>
          )}
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <input
            id={`cms-${f.name}`}
            type="text"
            value={inline ? "" : value}
            placeholder={inline ? `Embedded image (${inlineTokenKb(value)} KB, from the legacy site)` : "https://… or upload below"}
            onChange={(e) => onChange(e.target.value)}
            className={cn(fieldClass, "mt-0 h-10")}
          />
          <div className="flex flex-wrap items-center gap-2">
            <FileUpload
              kind="cms_image"
              accept="image/jpeg,image/png,image/webp"
              label={f.label}
              noun="a new file"
              onUploaded={(r) => onChange(r.url)}
            />
            {value ? (
              <button type="button" onClick={() => onChange("")} className={buttonClass({ variant: "ghost", size: "sm" })}>
                <X className="size-3.5" aria-hidden />
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Row and toolbar controls (rendered inside the server DataTable) ── */

export function CmsAddButton({ noun }: { noun: string }) {
  const { open } = useEditor();
  return (
    <button type="button" onClick={() => open("new")} className={buttonClass({ variant: "primary", size: "sm" })}>
      <Plus className="size-4" aria-hidden />
      Add {noun}
    </button>
  );
}

export function CmsRowActions({ item, viewHref }: { item: CmsItem; viewHref?: string | null }) {
  const { open, remove, busyId } = useEditor();
  const busy = busyId === item.id;
  return (
    <span className="flex items-center justify-end gap-1">
      {viewHref ? (
        <a href={viewHref} target="_blank" rel="noreferrer" aria-label="View on the website" className={buttonClass({ variant: "ghost", size: "iconSm" })}>
          <ExternalLink className="size-4" aria-hidden />
        </a>
      ) : null}
      <button type="button" onClick={() => open(item)} className={buttonClass({ variant: "ghost", size: "sm" })}>
        <Pencil className="size-3.5" aria-hidden />
        Edit
      </button>
      <button
        type="button"
        aria-label="Delete"
        disabled={busy}
        onClick={() => void remove(item)}
        className={cn(buttonClass({ variant: "ghost", size: "iconSm" }), "text-text-subtle hover:bg-danger-soft hover:text-danger")}
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Trash2 className="size-4" aria-hidden />}
      </button>
    </span>
  );
}

