"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, ShieldAlert, X } from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import type { PromoCode } from "@/lib/db/schema";
import { buttonClass } from "@/components/ui/button";
import { useConfirm } from "@/components/app/use-confirm";
import { FullWaiverDialog } from "@/components/admin/full-waiver-dialog";
import { PromoFormDialog } from "@/components/admin/money/pc-form";
import { PromoLedger } from "@/components/admin/money/pc-ledger";
import { PromoRedemptions, type RedemptionsView } from "@/components/admin/money/pc-redemptions";
import { promoState, type PromoState } from "@/lib/admin/promo-state";
import { paginate, sortPromos, type PromoSort } from "@/lib/admin/promo-redemptions";

const PAGE_SIZE = 25;
const SORT_LABELS: Record<PromoSort, string> = { newest: "Newest first", used: "Most used", code: "Code A to Z", ending: "Ending soonest" };
type TypeFilter = "all" | "percentage" | "fixed" | "full_waiver";

const CONTROL =
  "h-11 rounded-md border border-ink-300 bg-surface-raised px-3 text-base text-ink-900 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 md:h-10 md:text-sm";

/**
 * The promo codes list and everything you can do to a code: search, filter, sort, create, edit, pause or resume,
 * delete, copy, see redemptions, and (admin only) mint a full-waiver code. The figures above it come from the page;
 * this is the ledger and its actions. Nothing here changes how a discount is worked out.
 */
