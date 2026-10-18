"use client";

import { useState } from "react";
import {
  CheckCircle2,
  Clock,
  Inbox,
  Mail,
  MailOpen,
  Reply,
  Search,
  Trash2,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatDate } from "@/lib/format";
import type { ContactMessage } from "@/lib/db/schema";
import { StatusBadge } from "@/components/admin/status-badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/** "INTERN_HELP" → "Intern help" */
function prettyType(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(/[_-]+/)
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function initials(m: ContactMessage): string {
  return `${m.firstName.charAt(0).toUpperCase()}${m.lastName.charAt(0).toUpperCase()}`;
}

export function MessagesInbox({
  initialMessages,
}: {
  initialMessages: ContactMessage[];
}) {
  const [messages, setMessages] = useState<ContactMessage[]>(initialMessages);
  const [selectedMessage, setSelectedMessage] = useState<ContactMessage | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = messages.filter((m) => {
    if (filter === "unread" && m.isRead) return false;
    if (filter === "read" && !m.isRead) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const match =
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
        m.email.toLowerCase().includes(q) ||
        (m.subject || "").toLowerCase().includes(q) ||
        m.message.toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  async function toggleReadStatus(id: string, currentRead: boolean) {
    setBusyId(id);
    setActionError(null);
    try {
      const nextRead = !currentRead;
      const res = await csrfFetch("/api/admin/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, isRead: nextRead }),
      });
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, isRead: nextRead } : m)),
        );
        if (selectedMessage?.id === id) {
          setSelectedMessage((prev) => (prev ? { ...prev, isRead: nextRead } : null));
        }
      } else {
        setActionError("Couldn't update this message. Try again.");
      }
    } catch {
      setActionError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Are you sure you want to delete this message?")) return;
    setBusyId(id);
    setActionError(null);
    try {
      const res = await csrfFetch("/api/admin/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        if (selectedMessage?.id === id) setSelectedMessage(null);
      } else {
        setActionError("Couldn't delete this message. Try again.");
      }
    } catch {
      setActionError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="apple-admin space-y-4">
      {actionError && !selectedMessage ? (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-4 py-3 text-sm text-danger">
          {actionError}
        </p>
      ) : null}

      {/* Frosted toolbar: search + segmented triage */}
      <div className="apple-panel flex flex-col gap-3 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-400"
          />
          <input
            type="search"
            value={search}
            placeholder="Search senders, subjects, messages…"
            aria-label="Search messages"
            onChange={(e) => setSearch(e.target.value)}
            className="apple-spring min-h-11 w-full rounded-[10px] border border-ink-200 bg-ink-50 pr-3 pl-9 text-[15px] tracking-[-0.01em] text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
        </div>

        <div
          role="tablist"
          aria-label="Read status"
          className="grid grid-cols-3 gap-0.5 self-start rounded-[10px] bg-ink-100 p-1 lg:self-auto"
        >
          {(["all", "unread", "read"] as const).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={filter === tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={cn(
                "apple-spring inline-flex min-h-11 items-center justify-center rounded-[8px] px-4 text-[14px] font-medium tracking-[-0.01em] capitalize",
                filter === tab
                  ? "bg-white text-ink-900 shadow-xs"
                  : "text-ink-500 hover:text-ink-800",
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Mail rows */}
      <div className="apple-panel overflow-hidden bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span
              aria-hidden
              className="mb-3 grid size-12 place-items-center rounded-full bg-ink-100 text-ink-400"
            >
              <Inbox className="size-5" />
            </span>
            <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink-800">
              {search ? "No matching messages" : "Inbox zero"}
            </p>
            <p className="mt-1 max-w-sm text-[14px] text-text-subtle">
              {search
                ? "Try widening your search terms."
                : "Every inquiry is reviewed. Nothing waiting."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {filtered.map((msg) => {
              const type = prettyType(msg.queryType);
              return (
                <li key={msg.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedMessage(msg)}
                    aria-label={`${msg.isRead ? "" : "Unread: "}${msg.subject || "No subject"} from ${msg.firstName} ${msg.lastName}`}
                    className="apple-spring group flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50/70 sm:px-5"
                  >
                    {/* Unread dot, Apple Mail language */}
                    <span aria-hidden className="w-2 shrink-0">
                      {msg.isRead ? null : (
                        <span className="block size-2 rounded-full bg-info" />
                      )}
                    </span>

                    <span
                      aria-hidden
                      className={cn(
                        "grid size-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold",
                        msg.isRead
                          ? "bg-ink-100 text-ink-500"
                          : "bg-brand-100 text-brand-800",
                      )}
                    >
                      {initials(msg)}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span
                          className={cn(
                            "truncate text-[15px] tracking-[-0.01em] text-ink-900",
                            msg.isRead ? "font-medium" : "font-semibold",
                          )}
                        >
                          {msg.firstName} {msg.lastName}
                        </span>
                        <span className="shrink-0 text-[12px] tabular-nums text-text-subtle">
                          {msg.createdAt ? formatDate(msg.createdAt) : "-"}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block truncate text-[14px] tracking-[-0.01em]",
                          msg.isRead
                            ? "font-normal text-ink-600"
                            : "font-medium text-ink-900",
                        )}
                      >
                        {msg.subject || "No subject"}
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-text-subtle">
                          {msg.message}
                        </span>
                        {type ? (
                          <span className="shrink-0 text-[12px] text-text-subtle">
                            {type}
                          </span>
                        ) : null}
                      </span>
                    </span>

                    <span
                      className="flex shrink-0 items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                      role="group"
                      aria-label="Message actions"
                    >
                      <span
                        role="button"
                        tabIndex={0}
                        title={msg.isRead ? "Mark unread" : "Mark reviewed"}
                        aria-label={msg.isRead ? "Mark unread" : "Mark reviewed"}
                        aria-disabled={busyId === msg.id}
                        onClick={() => toggleReadStatus(msg.id, msg.isRead)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            toggleReadStatus(msg.id, msg.isRead);
                          }
                        }}
                        className="apple-spring apple-pressable hidden min-h-11 min-w-11 items-center justify-center rounded-[10px] text-ink-400 group-hover:inline-flex hover:bg-ink-100 hover:text-ink-800 focus-visible:inline-flex"
                      >
                        {msg.isRead ? (
                          <Mail className="size-4" />
                        ) : (
                          <MailOpen className="size-4 text-brand-600" />
                        )}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        title="Delete inquiry"
                        aria-label="Delete inquiry"
                        aria-disabled={busyId === msg.id}
                        onClick={() => deleteMessage(msg.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            deleteMessage(msg.id);
                          }
                        }}
                        className="apple-spring apple-pressable hidden min-h-11 min-w-11 items-center justify-center rounded-[10px] text-ink-400 group-hover:inline-flex hover:bg-danger-soft hover:text-danger focus-visible:inline-flex"
                      >
                        <Trash2 className="size-4" />
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Inspection sheet */}
      <Sheet
        open={Boolean(selectedMessage)}
        onOpenChange={(open) => !open && setSelectedMessage(null)}
      >
        <SheetContent
          side="right"
          className="apple-admin w-full overflow-y-auto bg-ink-50 p-0 sm:max-w-lg"
        >
          {selectedMessage ? (
            <div className="space-y-4 p-4 sm:p-6">
              <SheetHeader className="apple-panel bg-white p-5 text-left">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-100 text-[15px] font-semibold text-brand-800"
                  >
                    {initials(selectedMessage)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="truncate text-[17px] font-semibold tracking-[-0.02em] text-ink-900">
                      {selectedMessage.firstName} {selectedMessage.lastName}
                    </SheetTitle>
                    <SheetDescription className="truncate text-[13px] text-text-subtle">
                      {selectedMessage.email}
                      {selectedMessage.phone ? ` · ${selectedMessage.phone}` : ""}
                    </SheetDescription>
                  </div>
                  <StatusBadge
                    tone={selectedMessage.isRead ? "neutral" : "warning"}
                    label={selectedMessage.isRead ? "Reviewed" : "Unread"}
                  />
                </div>
              </SheetHeader>

              <div className="apple-panel flex flex-wrap items-center gap-2 bg-white p-3">
                <a
                  href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject || "Findtern inquiry")}`}
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-[14px] font-semibold text-white hover:bg-brand-600"
                >
                  <Reply className="size-4" />
                  Reply
                </a>
                <button
                  type="button"
                  onClick={() =>
                    toggleReadStatus(selectedMessage.id, selectedMessage.isRead)
                  }
                  className="apple-spring apple-pressable inline-flex min-h-11 items-center gap-1.5 rounded-[10px] border border-ink-200 bg-white px-3 text-[14px] font-medium text-ink-800 hover:bg-ink-50"
                >
                  {selectedMessage.isRead ? (
                    <Mail className="size-4 text-ink-400" />
                  ) : (
                    <CheckCircle2 className="size-4 text-brand-600" />
                  )}
                  {selectedMessage.isRead ? "Mark unread" : "Mark reviewed"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMessage(selectedMessage.id)}
                  className="apple-spring apple-pressable ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-danger hover:bg-danger-soft"
                >
                  <Trash2 className="size-4" />
                  Delete
                </button>
                {actionError ? (
                  <p role="alert" className="w-full text-sm text-danger">
                    {actionError}
                  </p>
                ) : null}
              </div>

              <div className="apple-panel overflow-hidden bg-white">
                <div className="border-b border-ink-100 px-5 py-4">
                  <p className="text-[12px] font-semibold tracking-[0.02em] text-text-subtle">
                    Subject
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tracking-[-0.01em] text-ink-900">
                    {selectedMessage.subject || "No subject"}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-[13px] text-text-subtle">
                    <Clock className="size-3.5 text-ink-400" />
                    {selectedMessage.createdAt
                      ? formatDate(selectedMessage.createdAt)
                      : "-"}
                    {prettyType(selectedMessage.queryType)
                      ? ` · ${prettyType(selectedMessage.queryType)}`
                      : ""}
                  </p>
                </div>
                <div className="px-5 py-4">
                  <p className="text-[12px] font-semibold tracking-[0.02em] text-text-subtle">
                    Message
                  </p>
                  <p className="mt-2 text-[14px] leading-relaxed whitespace-pre-wrap text-ink-800">
                    {selectedMessage.message}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
