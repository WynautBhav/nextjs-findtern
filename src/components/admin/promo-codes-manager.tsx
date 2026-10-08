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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

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

  // Delete Dialog state
  const [deleteTarget, setDeleteTarget] = useState<PromoCode | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Copy feedback
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

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
    setErrorMsg("");
    setModalOpen(true);
  }

  function openEditModal(promo: PromoCode) {
    setEditingPromo(promo);
    setCode(promo.code);
    setDescription(promo.description || "");
    setDiscountType(promo.discountType === "fixed" ? "fixed" : "percentage");
    setDiscountValue(promo.discountValue);
    setMaxUsages(promo.maxUsages ?? "");
    setMinOrderAmountRupees(
      promo.minOrderAmountMinor ? Math.round(promo.minOrderAmountMinor / 100) : ""
    );
    setValidFrom(
      promo.validFrom ? new Date(promo.validFrom).toISOString().slice(0, 16) : ""
    );
    setValidUntil(
      promo.validUntil ? new Date(promo.validUntil).toISOString().slice(0, 16) : ""
    );
    setIsActive(promo.isActive);
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
    if (isNaN(valNum) || valNum <= 0) {
      setErrorMsg("Please provide a valid discount value greater than 0.");
      return;
    }
    if (discountType === "percentage" && valNum > 100) {
      setErrorMsg("Percentage discount cannot exceed 100%.");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        code: trimmedCode,
        description: description.trim() || undefined,
        discountType,
        discountValue: valNum,
        maxUsages: maxUsages !== "" ? Number(maxUsages) : undefined,
        minOrderAmountMinor:
          minOrderAmountRupees !== "" ? Math.round(Number(minOrderAmountRupees) * 100) : undefined,
        validFrom: validFrom ? new Date(validFrom).toISOString() : undefined,
        validUntil: validUntil ? new Date(validUntil).toISOString() : undefined,
        isActive,
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
                  discountValue: valNum,
                  maxUsages: maxUsages !== "" ? Number(maxUsages) : null,
                  minOrderAmountMinor:
                    minOrderAmountRupees !== "" ? Math.round(Number(minOrderAmountRupees) * 100) : null,
                  validFrom: validFrom ? new Date(validFrom) : null,
                  validUntil: validUntil ? new Date(validUntil) : null,
                  isActive,
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
        // revert on error
        setPromos((prev) =>
          prev.map((p) => (p.id === promo.id ? { ...p, isActive: promo.isActive } : p))
        );
      } else {
        router.refresh();
      }
    } catch {
      // revert on error
      setPromos((prev) =>
        prev.map((p) => (p.id === promo.id ? { ...p, isActive: promo.isActive } : p))
      );
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
      alert(err instanceof Error ? err.message : "Failed to delete");
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
    <div className="space-y-4">
      {/* Controls Bar: Search, Filters, and Add Button */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {/* Search box */}
          <div className="relative min-w-[240px] flex-1 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or description…"
              className="w-full rounded-lg border border-sand-300 bg-sand-50/60 py-2 pl-9 pr-3 text-sm text-ink-900 placeholder:text-text-subtle focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-700"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          {/* Status selector */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
            className="rounded-lg border border-sand-300 bg-sand-50/60 px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All statuses</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </select>

          {/* Type selector */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as "all" | "percentage" | "fixed")}
            className="rounded-lg border border-sand-300 bg-sand-50/60 px-3 py-2 text-sm text-ink-800 focus:border-brand-500 focus:outline-none"
          >
            <option value="all">All discount types</option>
            <option value="percentage">Percentage (%)</option>
            <option value="fixed">Fixed amount (₹)</option>
          </select>
        </div>

        {/* Add Promo Code Button */}
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 active:scale-[0.99]"
        >
          <Plus className="size-4" />
          Add Promo Code
        </button>
      </div>

      {/* Promo Codes Table */}
      <div className="overflow-hidden rounded-xl border border-sand-200 bg-white shadow-xs">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-sand-200 bg-sand-50/70 hover:bg-sand-50/70">
              <TableHead className="w-[180px] font-semibold text-ink-700">Coupon Code</TableHead>
              <TableHead className="font-semibold text-ink-700">Benefit</TableHead>
              <TableHead className="font-semibold text-ink-700">Redemptions</TableHead>
              <TableHead className="font-semibold text-ink-700">Min Purchase</TableHead>
              <TableHead className="font-semibold text-ink-700">Validity</TableHead>
              <TableHead className="w-[110px] text-center font-semibold text-ink-700">Active</TableHead>
              <TableHead className="w-[120px] text-right font-semibold text-ink-700">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPromos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center">
                  <div className="mx-auto flex max-w-sm flex-col items-center justify-center text-center">
                    <div className="mb-3 grid size-12 place-items-center rounded-full bg-sand-100 text-ink-400">
                      <Tag className="size-6" />
                    </div>
                    <p className="text-sm font-semibold text-ink-900">No promo codes found</p>
                    <p className="mt-1 text-xs text-text-subtle">
                      {search || statusFilter !== "all" || typeFilter !== "all"
                        ? "No promo codes match your active filters. Try clearing them."
                        : "Create discount vouchers and coupon codes to incentivize hires."}
                    </p>
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"
                    >
                      <Plus className="size-3.5" />
                      Create First Promo Code
                    </button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredPromos.map((promo) => {
                const max = promo.maxUsages;
                const used = promo.usedCount;
                const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
                const isCopied = copiedCode === promo.code;

                return (
                  <TableRow
                    key={promo.id}
                    className="border-b border-sand-100 transition-colors hover:bg-sand-50/50"
                  >
                    {/* Code & Copy */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold uppercase tracking-wider text-brand-800 bg-brand-50 border border-brand-200 px-2.5 py-1 rounded-md">
                          {promo.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(promo.code)}
                          title="Copy code"
                          className="rounded p-1 text-ink-400 hover:bg-sand-100 hover:text-ink-700"
                        >
                          {isCopied ? (
                            <Check className="size-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </div>
                      {promo.description && (
                        <p className="mt-1 max-w-xs truncate text-xs text-text-subtle">
                          {promo.description}
                        </p>
                      )}
                    </TableCell>

                    {/* Benefit */}
                    <TableCell>
                      <span className="font-semibold text-ink-900">
                        {promo.discountType === "percentage"
                          ? `${promo.discountValue}% reduction`
                          : `${formatMoney(promo.discountValue, "INR")} reduction`}
                      </span>
                    </TableCell>

                    {/* Redemptions & Progress */}
                    <TableCell>
                      <div className="min-w-[7rem] space-y-1">
                        <p className="text-xs font-medium tabular-nums text-ink-800">
                          {used.toLocaleString("en-IN")}{" "}
                          {max ? `of ${max.toLocaleString("en-IN")}` : "used (unlimited)"}
                        </p>
                        {max ? (
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-sand-200">
                            <div
                              className="h-full rounded-full bg-brand-600 transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        ) : null}
                      </div>
                    </TableCell>

                    {/* Min purchase */}
                    <TableCell>
                      <span className="text-xs font-medium tabular-nums text-text-subtle">
                        {promo.minOrderAmountMinor
                          ? formatMoney(promo.minOrderAmountMinor, "INR")
                          : "Zero minimum"}
                      </span>
                    </TableCell>

                    {/* Validity */}
                    <TableCell>
                      <div className="text-xs text-text-subtle">
                        {promo.validUntil ? (
                          <span>Until {formatDate(new Date(promo.validUntil).toISOString())}</span>
                        ) : (
                          <span className="text-emerald-700">Permanent / No expiry</span>
                        )}
                      </div>
                    </TableCell>

                    {/* Active Toggle Switch */}
                    <TableCell className="text-center">
                      <div className="flex justify-center items-center">
                        <Switch
                          checked={promo.isActive}
                          onCheckedChange={() => handleToggleActive(promo)}
                          aria-label="Toggle promo code status"
                        />
                      </div>
                    </TableCell>

                    {/* Actions: Edit & Delete */}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditModal(promo)}
                          className="rounded-md border border-sand-300 p-1.5 text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 transition"
                          title="Edit promo code"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(promo)}
                          className="rounded-md border border-sand-300 p-1.5 text-ink-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 transition"
                          title="Delete promo code"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add / Edit Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-md sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="size-5 text-brand-600" />
              {editingPromo ? "Edit Promo Code" : "Create New Promo Code"}
            </DialogTitle>
            <DialogDescription>
              {editingPromo
                ? "Update promotional voucher terms, usages, or discount amounts."
                : "Configure a promotional discount coupon for employer or intern orders."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePromo} className="space-y-4 pt-2">
            {errorMsg && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700">
                {errorMsg}
              </div>
            )}

            {/* Code & Active status */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">
                  Promo Code <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. WELCOME20"
                  className="w-full font-mono uppercase tracking-wider rounded-lg border border-sand-300 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5 flex flex-col justify-end">
                <label className="text-xs font-semibold text-ink-800">Active status</label>
                <div className="flex items-center gap-2 h-9">
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                    aria-label="Active status switch"
                  />
                  <span className="text-xs font-medium text-ink-700">
                    {isActive ? "Active" : "Disabled"}
                  </span>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-ink-800">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Early adopter 20% discount on initial candidate match"
                className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
              />
            </div>

            {/* Discount Type & Value */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">Discount Type</label>
                <select
                  value={discountType}
                  onChange={(e) => setDiscountType(e.target.value as "percentage" | "fixed")}
                  className="w-full rounded-lg border border-sand-300 bg-white px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                >
                  <option value="percentage">Percentage (%)</option>
                  <option value="fixed">Fixed Amount (₹)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">
                  {discountType === "percentage" ? "Percentage Value (%)" : "Flat Value (₹)"}{" "}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max={discountType === "percentage" ? "100" : undefined}
                  required
                  value={discountValue}
                  onChange={(e) => setDiscountValue(e.target.value)}
                  className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Max Usages & Min Order */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">
                  Usage Limit <span className="text-text-subtle font-normal">(empty = unlimited)</span>
                </label>
                <input
                  type="number"
                  min="1"
                  value={maxUsages}
                  onChange={(e) => setMaxUsages(e.target.value)}
                  placeholder="e.g. 50"
                  className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">
                  Min Purchase (₹) <span className="text-text-subtle font-normal">(optional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  value={minOrderAmountRupees}
                  onChange={(e) => setMinOrderAmountRupees(e.target.value)}
                  placeholder="e.g. 2499"
                  className="w-full rounded-lg border border-sand-300 px-3 py-2 text-sm text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Validity Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">
                  Valid From <span className="text-text-subtle font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  className="w-full rounded-lg border border-sand-300 px-3 py-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink-800">
                  Valid Until <span className="text-text-subtle font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="w-full rounded-lg border border-sand-300 px-3 py-2 text-xs text-ink-900 focus:border-brand-500 focus:outline-none"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-lg border border-sand-300 px-4 py-2 text-xs font-medium text-ink-700 hover:bg-sand-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-50"
              >
                {saving && <Loader2 className="size-3.5 animate-spin" />}
                {editingPromo ? "Save Changes" : "Create Code"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-rose-600">Delete Promo Code?</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete coupon code{" "}
              <strong className="font-mono text-ink-900">{deleteTarget?.code}</strong>? This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="pt-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
              className="rounded-lg border border-sand-300 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-sand-100"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={handleDeleteConfirm}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            >
              {deleting && <Loader2 className="size-3.5 animate-spin" />}
              Delete Code
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
