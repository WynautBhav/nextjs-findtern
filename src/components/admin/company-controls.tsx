"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { InlineSelect, InlineToggle, sendInline } from "@/components/admin/inline-control";
import { buttonClass } from "@/components/ui/button";
import { fteOf } from "@/lib/admin/fte";
import { cn } from "@/lib/utils";

/**
 * Company controls, all on PATCH/DELETE /api/admin/companies/[id].
 *
 * International FTE uses legacy's three values only (none / applied /
 * approved, ADP-03): Approve and Revoke are always available, and declining
 * a request sets it back to "none" so the company can apply again. A stored
 * "rejected" (written by an earlier build) reads as none.
 */


const FTE_OPTIONS = [
  { value: "none", label: "Not approved" },
  { value: "applied", label: "Applied" },
  { value: "approved", label: "Approved" },
] as const;

export function CompanyFteSelect({ id, value, refresh = false }: { id: string; value: string; refresh?: boolean }) {
  return (
    <InlineSelect
      label="International FTE status"
      value={fteOf(value)}
      options={FTE_OPTIONS}
      refresh={refresh}
      request={{ url: `/api/admin/companies/${id}`, method: "PATCH", valueKey: "internationalFteStatus" }}
    />
  );
}

export function CompanyActiveToggle({ id, isActive, refresh = false }: { id: string; isActive: boolean; refresh?: boolean }) {
  return (
    <InlineToggle
      on={isActive}
      onLabel="Active"
      offLabel="Inactive"
      turnOnLabel="Activate"
      turnOffLabel="Deactivate"
      confirmOff="Deactivate this company? They won't be able to sign in until reactivated."
      refresh={refresh}
      request={{ url: `/api/admin/companies/${id}`, method: "PATCH", valueKey: "isActive" }}
    />
  );
}

/** Delete, only for an employer with no proposals, interviews or payments (the API refuses otherwise). */
export function CompanyDeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (!window.confirm("Delete this employer permanently? This can't be undone.")) return;
    setBusy(true);
    setError(null);
    const result = await sendInline({ url: `/api/admin/companies/${id}`, method: "DELETE" });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    router.push("/admin/companies");
  }

  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={busy}
        onClick={remove}
        className={cn(buttonClass({ variant: "ghost", size: "sm" }), "text-danger hover:bg-danger-soft")}
      >
        <Trash2 className="size-4" aria-hidden />
        Delete
      </button>
      {error ? (
        <span role="alert" className="max-w-xs text-xs font-medium text-danger">
          {error}
        </span>
      ) : null}
    </span>
  );
}
