"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  Edit2,
  Loader2,
  Plus,
  Search,
  Tag,
  Trash2,
  X,
} from "lucide-react";

import { csrfFetch } from "@/lib/client-fetch";
import { formatDate, formatMoney } from "@/lib/format";
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
import { ADMIN_PILL_PRIMARY, ADMIN_SURFACE } from "@/components/admin/surface";
import { COLLEGE_CODE_LOCKED } from "@/lib/promo-rules";

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-surface px-3 text-base sm:text-sm text-ink-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring placeholder:text-text-subtle focus:border-brand-500";

/** Fixed amounts are stored as major rupees (the form takes "₹"), not minor units. */
/** Code · discount · used · active · menu. */
const PROMO_GRID = "grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_2.5rem]";

function benefitLabel(promo: PromoCode): string {
  return promo.discountType === "percentage"
    ? `${promo.discountValue}% off`
    : `${formatMoney(Number(promo.discountValue), "INR", { zeroLabel: false })} off`;
}

export function PromoCodesManager({
  initialPromoCodes,
}: {
  initialPromoCodes: PromoCode[];
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
  const [typeFilter, setTypeFilter] = useState<"all" | "percentage" | "fixed">("all");

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
  const [appliesTo, setAppliesTo] = useState<"intern" | "employer" | "both">("intern");

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

  function openEditModal(promo: PromoCode) {
    setEditingPromo(promo);
    setCode(promo.code);
    setDescription(promo.description || "");
    setDiscountType(promo.discountType === "fixed" ? "fixed" : "percentage");
    setDiscountValue(promo.discountType === "fixed" ? promo.discountValue / 100 : promo.discountValue);
    setMaxUsages(promo.maxUsages ?? "");
    setMinOrderAmountRupees(
      promo.minOrderAmountMinor ? Math.round(promo.minOrderAmountMinor / 100) : ""
    );
    // datetime-local wants local time; toISOString() is UTC, which moved
    // the dates 5½ hours earlier on every save.
    setValidFrom(promo.validFrom ? toLocalInput(promo.validFrom) : "");
    setValidUntil(promo.validUntil ? toLocalInput(promo.validUntil) : "");
    setIsActive(promo.isActive);
    setAppliesTo(promo.appliesTo === "intern" || promo.appliesTo === "employer" ? promo.appliesTo : "both");
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
      invalid("Only an intern code can be 100%. Company codes can't cover the whole stipend.", "promo-value");
      return;
    }
    if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) {
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
        validFrom: validFrom ? new Date(validFrom).toISOString() : null,
        validUntil: validUntil ? new Date(validUntil).toISOString() : null,
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
                  validFrom: validFrom ? new Date(validFrom) : null,
                  validUntil: validUntil ? new Date(validUntil) : null,
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
      body: "This removes the voucher permanently. Orders already placed keep their discount.",
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

  // Filtered rows
  const filteredPromos = promos.filter((promo) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      promo.code.toLowerCase().includes(q) ||
      (promo.description || "").toLowerCase().includes(q);

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && promo.isActive) ||
      (statusFilter === "inactive" && !promo.isActive);

    const matchesType =
      typeFilter === "all" || promo.discountType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  return (
    <div className="apple-admin space-y-4">
      {/* Toolbar */}
      <div className={cn(ADMIN_SURFACE, "flex flex-col gap-3 p-[var(--admin-pad-panel)] lg:flex-row lg:items-center")}>
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-text-subtle"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes…"
            aria-label="Search promo codes"
            className="h-10 w-full rounded-full bg-[color:var(--admin-panel-2)] pr-11 pl-10 text-base sm:text-sm text-foreground placeholder:text-text-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-0 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-full text-text-subtle hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            aria-label="Filter by status"
            className="h-10 cursor-pointer rounded-full bg-[color:var(--admin-panel-2)] pr-9 pl-4 text-base sm:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "percentage" | "fixed")}
            aria-label="Filter by discount type"
            className="h-10 cursor-pointer rounded-full bg-[color:var(--admin-panel-2)] pr-9 pl-4 text-base sm:text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
          >
            <option value="all">All types</option>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className={buttonClass({ variant: "primary", size: "md", className: cn(ADMIN_PILL_PRIMARY, "lg:ml-auto") })}
        >
          <Plus className="size-4" />
          New code
        </button>
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
                </div>
                <div className="max-lg:col-span-2">
                  <p className="nums font-semibold text-ink-900">{benefitLabel(promo)}</p>
                  <p className="text-xs text-ink-600">
                    {promo.appliesTo === "intern" ? "Interns only" : promo.appliesTo === "employer" ? "Companies only" : "Interns and companies"}
                    {promo.minOrderAmountMinor ? ` · min ${formatMoney(promo.minOrderAmountMinor, "INR", { zeroLabel: false })}` : ""}
                  </p>
                </div>
                <div className="max-lg:col-span-2">
                  <p className="nums text-sm text-ink-800">
                    {used.toLocaleString("en-IN")}
                    {max ? ` of ${max.toLocaleString("en-IN")}` : " · no limit"}
                  </p>
                  {max ? (
                    <div aria-hidden className="mt-1.5 h-2 max-w-40 overflow-hidden rounded-full bg-[color:var(--admin-panel-2)]">
                      <div className="h-full rounded-full bg-[color:var(--admin-tile)]" style={{ width: `${pct}%` }} />
                    </div>
                  ) : null}
                  <p className="mt-1 text-xs text-ink-600">
                    {promo.validUntil ? `Until ${formatDate(new Date(promo.validUntil).toISOString())}` : "No expiry"}
                  </p>
                </div>
                <div className="max-lg:col-start-2 max-lg:row-start-1 max-lg:justify-self-end">
                  <Switch
                    checked={promo.isActive}
                    onCheckedChange={() => handleToggleActive(promo)}
                    aria-label={`${promo.code} active`}
                  />
                </div>
                <div className="max-lg:hidden">
                  <RowMenu
                    label={`More actions for ${promo.code}`}
                    items={[
                      { label: "Edit code", onSelect: () => openEditModal(promo), icon: <Edit2 /> },
                      { label: "Delete code", onSelect: () => void handleDelete(promo), icon: <Trash2 />, destructive: true },
                    ]}
                  />
                </div>
                <div className="flex gap-2 lg:hidden max-lg:col-span-2">
                  <button
                    type="button"
                    onClick={() => openEditModal(promo)}
                    className="apple-spring inline-flex h-10 items-center gap-1.5 rounded-full bg-[color:var(--admin-panel-2)] px-4 text-sm font-medium text-foreground hover:bg-[color:var(--admin-bar-tint)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring touch:min-h-11"
                  >
                    <Edit2 className="size-4" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === promo.id}
                    onClick={() => void handleDelete(promo)}
                    aria-label={`Delete ${promo.code}`}
                    className={buttonClass({ variant: "ghost", size: "iconSm", className: "text-ink-600 hover:bg-danger-soft hover:text-danger" })}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
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
                  className={`${inputClass} tabular-nums`}
                />
              </div>
              <div>
                <label htmlFor="promo-min" className="block text-sm font-semibold text-ink-800">
                  Min order ₹ <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input
                  id="promo-min"
                  type="number"
                  min="0"
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
                  From <span className="font-normal text-ink-600">(optional)</span>
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
                  Until <span className="font-normal text-ink-600">(optional)</span>
                </label>
                <input
                  id="promo-until"
                {...bad("promo-until")}
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className={inputClass}
                />
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
                onChange={(e) => setAppliesTo(e.target.value as "intern" | "employer" | "both")}
                className={inputClass}
              >
                <option value="both">Interns and companies</option>
                <option value="intern">Interns only (activation fee)</option>
                <option value="employer">Companies only (checkout)</option>
              </select>
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

            <DialogFooter className="pt-2">
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

/** A Date as `YYYY-MM-DDTHH:mm` in the browser's own time zone. */
function toLocalInput(value: string | Date): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
