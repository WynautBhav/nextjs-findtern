"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, ExternalLink, FileText, Globe, Loader2, Mail, MailOpen, Paperclip, Reply, Trash2, Video } from "lucide-react";

import { UserDot } from "@/components/layout/shell-parts";
import { EmptyScene } from "@/components/app/primitives";
import { Pill, type Tone } from "@/components/app/primitives";
import type { ContactFile, ContactMeta } from "@/lib/admin/contact-meta";
import { csrfFetch } from "@/lib/client-fetch";
import { formatNumber, shortDate, shortDateTime } from "@/lib/format";
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
  /** How long it has waited, "3 d", and the whole days behind it (the age column of the queue). */
  ageLabel: string;
  ageDays: number;
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
  if (qt === "college") return "College"; // /contact?type=college (a college partnership enquiry)
  return qt === "general" ? "General" : null;
}

function when(iso: string | null, withTime = false): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const day = { day: "2-digit", month: "2-digit", year: "numeric" } as const;
  return withTime ? shortDateTime(date, { ...day, hour: "2-digit", minute: "2-digit", hour12: true }) : shortDate(date, day);
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

function kindTone(m: InboxMessage): Tone {
  return m.meta.kind === "report" ? "waiting" : m.meta.kind === "feedback" ? "new" : "neutral";
}

const BTN = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-ink-300 bg-transparent px-3 text-sm font-medium text-ink-900 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200/60 disabled:pointer-events-none disabled:opacity-50 max-lg:min-h-11 " + FOCUS;
const BTN_PRIMARY = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-brand-800 px-3 text-sm font-semibold text-paper transition-colors duration-[var(--motion-fast)] hover:bg-brand-900 max-lg:min-h-11 " + FOCUS;
const BTN_DANGER = "inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-danger transition-colors duration-[var(--motion-fast)] hover:bg-danger-soft disabled:pointer-events-none disabled:opacity-50 max-lg:min-h-11 " + FOCUS;

