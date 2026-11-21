import { AdminLoadError, Panel, PanelBody, PanelHeader } from "@/components/admin/panel";
import { ADMIN_PILL_SECONDARY } from "@/components/admin/surface";
import { ManualInternInvoiceForm } from "@/components/admin/invoices/manual-intern-invoice-form";
import { ButtonLink } from "@/components/ui/button";

/** The Interns tab: where the automatic list lives, and the form for a fee paid outside checkout. */
export function InternsTab({ canWrite, feeMinor }: { canWrite: boolean; feeMinor: number | null }) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p className="max-w-2xl text-sm leading-relaxed text-text-subtle sm:text-base">
          An activation invoice is made automatically when an intern pays online. The full list, with every payment, is under Intern invoices.
        </p>
        <ButtonLink href="/admin/intern-invoices" variant="outline" size="sm" className={ADMIN_PILL_SECONDARY}>
          Open intern invoices
        </ButtonLink>
      </div>

      <Panel className="max-w-3xl">
        <PanelHeader title="Create manual invoice" description="For an intern who paid the activation fee outside checkout, by bank transfer, UPI or cash." />
        <PanelBody>
          {!canWrite ? (
            <p className="text-sm text-text-subtle">Creating a manual invoice needs the Accounts permission (transactions:write).</p>
          ) : feeMinor === null ? (
            <AdminLoadError what="the activation fee" retryHref="/admin/invoices?tab=interns" />
          ) : (
            <ManualInternInvoiceForm feeMinor={feeMinor} />
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
