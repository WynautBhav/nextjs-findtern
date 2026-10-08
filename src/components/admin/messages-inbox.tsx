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
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMessage(id: string) {
    if (!confirm("Are you sure you want to delete this message?")) return;
    setBusyId(id);
    try {
      const res = await csrfFetch("/api/admin/messages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) {
        setMessages((prev) => prev.filter((m) => m.id !== id));
        if (selectedMessage?.id === id) setSelectedMessage(null);
      }
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 rounded-2xl border border-ink-100 bg-white p-3.5 shadow-2xs">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            type="search"
            value={search}
            placeholder="Filter by sender, email, subject, or message content..."
            onChange={(e) => setSearch(e.target.value)}
            className="h-9.5 w-full rounded-xl border border-ink-200 bg-surface-alt pl-9.5 pr-3 text-xs text-ink-900 shadow-2xs outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
        </div>

        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          {(["all", "unread", "read"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${
                filter === tab
                  ? "bg-brand-700 text-white shadow-2xs"
                  : "bg-surface-alt text-ink-600 hover:bg-ink-100 hover:text-ink-900"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Messages List / Table */}
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xs">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Inbox className="mx-auto size-8 text-ink-300" />
            <h4 className="mt-2 text-sm font-semibold text-ink-800">No messages found</h4>
            <p className="mt-1 text-xs text-text-subtle">
              {search ? "Try widening your search terms." : "The triage inbox is all caught up."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-ink-100">
            {filtered.map((msg) => (
              <div
                key={msg.id}
                onClick={() => setSelectedMessage(msg)}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 transition-colors cursor-pointer hover:bg-surface-alt ${
                  !msg.isRead ? "bg-brand-50/20 font-medium" : ""
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <span
                    aria-hidden
                    className={`grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold ${
                      !msg.isRead
                        ? "bg-brand-100 text-brand-800 border border-brand-200"
                        : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {msg.firstName.charAt(0).toUpperCase()}
                    {msg.lastName.charAt(0).toUpperCase()}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-ink-900 truncate">
                        {msg.firstName} {msg.lastName}
                      </span>
                      <span className="text-2xs text-text-subtle truncate">
                        &lt;{msg.email}&gt;
                      </span>
                      {msg.queryType ? (
                        <span className="rounded-md bg-ink-100 px-2 py-0.5 text-3xs font-medium uppercase tracking-wider text-ink-700">
                          {msg.queryType}
                        </span>
                      ) : null}
                    </div>

                    <p className="mt-0.5 text-xs text-ink-800 truncate">
                      {msg.subject || "(No subject provided)"}
                    </p>
                    <p className="mt-0.5 text-2xs text-text-subtle line-clamp-1">
                      {msg.message}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  <span className="text-2xs text-text-subtle tabular-nums">
                    {msg.createdAt ? formatDate(msg.createdAt) : "—"}
                  </span>

                  <StatusBadge
                    tone={msg.isRead ? "neutral" : "warning"}
                    label={msg.isRead ? "Reviewed" : "Unread"}
                  />

                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1"
                  >
                    <button
                      type="button"
                      title={msg.isRead ? "Mark unread" : "Mark reviewed"}
                      disabled={busyId === msg.id}
                      onClick={() => toggleReadStatus(msg.id, msg.isRead)}
                      className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900 transition-colors"
                    >
                      {msg.isRead ? <Mail className="size-3.5" /> : <MailOpen className="size-3.5 text-brand-600" />}
                    </button>
                    <button
                      type="button"
                      title="Delete inquiry"
                      disabled={busyId === msg.id}
                      onClick={() => deleteMessage(msg.id)}
                      className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-danger transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Message Inspection Sheet Drawer */}
      <Sheet open={Boolean(selectedMessage)} onOpenChange={(open) => !open && setSelectedMessage(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg md:max-w-xl overflow-y-auto p-0 bg-surface-alt">
          {selectedMessage ? (
            <div className="p-6 space-y-6">
              <SheetHeader className="text-left pb-4 border-b border-ink-100">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-sm font-bold text-brand-800 border border-brand-200">
                      {selectedMessage.firstName.charAt(0).toUpperCase()}
                      {selectedMessage.lastName.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <SheetTitle className="text-lg font-bold text-ink-900">
                        {selectedMessage.firstName} {selectedMessage.lastName}
                      </SheetTitle>
                      <SheetDescription className="text-xs text-text-subtle">
                        {selectedMessage.email} {selectedMessage.phone ? `· ${selectedMessage.phone}` : ""}
                      </SheetDescription>
                    </div>
                  </div>
                  <StatusBadge
                    tone={selectedMessage.isRead ? "neutral" : "warning"}
                    label={selectedMessage.isRead ? "Reviewed" : "Unread"}
                  />
                </div>
              </SheetHeader>

              {/* Action Toolbar */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 border border-ink-100 shadow-2xs">
                <a
                  href={`mailto:${selectedMessage.email}?subject=Re: ${encodeURIComponent(selectedMessage.subject || "Findtern Inquiry")}`}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 text-xs font-semibold text-white shadow-2xs hover:bg-brand-600 transition-colors"
                >
                  <Reply className="size-3.5" />
                  <span>Reply via Email</span>
                </a>
                <button
                  type="button"
                  onClick={() => toggleReadStatus(selectedMessage.id, selectedMessage.isRead)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-ink-800 hover:bg-ink-50 transition-colors"
                >
                  {selectedMessage.isRead ? <Mail className="size-3.5 text-ink-500" /> : <CheckCircle2 className="size-3.5 text-brand-600" />}
                  <span>{selectedMessage.isRead ? "Mark Unread" : "Mark as Reviewed"}</span>
                </button>
                <button
                  type="button"
                  onClick={() => deleteMessage(selectedMessage.id)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 text-xs font-medium text-danger hover:bg-danger-soft transition-colors ml-auto"
                >
                  <Trash2 className="size-3.5" />
                  <span>Delete</span>
                </button>
              </div>

              {/* Inquiry Details Card */}
              <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-2xs space-y-4">
                <div>
                  <span className="text-2xs font-semibold uppercase tracking-wider text-text-subtle block">
                    Subject
                  </span>
                  <h3 className="mt-1 text-sm font-bold text-ink-900">
                    {selectedMessage.subject || "No subject provided"}
                  </h3>
                </div>

                <div className="flex items-center gap-4 text-xs text-text-subtle pt-2 border-t border-ink-100">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="size-3.5 text-ink-400" />
                    {selectedMessage.createdAt ? formatDate(selectedMessage.createdAt) : "—"}
                  </span>
                  {selectedMessage.queryType ? (
                    <span className="rounded-md bg-ink-100 px-2 py-0.5 text-3xs font-medium uppercase tracking-wider text-ink-700">
                      {selectedMessage.queryType}
                    </span>
                  ) : null}
                </div>

                <div className="pt-2 border-t border-ink-100">
                  <span className="text-2xs font-semibold uppercase tracking-wider text-text-subtle block">
                    Message Body
                  </span>
                  <div className="mt-2 text-xs leading-relaxed text-ink-800 whitespace-pre-wrap rounded-lg bg-surface-alt p-4 border border-ink-100/80">
                    {selectedMessage.message}
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
