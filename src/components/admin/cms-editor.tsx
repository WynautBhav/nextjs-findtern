"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";

import { AdminEmpty, Panel, PanelHeader } from "@/components/admin/panel";
import { FileUpload } from "@/components/app/file-upload";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { CMS_COLLECTIONS, type CmsField, type CmsType } from "@/lib/admin/cms-collections";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";

type Item = Record<string, unknown> & { id: string };

const input =
  "mt-1.5 w-full rounded-[10px] border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** One editor for every website collection: list, add, edit, hide, delete. */
export function CmsEditor({ active, items }: { active: CmsType; items: Record<CmsType, Item[]> }) {
  const router = useRouter();
  const def = CMS_COLLECTIONS[active];
  const [editing, setEditing] = useState<Item | "new" | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(item: Item | "new") {
    setEditing(item);
    setError(null);
    setValues(
      Object.fromEntries(
        (def.fields as readonly CmsField[]).map((f) => [
          f.name,
          item === "new" ? (f.kind === "select" ? (f.options?.[0] ?? "") : "") : String(item[f.name] ?? ""),
        ]),
      ),
    );
  }

  async function send(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/cms", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: active, ...payload }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? (method === "DELETE" ? "Couldn't delete." : "Couldn't save."));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = Object.fromEntries(Object.entries(values).filter(([, v]) => v !== ""));
    const ok = editing === "new" ? await send("POST", payload) : await send("PATCH", { id: (editing as Item).id, ...payload });
    if (ok) setEditing(null);
  }

  const list = items[active];
  return (
    <div className="space-y-4">
      {/* Same ink-100 segmented control as payouts / messages; scrolls
          sideways on phones rather than wrapping into a pile of pills. */}
      <nav
        className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-ink-100 p-1"
        aria-label="Content types"
      >
        {(Object.keys(CMS_COLLECTIONS) as CmsType[]).map((t) => (
          <Link
            key={t}
            href={`/admin/cms?tab=${t}`}
            aria-current={t === active ? "page" : undefined}
            className={cn(
              "apple-spring apple-pressable inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.01em]",
              t === active ? "bg-white text-ink-900 shadow-xs" : "text-ink-500 hover:text-ink-800",
            )}
          >
            {CMS_COLLECTIONS[t].label}
            <span className="tabular-nums text-ink-400">{items[t].length}</span>
          </Link>
        ))}
      </nav>

      <Panel>
        <PanelHeader
          title={def.label}
          action={
            <button
              type="button"
              onClick={() => open("new")}
              className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-3.5 text-[14px] font-medium text-white hover:bg-brand-600"
            >
              <Plus className="size-4" aria-hidden /> Add
            </button>
          }
        />
        {error && editing === null ? (
          <p role="alert" className="border-b border-ink-100 bg-danger-soft px-5 py-3 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {list.length === 0 ? (
          <AdminEmpty
            title={`No ${def.label.toLowerCase()} yet`}
            body="Use Add to publish the first entry. It shows on the public site as soon as it is saved."
          />
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.map((item) => {
              const hidden = def.toggle && item.isActive === false;
              return (
                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn("min-w-0 flex-1", hidden && "opacity-50")}>
                    <span className="block truncate text-sm font-medium text-ink-900">{String(item[def.title] ?? "Untitled")}</span>
                    <span className="block truncate text-xs text-text-subtle">{String(item[def.subtitle] ?? "")}</span>
                  </span>
                  {def.toggle ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void send("PATCH", { id: item.id, isActive: hidden })}
                      className="min-h-9 rounded-lg px-2.5 text-xs font-medium text-ink-700 hover:bg-ink-100 max-lg:min-h-11"
                    >
                      {hidden ? "Show" : "Hide"}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => open(item)} aria-label="Edit" className="grid size-9 place-items-center rounded-lg text-ink-500 hover:bg-ink-100 max-lg:size-11">
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Delete this item?")) void send("DELETE", { id: item.id });
                    }}
                    className="grid size-9 place-items-center rounded-lg text-ink-400 hover:bg-danger-soft hover:text-danger max-lg:size-11"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{editing === "new" ? `Add to ${def.label.toLowerCase()}` : "Edit"}</SheetTitle>
          </SheetHeader>
          <form onSubmit={save} className="space-y-4 px-4 pb-6">
            {(def.fields as readonly CmsField[]).map((f) => (
              <div key={f.name}>
                <label htmlFor={`cms-${f.name}`} className="block text-sm font-medium text-ink-800">
                  {f.label}
                  {f.required ? " *" : ""}
                </label>
                {f.kind === "textarea" ? (
                  <textarea
                    id={`cms-${f.name}`}
                    rows={f.name === "body" ? 14 : 4}
                    required={f.required}
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    className={`${input} py-2`}
                  />
                ) : f.kind === "select" ? (
                  <select
                    id={`cms-${f.name}`}
                    value={values[f.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    className={`${input} h-10`}
                  >
                    {f.options?.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`cms-${f.name}`}
                    type={f.kind === "number" ? "number" : "text"}
                    required={f.required}
                    value={values[f.name] ?? ""}
                    placeholder={f.kind === "image" ? "Paste a URL or upload below" : undefined}
                    onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    className={`${input} h-10`}
                  />
                )}
                {f.kind === "image" ? (
                  <FileUpload
                    className="mt-2"
                    kind="cms_image"
                    accept="image/jpeg,image/png,image/webp"
                    label={f.label}
                    onUploaded={(r) => setValues((v) => ({ ...v, [f.name]: r.url }))}
                  />
                ) : f.hint ? (
                  <p className="mt-1 text-xs text-text-subtle">{f.hint}</p>
                ) : null}
              </div>
            ))}
            {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-[10px] bg-brand-700 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save"}
            </button>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
