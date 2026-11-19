"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Download,
  Edit2,
  Loader2,
  Plus,
  Receipt,
  Search,
  ShieldAlert,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatIstStamp, formatMoney } from "@/lib/format";
import type { PromoCode } from "@/lib/db/schema";
import { AdminEmpty } from "@/components/admin/panel";
import { buttonClass } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { RowMenu } from "@/components/app/row-menu";
import { useConfirm } from "@/components/app/use-confirm";
import { ADMIN_PILL_PRIMARY, ADMIN_PILL_SECONDARY, ADMIN_SURFACE } from "@/components/admin/surface";
import { FILTER_CONTROL, FILTER_SELECT, FilterBar, FilterField } from "@/components/admin/filter-controls";
import { COLLEGE_CODE_LOCKED, promoExpiryProblem, promoState, type PromoAppliesTo, type PromoState } from "@/lib/promo-rules";
import { FullWaiverDialog } from "@/components/admin/full-waiver-dialog";
import { isFullWaiver } from "@/lib/full-waiver";
import { isoToIstInput, istInputToIso } from "@/lib/admin/promo-form-time";
import { paginate, sortPromos, type PromoSort, type Redemption } from "@/lib/admin/promo-redemptions";

const PAGE_SIZE = 25;
const SORT_LABELS: Record<PromoSort, string> = { newest: "Newest first", used: "Most used", code: "Code A to Z", ending: "Ending soonest" };

type RedemptionsView = { code: string; usedCount: number; totalDiscountInrMinor: number; redemptions: (Omit<Redemption, "redeemedAt"> & { redeemedAt: string | null })[] };

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus:border-brand-500";

/** Fixed amounts are stored as major rupees (the form takes "₹"), not minor units. */
/** Code · discount · used · active · menu. */
const PROMO_GRID = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_2.5rem]";

/** Who a code is for, as the list says it. */
function audienceLabel(appliesTo: string | null | undefined): string {
  return appliesTo === "intern" ? "Interns only" : appliesTo === "employer" ? "Companies only (hiring)" : appliesTo === "subscription" ? "Employer subscription only" : "Interns and companies";
}

function benefitLabel(promo: PromoCode): string {
  if (isFullWaiver(promo)) return "Full waiver (whole payment free)";
  return promo.discountType === "percentage"
    ? `${promo.discountValue}% off`
    : `${formatMoney(Number(promo.discountValue), "INR", { zeroLabel: false })} off`;
}

const STATE_LABEL: Record<PromoState, string> = { active: "Active", "used up": "Used up", expired: "Expired", off: "Disabled" };

/** "Active, 1 of 1 uses left, expires 24 Nov" for a waiver row; the first word is the state an admin scans for. */
function waiverState(p: PromoCode): string {
  const until = p.validUntil ? new Date(p.validUntil) : null;
  return `${STATE_LABEL[promoState(p)]} · expires ${until ? formatDate(until.toISOString()) : "never (invalid)"}`;
}