export function MessagesInbox({ messages, filtering }: { messages: InboxMessage[]; filtering: boolean }) {
  const { ask, dialog } = useConfirm();
  const router = useRouter();
  const [rows, setRows] = useState(messages);
  const [seen, setSeen] = useState(messages);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  if (seen !== messages) {
    // A new page or filter brings different rows; a selection kept from the
    // old ones would let a bulk delete hit messages that are no longer shown.
    setSeen(messages);
    setRows(messages);
    setSelected(new Set());
  }
  const paneRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Opening an unread message marks it read and the page refreshes: in the Unread view it then drops out
  // of the list. The reading pane keeps the message you opened (pinned) instead of closing under you.
  const [pinned, setPinned] = useState<InboxMessage | null>(null);
  const open = rows.find((m) => m.id === openId) ?? (pinned && pinned.id === openId ? pinned : null);
  // On a phone the reading pane replaces the list, so move focus into it; on a
  // wide screen both are visible and the row keeps focus.
  useEffect(() => {
    if (openId && !window.matchMedia("(min-width: 1024px)").matches) paneRef.current?.focus();
  }, [openId]);

  function closePane() {
    const id = openId;
    setOpenId(null);
    if (id) requestAnimationFrame(() => document.getElementById(`msg-row-${id}`)?.focus());
  }

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
    setPinned((prev) => (prev && ids.includes(prev.id) ? { ...prev, isRead } : prev));
    setSelected(new Set());
    router.refresh();
  }

  async function remove(ids: string[]) {
    const ok = await ask({
      title: ids.length === 1 ? "Delete this message?" : `Delete ${formatNumber(ids.length)} messages?`,
      body: "Deleted messages are gone from the inbox for everyone. This can't be undone.",
      confirmLabel: ids.length === 1 ? "Yes, delete it" : `Yes, delete ${formatNumber(ids.length)}`,
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
    setPinned({ ...m, isRead: true });
    setError(null);
    // Opening a message reads it (legacy inbox did the same). A failure is
    // shown in the message, so it is clear why it is still marked unread.
    if (!m.isRead) {
      void csrfFetch("/api/admin/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, isRead: true }),
      })
        .then(async (res) => {
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            setError(data?.error ?? "Couldn't mark this message as read.");
            return;
          }
          setRows((prev) => prev.map((x) => (x.id === m.id ? { ...x, isRead: true } : x)));
          router.refresh();
        })
        .catch(() => setError("Couldn't mark this message as read: the network request failed."));
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
      <EmptyScene title="No messages match" body="Nothing matches this search and these filters. Clear a filter to see more." next={{ href: "/admin/messages", label: "Clear filters" }} />
    ) : (
      <EmptyScene title="Nothing is waiting" body="Website enquiries and in-app problem reports land here. When one arrives it shows with how long it has waited." next={{ href: "/admin/notifications", label: "Send a notification instead" }} />
    );
  }

  const selectedIds = [...selected];

  return (
    <div className="overflow-hidden rounded-lg border border-ink-200 bg-surface-raised lg:grid lg:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)]">
      {dialog}
      {/* The queue. Below lg it hides while a message is open (the reading pane takes its place). */}
      <div className={cn("min-w-0 lg:border-r lg:border-ink-200", open && "max-lg:hidden")}>
        <div className="flex min-h-12 flex-wrap items-center gap-2 border-b border-ink-200 px-4 py-2">
          <label className="inline-flex min-h-9 items-center gap-2.5 text-sm font-medium text-ink-800 max-lg:min-h-11">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(rows.map((m) => m.id)))}
              className="size-4 rounded-sm accent-[color:var(--color-brand-800)]"
            />
            {selected.size ? `${formatNumber(selected.size)} selected` : "Select all on this page"}
          </label>
          {selected.size ? (
            <div className="flex flex-wrap items-center gap-1.5 sm:ml-auto">
              <button type="button" disabled={busy} onClick={() => setRead(selectedIds, true)} className={BTN}>
                <MailOpen className="size-4" aria-hidden />
                Mark read
              </button>
              <button type="button" disabled={busy} onClick={() => setRead(selectedIds, false)} className={BTN}>
                <Mail className="size-4" aria-hidden />
                Mark unread
              </button>
              <button type="button" disabled={busy} onClick={() => remove(selectedIds)} className={BTN_DANGER}>
                <Trash2 className="size-4" aria-hidden />
                Delete
              </button>
              {busy ? <Loader2 className="size-4 animate-spin text-ink-600" aria-label="Saving" /> : null}
            </div>
          ) : (
            <span className="ml-auto nums text-xs text-ink-600" aria-hidden>
              Waiting
            </span>
          )}
        </div>
        {error && !open ? (
          <p role="alert" className="mx-4 my-2 rounded-md bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}

        <ul className="divide-y divide-ink-200 lg:max-h-[min(46rem,calc(100dvh-20rem))] lg:overflow-y-auto">
          {rows.map((m) => {
            const name = m.sender?.name ?? m.name;
            const isOpen = m.id === openId;
            const late = !m.isRead && m.ageDays >= 3;
            return (
              <li key={m.id} className={cn("flex items-start gap-1 px-1 transition-colors duration-[var(--motion-fast)] hover:bg-ink-100", (isOpen || selected.has(m.id)) && "bg-ink-100")}>
                <label className="flex size-11 shrink-0 cursor-pointer items-start justify-center pt-3.5 max-lg:items-center max-lg:pt-0">
                  <input
                    type="checkbox"
                    aria-label={`Select message from ${m.name}`}
                    checked={selected.has(m.id)}
                    onChange={() => toggle(m.id)}
                    className="size-4 shrink-0 rounded-sm accent-[color:var(--color-brand-800)] max-lg:size-5"
                  />
                </label>
                <button
                  type="button"
                  id={`msg-row-${m.id}`}
                  onClick={() => openMessage(m)}
                  aria-current={isOpen ? "true" : undefined}
                  className={cn("flex min-w-0 flex-1 items-start gap-3 rounded-md py-3 pr-3 text-left", FOCUS)}
                >
                  {/* The row's visible text is its name (sender, age, subject),
                      so voice control can say what it sees; only "unread" is added. */}
                  {m.isRead ? null : <span className="sr-only">Unread. </span>}
                  <UserDot name={name} className="mt-0.5 size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={cn("flex min-w-0 items-center gap-2 text-sm text-ink-900", m.isRead ? "font-medium" : "font-semibold")}>
                        <span className="truncate">{name}</span>
                        {m.isRead ? null : <span aria-hidden className="size-2 shrink-0 rounded-full bg-brand-700" />}
                      </span>
                      <span className={cn("nums shrink-0 text-xs", late ? "font-semibold text-signal" : "text-ink-600")}>
                        <span className="sr-only">Waiting </span>
                        {m.ageLabel}
                      </span>
                    </span>
                    <span className={cn("mt-0.5 block truncate text-sm text-ink-900", m.isRead ? "" : "font-medium")}>{m.subject || "No subject"}</span>
                    <span className="mt-0.5 block truncate text-sm text-ink-600">{m.meta.body || "(no text)"}</span>
                    {m.meta.files.length ? (
                      <span className="mt-1.5 inline-flex items-center gap-1 text-xs text-ink-600">
                        <Paperclip className="size-3.5" aria-hidden />
                        <span className="nums">{formatNumber(m.meta.files.length)}</span>
                        <span className="sr-only">attachments</span>
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Reading pane. */}
      <div className={cn("min-w-0 lg:max-h-[min(50rem,calc(100dvh-17rem))] lg:overflow-y-auto", !open && "max-lg:hidden")}>
        {open ? (
          <MessageDetail
            m={open}
            busy={busy}
            error={error}
            paneRef={paneRef}
            onBack={closePane}
            onRead={(v) => setRead([open.id], v)}
            onDelete={() => remove([open.id])}
          />
        ) : (
          <div className="px-6 py-10">
            <p className="font-display text-lg font-semibold text-ink-900">Pick the oldest unread message</p>
            <p className="mt-1 max-w-sm text-sm text-ink-600">Opening one marks it read and shows the full text, the page it was sent from and any attachments.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MessageDetail({
  m,
  busy,
  error,
  paneRef,
  onBack,
  onRead,
  onDelete,
}: {
  m: InboxMessage;
  busy: boolean;
  error: string | null;
  paneRef: React.RefObject<HTMLDivElement | null>;
  onBack: () => void;
  onRead: (isRead: boolean) => void;
  onDelete: () => void;
}) {
  const role = roleLabel(m);
  const name = m.sender?.name ?? m.name;
  const pageHref = m.meta.pageUrl && /^(https?:\/\/|\/)/i.test(m.meta.pageUrl) ? m.meta.pageUrl : null;
  return (
    <article aria-label={`Message from ${name}`} className="space-y-6 p-5">
      <button type="button" onClick={onBack} className={cn(BTN, "-ml-1 border-transparent lg:hidden")}>
        <ArrowLeft className="size-4" aria-hidden />
        Back to inbox
      </button>

      <header className="flex items-start gap-3">
        <UserDot name={name} className="size-11 text-sm" />
        <div className="min-w-0 flex-1">
          <h2 ref={paneRef} tabIndex={-1} className="break-words font-display text-lg font-semibold text-ink-900 outline-none">
            {name}
          </h2>
          <p className="mt-0.5 break-all text-sm text-ink-600">
            {m.email}
            {m.phone ? ` · ${m.phone}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Pill tone={m.isRead ? "closed" : "waiting"}>{m.isRead ? "Read" : "Unread"}</Pill>
            <Pill tone={kindTone(m)}>{kindLabel(m)}</Pill>
            {role ? <Pill tone="neutral">{role}</Pill> : null}
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || "Findtern enquiry"}`)}`} className={BTN_PRIMARY}>
          <Reply className="size-4" aria-hidden />
          Reply by email
        </a>
        <button type="button" disabled={busy} onClick={() => onRead(!m.isRead)} className={BTN}>
          {m.isRead ? <Mail className="size-4" aria-hidden /> : <MailOpen className="size-4" aria-hidden />}
          {m.isRead ? "Mark unread" : "Mark read"}
        </button>
        {m.sender ? (
          <Link href={m.sender.href} className={BTN}>
            Open {m.sender.role === "intern" ? "candidate" : "company"} record
            <ExternalLink className="size-3.5" aria-hidden />
          </Link>
        ) : null}
        <button type="button" disabled={busy} onClick={onDelete} className={cn(BTN_DANGER, "sm:ml-auto")}>
          <Trash2 className="size-4" aria-hidden />
          Delete message
        </button>
        {error ? (
          <p role="alert" className="w-full text-sm font-medium text-danger">
            {error}
          </p>
        ) : null}
      </div>

      <section aria-label="Message" className="border-t border-ink-200 pt-5">
        <h3 className="font-display text-lg font-semibold text-ink-900">{m.subject || "No subject"}</h3>
        <dl className="mt-2 grid gap-1.5 text-sm text-ink-600">
          <div className="flex items-center gap-2">
            <Clock className="size-3.5 shrink-0" aria-hidden />
            <dt className="sr-only">Received</dt>
            <dd className="nums">
              {when(m.createdAt, true)} IST <span className="text-ink-600">({m.ageLabel} ago)</span>
            </dd>
          </div>
          {m.meta.pageUrl ? (
            <div className="flex min-w-0 items-center gap-2">
              <Globe className="size-3.5 shrink-0" aria-hidden />
              <dt className="sr-only">Sent from page</dt>
              <dd className="min-w-0 truncate">
                {pageHref ? (
                  <a href={pageHref} target="_blank" rel="noreferrer noopener" className="rounded-sm text-brand-700 underline underline-offset-4 hover:text-brand-900 focus-visible:outline-2 focus-visible:outline-ring" title={m.meta.pageUrl}>
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
              <dt>Topic:</dt>
              <dd className="font-medium capitalize text-ink-900">{m.meta.topic}</dd>
            </div>
          ) : null}
        </dl>
        <p className="mt-4 max-w-[65ch] whitespace-pre-wrap break-words text-base leading-relaxed text-ink-900">{m.meta.body || "(no text)"}</p>
      </section>

      {m.meta.files.length ? (
        <section aria-labelledby={`att-${m.id}`} className="border-t border-ink-200 pt-5">
          <h3 id={`att-${m.id}`} className="text-sm font-semibold text-ink-900">
            Attachments <span className="nums font-normal text-ink-600">({m.meta.files.length})</span>
          </h3>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {m.meta.files.map((f) => (
              <Attachment key={f.href} file={f} />
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

function Attachment({ file }: { file: ContactFile }) {
  return (
    <li className="min-w-0 space-y-2">
      {file.type === "image" ? (
        <a href={file.href} target="_blank" rel="noreferrer" className={cn("block overflow-hidden rounded-lg bg-ink-100", FOCUS)}>
          {/* Admin-only file route; next/image can't forward the session. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={file.href} alt={`Attachment ${file.name}`} loading="lazy" className="h-36 w-full object-contain" />
        </a>
      ) : file.type === "video" ? (
        <video src={file.href} controls preload="metadata" className="h-36 w-full rounded-lg bg-ink-100" />
      ) : null}
      <a
        href={file.href}
        target="_blank"
        rel="noreferrer"
        className={cn(
          "inline-flex min-h-11 max-w-full items-center gap-2 rounded-md bg-ink-100 px-3 py-2 text-sm font-medium text-ink-900 transition-colors duration-[var(--motion-fast)] hover:bg-ink-200",
          FOCUS,
        )}
      >
        {file.type === "video" ? <Video className="size-4 shrink-0" aria-hidden /> : file.type === "image" ? <Paperclip className="size-4 shrink-0" aria-hidden /> : <FileText className="size-4 shrink-0" aria-hidden />}
        <span className="min-w-0 truncate" title={file.name}>
          {file.name}
        </span>
      </a>
    </li>
  );
}
