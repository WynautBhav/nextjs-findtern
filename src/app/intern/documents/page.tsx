import type { Metadata } from "next";
import { eq, desc } from "drizzle-orm";
import { FileImage, FileText, Info, Upload, Video } from "lucide-react";

import { getDb, schema } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { EmptyScene, PageHead, Surface } from "@/components/app/primitives";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { DocImagePreview } from "@/components/intern/doc-preview";
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
        <>
          <ul className="grid gap-4 sm:grid-cols-2">
            {rows.map((doc) => {
              const type = (doc.contentType ?? "").toLowerCase();
              const isImage = type.startsWith("image/");
              const isVideo = type.startsWith("video/");
              return (
                <Surface as="li" key={doc.id} className="flex flex-col overflow-hidden">
                  {/* Inline preview (INT-29): images as a thumbnail, the intro video as a player. */}
                  {isImage ? (
                    <DocImagePreview href={doc.href} label={doc.label} />
                  ) : isVideo ? (
                    <video controls preload="none" src={doc.href} className="aspect-video w-full bg-ink-900">
                      <track kind="captions" />
                    </video>
                  ) : (
                    <div className="grid aspect-[16/10] place-items-center bg-ink-50 text-text-subtle" aria-hidden>
                      <FileText className="size-10" />
                    </div>
                  )}
                  <div className="flex items-center gap-3 border-t border-ink-100 px-4 py-3.5">
                    <span className="grid size-10 shrink-0 place-items-center rounded-apple-sm bg-brand-50 text-brand-700">
                      <DocIcon contentType={doc.contentType} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[0.9375rem] font-medium text-ink-900">{doc.label}</p>
                      <p className="truncate text-xs text-ink-600">
                        {doc.fileName} · {formatBytes(doc.size)}
                        {doc.stampedAt ? ` · ${formatDay(doc.stampedAt)}` : ""}
                      </p>
                    </div>
                    <a href={doc.href} target="_blank" rel="noreferrer" className={buttonClass({ variant: "outline", size: "sm", className: "min-h-11 shrink-0" })}>
                      Open
                    </a>
                  </div>
                </Surface>
              );
            })}
          </ul>

          <p className="mt-5 flex items-start gap-2 text-sm text-ink-600">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
            Employers never see these files. They are used to verify you and to pay your stipend.
          </p>
        </>
      )}
    </div>
  );
}

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

function kindLabel(type: string | null): string {
  const t = (type ?? "").toLowerCase();
  if (t.startsWith("image/")) return `${t.slice(6).toUpperCase()} image`;
  if (t.startsWith("video/")) return "Video";
  if (t === "application/pdf") return "PDF";
  return "File";
}

function DocIcon({ contentType }: { contentType: string | null }) {
  const type = (contentType ?? "").toLowerCase();
  if (type.startsWith("video/")) return <Video className="size-4" aria-hidden />;
  if (type.startsWith("image/")) return <FileImage className="size-4" aria-hidden />;
  return <FileText className="size-4" aria-hidden />;
}

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes) || bytes <= 0) return "Size unknown";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDay(value: Date): string {
  // DD/MM/YYYY, India time (bug sheet 7, NC r24).
  return new Date(value).toLocaleDateString("en-GB", { timeZone: "Asia/Kolkata" });
}
