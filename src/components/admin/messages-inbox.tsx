"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Clock, ExternalLink, FileText, Globe, Loader2, Mail, MailOpen, Paperclip, Reply, Trash2, Video } from "lucide-react";

import { AdminEmpty } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
import { Pill } from "@/components/app/primitives";
import { buttonClass } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ContactFile, ContactMeta } from "@/lib/admin/contact-meta";
import { csrfFetch } from "@/lib/client-fetch";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/app/use-confirm";

export type InboxMessage = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  subject: string | null;
  queryType: string | null;
  isRead: boolean;
  createdAt: string | null;
  meta: ContactMeta;
  /** The sender's record, when it could be matched (id header or email). */
  sender: { name: string; href: string; role: "intern" | "employer" } | null;
};

const KIND_LABEL: Record<string, string> = {
  report: "Problem report",
  feedback: "Feedback",
  website: "Website",
};

function kindLabel(m: InboxMessage): string {
  if (m.meta.kind) return KIND_LABEL[m.meta.kind];
  return m.subject?.toLowerCase().startsWith("full-time offer") ? "Full-time offer" : "Website enquiry";
}

function roleLabel(m: InboxMessage): string | null {
  const role = m.sender?.role ?? m.meta.role;
  if (role === "intern") return "Candidate";
  if (role === "employer") return "Employer";
  const qt = (m.queryType ?? "").trim().toLowerCase();
  return qt === "general" ? "General" : null;
}