export function PromoCodesManager({
  initialPromoCodes,
  canWrite,
  canMintWaiver = false,
  discountGiven = {},
}: {
  initialPromoCodes: PromoCode[];
  canWrite: boolean;
  /** Finance (transactions:write): may create full-waiver codes. */
  canMintWaiver?: boolean;
  /** Discount given per promo id, in INR paise. */
  discountGiven?: Record<string, number>;
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

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "percentage" | "fixed" | "full_waiver">("all");
  const [waiverOpen, setWaiverOpen] = useState(false);
  const [sort, setSort] = useState<PromoSort>("newest");
  const [page, setPage] = useState(1);

  // Redemptions dialog
  const [redeemFor, setRedeemFor] = useState<PromoCode | null>(null);
  const [redeemView, setRedeemView] = useState<RedemptionsView | null>(null);
  const [redeemError, setRedeemError] = useState("");

  // Modal Dialog state (Add / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  // A college code's discount, audience and cap are changed on the college screen only.
  const collegeLocked = Boolean(editingPromo?.collegeId);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  /** The dialog field (its id) the error is about, so it is marked invalid and focused. */
  const [errorField, setErrorField] = useState<string | null>(null);

  // Form state
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [discountValue, setDiscountValue] = useState<number | string>(10);
  const [maxUsages, setMaxUsages] = useState<number | string>("");
  const [minOrderAmountRupees, setMinOrderAmountRupees] = useState<number | string>("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [appliesTo, setAppliesTo] = useState<PromoAppliesTo>("intern");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  // A refused toggle / delete, shown on the card it belongs to.
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  function openCreateModal() {
    setEditingPromo(null);
    setCode("");
    setDescription("");
    setDiscountType("percentage");
    setDiscountValue(10);
    setMaxUsages("");
    setMinOrderAmountRupees("");
    setValidFrom("");
    setValidUntil("");
    setIsActive(true);
    setAppliesTo("intern");
    setErrorMsg("");
    setErrorField(null);
    setModalOpen(true);
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

  function openEditModal(promo: PromoCode) {
    setEditingPromo(promo);
    setCode(promo.code);
    setDescription(promo.description || "");
    setDiscountType(promo.discountType === "fixed" ? "fixed" : "percentage");
    setDiscountValue(promo.discountType === "fixed" ? promo.discountValue / 100 : promo.discountValue);
    setMaxUsages(promo.maxUsages ?? "");
    setMinOrderAmountRupees(promo.minOrderAmountMinor ? promo.minOrderAmountMinor / 100 : "");
    // The date fields are IST, whatever zone the admin's browser is in.
    setValidFrom(isoToIstInput(promo.validFrom));
    setValidUntil(isoToIstInput(promo.validUntil));
    setIsActive(promo.isActive);
    setAppliesTo(promo.appliesTo === "intern" || promo.appliesTo === "employer" || promo.appliesTo === "subscription" ? promo.appliesTo : "both");
    setErrorMsg("");
    setErrorField(null);
    setModalOpen(true);
  }

  function invalid(message: string, field: string) {
    setErrorMsg(message);
    setErrorField(field);
    document.getElementById(field)?.focus();
  }

  /** aria-invalid and the link to the dialog's error text, for the field the error is about. */
  const bad = (id: string) => (errorField === id ? ({ "aria-invalid": true, "aria-describedby": "promo-error" } as const) : {});

  async function handleSavePromo(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");
    setErrorField(null);

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      invalid("Promo code is required.", "promo-code");
      return;
    }
    const valNum = Number(discountValue);
    // Fixed amounts are typed in rupees and stored in paise.
    const stored = discountType === "fixed" ? Math.round(valNum * 100) : valNum;
    if (isNaN(valNum) || valNum <= 0) {
      invalid("Please provide a valid discount value greater than 0.", "promo-value");
      return;
    }
    if (discountType === "percentage" && valNum > 100) {
      invalid("Percentage discount cannot exceed 100%.", "promo-value");
      return;
    }
    if (discountType === "percentage" && valNum === 100 && appliesTo !== "intern") {
      invalid(
        appliesTo === "subscription"
          ? "A subscription code can't be 100%. To give a subscription away, create a full-waiver code for the subscription."
          : "Only an intern code can be 100%. Company codes can't cover the whole stipend.",
        "promo-value",
      );
      return;
    }
    if (validFrom && validUntil && (istInputToIso(validUntil) ?? "") < (istInputToIso(validFrom) ?? "")) {
      invalid("The end date must be on or after the start date.", "promo-until");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: trimmedCode,
        // null clears a field that was set before.
        description: description.trim() || null,
        discountType,
        discountValue: stored,
        maxUsages: maxUsages !== "" ? Number(maxUsages) : null,
        minOrderAmountMinor:
          minOrderAmountRupees !== "" ? Math.round(Number(minOrderAmountRupees) * 100) : null,
        validFrom: istInputToIso(validFrom),
        validUntil: istInputToIso(validUntil),
        isActive,
        appliesTo,
      };

      if (editingPromo) {
        // Update
        const res = await csrfFetch(`/api/admin/promo-codes/${editingPromo.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to update promo code.");
        }

        setPromos((prev) =>
          prev.map((p) =>
            p.id === editingPromo.id
              ? {
                  ...p,
                  code: trimmedCode,
                  description: description.trim() || null,
                  discountType,
                  discountValue: stored,
                  maxUsages: maxUsages !== "" ? Number(maxUsages) : null,
                  minOrderAmountMinor:
                    minOrderAmountRupees !== "" ? Math.round(Number(minOrderAmountRupees) * 100) : null,
                  validFrom: istInputToIso(validFrom) ? new Date(istInputToIso(validFrom)!) : null,
                  validUntil: istInputToIso(validUntil) ? new Date(istInputToIso(validUntil)!) : null,
                  isActive,
                  appliesTo,
                  updatedAt: new Date(),
                }
              : p
          )
        );
      } else {
        // Create
        const res = await csrfFetch("/api/admin/promo-codes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || "Failed to create promo code.");
        }

        const data = await res.json();
        if (data.promo) {
          setPromos((prev) => [data.promo, ...prev]);
        }
      }

      setModalOpen(false);
      router.refresh();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "An error occurred.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(promo: PromoCode) {
    const nextActive = !promo.isActive;
    setRowError(null);
    // Optimistic update
    setPromos((prev) =>
      prev.map((p) => (p.id === promo.id ? { ...p, isActive: nextActive } : p))
    );

    try {
      const res = await csrfFetch(`/api/admin/promo-codes/${promo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setPromos((prev) =>
          prev.map((p) => (p.id === promo.id ? { ...p, isActive: promo.isActive } : p))
        );
        setRowError({ id: promo.id, message: data?.error || `Not saved (HTTP ${res.status})` });
      } else {
        router.refresh();
      }
    } catch {
      setPromos((prev) =>
        prev.map((p) => (p.id === promo.id ? { ...p, isActive: promo.isActive } : p))
      );
      setRowError({ id: promo.id, message: "Not saved: the network request failed." });
    }
  }

  async function handleDelete(promo: PromoCode) {
    const ok = await ask({
      title: `Delete ${promo.code}?`,
      body: "This removes the code permanently. A code that has been used can't be deleted: turn it off instead.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    setDeletingId(promo.id);
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
    } finally {
      setDeletingId(null);
    }
  }

  async function copyToClipboard(promo: PromoCode) {
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

  // Warn before saving: a code that ends in the past is refused by the server too. An unchanged date on an edit is allowed.
  const untilIso = istInputToIso(validUntil);
  const pastUntil = untilIso ? promoExpiryProblem(new Date(untilIso), editingPromo?.validUntil ? new Date(editingPromo.validUntil) : null) : null;

  // Filtered rows
  const filteredAll = promos.filter((promo) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      promo.code.toLowerCase().includes(q) ||
      (promo.description || "").toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && promoState(promo) === "active") ||
      (statusFilter === "inactive" && promoState(promo) !== "active");

    const matchesType =
      typeFilter === "all" || promo.discountType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });
  const paged = paginate(sortPromos(filteredAll, sort), page, PAGE_SIZE);
  const filteredPromos = paged.items;

  return (
    <div className="apple-admin space-y-4">
      {/* Toolbar */}
      <div className={cn(ADMIN_SURFACE, "p-[var(--admin-pad-panel)]")}>
        <FilterBar name="promo-codes">
          <FilterField label="Search" htmlFor="promo-search" className="w-full min-w-[12rem] flex-1 sm:w-auto sm:max-w-sm">
            <div className="relative">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-subtle"
              />
              <input
                id="promo-search"
                type="search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search codes…"
                className={cn(FILTER_CONTROL, "w-full pr-11 pl-10 [&::-webkit-search-cancel-button]:hidden")}
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => { setSearch(""); setPage(1); }}
                  aria-label="Clear search"
                  className="absolute top-1/2 right-0 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full text-text-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <X className="size-4" />
                </button>
              ) : null}
            </div>
          </FilterField>

          <FilterField label="Status" htmlFor="promo-status" className="max-sm:w-full">
            <select
              id="promo-status"
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as "all" | "active" | "inactive"); setPage(1); }}
              className={FILTER_SELECT}
            >
              <option value="all">All statuses</option>
              <option value="active">Active only</option>
              <option value="inactive">Inactive only</option>
            </select>
          </FilterField>
          <FilterField label="Discount type" htmlFor="promo-type" className="max-sm:w-full">
            <select
              id="promo-type"
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value as "all" | "percentage" | "fixed" | "full_waiver"); setPage(1); }}
              className={FILTER_SELECT}
            >
              <option value="all">All types</option>
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed amount</option>
              <option value="full_waiver">Full waiver</option>
            </select>
          </FilterField>
          <FilterField label="Sort by" htmlFor="promo-sort" className="max-sm:w-full">
            <select
              id="promo-sort"
              value={sort}
              onChange={(e) => { setSort(e.target.value as PromoSort); setPage(1); }}
              className={FILTER_SELECT}
            >
              {(Object.keys(SORT_LABELS) as PromoSort[]).map((k) => <option key={k} value={k}>{SORT_LABELS[k]}</option>)}
            </select>
          </FilterField>

          {canWrite && canMintWaiver ? (
            <FilterField>
              <button
                type="button"
                onClick={() => setWaiverOpen(true)}
                className={buttonClass({ variant: "outline", size: "md", className: cn(ADMIN_PILL_SECONDARY, "h-10 touch:min-h-11") })}
              >
                <ShieldAlert className="size-4" aria-hidden />
                New full-waiver code
              </button>
            </FilterField>
          ) : null}
          {canWrite ? (
            <FilterField>
              <button
                type="button"
                onClick={openCreateModal}
                className={buttonClass({ variant: "primary", size: "md", className: cn(ADMIN_PILL_PRIMARY, "h-10 touch:min-h-11") })}
              >
                <Plus className="size-4" />
                New code
              </button>
            </FilterField>
          ) : null}
        </FilterBar>
      </div>

      {/* Ticket grid */}
      {filteredPromos.length === 0 ? (
        <div className={ADMIN_SURFACE}>
          <AdminEmpty
            title="No promo codes found"
            body={
              search || statusFilter !== "all" || typeFilter !== "all"
                ? "Nothing matches these filters. Clear them to see everything."
                : "Create discount vouchers to incentivize hires."
            }
            action={undefined}
            icon={Tag}
          />
        </div>
      ) : (
        // Rows, not one card per code (critique A, §0 density): the state is
        // the switch alone (it was a switch and a pill), Edit and Delete are
        // in the row's menu.
        <div className={cn(ADMIN_SURFACE, "min-w-0 overflow-hidden")}>
          <div aria-hidden className={cn(PROMO_GRID, "hidden gap-x-6 border-b border-[color:var(--admin-rule)] px-[var(--admin-pad-panel)] py-2.5 text-[0.8125rem] font-medium text-text-subtle lg:grid")}>
            <span>Code</span>
            <span>Discount</span>
            <span>Used</span>
            <span>Active</span>
            <span />
          </div>
          <ul className="divide-y divide-[color:var(--admin-rule)]">
          {filteredPromos.map((promo) => {
            const max = promo.maxUsages;
            const used = promo.usedCount;
            const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
            const isCopied = copiedCode === promo.code;
            const state = promoState(promo);
            return (
              <li key={promo.id} className={cn(PROMO_GRID, "grid items-center gap-x-6 gap-y-2 px-[var(--admin-pad-panel)] py-4")}>
                <div className="min-w-0">
                  <p className="flex items-center gap-1">
                    <span className={cn("truncate text-[0.9375rem] font-semibold tracking-[0.04em]", promo.isActive ? "text-foreground" : "text-text-subtle")}>
                      {promo.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyToClipboard(promo)}
                      title="Copy code"
                      aria-label={`Copy code ${promo.code}`}
                      className={buttonClass({ variant: "ghost", size: "iconSm", className: "text-text-subtle" })}
                    >
                      {isCopied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
                    </button>
                  </p>
                  {promo.description ? <p className="text-sm text-ink-600">{promo.description}</p> : null}
                  {state === "used up" || state === "expired" ? <p className="mt-1 text-xs font-semibold text-danger">{STATE_LABEL[state]}</p> : null}
                  {isFullWaiver(promo) ? (
                    <p className="mt-1 flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-danger-soft px-2 py-0.5 text-[0.6875rem] font-bold tracking-wide text-danger">
                        <ShieldAlert className="size-3" aria-hidden />
                        FULL WAIVER
                      </span>
                      <span className="text-xs text-ink-600">{waiverState(promo)}</span>
                      {canWrite && state === "active" ? (
                        <button
                          type="button"
                          onClick={() => void handleToggleActive(promo)}
                          className="inline-flex min-h-11 items-center rounded-full px-2 text-xs font-semibold text-danger underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        >
                          Disable
                        </button>
                      ) : null}
                    </p>
                  ) : null}
                </div>
                <div className="max-lg:col-span-2">
                  <p className="nums font-semibold text-ink-900">{benefitLabel(promo)}</p>
                  <p className="text-xs text-ink-600">
                    {audienceLabel(promo.appliesTo)}
                    {promo.minOrderAmountMinor ? ` · min ${formatMoney(promo.minOrderAmountMinor, "INR", { zeroLabel: false })}` : ""}
                  </p>
                </div>
                <div className="max-lg:col-span-2">
                  <p className="nums text-sm text-ink-800">
                    {used.toLocaleString("en-IN")}
                    {max ? ` of ${max.toLocaleString("en-IN")}` : " · no limit"}
                    {isFullWaiver(promo) && max ? ` · ${Math.max(0, max - used)} left` : ""}
                  </p>
                  {max ? (
                    <div aria-hidden className="mt-1.5 h-2 max-w-40 overflow-hidden rounded-full bg-[color:var(--admin-panel-2)]">
                      <div className="h-full rounded-full bg-[color:var(--admin-tile)]" style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-600">
                    {promo.validUntil ? `Until ${formatDate(new Date(promo.validUntil).toISOString())}` : "No expiry"}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-xs text-ink-600">
                    {discountGiven[promo.id] ? <span className="nums">{formatMoney(discountGiven[promo.id], "INR", { zeroLabel: false })} given</span> : null}
                    <button
                      type="button"
                      onClick={() => void openRedemptions(promo)}
                      className="inline-flex items-center gap-1 rounded-full font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
                    >
                      <Receipt className="size-3.5" />
                      Redemptions
                    </button>
                  </p>
                </div>
                <div className="max-lg:col-start-2 max-lg:row-start-1 max-lg:justify-self-end">
                  <Switch
                    checked={state === "active"}
                    disabled={!canWrite || state === "used up" || state === "expired"}
                    onCheckedChange={() => handleToggleActive(promo)}
                    aria-label={`${promo.code} active`}
                  />
                </div>
                {canWrite ? <><div className="max-lg:hidden">
                  <RowMenu
                    label={`More actions for ${promo.code}`}
                    items={[
                      ...(isFullWaiver(promo) ? [] : [{ label: "Edit code", onSelect: () => openEditModal(promo), icon: <Edit2 /> }]),
                      ...(promo.collegeId ? [] : [{ label: "Delete code", onSelect: () => void handleDelete(promo), icon: <Trash2 />, destructive: true }]),
                    ]}
                  />
                </div>
                <div className="flex gap-2 lg:hidden max-lg:col-span-2">
                  {isFullWaiver(promo) ? null : (
                  <button
                    type="button"
                    onClick={() => openEditModal(promo)}
                    className="apple-spring inline-flex h-10 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
                  >
                    <Edit2 className="size-4" />
                    Edit
                  </button>
                  )}
                  {promo.collegeId ? null : (
                    <button
                      type="button"
                      disabled={deletingId === promo.id}
                      onClick={() => void handleDelete(promo)}
                      aria-label={`Delete ${promo.code}`}
                      className={buttonClass({ variant: "ghost", size: "iconSm", className: "text-ink-600 hover:bg-danger-soft hover:text-danger" })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div></> : null}
                {rowError?.id === promo.id ? (
                  <p role="alert" className="text-sm font-medium text-danger lg:col-span-5 max-lg:col-span-2">
                    {rowError.message}
                  </p>
                ) : null}
              </li>
            );
          })}
          </ul>
        </div>
      )}

      {paged.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-700">
          <p className="nums" aria-live="polite">Showing {paged.from} to {paged.to} of {paged.total}</p>
          {paged.pages > 1 ? (
            <div className="flex items-center gap-2">
              <button type="button" disabled={paged.page <= 1} onClick={() => setPage(paged.page - 1)} className={buttonClass({ variant: "ghost", size: "md" })}>Previous</button>
              <span className="nums">Page {paged.page} of {paged.pages}</span>
              <button type="button" disabled={paged.page >= paged.pages} onClick={() => setPage(paged.page + 1)} className={buttonClass({ variant: "ghost", size: "md" })}>Next</button>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Redemptions */}
      <Dialog open={redeemFor !== null} onOpenChange={(o) => { if (!o) setRedeemFor(null); }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl [&>*]:min-w-0 grid-cols-[minmax(0,1fr)]">
          <DialogHeader>
            <DialogTitle>{redeemFor?.code} redemptions</DialogTitle>
            <DialogDescription>Every use of this code: who, the order and the discount given.</DialogDescription>
          </DialogHeader>
          {redeemError ? (
            <p role="alert" className="text-sm font-medium text-danger">{redeemError}</p>
          ) : !redeemView ? (
            <p className="flex items-center gap-2 text-sm text-ink-600"><Loader2 className="size-4 animate-spin" /> Loading</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="nums text-sm text-ink-800">
                  <span className="font-semibold">{redeemView.usedCount.toLocaleString("en-IN")}</span> used ·{" "}
                  <span className="font-semibold">{formatMoney(redeemView.totalDiscountInrMinor, "INR", { zeroLabel: false })}</span> discount given
                </p>
                <a
                  href={`/api/admin/promo-codes/${redeemFor?.id}/redemptions?format=csv`}
                  download
                  className={buttonClass({ variant: "ghost", size: "md" })}
                >
                  <Download className="size-4" />
                  Download CSV
                </a>
              </div>
              {redeemView.redemptions.length === 0 ? (
                <p className="rounded-apple-sm bg-ink-50 px-3 py-6 text-center text-sm text-ink-600">No one has used this code yet.</p>
              ) : (
                <div className="max-h-[50dvh] overflow-auto rounded-apple-sm border border-[color:var(--admin-rule)]">
                  <table className="w-full min-w-[34rem] text-left text-sm">
                    <thead className="sticky top-0 bg-background text-[0.8125rem] text-text-subtle">
                      <tr><th className="px-3 py-2 font-medium">Who</th><th className="px-3 py-2 font-medium">Order</th><th className="px-3 py-2 text-right font-medium">Discount</th><th className="px-3 py-2 font-medium">When</th></tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--admin-rule)]">
                      {redeemView.redemptions.map((r, i) => (
                        <tr key={`${r.orderId}-${i}`}>
                          <td className="px-3 py-2"><span className="block font-medium text-ink-900">{r.who ?? "Unknown"}</span><span className="block text-xs text-ink-600">{r.kind === "employer" ? "Company" : "Intern"}{r.email ? ` · ${r.email}` : ""}</span></td>
                          <td className="px-3 py-2 font-mono text-xs text-ink-700">{r.orderId ?? "-"}</td>
                          <td className="nums px-3 py-2 text-right">{formatMoney(r.discountMinor, r.currency, { zeroLabel: false })}</td>
                          <td className="nums px-3 py-2 whitespace-nowrap text-ink-700">{formatIstStamp(r.redeemedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <FullWaiverDialog
        open={waiverOpen}
        onOpenChange={setWaiverOpen}
        onCreated={(promo) => {
          setPromos((prev) => [promo, ...prev]);
          router.refresh();
        }}
      />

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="apple-admin max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em]">
              <Tag className="size-5 text-brand-600" />
              {editingPromo ? "Edit code" : "New code"}
            </DialogTitle>
            <DialogDescription className="text-sm">
              {editingPromo
                ? "Update terms, limits or discount."
                : "A voucher employers or interns apply at checkout."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePromo} className="space-y-4 pt-2">
            {collegeLocked && (
              <p className="rounded-apple-sm bg-ink-50 px-3 py-2 text-sm text-ink-700" role="note">
                {COLLEGE_CODE_LOCKED}
              </p>
            )}
            {errorMsg && (
              <div id="promo-error" role="alert" className="rounded-apple-sm bg-danger-soft p-3 text-sm font-medium text-danger">
                {errorMsg}
              </div>
            )}

            <div>
              <label htmlFor="promo-code" className="block text-sm font-semibold text-ink-800">
                Code
              </label>
              <input
                id="promo-code"
                {...bad("promo-code")}
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME20"
                className={`${inputClass} uppercase tracking-[0.08em]`}
              />
            </div>

            <div>
              <label htmlFor="promo-desc" className="block text-sm font-semibold text-ink-800">
                Description <span className="font-normal text-ink-600">(optional)</span>
              </label>
              <input
                id="promo-desc"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Early adopter discount"
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="promo-type" className="block text-sm font-semibold text-ink-800">
                  Type
                </label>
                <select
                  id="promo-type"
                  value={discountType}
                  disabled={collegeLocked}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                  className={inputClass}
                >
                  <option value="percentage">Percentage</option>
                  <option value="fixed">Fixed ₹</option>
                </select>
              </div>
              <div>
                <label htmlFor="promo-value" className="block text-sm font-semibold text-ink-800">
                  {discountType === "percentage" ? "Percent" : "Rupees"}
                </label>
                <input
                  id="promo-value"
                {...bad("promo-value")}
                  type="number"
                  min="1"
                  max={discountType === "percentage" ? "100" : undefined}
                  required
                  value={discountValue}
                  disabled={collegeLocked}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="promo-max" className="block text-sm font-semibold text-ink-800">
                  Max uses <span className="font-normal text-ink-600">(blank ∞)</span>
                </label>
                <input
                  id="promo-max"
                  type="number"
                  min="1"
                  value={maxUsages}
                  disabled={collegeLocked}
                  onChange={(e) => setMaxUsages(e.target.value)}
                  placeholder="50"
                  aria-describedby="promo-max-help"
                  className={`${inputClass} tabular-nums`}
                />
                <p id="promo-max-help" className="mt-1 text-xs text-ink-600">Each account can use a code once. This is the total across all accounts.</p>
              </div>
              <div>
                <label htmlFor="promo-min" className="block text-sm font-semibold text-ink-800">
                  Min order ₹ <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input
                  id="promo-min"
                  type="number"
                  min="0"
                  step="0.01"
                  value={minOrderAmountRupees}
                  onChange={(e) => setMinOrderAmountRupees(e.target.value)}
                  placeholder="2499"
                  className={`${inputClass} tabular-nums`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="promo-from" className="block text-sm font-semibold text-ink-800">
                  From, IST <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input
                  id="promo-from"
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="promo-until" className="block text-sm font-semibold text-ink-800">
                  Until, IST <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input
                  id="promo-until"
                {...bad("promo-until")}
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  aria-describedby="promo-until-help"
                  className={inputClass}
                />
                <p id="promo-until-help" className="mt-1 text-xs text-ink-600">Ends at this time, IST.</p>
                {pastUntil ? <p role="alert" className="mt-1 text-xs font-semibold text-danger">{pastUntil}</p> : null}
              </div>
            </div>

            <div>
              <label htmlFor="promo-applies" className="block text-sm font-semibold text-ink-800">
                Who can use it
              </label>
              <select
                id="promo-applies"
                value={appliesTo}
                disabled={collegeLocked}
                onChange={(e) => setAppliesTo(e.target.value as PromoAppliesTo)}
                aria-describedby="promo-applies-help"
                className={inputClass}
              >
                <option value="both">Interns and companies</option>
                <option value="intern">Interns only (activation fee)</option>
                <option value="employer">Companies only (hiring checkout)</option>
                <option value="subscription">Employer subscription (Findtern Pro)</option>
              </select>
              <p id="promo-applies-help" className="mt-1 text-xs text-ink-600">
                {appliesTo === "subscription"
                  ? "Takes money off the Findtern Pro subscription only. It does not work on hires or intern activation, and hiring codes do not work on the subscription."
                  : "Hiring and activation codes never apply to the Findtern Pro subscription. Choose Employer subscription for a code that does."}
              </p>
            </div>

            <div className="flex items-center justify-between rounded-apple-sm bg-ink-50 px-3 py-2">
              <span className="text-sm font-medium text-ink-800">
                Active{isActive ? "" : " · disabled"}
              </span>
              <Switch
                checked={isActive}
                onCheckedChange={setIsActive}
                aria-label="Active status"
              />
            </div>

            <DialogFooter className="sticky bottom-0 -mb-6 bg-background pt-2 pb-6">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className={buttonClass({ variant: "ghost", size: "md" })}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className={buttonClass({ variant: "primary", size: "md" })}
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                {editingPromo ? "Save changes" : "Create code"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
