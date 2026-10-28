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
import { formatDate } from "@/lib/format";
import type { PromoCode } from "@/lib/db/schema";
import { AdminEmpty } from "@/components/admin/panel";
import { StatusBadge } from "@/components/admin/status-badge";
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

const inputClass =
  "mt-1.5 min-h-11 w-full rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-text-subtle focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20";

/** Fixed amounts are stored as major rupees (the form takes "₹"), not minor units. */
function benefitLabel(promo: PromoCode): string {
  return promo.discountType === "percentage"
    ? `${promo.discountValue}% off`
    : `₹${(Number(promo.discountValue) / 100).toLocaleString("en-IN")} off`;
}

export function PromoCodesManager({
  initialPromoCodes,
}: {
  initialPromoCodes: PromoCode[];
}) {
  const router = useRouter();
  const [promos, setPromos] = useState<PromoCode[]>(initialPromoCodes);

  // Search & Filter state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [typeFilter, setTypeFilter] = useState<"all" | "percentage" | "fixed">("all");

  // Modal Dialog state (Add / Edit)
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromoCode | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

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

  // Delete Dialog state
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setModalOpen(true);
  }

  async function handleSavePromo(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const trimmedCode = code.trim().toUpperCase();
    if (!trimmedCode) {
      setErrorMsg("Promo code is required.");
      return;
    }
    const valNum = Number(discountValue);
    // Fixed amounts are typed in rupees and stored in paise.
    const stored = discountType === "fixed" ? Math.round(valNum * 100) : valNum;
    if (isNaN(valNum) || valNum <= 0) {
      setErrorMsg("Please provide a valid discount value greater than 0.");
      return;
    }
    if (discountType === "percentage" && valNum > 100) {
      setErrorMsg("Percentage discount cannot exceed 100%.");
      return;
    }
    if (validFrom && validUntil && new Date(validUntil) < new Date(validFrom)) {
      setErrorMsg("The end date must be on or after the start date.");
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

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);

    try {
      const res = await csrfFetch(`/api/admin/promo-codes/${deleteTarget.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to delete promo code.");
      }

      setPromos((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
      router.refresh();
    } catch (err: unknown) {
      setRowError({ id: deleteTarget.id, message: err instanceof Error ? err.message : "Failed to delete" });
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard?.writeText(text);
    setCopiedCode(text);
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
      <div className="apple-panel flex flex-col gap-3 bg-white p-4 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1 lg:max-w-sm">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search codes…"
            aria-label="Search promo codes"
            className="min-h-11 w-full rounded-apple-sm border border-ink-200 bg-ink-50 pr-10 pl-9 text-[0.9375rem] text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:bg-white focus:ring-2 focus:ring-brand-500/20 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-0 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-apple-sm text-ink-600 hover:text-ink-800"
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
            className="min-h-11 cursor-pointer rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "percentage" | "fixed")}
            aria-label="Filter by discount type"
            className="min-h-11 cursor-pointer rounded-apple-sm border border-ink-200 bg-white px-3 text-sm text-ink-700 focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All types</option>
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount</option>
          </select>
        </div>

        <button
          type="button"
          onClick={openCreateModal}
          className={buttonClass({ variant: "primary", size: "md", className: "lg:ml-auto" })}
        >
          <Plus className="size-4" />
          New code
        </button>
      </div>

      {/* Ticket grid */}
      {filteredPromos.length === 0 ? (
        <div className="apple-panel bg-white">
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
        <ul className="grid gap-4 md:grid-cols-2">
          {filteredPromos.map((promo) => {
            const max = promo.maxUsages;
            const used = promo.usedCount;
            const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
            const isCopied = copiedCode === promo.code;
            return (
              <li
                key={promo.id}
                className={cn(
                  "apple-panel apple-spring bg-white p-5",
                  !promo.isActive && "opacity-70",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-lg font-bold tracking-[0.04em] text-ink-900">
                    {promo.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(promo.code)}
                    title="Copy code"
                    aria-label={`Copy code ${promo.code}`}
                    className={buttonClass({ variant: "ghost", size: "icon", className: "text-ink-600" })}
                  >
                    {isCopied ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                  </button>
                  <Switch
                    checked={promo.isActive}
                    onCheckedChange={() => handleToggleActive(promo)}
                    aria-label={`Toggle ${promo.code} active status`}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
                  <p className="nums text-3xl font-semibold tracking-[-0.02em] text-brand-800">{benefitLabel(promo)}</p>
                  <StatusBadge value={promo.isActive ? "active" : "inactive"} />
                </div>
                <p className="mt-1 text-sm font-medium text-ink-700">
                  {promo.appliesTo === "intern" ? "Interns only" : promo.appliesTo === "employer" ? "Companies only" : "Interns and companies"}
                </p>
                {promo.description ? (
                  <p className="mt-1 truncate text-sm text-ink-600">
                    {promo.description}
                  </p>
                ) : null}

                <div className="mt-4 border-t border-dashed border-ink-200 pt-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="nums text-sm text-ink-600">
                      {used.toLocaleString("en-IN")}
                      {max ? ` of ${max.toLocaleString("en-IN")} used` : " used · unlimited"}
                    </span>
                    <span className="shrink-0 text-xs text-ink-600">
                      {promo.validUntil
                        ? `Until ${formatDate(new Date(promo.validUntil).toISOString())}`
                        : "No expiry"}
                      {promo.minOrderAmountMinor
                        ? ` · min ₹${Math.round(promo.minOrderAmountMinor / 100).toLocaleString("en-IN")}`
                        : ""}
                    </span>
                  </div>
                  {max ? (
                    <div aria-hidden className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full rounded-full bg-brand-600"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditModal(promo)}
                      className={buttonClass({ variant: "outline", size: "sm", className: "flex-1 max-lg:h-11" })}
                    >
                      <Edit2 className="size-4" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(promo)}
                      aria-label={`Delete ${promo.code}`}
                      className={buttonClass({ variant: "ghost", size: "iconSm", className: "text-ink-600 hover:bg-danger-soft hover:text-danger max-lg:size-11" })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {rowError?.id === promo.id ? (
                    <p role="alert" className="mt-2 text-sm font-medium text-danger">
                      {rowError.message}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
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
            {errorMsg && (
              <div role="alert" className="rounded-apple-sm border border-danger/30 bg-danger-soft p-3 text-sm font-medium text-danger">
                {errorMsg}
              </div>
            )}

            <div>
              <label htmlFor="promo-code" className="block text-sm font-semibold text-ink-800">
                Code
              </label>
              <input
                id="promo-code"
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="WELCOME20"
                className={`${inputClass} font-mono uppercase tracking-[0.08em]`}
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

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="promo-type" className="block text-sm font-semibold text-ink-800">
                  Type
                </label>
                <select
                  id="promo-type"
                  value={discountType}
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
                  type="number"
                  min="1"
                  max={discountType === "percentage" ? "100" : undefined}
                  required
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className={`${inputClass} tabular-nums`}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="promo-max" className="block text-sm font-semibold text-ink-800">
                  Max uses <span className="font-normal text-ink-600">(blank ∞)</span>
                </label>
                <input
                  id="promo-max"
                  type="number"
                  min="1"
                  value={maxUsages}
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

            <div className="grid grid-cols-2 gap-3">
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="apple-admin max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold tracking-[-0.02em] text-danger">
              Delete {deleteTarget?.code}?
            </DialogTitle>
            <DialogDescription className="text-sm">
              This removes the voucher permanently. Orders already placed keep their discount.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className={buttonClass({ variant: "ghost", size: "md" })}
            >
              Keep
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeleteConfirm}
              className={buttonClass({ variant: "primary", size: "md", className: "bg-danger hover:bg-danger/90" })}
            >
              {deleting && <Loader2 className="size-4 animate-spin" />}
              Delete
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** A Date as `YYYY-MM-DDTHH:mm` in the browser's own time zone. */
function toLocalInput(value: string | Date): string {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