export function PromoCodesManager({
  initialPromoCodes,
  canWrite,
  canMintWaiver = false,
  discountGiven = {},
  nowMs,
}: {
  initialPromoCodes: PromoCode[];
  canWrite: boolean;
  /** Finance (transactions:write): may create full-waiver codes. */
  canMintWaiver?: boolean;
  /** Discount given per promo id, in INR paise. */
  discountGiven?: Record<string, number>;
  /** The server's clock, so states and "in 7 days" agree between the server render and the browser. */
  nowMs: number;
}) {
  const router = useRouter();
  const { ask, dialog: confirmDialog } = useConfirm();
  const [promos, setPromos] = useState<PromoCode[]>(initialPromoCodes);
  // router.refresh() hands down a new list; without this the rows kept the first render's copy.
  const [seenPromos, setSeenPromos] = useState(initialPromoCodes);
  if (seenPromos !== initialPromoCodes) {
    setSeenPromos(initialPromoCodes);
    setPromos(initialPromoCodes);
  }

  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<"all" | PromoState>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<PromoSort>("newest");
  const [page, setPage] = useState(1);

  const [waiverOpen, setWaiverOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PromoCode | null>(null);

  const [redeemFor, setRedeemFor] = useState<PromoCode | null>(null);
  const [redeemView, setRedeemView] = useState<RedemptionsView | null>(null);
  const [redeemError, setRedeemError] = useState("");

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  // A refused toggle / delete, shown under the code it belongs to.
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const now = new Date(nowMs);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(promo: PromoCode) {
    setEditing(promo);
    setFormOpen(true);
  }

  async function openRedemptions(promo: PromoCode) {
    setRedeemFor(promo);
    setRedeemView(null);
    setRedeemError("");
    try {
      const res = await fetch(`/api/admin/promo-codes/${promo.id}/redemptions`, { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as (RedemptionsView & { error?: string }) | null;
      if (!res.ok || !data) throw new Error(data?.error || `Could not load (HTTP ${res.status})`);
      setRedeemView(data);
    } catch (err: unknown) {
      setRedeemError(err instanceof Error ? err.message : "Could not load the redemptions.");
    }
  }

  async function toggleActive(promo: PromoCode) {
    const nextActive = !promo.isActive;
    setRowError(null);
    // Optimistic update
    setPromos((prev) => prev.map((p) => (p.id === promo.id ? { ...p, isActive: nextActive } : p)));
    const revert = () => setPromos((prev) => prev.map((p) => (p.id === promo.id ? { ...p, isActive: promo.isActive } : p)));
    try {
      const res = await csrfFetch(`/api/admin/promo-codes/${promo.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: nextActive }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        revert();
        setRowError({ id: promo.id, message: data?.error || `Not saved (HTTP ${res.status})` });
      } else {
        router.refresh();
      }
    } catch {
      revert();
      setRowError({ id: promo.id, message: "Not saved: the network request failed." });
    }
  }

  async function deletePromo(promo: PromoCode) {
    const ok = await ask({
      title: `Delete ${promo.code}?`,
      body: "This removes the code permanently. A code that has been used can't be deleted: pause it instead.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setRowError(null);
    try {
      const res = await csrfFetch(`/api/admin/promo-codes/${promo.id}`, { method: "DELETE" });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete promo code.");
      }
      setPromos((prev) => prev.filter((p) => p.id !== promo.id));
      router.refresh();
    } catch (err: unknown) {
      setRowError({ id: promo.id, message: err instanceof Error ? err.message : "Failed to delete" });
    }
  }

  async function copy(promo: PromoCode) {
    setRowError(null);
    try {
      await navigator.clipboard.writeText(promo.code);
    } catch {
      setRowError({ id: promo.id, message: "Couldn't copy. Select the code and copy it by hand." });
      return;
    }
    setCopiedCode(promo.code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const q = search.trim().toLowerCase();
  const filteredAll = promos.filter(
    (p) =>
      (!q || p.code.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q)) &&
      (stateFilter === "all" || promoState(p, now) === stateFilter) &&
      (typeFilter === "all" || p.discountType === typeFilter),
  );
  const paged = paginate(sortPromos(filteredAll, sort), page, PAGE_SIZE);
  const filtering = Boolean(q) || stateFilter !== "all" || typeFilter !== "all";
  const clearFilters = () => {
    setSearch("");
    setStateFilter("all");
    setTypeFilter("all");
    setPage(1);
  };
  const mayMint = canWrite && canMintWaiver;

  return (
    <div className="min-w-0">
      <div className={promos.length > 0 ? "mb-4 flex flex-col gap-3 lg:flex-row lg:items-end" : undefined}>
        {promos.length > 0 ? (
          <div className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
            <label className="relative block min-w-0 flex-1 basis-56 lg:max-w-xs">
              <span className="sr-only">Search promo codes</span>
              <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-600" />
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Search code or description"
                className={`${CONTROL} w-full pl-9 placeholder:text-ink-600 [&::-webkit-search-cancel-button]:hidden`}
              />
            </label>
            <label className="block">
              <span className="sr-only">Filter by state</span>
              <select
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value as "all" | PromoState);
                  setPage(1);
                }}
                className={CONTROL}
              >
                <option value="all">All states</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="used_up">Used up</option>
                <option value="expired">Expired</option>
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Filter by discount type</span>
              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as TypeFilter);
                  setPage(1);
                }}
                className={CONTROL}
              >
                <option value="all">All types</option>
                <option value="percentage">Percent off</option>
                <option value="fixed">Rupees off</option>
                <option value="full_waiver">Full waiver</option>
              </select>
            </label>
            <label className="block">
              <span className="sr-only">Sort promo codes</span>
              <select
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as PromoSort);
                  setPage(1);
                }}
                className={CONTROL}
              >
                {(Object.keys(SORT_LABELS) as PromoSort[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            {filtering ? (
              <button type="button" onClick={clearFilters} className="inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-800 underline decoration-ink-300 underline-offset-4 hover:decoration-ink-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-700 md:min-h-10">
                <X className="size-4" aria-hidden />
                Clear
              </button>
            ) : null}
          </div>
        ) : null}
        {canWrite && promos.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
            {mayMint ? (
              <button type="button" onClick={() => setWaiverOpen(true)} className={buttonClass({ variant: "outline", size: "md", className: "max-sm:flex-1" })}>
                <ShieldAlert className="size-4" aria-hidden />
                New full-waiver code
              </button>
            ) : null}
            <button type="button" onClick={openCreate} className={buttonClass({ variant: "primary", size: "md", className: "max-sm:flex-1" })}>
              <Plus className="size-4" aria-hidden />
              New promo code
            </button>
          </div>
        ) : null}
      </div>

      {promos.length === 0 ? (
        <div className="border-t border-ink-200 py-8">
          <p className="font-display text-xl font-semibold text-ink-900">No promo codes yet</p>
          <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-600">
            {canWrite
              ? "Create a code to take money off an intern activation fee or an employer order. You set the discount, who can use it and how many times."
              : "An admin with write access can create a code. Codes will list here with what they give and how much they have cost."}
          </p>
          {canWrite ? (
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button type="button" onClick={openCreate} className={buttonClass({ variant: "primary", size: "md" })}>
                <Plus className="size-4" aria-hidden />
                New promo code
              </button>
              {mayMint ? (
                <button type="button" onClick={() => setWaiverOpen(true)} className={buttonClass({ variant: "outline", size: "md" })}>
                  <ShieldAlert className="size-4" aria-hidden />
                  New full-waiver code
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : paged.total === 0 ? (
        <div className="border-t-2 border-ink-800 py-8">
          <p className="font-display text-xl font-semibold text-ink-900">No code matches</p>
          <p className="mt-2 max-w-md text-sm text-ink-600">Nothing fits the search and filters. Clear them to see all {promos.length.toLocaleString("en-IN")} codes.</p>
          <button type="button" onClick={clearFilters} className={buttonClass({ variant: "outline", size: "md", className: "mt-5" })}>
            Clear search and filters
          </button>
        </div>
      ) : (
        <PromoLedger
          promos={paged.items}
          nowMs={nowMs}
          given={discountGiven}
          copied={copiedCode}
          rowError={rowError}
          actions={{ canWrite, onCopy: (p) => void copy(p), onToggle: (p) => void toggleActive(p), onEdit: openEdit, onDelete: (p) => void deletePromo(p), onRedemptions: (p) => void openRedemptions(p) }}
        />
      )}

      {paged.total > 0 ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-700">
          <p className="nums" aria-live="polite">
            Showing {paged.from} to {paged.to} of {paged.total}
          </p>
          {paged.pages > 1 ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)} className={buttonClass({ variant: "light", size: "sm" })}>
                Previous
              </button>
              <span className="nums">
                Page {paged.page} of {paged.pages}
              </span>
              <button type="button" disabled={paged.page >= paged.pages} onClick={() => setPage(paged.page + 1)} className={buttonClass({ variant: "light", size: "sm" })}>
                Next
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <PromoRedemptions promo={redeemFor} view={redeemView} error={redeemError} onClose={() => setRedeemFor(null)} />

      <FullWaiverDialog
        open={waiverOpen}
        onOpenChange={setWaiverOpen}
        onCreated={(promo) => {
          setPromos((prev) => [promo, ...prev]);
          router.refresh();
        }}
      />

      <PromoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        onSaved={(promo, mode) => {
          setPromos((prev) => (mode === "created" ? [promo, ...prev] : prev.map((p) => (p.id === promo.id ? promo : p))));
          router.refresh();
        }}
      />

      {confirmDialog}
    </div>
  );
}