function when(iso: string | null, withTime = false): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
    timeZone: "Asia/Kolkata",
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.charAt(0) ?? ""}${parts[1]?.charAt(0) ?? ""}`.toUpperCase() || "?";
}

export function MessagesInbox({ messages, filtering }: { messages: InboxMessage[]; filtering: boolean }) {
  const { ask, dialog } = useConfirm();
  const router = useRouter();
  const [rows, setRows] = useState(messages);
  const [seen, setSeen] = useState(messages);
  if (seen !== messages) {
    setSeen(messages);
    setRows(messages);
  }
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const open = rows.find((m) => m.id === openId) ?? null;
  const allSelected = rows.length > 0 && rows.every((m) => selected.has(m.id));

  async function send(method: "PATCH" | "DELETE", ids: string[], isRead?: boolean): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await csrfFetch("/api/admin/messages", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ids.length === 1 ? { id: ids[0], isRead } : { ids, isRead }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? "Not saved. Try again.");
        return false;
      }
      return true;
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function setRead(ids: string[], isRead: boolean) {
    if (!(await send("PATCH", ids, isRead))) return;
    setRows((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, isRead } : m)));
    setSelected(new Set());
    router.refresh();
  }

  async function remove(ids: string[]) {
    const ok = await ask({
      title: ids.length === 1 ? "Delete this message?" : `Delete ${ids.length} messages?`,
      body: "Deleted messages are gone from the inbox for everyone. This can't be undone.",
      confirmLabel: ids.length === 1 ? "Yes, delete it" : `Yes, delete ${ids.length}`,
    });
    if (!ok) return;
    if (!(await send("DELETE", ids))) return;
    setRows((prev) => prev.filter((m) => !ids.includes(m.id)));
    setSelected(new Set());
    if (openId && ids.includes(openId)) setOpenId(null);
    router.refresh();
  }

  function openMessage(m: InboxMessage) {
    setOpenId(m.id);
    // Opening a message reads it (legacy inbox did the same). Silent: a
    // read-only role can still open it, it just stays unread.
    if (!m.isRead) {
      void csrfFetch("/api/admin/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isRead: true }),
      })
        .then((res) => {
          if (!res.ok) return;
          setRows((prev) => prev.map((x) => (x.id === m.id ? { ...x, isRead: true } : x)));
          router.refresh();
        })
        .catch(() => undefined);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (rows.length === 0) {
    return filtering ? (
      <AdminEmpty title="No messages match" body="Nothing matches this search and these filters. Clear a filter to see more." action={{ href: "/admin/messages", label: "Clear filters" }} />
    ) : (
      <AdminEmpty title="Inbox zero" body="Website enquiries and in-app problem reports land here. Nothing is waiting." />
    );
  }

  const selectedIds = [...selected];

  return (
    <div>
      {dialog}
      {/* Bulk bar replaces the select-all row while a selection exists. */}
      <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-2">
        <label className="inline-flex min-h-9 items-center gap-2.5 text-sm font-medium text-ink-700 max-lg:min-h-11">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((m) => m.id)))}
            className="size-4 rounded-sm accent-brand-700"
          />
          {selected.size ? `${selected.size} selected` : "Select all on this page"}
        </label>
        {selected.size ? (
          <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
            <button type="button" disabled={busy} onClick={() => setRead(selectedIds, true)} className={buttonClass({ variant: "outline", size: "sm" })}>
              <MailOpen className="size-4" aria-hidden />
              Mark read
            </button>
            <button type="button" disabled={busy} onClick={() => setRead(selectedIds, false)} className={buttonClass({ variant: "outline", size: "sm" })}>
              <Mail className="size-4" aria-hidden />
              Mark unread
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => remove(selectedIds)}
              className={cn(buttonClass({ variant: "ghost", size: "sm" }), "text-danger hover:bg-danger-soft")}
            >
              <Trash2 className="size-4" aria-hidden />
              Delete
            </button>
            {busy ? <Loader2 className="size-4 animate-spin text-text-subtle" aria-label="Saving" /> : null}
          </div>
        ) : null}
      </div>
      {error && !open ? (
        <p role="alert" className="border-b border-danger/20 bg-danger-soft px-5 py-2.5 text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}

      <ul className="divide-y divide-ink-100">
        {rows.map((m) => {
          const role = roleLabel(m);
          return (
            <li key={m.id} className={cn("flex items-start gap-3 px-5 py-3.5 hover:bg-ink-50/60", selected.has(m.id) && "bg-brand-50/50")}>
              {/* The label is the 44px target; negative margins keep the box
                  where it was (QA-146). */}
              <label className="-m-3 flex size-11 shrink-0 cursor-pointer items-start justify-center pt-3 max-lg:-m-2.5 max-lg:items-center max-lg:pt-0">
                <input
                  type="checkbox"
                  aria-label={`Select message from ${m.name}`}
                  checked={selected.has(m.id)}
                  onChange={() => toggle(m.id)}
                  className="mt-1 size-4 shrink-0 rounded-sm accent-brand-700 max-lg:mt-0 max-lg:size-5"
                />
              </label>
              <button
                type="button"
                onClick={() => openMessage(m)}
                className="flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-600"
              >
                {/* The row's visible text is its name (sender, date, subject),
                    so voice control can say what it sees; only "unread" is added. */}
                {m.isRead ? null : <span className="sr-only">Unread. </span>}
                <span
                  aria-hidden
                  className={cn(
                    "relative grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
                    m.isRead ? "bg-ink-100 text-ink-600" : "bg-brand-100 text-brand-800",
                  )}
                >
                  {initials(m.sender?.name ?? m.name)}
                  {m.isRead ? null : <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-info ring-2 ring-white" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className={cn("truncate text-[0.9375rem] text-ink-900", m.isRead ? "font-medium" : "font-semibold")}>
                      {m.sender?.name ?? m.name}
                    </span>
                    <span className="nums shrink-0 text-xs text-ink-600">{when(m.createdAt)}</span>
                  </span>
                  <span className={cn("mt-0.5 block truncate text-sm", m.isRead ? "text-ink-600" : "font-medium text-ink-900")}>
                    {m.subject || "No subject"}
                  </span>
                  <span className="mt-1 block truncate text-sm text-ink-600">{m.meta.body || "(no text)"}</span>
                  <span className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Pill tone={m.meta.kind === "report" ? "waiting" : m.meta.kind === "feedback" ? "new" : "neutral"}>{kindLabel(m)}</Pill>
                    {role ? <Pill tone="closed">{role}</Pill> : null}
                    {m.meta.files.length ? (
                      <span className="inline-flex items-center gap-1 text-xs text-ink-600">
                        <Paperclip className="size-3.5" aria-hidden />
                        <span className="nums">{m.meta.files.length}</span>
                        <span className="sr-only">attachments</span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <Sheet open={Boolean(open)} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto bg-ink-50 p-0 sm:max-w-xl">
          {open ? <MessageDetail m={open} busy={busy} error={error} onRead={(v) => setRead([open.id], v)} onDelete={() => remove([open.id])} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MessageDetail({
  m,
  busy,
  error,
  onRead,
  onDelete,
}: {
  m: InboxMessage;
  busy: boolean;
  error: string | null;
  onRead: (isRead: boolean) => void;
  onDelete: () => void;
}) {
  const role = roleLabel(m);
  const pageHref = m.meta.pageUrl && /^(https?:\/\/|\/)/i.test(m.meta.pageUrl) ? m.meta.pageUrl : null;
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <SheetHeader className="rounded-apple-lg border border-ink-200/80 bg-white p-5 text-left shadow-xs">
        <div className="flex items-start gap-3 pr-8">
          <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full bg-brand-100 text-[0.9375rem] font-semibold text-brand-800">
            {initials(m.sender?.name ?? m.name)}
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-lg font-semibold text-ink-900">{m.sender?.name ?? m.name}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm break-all text-ink-600">
              {m.email}
              {m.phone ? ` · ${m.phone}` : ""}
            </SheetDescription>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <StatusBadge tone={m.isRead ? "neutral" : "warning"} label={m.isRead ? "Read" : "Unread"} />
              <Pill tone={m.meta.kind === "report" ? "waiting" : m.meta.kind === "feedback" ? "new" : "neutral"}>{kindLabel(m)}</Pill>
              {role ? <Pill tone="closed">{role}</Pill> : null}
            </div>
          </div>
        </div>
        {m.sender ? (
          <Link href={m.sender.href} className={cn(buttonClass({ variant: "outline", size: "sm" }), "mt-4 self-start")}>
            Open {m.sender.role === "intern" ? "candidate" : "company"} record
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ) : null}
      </SheetHeader>

      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "Findtern enquiry"}`)}`}
          className={buttonClass({ variant: "primary", size: "sm" })}
        >
          <Reply className="size-4" aria-hidden />
          Reply by email
        </a>
        <button type="button" disabled={busy} onClick={() => onRead(!m.isRead)} className={buttonClass({ variant: "outline", size: "sm" })}>
          {m.isRead ? <Mail className="size-4" aria-hidden /> : <MailOpen className="size-4" aria-hidden />}
          {m.isRead ? "Mark unread" : "Mark read"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          className={cn(buttonClass({ variant: "ghost", size: "sm" }), "ml-auto text-danger hover:bg-danger-soft")}
        >
          <Trash2 className="size-4" aria-hidden />
          Delete
        </button>
        {error ? (
          <p role="alert" className="w-full text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <section className="overflow-hidden rounded-apple-lg border border-ink-200/80 bg-white shadow-xs">
        <div className="border-b border-ink-100 px-5 py-4">
          <p className="text-xs font-medium text-ink-600">Subject</p>
          <p className="mt-1 text-[0.9375rem] font-semibold text-ink-900">{m.subject || "No subject"}</p>
          <dl className="mt-3 grid gap-1.5 text-sm text-ink-600">
            <div className="flex items-center gap-2">
              <Clock className="size-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Received</dt>
              <dd className="nums">{when(m.createdAt, true)} IST</dd>
            </div>
            {m.meta.pageUrl ? (
              <div className="flex min-w-0 items-center gap-2">
                <Globe className="size-3.5 shrink-0" aria-hidden />
                <dt className="sr-only">Sent from page</dt>
                <dd className="min-w-0 truncate">
                  {pageHref ? (
                    <a href={pageHref} target="_blank" rel="noreferrer noopener" className="text-brand-700 underline-offset-4 hover:underline" title={m.meta.pageUrl}>
                      {m.meta.pageUrl}
                    </a>
                  ) : (
                    m.meta.pageUrl
                  )}
                </dd>
              </div>
            ) : null}
            {m.meta.topic ? (
              <div className="flex items-center gap-2">
                <dt className="text-ink-600">Topic:</dt>
                <dd className="font-medium capitalize text-ink-800">{m.meta.topic}</dd>
              </div>
            ) : null}
          </dl>
        </div>
        <div className="px-5 py-4">
          <p className="text-xs font-medium text-ink-600">Message</p>
          <p className="mt-2 text-[0.9375rem] leading-relaxed whitespace-pre-wrap break-words text-ink-800">{m.meta.body || "(no text)"}</p>
        </div>
      </section>

      {m.meta.files.length ? (
        <section className="rounded-apple-lg border border-ink-200/80 bg-white p-5 shadow-xs">
          <h3 className="text-sm font-semibold text-ink-900">
            Attachments <span className="nums font-normal text-ink-600">({m.meta.files.length})</span>
          </h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {m.meta.files.map((f) => (
              <Attachment key={f.href} file={f} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Attachment({ file }: { file: ContactFile }) {
  return (
    <li className="min-w-0 overflow-hidden rounded-apple-md border border-ink-200/80">
      {file.type === "image" ? (
        <a href={file.href} target="_blank" rel="noreferrer" className="block bg-ink-50">
          {/* Admin-only file route; next/image can't forward the session. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.href} alt={`Attachment ${file.name}`} loading="lazy" className="h-36 w-full object-contain" />
        </a>
      ) : file.type === "video" ? (
        <video src={file.href} controls preload="metadata" className="h-36 w-full bg-ink-900" />
      ) : null}
      <a
        href={file.href}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-11 items-center gap-2 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-50"
      >
        {file.type === "video" ? <Video className="size-4 shrink-0" aria-hidden /> : file.type === "image" ? <Paperclip className="size-4 shrink-0" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
        <span className="min-w-0 truncate" title={file.name}>
          {file.name}
        </span>
      </a>
    </li>
  );
}
