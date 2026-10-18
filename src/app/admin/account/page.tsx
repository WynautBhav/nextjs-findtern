import { AdminPageHeader } from "@/components/admin/panel";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

/** Every admin can reach this, whatever their role. */
export default function AdminAccountPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Your account" subtitle="Change the password you sign in with." />
      <div className="max-w-md rounded-2xl border border-ink-100 bg-white p-6">
        <ChangePasswordForm endpoint="/api/admin/account/password" />
      </div>
    </div>
  );
}
