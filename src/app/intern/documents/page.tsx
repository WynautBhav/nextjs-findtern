import type { Metadata } from "next";
import Link from "next/link";
import { eq, desc } from "drizzle-orm";
import { Upload } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene, PageHead, Pill } from "@/components/app/primitives";
import { Tile } from "@/components/app/tiles";
import { ButtonLink } from "@/components/ui/button";
import { formatDmy } from "@/lib/format";
import { DocGallery, kindLabel } from "@/components/intern/kit/doc-gallery";
import { certificateFiles } from "@/lib/onboarding";

export const metadata: Metadata = {
  title: "Documents",
  robots: { index: false, follow: false },
};

/* Read-only. "View" links go through /intern/documents/open, which checks
 * ownership and mints a fresh signed URL per click, so links never go stale.
 * Replacement uploads happen in the onboarding form.
 */

type DocumentRow = {
  id: string;
  href: string;
  /** Stored file name or key, when it differs from the label shown. */
  key?: string;
  label: string;
  fileName: string;
  contentType: string | null;
  size: number | null;
  stampedAt: Date | null;
};

export default async function InternDocuments() {
  const session = await requireRole("intern");
  // No try/catch: a failed read shows the error state (app/intern/error.tsx),
  // never "No documents uploaded".
  const db = getDb();
  const [record] = await db
    .select()
    .from(schema.internDocuments)
    .where(eq(schema.internDocuments.userId, session.uid))
    .orderBy(desc(schema.internDocuments.createdAt))
    .limit(1);

  let rows: DocumentRow[] = record ? flattenRecord(record) : [];
  const [onboarding] = await db
    .select({ extra: schema.internOnboarding.extraData })
    .from(schema.internOnboarding)
    .where(eq(schema.internOnboarding.userId, session.uid))
    .limit(1);
  const academics = ((onboarding?.extra ?? {}) as Record<string, unknown>).academics as Record<string, unknown> | undefined;
  const sheets = Array.isArray(academics?.marksheetUploads) ? (academics.marksheetUploads as Record<string, unknown>[]) : [];
  sheets.forEach((m, i) => {
    const name = String(m.name ?? "");
    if (!name) return;
    rows.push({
      id: `marksheet-${i}`,
      href: "",
      label: "Marksheet",
      // Legacy stores `originalName`; older rows from this app used `label`.
      fileName: String(m.originalName || m.label || name.split("/").pop()),
      contentType: typeof m.type === "string" ? m.type : null,
      size: typeof m.size === "number" ? m.size : null,
      stampedAt: null,
      key: name,
    });
  });
  certificateFiles(academics).forEach((c, i) => {
    rows.push({
      id: `certificate-${i}`,
      href: "",
      label: c.label,
      fileName: c.originalName || c.name.split("/").pop() || c.name,
      contentType: c.type || null,
      size: c.size || null,
      stampedAt: null,
      key: c.name,
    });
  });
  rows = rows.map((r) => ({ ...r, href: `/intern/documents/open?key=${encodeURIComponent(r.key ?? r.fileName)}` }));

  return (
    <div>
      <PageHead
        title="Documents"
        lede="The files attached to your profile. Only you and the Findtern team can open them."
        action={
          rows.length > 0 ? (
            <ButtonLink href="/intern/onboarding" variant="outline">
              <Upload className="size-4" aria-hidden />
              Replace or add files
            </ButtonLink>
          ) : null
        }
      />

      {rows.length === 0 ? (
        <EmptyScene
          art
          title="No documents uploaded yet"
          body="Your profile photo, Aadhaar, PAN and marksheets appear here once you add them in the profile editor."
          next={{ label: "Add them in your profile", href: "/intern/onboarding" }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* What the files are for, in the order they matter: being paid, then the profile, then education. */}
          {GROUPS.map((g) => {
            const docs = rows.filter((r) => g.has(r.label));
            if (docs.length === 0 && g.title !== "For your stipend") return null;
            const pan = rows.some((r) => r.label === "PAN");
            return (
              <Tile
                key={g.title}
                title={g.title}
                className={g.wide ? "lg:col-span-2" : undefined}
                aside={g.title === "For your stipend" ? <Pill tone={pan ? "paid" : "waiting"}>{pan ? "PAN on file" : "PAN missing"}</Pill> : null}
                description={
                  g.title !== "For your stipend" ? undefined : pan ? (
                    "Your PAN image is what payouts need, so your stipend can go out. Employers never see these files."
                  ) : (
                    <>
                      Payouts need your PAN image.{" "}
                      <Link href="/intern/onboarding" className="font-medium text-brand-700 underline underline-offset-2 hover:text-brand-800">
                        Add it in your profile
                      </Link>{" "}
                      so your stipend can go out.
                    </>
                  )
                }
              >
                {docs.length > 0 ? (
                  <DocGallery wide={g.wide} docs={docs.map((d) => ({ id: d.id, href: d.href, label: d.label, fileName: d.fileName, contentType: d.contentType, size: d.size, stamped: d.stampedAt ? formatDmy(d.stampedAt) : null }))} />
                ) : null}
              </Tile>
            );
          })}
        </div>
      )}
    </div>
  );
}

const GROUPS: { title: string; wide?: boolean; has: (label: string) => boolean }[] = [
  { title: "For your stipend", has: (l) => l === "Aadhaar" || l === "PAN" },
  { title: "Your profile", has: (l) => l === "Profile photo" || l === "Intro video" },
  { title: "Education and certificates", wide: true, has: (l) => !["Aadhaar", "PAN", "Profile photo", "Intro video"].includes(l) },
];

/** A stored record groups up to four files under one row; present them as a list. */
function flattenRecord(record: typeof schema.internDocuments.$inferSelect): DocumentRow[] {
  const slots = [
    { label: "Profile photo", name: record.profilePhotoName, type: record.profilePhotoType, size: record.profilePhotoSize },
    { label: "Intro video", name: record.introVideoName, type: record.introVideoType, size: record.introVideoSize },
    { label: "Aadhaar", name: record.aadhaarImageName, type: record.aadhaarImageType, size: record.aadhaarImageSize },
    { label: "PAN", name: record.panImageName, type: record.panImageType, size: record.panImageSize },
  ];

  return slots
    .filter((slot): slot is { label: string; name: string; type: string | null; size: number | null } =>
      Boolean(slot.name),
    )
    .map((slot, i) => ({
      id: `${record.id}-${i}`,
      href: "",
      label: slot.label,
      // Identity slots keep only a storage key, not the original name.
      fileName: kindLabel(slot.type),
      key: slot.name,
      contentType: slot.type,
      size: slot.size,
      stampedAt: record.updatedAt ?? record.createdAt ?? null,
    }));
}
